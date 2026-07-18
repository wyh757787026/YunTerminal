import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { Client, FileType } from 'basic-ftp'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../../src/shared/ipc'
import type { FtpSecureMode, FtpSettings } from '../../../src/shared/types/connection'
import type { FileEntry, SftpTransferProgress } from '../../../src/shared/types/sftp'
import type { ConnectionStore } from '../store/connection-store'
import { enterActiveMode } from './active-transfer'

function resolveFtpSecureMode(ftp?: FtpSettings): FtpSecureMode {
  if (ftp?.secureMode) return ftp.secureMode
  if (ftp?.secure) return 'explicit'
  return 'plain'
}

function toBasicFtpSecure(mode: FtpSecureMode): boolean | 'implicit' {
  if (mode === 'implicit') return 'implicit'
  if (mode === 'explicit') return true
  return false
}

function usePassiveMode(ftp?: FtpSettings): boolean {
  return ftp?.passive !== false
}

function formatFtpConnectError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'FTP 连接失败'
  if (/ETIMEDOUT|timeout/i.test(raw) && /control socket/i.test(raw)) {
    return `${raw}\n控制通道超时：本机无法连上该主机的 FTP 端口（常见原因：端口被防火墙拦截、服务未监听、端口号错误）。传输模式（主动/被动）此时尚不起作用；请先确认端口可通，或向管理员核对正确端口（隐式 FTPS 多为 990）。`
  }
  if (/ECONNREFUSED/i.test(raw)) {
    return `${raw}\n连接被拒绝：目标端口没有 FTP 服务在监听，请核对主机与端口。`
  }
  if (/ENOTFOUND|getaddrinfo/i.test(raw)) {
    return `${raw}\n域名解析失败：请检查主机地址是否正确。`
  }
  return raw
}

function formatFtpTransferError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'FTP 传输失败'
  if (/timeout/i.test(raw) && /control socket/i.test(raw)) {
    return `${raw}\n上传/下载等待响应超时。主动模式下请确认服务器能回连本机；也可稍后重试。连接若已断开，请重新打开 FTP 会话。`
  }
  if (/closed|未连接|已断开/i.test(raw)) {
    return `${raw}\n请关闭后重新打开 FTP 会话再试。`
  }
  return raw
}

function normalizeRemotePath(path: string): string {
  if (!path || path === '.') return '/'
  const normalized = path.replace(/\\/g, '/')
  if (normalized === '/') return '/'
  return normalized.startsWith('/') ? normalized.replace(/\/+$/, '') || '/' : `/${normalized.replace(/\/+$/, '')}`
}

function joinRemotePath(dir: string, name: string): string {
  const base = normalizeRemotePath(dir)
  if (base === '/') return `/${name}`
  return `${base}/${name}`
}

interface FtpSession {
  client: Client
}

export class FtpManager {
  private readonly sessions = new Map<string, FtpSession>()
  private readonly connecting = new Map<string, Promise<void>>()
  /** basic-ftp 同一 Client 同时只能跑一个控制通道任务，按连接串行化 */
  private readonly opChains = new Map<string, Promise<unknown>>()

  constructor(
    private readonly store: ConnectionStore,
    private getWindow: () => BrowserWindow | null
  ) {}

  private enqueue<T>(connectionId: string, op: () => Promise<T>): Promise<T> {
    const prev = this.opChains.get(connectionId) ?? Promise.resolve()
    const next = prev.then(op, op)
    this.opChains.set(
      connectionId,
      next.then(
        () => undefined,
        () => undefined
      )
    )
    return next
  }

  /** 超时或并发错误后 Client 会被 basic-ftp 关闭，下一次操作前自动重连 */
  private async ensureClient(connectionId: string): Promise<Client> {
    const session = this.sessions.get(connectionId)
    if (session && !session.client.closed) return session.client
    if (session) this.dropSession(connectionId)
    await this.connect(connectionId)
    return this.getClient(connectionId)
  }

  async connect(connectionId: string): Promise<void> {
    if (this.sessions.has(connectionId)) {
      const existing = this.sessions.get(connectionId)
      if (existing && !existing.client.closed) return
      this.disconnect(connectionId)
    }

    const inflight = this.connecting.get(connectionId)
    if (inflight) {
      await inflight
      const session = this.sessions.get(connectionId)
      if (session && !session.client.closed) return
    }

    const task = this.doConnect(connectionId).finally(() => {
      this.connecting.delete(connectionId)
    })
    this.connecting.set(connectionId, task)
    await task
  }

