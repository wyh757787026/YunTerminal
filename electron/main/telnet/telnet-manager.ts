import type { BrowserWindow } from 'electron'
import { Telnet } from 'telnet-client'
import type { Stream } from 'telnet-client/lib/utils'
import { IPC_CHANNELS, type TelnetStatusEvent } from '../../../src/shared/ipc'
import type { ConnectionStore } from '../store/connection-store'
import type { CredentialStore } from '../store/credential-store'
import type { SshAuthBridge } from '../ssh/ssh-auth-bridge'
import { buildTelnetConnectOptions, resolveTelnetCredentials } from './telnet-connect'

interface ActiveSession {
  client: Telnet
  connectionId: string
  shell?: Stream
}

export class TelnetManager {
  private readonly sessions = new Map<string, ActiveSession>()
  private readonly streamEpoch = new Map<string, number>()

  constructor(
    private readonly store: ConnectionStore,
    private getWindow: () => BrowserWindow | null,
    private readonly authBridge?: SshAuthBridge,
    private readonly credentialStore?: CredentialStore
  ) {}

  async connect(sessionId: string, connectionId: string, cols: number, rows: number): Promise<void> {
    this.disconnect(sessionId)
    const connectEpoch = this.bumpStreamEpoch(sessionId)

    const connection = this.store.getConnection(connectionId)
    if (!connection) {
      this.emitStatus(sessionId, 'error', '连接配置不存在')
      return
    }

    if (connection.protocol !== 'telnet') {
      this.emitStatus(sessionId, 'error', '该连接不是 Telnet 协议')
      return
    }

    this.store.recordRecent(connectionId)
    this.emitStatus(sessionId, 'connecting')

    const client = new Telnet()

    try {
      const credentials = await resolveTelnetCredentials(connection, this.store, {
        sessionId,
        authBridge: this.authBridge,
        credentialStore: this.credentialStore
      })

      if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) {
        await client.end().catch(() => undefined)
        return
      }

      this.sessions.set(sessionId, { client, connectionId })

      const connectOptions = buildTelnetConnectOptions(connection, credentials, cols, rows)
      await client.connect(connectOptions)

      if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) {
        await client.end().catch(() => undefined)
        return
      }

      const shell = await client.shell()
      const session = this.sessions.get(sessionId)
      if (!session) {
        shell.end()
        await client.end().catch(() => undefined)
        return
      }

      session.shell = shell
      this.emitStatus(sessionId, 'connected')

      shell.on('data', (data: Buffer | string) => {
        if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
        const text = typeof data === 'string' ? data : data.toString('utf-8')
        this.emitData(sessionId, text)
      })

      shell.on('close', () => {
        if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
        this.emitStatus(sessionId, 'disconnected')
        this.cleanup(sessionId)
      })
    } catch (err) {
      if (!this.isCurrentStreamEpoch(sessionId, connectEpoch)) return
      await client.end().catch(() => undefined)
      this.cleanup(sessionId)
      const message = err instanceof Error ? err.message : 'Telnet 连接失败'
      this.emitStatus(sessionId, 'error', message)
    }
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.shell?.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const client = session.client as unknown as {
      opts: { terminalWidth: number; terminalHeight: number }
    }
    client.opts.terminalWidth = cols
    client.opts.terminalHeight = rows
  }

  disconnect(sessionId: string): void {
    this.bumpStreamEpoch(sessionId)

    const session = this.sessions.get(sessionId)
    if (!session) return

    session.shell?.end()
    void session.client.end().catch(() => undefined)
    this.cleanup(sessionId)
  }

  disconnectAll(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      this.disconnect(sessionId)
    }
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
    this.getWindow()?.webContents.send(IPC_CHANNELS.TELNET_DATA, { sessionId, data })
  }

  private emitStatus(
    sessionId: string,
    status: TelnetStatusEvent['status'],
    message?: string
  ): void {
    this.getWindow()?.webContents.send(IPC_CHANNELS.TELNET_STATUS, { sessionId, status, message })
  }

  private cleanup(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}

export async function testTelnetConnection(
  store: ConnectionStore,
  connectionId: string,
  authBridge?: SshAuthBridge,
  credentialStore?: CredentialStore
): Promise<{ success: boolean; latencyMs?: number; message?: string }> {
  const connection = store.getConnection(connectionId)
  if (!connection || connection.protocol !== 'telnet') {
    return { success: false, message: 'Telnet 连接配置不存在' }
  }

  const startedAt = Date.now()
  const client = new Telnet()

  try {
    const credentials = await resolveTelnetCredentials(connection, store, {
      authBridge,
      credentialStore
    })
    const connectOptions = buildTelnetConnectOptions(connection, credentials, 80, 24)
    await client.connect(connectOptions)
    await client.end()
    return { success: true, latencyMs: Date.now() - startedAt }
  } catch (err) {
    await client.end().catch(() => undefined)
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Telnet 连接失败'
    }
  }
}
