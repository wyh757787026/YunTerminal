import type { BrowserWindow } from 'electron'
import { Client } from 'ssh2'
import { IPC_CHANNELS, type SshStatusEvent } from '../../../src/shared/ipc'
import type { ConnectionStore } from '../store/connection-store'
import type { CredentialStore } from '../store/credential-store'
import type { SshAuthBridge } from './ssh-auth-bridge'
import {
  createSshClient,
  formatSshError,
  getInitScript,
  getShellOptions,
  isSshAbortError
} from '../ssh/ssh-connect'

interface ShellStream {
  write: (data: string) => void
  setWindow: (rows: number, cols: number, height: number, width: number) => void
  on: (event: string, listener: (...args: unknown[]) => void) => void
  stderr: { on: (event: string, listener: (...args: unknown[]) => void) => void }
}

interface ActiveSession {
  client: Client
  connectionId: string
  stream?: ShellStream
  jumpClients: Client[]
}

export { buildConnectConfig, establishJumpChain } from '../ssh/ssh-connect'

export class SshManager {
  private readonly sessions = new Map<string, ActiveSession>()
  /** 每次 connect/disconnect 递增，用于丢弃过期 shell 的输出 */
  private readonly streamEpoch = new Map<string, number>()
  private readonly pendingAbort = new Map<string, AbortController>()
  private readonly connectingTasks = new Map<string, Promise<void>>()

  constructor(
    private readonly store: ConnectionStore,
    private getWindow: () => BrowserWindow | null,
    private readonly authBridge?: SshAuthBridge,
    private readonly credentialStore?: CredentialStore,
    private readonly onConnectionClientClosed?: (connectionId: string) => void
  ) {}

  async connect(sessionId: string, connectionId: string, cols: number, rows: number): Promise<void> {
    // 先同步占位，避免并发 connect 在 await 前都通过检查并各自 doConnect
    const inflight = this.connectingTasks.get(sessionId)
    if (inflight) {
      await inflight
      const after = this.sessions.get(sessionId)
      if (after?.stream && after.connectionId === connectionId) {
        this.resize(sessionId, cols, rows)
        this.emitStatus(sessionId, 'connected')
      }
      return
    }

    const existing = this.sessions.get(sessionId)
    if (existing?.connectionId === connectionId && existing.stream) {
      this.resize(sessionId, cols, rows)
      this.emitStatus(sessionId, 'connected')
      return
    }

    let settle!: () => void
    const gate = new Promise<void>((resolve) => {
      settle = resolve
    })
    this.connectingTasks.set(sessionId, gate)

    try {
      await this.doConnect(sessionId, connectionId, cols, rows)
    } finally {
      settle()
      if (this.connectingTasks.get(sessionId) === gate) {
        this.connectingTasks.delete(sessionId)
      }
    }
  }

