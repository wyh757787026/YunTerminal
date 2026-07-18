import type { SFTPWrapper } from 'ssh2'
import type { Client } from 'ssh2'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../../src/shared/ipc'
import type {
  FileEntry,
  SftpTransferProgress
} from '../../../src/shared/types/sftp'
import type { ConnectionStore } from '../store/connection-store'
import { createSshClient } from '../ssh/ssh-connect'

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

export class SftpManager {
  private readonly sessions = new Map<string, SftpSession>()

  constructor(
    private readonly store: ConnectionStore,
    private getWindow: () => BrowserWindow | null
  ) {}

  async connect(connectionId: string, existingClient?: Client | null): Promise<void> {
    if (this.sessions.has(connectionId)) return

    let client: import('ssh2').Client
    let jumpClients: import('ssh2').Client[] = []
    let sharedClient = false

    if (existingClient) {
      client = existingClient
      sharedClient = true
    } else {
      const result = await createSshClient(this.store, connectionId)
      client = result.client
      jumpClients = result.jumpClients
    }

    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, wrapper) => {
        if (err) reject(err)
        else resolve(wrapper)
      })
    })

    this.sessions.set(connectionId, { client, sftp, jumpClients, sharedClient })
  }

  disconnect(connectionId: string): void {
    const session = this.sessions.get(connectionId)
    if (!session) return
    if (!session.sharedClient) {
      session.client.end()
      for (const jump of session.jumpClients) jump.end()
    }
    this.sessions.delete(connectionId)
  }

  disconnectAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.disconnect(id)
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
    let remotePath = normalizeRemotePath(path)
    if (remotePath === '.') {
      remotePath = await this.realpath(connectionId, '.')
    }

    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          reject(err)
          return
        }

        const entries: FileEntry[] = list
          .filter((item) => item.filename !== '.' && item.filename !== '..')
          .map((item) => ({
            name: item.filename,
            path: joinRemotePath(remotePath, item.filename),
            isDirectory: item.attrs.isDirectory(),
            size: item.attrs.size,
            modifiedAt: new Date((item.attrs.mtime ?? 0) * 1000).toISOString(),
            permissions: formatPermissions(item.attrs.mode ?? 0),
            mode: (item.attrs.mode ?? 0) & 0o777
          }))
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
            return a.name.localeCompare(b.name)
          })

        resolve(entries)
      })
    })
  }

  async readFile(connectionId: string, path: string): Promise<string> {
    const sftp = this.getSftp(connectionId)
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      sftp.readFile(normalizeRemotePath(path), (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })
    return buffer.toString('utf-8')
  }

  async writeFile(connectionId: string, path: string, content: string): Promise<void> {
    const sftp = this.getSftp(connectionId)
    await new Promise<void>((resolve, reject) => {
      sftp.writeFile(normalizeRemotePath(path), content, 'utf-8', (err) => {
        if (err) reject(err)
        else resolve()
      })
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

  async mkdir(connectionId: string, path: string): Promise<void> {
    const sftp = this.getSftp(connectionId)
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(normalizeRemotePath(path), (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async remove(connectionId: string, path: string, isDirectory: boolean): Promise<void> {
    const sftp = this.getSftp(connectionId)
    const remotePath = normalizeRemotePath(path)
    await new Promise<void>((resolve, reject) => {
      if (isDirectory) {
        sftp.rmdir(remotePath, (err) => {
          if (err) reject(err)
          else resolve()
        })
      } else {
        sftp.unlink(remotePath, (err) => {
          if (err) reject(err)
          else resolve()
        })
      }
    })
  }

  async rename(connectionId: string, oldPath: string, newPath: string): Promise<void> {
    const sftp = this.getSftp(connectionId)
    await new Promise<void>((resolve, reject) => {
      sftp.rename(normalizeRemotePath(oldPath), normalizeRemotePath(newPath), (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async chmod(connectionId: string, path: string, mode: number): Promise<void> {
    const sftp = this.getSftp(connectionId)
    await new Promise<void>((resolve, reject) => {
      sftp.chmod(normalizeRemotePath(path), mode, (err) => {
        if (err) reject(err)
        else resolve()
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