  private async doConnect(connectionId: string): Promise<void> {
    if (this.sessions.has(connectionId)) return

    const connection = this.store.getConnection(connectionId)
    if (!connection) throw new Error('连接配置不存在')
    if ((connection.protocol ?? 'ssh') !== 'ftp') {
      throw new Error('当前连接不是 FTP')
    }

    const secrets = this.store.getConnectionSecrets(connectionId)
    if (!secrets.password && connection.authType !== 'prompt') {
      // 允许空密码匿名；多数站点仍需要密码字段
    }

    // allowSeparateTransferHost: 许多 NAT 后的 FTP 会在 PASV 返回不同 IP；默认拒绝会导致“连上却列不出目录”
    // 主动模式上传时控制通道可能较久才收到 150/226，超时过短会误杀连接
    const client = new Client(120_000, { allowSeparateTransferHost: true })
    client.ftp.verbose = false
    if (!usePassiveMode(connection.ftp)) {
      client.prepareTransfer = enterActiveMode
    }
    const secureMode = resolveFtpSecureMode(connection.ftp)
    const defaultPort = secureMode === 'implicit' ? 990 : 21

    try {
      await client.access({
        host: connection.host,
        port: connection.port || defaultPort,
        user: connection.username || 'anonymous',
        password: secrets.password ?? '',
        secure: toBasicFtpSecure(secureMode),
        // 暂与多数客户端默认一致：先连通；后续可加证书信任提示
        secureOptions: { rejectUnauthorized: false }
      })

      this.store.recordRecent(connectionId)
      this.sessions.set(connectionId, { client })
    } catch (err) {
      client.close()
      throw new Error(formatFtpConnectError(err))
    }
  }

  disconnect(connectionId: string): void {
    this.dropSession(connectionId)
    this.opChains.delete(connectionId)
  }

  /** 中止当前传输（关闭控制连接）；后续操作会自动重连 */
  abortTransfer(connectionId: string): void {
    this.dropSession(connectionId)
  }

  /** 仅丢弃 Client，保留操作队列（供超时后自动重连） */
  private dropSession(connectionId: string): void {
    const session = this.sessions.get(connectionId)
    if (!session) return
    try {
      session.client.close()
    } catch {
      // ignore
    }
    this.sessions.delete(connectionId)
  }

  disconnectAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.disconnect(id)
    }
  }

  async realpath(connectionId: string, path: string): Promise<string> {
    return this.enqueue(connectionId, async () => {
      const client = await this.ensureClient(connectionId)
      const target = normalizeRemotePath(path)
      if (target === '/') {
        const pwd = await client.pwd()
        return normalizeRemotePath(pwd)
      }
      const prev = await client.pwd()
      try {
        await client.cd(target)
        return normalizeRemotePath(await client.pwd())
      } finally {
        try {
          await client.cd(prev)
        } catch {
          // ignore
        }
      }
    })
  }

  async listDir(connectionId: string, path: string): Promise<FileEntry[]> {
    return this.enqueue(connectionId, async () => {
      const client = await this.ensureClient(connectionId)
      const remotePath = normalizeRemotePath(path)

      // 优先用带路径的 LIST/MLSD，避免先 cd 到尚不存在/编码不一致的目录时刷一堆 550
      let cwd = remotePath
      let list
      try {
        if (remotePath === '/') {
          try {
            await client.cd('/')
          } catch {
            // 部分服务器无绝对根，保留当前目录
          }
          cwd = normalizeRemotePath(await client.pwd())
          list = await client.list()
        } else {
          list = await client.list(remotePath)
          cwd = remotePath
        }
      } catch (err) {
        // 回退：cd + list（兼容不支持 LIST 带路径的服务器）
        const prev = await client.pwd()
        try {
          await client.cd(remotePath)
          cwd = normalizeRemotePath(await client.pwd())
          list = await client.list()
        } catch (inner) {
          throw inner instanceof Error ? inner : err
        } finally {
          try {
            await client.cd(prev)
          } catch {
            // ignore
          }
        }
      }

      return list
        .filter((item) => item.name !== '.' && item.name !== '..')
        .map((item) => {
          const isDirectory = item.isDirectory || item.type === FileType.Directory
          return {
            name: item.name,
            path: joinRemotePath(cwd, item.name),
            isDirectory,
            size: item.size ?? 0,
            modifiedAt: item.modifiedAt ? item.modifiedAt.toISOString() : new Date(0).toISOString(),
            permissions: isDirectory ? 'drwxr-xr-x' : '-rw-r--r--',
            mode: isDirectory ? 0o755 : 0o644
          } satisfies FileEntry
        })
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
    })
  }

  async mkdir(connectionId: string, path: string): Promise<void> {
    return this.enqueue(connectionId, async () => {
      const client = await this.ensureClient(connectionId)
      const remotePath = normalizeRemotePath(path)
      const prev = await client.pwd()
      try {
        // ensureDir 会逐级创建，比单次 MKD 绝对路径更兼容
        await client.ensureDir(remotePath)
      } finally {
        try {
          await client.cd(prev)
        } catch {
          // ignore
        }
      }
    })
  }

  async remove(connectionId: string, path: string, isDirectory: boolean): Promise<void> {
    return this.enqueue(connectionId, async () => {
      const client = await this.ensureClient(connectionId)
      const remotePath = normalizeRemotePath(path)
      if (isDirectory) {
        await client.removeDir(remotePath)
      } else {
        await client.remove(remotePath)
      }
    })
  }

  async rename(connectionId: string, oldPath: string, newPath: string): Promise<void> {
    return this.enqueue(connectionId, async () => {
      const client = await this.ensureClient(connectionId)
      await client.rename(normalizeRemotePath(oldPath), normalizeRemotePath(newPath))
    })
  }

  /** 远程文件复制：经临时文件中转（FTP 无通用 COPY 命令） */
  async copy(connectionId: string, fromPath: string, toPath: string): Promise<void> {
    return this.enqueue(connectionId, async () => {
      const client = await this.ensureClient(connectionId)
      const from = normalizeRemotePath(fromPath)
      const to = normalizeRemotePath(toPath)
      const tempDir = await mkdtemp(join(tmpdir(), 'yun-ftp-copy-'))
      const tempFile = join(tempDir, basename(from) || 'file')
      try {
        await client.downloadTo(tempFile, from)
        await client.uploadFrom(tempFile, to)
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    })
  }

  async upload(
    connectionId: string,
    localPath: string,
    remotePath: string,
    transferId: string
  ): Promise<void> {
    return this.enqueue(connectionId, async () => {
      const client = await this.ensureClient(connectionId)
      const total = Number((await stat(localPath)).size) || 0
      client.trackProgress((info) => {
        const transferred = Number(info.bytes)
        if (!Number.isFinite(transferred)) return
        this.emitProgress({
          transferId,
          transferred,
          total,
          status: 'progress'
        })
      })
      try {
        await client.uploadFrom(localPath, normalizeRemotePath(remotePath))
        this.emitProgress({ transferId, transferred: total, total, status: 'done' })
      } catch (err) {
        const message = formatFtpTransferError(err)
        this.emitProgress({
          transferId,
          transferred: 0,
          total,
          status: 'error',
          message
        })
        throw new Error(message)
      } finally {
        client.trackProgress()
      }
    })
  }

  async download(
    connectionId: string,
    remotePath: string,
    localPath: string,
    transferId: string
  ): Promise<void> {
    return this.enqueue(connectionId, async () => {
      const client = await this.ensureClient(connectionId)
      const remote = normalizeRemotePath(remotePath)
      let total = 0
      try {
        total = await client.size(remote)
      } catch {
        total = 0
      }
      client.trackProgress((info) => {
        const transferred = Number(info.bytes)
        if (!Number.isFinite(transferred)) return
        this.emitProgress({
          transferId,
          transferred,
          total,
          status: 'progress'
        })
      })
      try {
        await client.downloadTo(localPath, remote)
        const doneTotal = total > 0 ? total : undefined
        this.emitProgress({
          transferId,
          transferred: doneTotal ?? 1,
          total: doneTotal ?? 1,
          status: 'done'
        })
      } catch (err) {
        const message = formatFtpTransferError(err)
        this.emitProgress({
          transferId,
          transferred: 0,
          total,
          status: 'error',
          message
        })
        throw new Error(message)
      } finally {
        client.trackProgress()
      }
    })
  }

  private getClient(connectionId: string): Client {
    const session = this.sessions.get(connectionId)
    if (!session) throw new Error('FTP 未连接')
    if (session.client.closed) {
      this.sessions.delete(connectionId)
      throw new Error('FTP 连接已断开，请重新打开会话')
    }
    return session.client
  }

  private emitProgress(event: SftpTransferProgress): void {
    this.getWindow()?.webContents.send(IPC_CHANNELS.FTP_TRANSFER_PROGRESS, event)
  }
}

export async function testFtpConnection(
  store: ConnectionStore,
  connectionId: string
): Promise<{ success: boolean; latencyMs?: number; message?: string }> {
  const manager = new FtpManager(store, () => null)
  const startedAt = Date.now()
  try {
    await manager.connect(connectionId)
    manager.disconnect(connectionId)
    return { success: true, latencyMs: Date.now() - startedAt }
  } catch (err) {
    manager.disconnect(connectionId)
    return {
      success: false,
      message: err instanceof Error ? err.message : 'FTP 连接失败'
    }
  }
}
