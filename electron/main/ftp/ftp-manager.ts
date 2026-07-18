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

  constructor(
    private readonly store: ConnectionStore,
    private getWindow: () => BrowserWindow | null
  ) {}

  async connect(connectionId: string): Promise<void> {
    if (this.sessions.has(connectionId)) return

    const inflight = this.connecting.get(connectionId)
    if (inflight) {
      await inflight
      if (this.sessions.has(connectionId)) return
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
    const client = new Client(30_000, { allowSeparateTransferHost: true })
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
    const client = this.getClient(connectionId)
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
  }

  async listDir(connectionId: string, path: string): Promise<FileEntry[]> {
    const client = this.getClient(connectionId)
    const remotePath = normalizeRemotePath(path)
    const prev = await client.pwd()

    try {
      if (remotePath === '/') {
        try {
          await client.cd('/')
        } catch {
          // 部分服务器无绝对根路径，保留登录目录
        }
      } else {
        await client.cd(remotePath)
      }

      const cwd = normalizeRemotePath(await client.pwd())
      const list = await client.list()

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
    } finally {
      try {
        await client.cd(prev)
      } catch {
        // ignore
      }
    }
  }

  async mkdir(connectionId: string, path: string): Promise<void> {
    const client = this.getClient(connectionId)
    await client.send(`MKD ${normalizeRemotePath(path)}`)
  }

  async remove(connectionId: string, path: string, isDirectory: boolean): Promise<void> {
    const client = this.getClient(connectionId)
    const remotePath = normalizeRemotePath(path)
    if (isDirectory) {
      await client.removeDir(remotePath)
    } else {
      await client.remove(remotePath)
    }
  }

  async rename(connectionId: string, oldPath: string, newPath: string): Promise<void> {
    const client = this.getClient(connectionId)
    await client.rename(normalizeRemotePath(oldPath), normalizeRemotePath(newPath))
  }

  async upload(
    connectionId: string,
    localPath: string,
    remotePath: string,
    transferId: string
  ): Promise<void> {
    const client = this.getClient(connectionId)
    try {
      await client.uploadFrom(localPath, normalizeRemotePath(remotePath))
      this.emitProgress({ transferId, transferred: 1, total: 1, status: 'done' })
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传失败'
      this.emitProgress({
        transferId,
        transferred: 0,
        total: 0,
        status: 'error',
        message
      })
      throw err
    }
  }

  async download(
    connectionId: string,
    remotePath: string,
    localPath: string,
    transferId: string
  ): Promise<void> {
    const client = this.getClient(connectionId)
    try {
      await client.downloadTo(localPath, normalizeRemotePath(remotePath))
      this.emitProgress({ transferId, transferred: 1, total: 1, status: 'done' })
    } catch (err) {
      const message = err instanceof Error ? err.message : '下载失败'
      this.emitProgress({
        transferId,
        transferred: 0,
        total: 0,
        status: 'error',
        message
      })
      throw err
    }
  }

  private getClient(connectionId: string): Client {
    const session = this.sessions.get(connectionId)
    if (!session) throw new Error('FTP 未连接')
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
