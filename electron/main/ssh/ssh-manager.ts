import type { BrowserWindow } from 'electron'
import { Client } from 'ssh2'
import { IPC_CHANNELS, type SshStatusEvent } from '../../../src/shared/ipc'
import type { ConnectionStore } from '../store/connection-store'
import type { CredentialStore } from '../store/credential-store'
import type { RecordingManager } from '../recording/recording-manager'
import type { SshAuthBridge } from './ssh-auth-bridge'
import {
  createSshClient,
  getInitScript,
  getShellOptions
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

  constructor(
    private readonly store: ConnectionStore,
    private getWindow: () => BrowserWindow | null,
    private readonly recordingManager?: RecordingManager,
    private readonly authBridge?: SshAuthBridge,
    private readonly credentialStore?: CredentialStore,
    private readonly onConnectionClientClosed?: (connectionId: string) => void
  ) {}

  async connect(sessionId: string, connectionId: string, cols: number, rows: number): Promise<void> {
    this.disconnect(sessionId)
    const connectEpoch = this.bumpStreamEpoch(sessionId)

    const connection = this.store.getConnection(connectionId)
    if (!connection) {
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
        credentialStore: this.credentialStore
      })
      jumpClients = result.jumpClients
      const client = result.client

      if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) {
        client.end()
        for (const jump of jumpClients) jump.end()
        return
      }

      this.sessions.set(sessionId, { client, connectionId, jumpClients })

      const shellOptions = getShellOptions(connection)
      client.shell({ cols, rows, ...shellOptions }, (err, stream) => {
        if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) {
          stream.close()
          client.end()
          for (const jump of jumpClients) jump.end()
          return
        }

        if (err) {
          this.emitStatus(sessionId, 'error', err.message)
          this.disconnect(sessionId)
          return
        }

        const session = this.sessions.get(sessionId)
        if (!session) return

        session.stream = stream as unknown as ShellStream
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
      })

      client.on('error', (err) => {
        if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
        this.emitStatus(sessionId, 'error', err.message)
        this.cleanup(sessionId)
      })

      client.on('close', () => {
        if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
        if (this.sessions.has(sessionId)) {
          this.emitStatus(sessionId, 'disconnected')
          this.cleanup(sessionId)
        }
      })

      return
    } catch (err) {
      if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
      for (const client of jumpClients) client.end()
      const message = err instanceof Error ? err.message : '认证配置无效'
      this.emitStatus(sessionId, 'error', message)
    }
  }

  write(sessionId: string, data: string): void {
    this.recordingManager?.append(sessionId, 'in', data)
    this.sessions.get(sessionId)?.stream?.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.stream?.setWindow(rows, cols, 0, 0)
  }

  disconnect(sessionId: string): void {
    this.bumpStreamEpoch(sessionId)

    const session = this.sessions.get(sessionId)
    if (!session) return

    const stream = session.stream as { close?: () => void } | undefined
    stream?.close?.()
    session.client.end()
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
    this.recordingManager?.append(sessionId, 'out', data)
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
      for (const jump of session.jumpClients) jump.end()
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
      message: err instanceof Error ? err.message : '连接失败'
    }
  }
}
