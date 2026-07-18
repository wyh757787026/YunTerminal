import type { SFTPWrapper } from 'ssh2'
import type { Client } from 'ssh2'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../../src/shared/ipc'
import type { FileEntry, SftpTransferProgress } from '../../../src/shared/types/sftp'
import type { ConnectionStore } from '../store/connection-store'
import { createSshClient, formatSshError, isSshAbortError } from '../ssh/ssh-connect'

interface SftpSession {
  client: import('ssh2').Client
  sftp: SFTPWrapper
  jumpClients: import('ssh2').Client[]
  sharedClient: boolean
}

function formatPermissions(mode: number): string {
  const types = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  const owner = types[(mode >> 6) & 7]
  const group = types[(mode >> 3) & 7]
  const other = types[mode & 7]
  const prefix = (mode & 0o40000) !== 0 ? 'd' : '-'
  return `${prefix}${owner}${group}${other}`
}

function normalizeRemotePath(path: string): string {
  if (!path || path === '.') return '.'
  return path.replace(/\\/g, '/')
}

function joinRemotePath(dir: string, name: string): string {
  const base = normalizeRemotePath(dir)
  if (base === '/') return `/${name}`
  return `${base.replace(/\/$/, '')}/${name}`
}

const DISCONNECT_GRACE_MS = 400

export class SftpManager {
  private readonly sessions = new Map<string, SftpSession>()
  private readonly refCount = new Map<string, number>()
  private readonly connecting = new Map<string, Promise<void>>()
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly pendingAbort = new Map<string, AbortController>()

  constructor(
    private readonly store: ConnectionStore,
    private getWindow: () => BrowserWindow | null
  ) {}

  async connect(connectionId: string, existingClient?: Client | null): Promise<void> {
    this.clearDisconnectTimer(connectionId)
    this.refCount.set(connectionId, (this.refCount.get(connectionId) ?? 0) + 1)

    if (this.sessions.has(connectionId)) return

    const inflight = this.connecting.get(connectionId)
    if (inflight) {
      await inflight
      if (this.sessions.has(connectionId)) return
      if ((this.refCount.get(connectionId) ?? 0) <= 0) return
    }

    if (this.sessions.has(connectionId)) return

    const task = this.doConnect(connectionId, existingClient).finally(() => {
      this.connecting.delete(connectionId)
    })
    this.connecting.set(connectionId, task)
    await task

    if (!this.sessions.has(connectionId) && (this.refCount.get(connectionId) ?? 0) > 0) {
      throw new Error('SFTP 连接未能建立，请重试')
    }
  }