  private async doConnect(
    sessionId: string,
    connectionId: string,
    cols: number,
    rows: number
  ): Promise<void> {
    // 仅在已有完整会话时替换；进行中的半连接由 connect() 等待，不走到这里
    if (this.sessions.has(sessionId)) {
      this.disconnect(sessionId)
    }

    const connectEpoch = this.bumpStreamEpoch(sessionId)
    const abort = new AbortController()
    this.pendingAbort.set(sessionId, abort)

    const connection = this.store.getConnection(connectionId)
    if (!connection) {
      this.pendingAbort.delete(sessionId)
      this.emitStatus(sessionId, 'error', '连接配置不存在')
      return
    }

    this.store.recordRecent(connectionId)
    this.emitStatus(sessionId, 'connecting')

    let jumpClients: Client[] = []

    try {
      const result = await createSshClient(this.store, connectionId, {
        sessionId,
        authBridge: this.authBridge,
        credentialStore: this.credentialStore,
        signal: abort.signal
      })
      jumpClients = result.jumpClients
      const client = result.client

      if (!this.isCurrentStreamEpoch(sessionId, connectEpoch) || abort.signal.aborted) {
        client.end()
        for (const jump of jumpClients) jump.end()
        return
      }

      this.sessions.set(sessionId, { client, connectionId, jumpClients })

      const shellOptions = getShellOptions(connection)

      // 必须等到 shell 就绪再结束 connecting 任务，避免二次 connect 误杀握手
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const finish = (fn: () => void): void => {
          if (settled) return
          settled = true
          fn()
        }

        const dropHalfOpen = (stream?: { close?: () => void }): void => {
          try {
            stream?.close?.()
          } catch {
            // ignore
          }
          try {
            client.end()
          } catch {
            // ignore
          }
          for (const jump of jumpClients) {
            try {
              jump.end()
            } catch {
              // ignore
            }
          }
          this.sessions.delete(sessionId)
        }

        const onEarlyError = (err: Error): void => {
          if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) {
            finish(() => resolve())
            return
          }
          if (abort.signal.aborted || isSshAbortError(err)) {
            dropHalfOpen()
            finish(() => resolve())
            return
          }
          finish(() => reject(err))
        }

        client.once('error', onEarlyError)

        client.shell({ cols, rows, ...shellOptions }, (err, stream) => {
          client.removeListener('error', onEarlyError)

          if (!this.isCurrentStreamEpoch(sessionId, connectEpoch) || abort.signal.aborted) {
            dropHalfOpen(stream)
            finish(() => resolve())
            return
          }

          if (err) {
            finish(() => reject(err))
            return
          }

          const session = this.sessions.get(sessionId)
          if (!session) {
            try {
              stream.close()
            } catch {
              // ignore
            }
            finish(() => resolve())
            return
          }

          session.stream = stream as unknown as ShellStream
          this.pendingAbort.delete(sessionId)
          this.emitStatus(sessionId, 'connected')

          const initScript = getInitScript(connection)
          if (initScript) {
            setTimeout(() => {
              const lines = initScript.split(/\r?\n/)
              for (const line of lines) {
                if (line.length === 0) continue
                session.stream?.write(`${line}\r`)
              }
            }, 300)
          }

          stream.on('data', (data: Buffer) => {
            if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
            this.emitData(sessionId, data.toString('utf-8'))
          })

          stream.stderr.on('data', (data: Buffer) => {
            if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
            this.emitData(sessionId, data.toString('utf-8'))
          })

          stream.on('close', () => {
            if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
            this.emitStatus(sessionId, 'disconnected')
            this.cleanup(sessionId)
          })

          client.on('error', (clientErr) => {
            if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
            if (abort.signal.aborted || isSshAbortError(clientErr)) return
            this.emitStatus(sessionId, 'error', formatSshError(clientErr))
            this.cleanup(sessionId)
          })

          client.on('close', () => {
            if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
            if (this.sessions.has(sessionId)) {
              this.emitStatus(sessionId, 'disconnected')
              this.cleanup(sessionId)
            }
          })

          finish(() => resolve())
        })
      })
    } catch (err) {
      this.pendingAbort.delete(sessionId)
      if (
        !this.isCurrentStreamEpoch(sessionId, connectEpoch) ||
        isSshAbortError(err) ||
        abort.signal.aborted
      ) {
        return
      }
      for (const jump of jumpClients) jump.end()
      this.cleanup(sessionId)
      this.emitStatus(sessionId, 'error', formatSshError(err))
    }
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.stream?.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.stream?.setWindow(rows, cols, 0, 0)
  }

  disconnect(sessionId: string): void {
    this.bumpStreamEpoch(sessionId)
    const pending = this.pendingAbort.get(sessionId)
    if (pending) {
      pending.abort()
      this.pendingAbort.delete(sessionId)
    }

    const session = this.sessions.get(sessionId)
    if (!session) return

    const stream = session.stream as { close?: () => void } | undefined
    stream?.close?.()
    this.cleanup(sessionId)
  }

  disconnectAll(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      this.disconnect(sessionId)
    }
  }

  getClientForConnection(connectionId: string): Client | null {
    for (const session of this.sessions.values()) {
      if (session.connectionId === connectionId) return session.client
    }
    return null
  }

  async exec(
    connectionId: string,
    command: string
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    let client = this.getClientForConnection(connectionId)
    let jumpClients: Client[] = []
    let owned = false

    if (!client) {
      const result = await createSshClient(this.store, connectionId, {
        authBridge: this.authBridge,
        credentialStore: this.credentialStore
      })
      client = result.client
      jumpClients = result.jumpClients
      owned = true
    }

    try {
      return await this.execOnClient(client, command)
    } finally {
      if (owned) {
        client.end()
        for (const jump of jumpClients) jump.end()
      }
    }
  }

  private execOnClient(
    client: Client,
    command: string
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        let stdout = ''
        let stderr = ''
        stream.on('data', (data: Buffer) => {
          stdout += data.toString('utf-8')
        })
        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8')
        })
        stream.on('close', (code: number | null) => {
          resolve({ stdout, stderr, code: code ?? 0 })
        })
      })
    })
  }

  private bumpStreamEpoch(sessionId: string): number {
    const next = (this.streamEpoch.get(sessionId) ?? 0) + 1
    this.streamEpoch.set(sessionId, next)
    return next
  }

  private isCurrentStreamEpoch(sessionId: string, epoch: number): boolean {
    return this.streamEpoch.get(sessionId) === epoch
  }

  private emitData(sessionId: string, data: string): void {
    this.getWindow()?.webContents.send(IPC_CHANNELS.SSH_DATA, { sessionId, data })
  }

  private emitStatus(
    sessionId: string,
    status: SshStatusEvent['status'],
    message?: string
  ): void {
    this.getWindow()?.webContents.send(IPC_CHANNELS.SSH_STATUS, { sessionId, status, message })
  }

  private cleanup(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    const connectionId = session?.connectionId
    if (session) {
      try {
        session.client.end()
      } catch {
        // ignore
      }
      for (const jump of session.jumpClients) {
        try {
          jump.end()
        } catch {
          // ignore
        }
      }
    }
    this.sessions.delete(sessionId)
    if (connectionId && !this.getClientForConnection(connectionId)) {
      this.onConnectionClientClosed?.(connectionId)
    }
  }
}

export async function testConnection(
  store: ConnectionStore,
  connectionId: string,
  authBridge?: SshAuthBridge,
  credentialStore?: CredentialStore
): Promise<{ success: boolean; latencyMs?: number; message?: string }> {
  const connection = store.getConnection(connectionId)
  if (connection?.protocol === 'rdp') {
    return { success: false, message: 'RDP 连接请使用「连接」直接启动远程桌面' }
  }

  const startedAt = Date.now()
  let jumpClients: Client[] = []

  try {
    const { client, jumpClients: jumps } = await createSshClient(store, connectionId, {
      authBridge,
      credentialStore
    })
    jumpClients = jumps
    client.end()
    for (const jump of jumpClients) jump.end()
    return { success: true, latencyMs: Date.now() - startedAt }
  } catch (err) {
    for (const jump of jumpClients) jump.end()
    return {
      success: false,
      message: formatSshError(err)
    }
  }
}