  private async doConnect(connectionId: string, existingClient?: Client | null): Promise<void> {
    if (this.sessions.has(connectionId)) return
    if ((this.refCount.get(connectionId) ?? 0) <= 0) return

    let client: import('ssh2').Client
    let jumpClients: import('ssh2').Client[] = []
    let sharedClient = false

    if (existingClient) {
      client = existingClient
      sharedClient = true
    } else {
      const abort = new AbortController()
      this.pendingAbort.set(connectionId, abort)
      try {
        const result = await createSshClient(this.store, connectionId, { signal: abort.signal })
        client = result.client
        jumpClients = result.jumpClients
      } catch (err) {
        this.pendingAbort.delete(connectionId)
        if (isSshAbortError(err) || (this.refCount.get(connectionId) ?? 0) <= 0) {
          return
        }
        throw new Error(formatSshError(err))
      }
      this.pendingAbort.delete(connectionId)
    }

    if ((this.refCount.get(connectionId) ?? 0) <= 0) {
      if (!sharedClient) {
        client.end()
        for (const jump of jumpClients) jump.end()
      }
      return
    }

    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, wrapper) => {
        if (err) reject(err)
        else resolve(wrapper)
      })
    })

    if ((this.refCount.get(connectionId) ?? 0) <= 0) {
      if (!sharedClient) {
        client.end()
        for (const jump of jumpClients) jump.end()
      }
      return
    }

    this.sessions.set(connectionId, { client, sftp, jumpClients, sharedClient })
  }

  disconnect(connectionId: string): void {
    const next = (this.refCount.get(connectionId) ?? 1) - 1
    if (next > 0) {
      this.refCount.set(connectionId, next)
      return
    }

    this.refCount.delete(connectionId)
    this.clearDisconnectTimer(connectionId)

    // 延迟断开，避免 React StrictMode 双挂载立刻掐断握手
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(connectionId)
      if ((this.refCount.get(connectionId) ?? 0) > 0) return
      this.forceDisconnect(connectionId)
    }, DISCONNECT_GRACE_MS)
    this.disconnectTimers.set(connectionId, timer)
  }

  disconnectAll(): void {
    for (const id of [...this.sessions.keys(), ...this.refCount.keys()]) {
      this.refCount.delete(id)
      this.clearDisconnectTimer(id)
      this.forceDisconnect(id)
    }
  }

  private forceDisconnect(connectionId: string): void {
    // 仅在没有引用时结束连接；进行中的握手等 Promise 结束后再收尾，避免误报 handshake 错误
    const pending = this.pendingAbort.get(connectionId)
    const inflight = this.connecting.get(connectionId)

    const finish = (): void => {
      if ((this.refCount.get(connectionId) ?? 0) > 0) return

      if (pending) {
        pending.abort()
        this.pendingAbort.delete(connectionId)
      }

      const session = this.sessions.get(connectionId)
      if (!session) return
      if (!session.sharedClient) {
        session.client.end()
        for (const jump of session.jumpClients) jump.end()
      }
      this.sessions.delete(connectionId)
    }

    if (inflight) {
      void inflight.finally(finish)
      return
    }
    finish()
  }

  private clearDisconnectTimer(connectionId: string): void {
    const timer = this.disconnectTimers.get(connectionId)
    if (timer) {
      clearTimeout(timer)
      this.disconnectTimers.delete(connectionId)
    }
  }

  async realpath(connectionId: string, path: string): Promise<string> {
    const sftp = this.getSftp(connectionId)
    const remotePath = normalizeRemotePath(path)

    return new Promise((resolve, reject) => {
      sftp.realpath(remotePath, (err, absPath) => {
        if (err) reject(err)
        else resolve(absPath.replace(/\\/g, '/'))
      })
    })
  }

  async listDir(connectionId: string, path: string): Promise<FileEntry[]> {
    const sftp = this.getSftp(connectionId)
    const remotePath = normalizeRemotePath(path)

    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          reject(err)
          return
        }

        const entries = list
          .filter((item) => item.filename !== '.' && item.filename !== '..')
          .map((item) => {
            const fullPath = joinRemotePath(remotePath, item.filename)
            const isDirectory = (item.attrs.mode & 0o40000) !== 0
            return {
              name: item.filename,
              path: fullPath,
              isDirectory,
              size: item.attrs.size ?? 0,
              modifiedAt: new Date((item.attrs.mtime ?? 0) * 1000).toISOString(),
              permissions: formatPermissions(item.attrs.mode ?? 0),
              mode: (item.attrs.mode ?? 0) & 0o777
            } satisfies FileEntry
          })
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
            return a.name.localeCompare(b.name)
          })

        resolve(entries)
      })
    })
  }

  async mkdir(connectionId: string, path: string): Promise<void> {
    const sftp = this.getSftp(connectionId)
    return new Promise((resolve, reject) => {
      sftp.mkdir(normalizeRemotePath(path), (err) => (err ? reject(err) : resolve()))
    })
  }

  async remove(connectionId: string, path: string, isDirectory: boolean): Promise<void> {
    const sftp = this.getSftp(connectionId)
    const remotePath = normalizeRemotePath(path)
    return new Promise((resolve, reject) => {
      const done = (err?: Error | null): void => (err ? reject(err) : resolve())
      if (isDirectory) sftp.rmdir(remotePath, done)
      else sftp.unlink(remotePath, done)
    })
  }

  async rename(connectionId: string, oldPath: string, newPath: string): Promise<void> {
    const sftp = this.getSftp(connectionId)
    return new Promise((resolve, reject) => {
      sftp.rename(normalizeRemotePath(oldPath), normalizeRemotePath(newPath), (err) =>
        err ? reject(err) : resolve()
      )
    })
  }

  async chmod(connectionId: string, path: string, mode: number): Promise<void> {
    const sftp = this.getSftp(connectionId)
    return new Promise((resolve, reject) => {
      sftp.chmod(normalizeRemotePath(path), mode, (err) => (err ? reject(err) : resolve()))
    })
  }

  async readFile(connectionId: string, path: string): Promise<string> {
    const sftp = this.getSftp(connectionId)
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = sftp.createReadStream(normalizeRemotePath(path))
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    })
  }

  async writeFile(connectionId: string, path: string, content: string): Promise<void> {
    const sftp = this.getSftp(connectionId)
    return new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(normalizeRemotePath(path))
      stream.on('error', reject)
      stream.on('close', () => resolve())
      stream.end(content, 'utf-8')
    })
  }

  async upload(
    connectionId: string,
    localPath: string,
    remotePath: string,
    transferId: string
  ): Promise<void> {
    const sftp = this.getSftp(connectionId)
    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(localPath, normalizeRemotePath(remotePath), {
        step: (transferred, _chunk, total) => {
          this.emitProgress({ transferId, transferred, total, status: 'progress' })
        }
      }, (err) => {
        if (err) {
          this.emitProgress({
            transferId,
            transferred: 0,
            total: 0,
            status: 'error',
            message: err.message
          })
          reject(err)
        } else {
          this.emitProgress({ transferId, transferred: 1, total: 1, status: 'done' })
          resolve()
        }
      })
    })
  }

  async download(
    connectionId: string,
    remotePath: string,
    localPath: string,
    transferId: string
  ): Promise<void> {
    const sftp = this.getSftp(connectionId)
    await new Promise<void>((resolve, reject) => {
      sftp.fastGet(normalizeRemotePath(remotePath), localPath, {
        step: (transferred, _chunk, total) => {
          this.emitProgress({ transferId, transferred, total, status: 'progress' })
        }
      }, (err) => {
        if (err) {
          this.emitProgress({
            transferId,
            transferred: 0,
            total: 0,
            status: 'error',
            message: err.message
          })
          reject(err)
        } else {
          this.emitProgress({ transferId, transferred: 1, total: 1, status: 'done' })
          resolve()
        }
      })
    })
  }

  private getSftp(connectionId: string): SFTPWrapper {
    const session = this.sessions.get(connectionId)
    if (!session) throw new Error('SFTP 未连接，请先建立 SSH 会话')
    return session.sftp
  }

  private emitProgress(event: SftpTransferProgress): void {
    this.getWindow()?.webContents.send(IPC_CHANNELS.SFTP_TRANSFER_PROGRESS, event)
  }
}
