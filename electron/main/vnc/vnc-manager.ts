import net from 'net'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS, type ConnectionTestResult, type VncConnectResult } from '../../../src/shared/ipc'
import type { VncAuthType } from '../../../src/shared/types/vnc'
import type { ConnectionStore } from '../store/connection-store'
import { VncProxyService } from './vnc-proxy-service'

function resolveCredentials(
  authType: VncAuthType,
  username: string,
  password?: string
): { username?: string; password?: string } | undefined {
  switch (authType) {
    case 'none':
      return undefined
    case 'password':
      return password ? { password } : undefined
    case 'usernamePassword':
      return { username: username || undefined, password }
    default: {
      const _exhaustive: never = authType
      return _exhaustive
    }
  }
}

export async function testVncConnection(
  store: ConnectionStore,
  connectionId: string
): Promise<ConnectionTestResult> {
  const connection = store.getConnection(connectionId)
  if (!connection) {
    return { success: false, message: '连接配置不存在' }
  }
  if (connection.protocol !== 'vnc') {
    return { success: false, message: '该连接不是 VNC 类型' }
  }

  const started = Date.now()
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: connection.host, port: connection.port })
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve({ success: false, message: '连接超时' })
    }, 8000)

    socket.once('connect', () => {
      clearTimeout(timeout)
      socket.destroy()
      resolve({ success: true, latencyMs: Date.now() - started })
    })

    socket.once('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, message: err.message })
    })
  })
}

export class VncManager {
  private readonly sessionConnections = new Map<string, string>()

  constructor(
    private readonly store: ConnectionStore,
    private readonly proxy: VncProxyService,
    private readonly getWindow: () => BrowserWindow | null
  ) {}

  private emitStatus(
    sessionId: string,
    status: 'connecting' | 'connected' | 'disconnected' | 'error',
    message?: string
  ): void {
    const win = this.getWindow()
    if (!win) return
    win.webContents.send(IPC_CHANNELS.VNC_STATUS, { sessionId, status, message })
  }

  async connect(sessionId: string, connectionId: string): Promise<VncConnectResult> {
    const connection = this.store.getConnection(connectionId)
    if (!connection) {
      return { success: false, message: '连接配置不存在' }
    }
    if (connection.protocol !== 'vnc') {
      return { success: false, message: '该连接不是 VNC 类型' }
    }

    this.emitStatus(sessionId, 'connecting')

    try {
      const proxyPort = await this.proxy.getProxyPort()
      const { sessionId: proxySessionId, token } = await this.proxy.createSession({
        sessionId,
        host: connection.host,
        port: connection.port
      })

      this.sessionConnections.set(sessionId, connectionId)
      this.store.recordRecent(connectionId)

      const authType = connection.vnc?.authType ?? 'password'
      const secrets = this.store.getConnectionSecrets(connectionId)
      const credentials = resolveCredentials(authType, connection.username, secrets.password)
      const vnc = connection.vnc

      return {
        success: true,
        proxyPort,
        sessionId: proxySessionId,
        token,
        credentials,
        viewOnly: vnc?.viewOnly ?? false,
        scaleViewport: vnc?.scaleViewport ?? true,
        clipViewport: vnc?.clipViewport ?? false,
        shared: vnc?.shared ?? true,
        qualityLevel: vnc?.qualityLevel ?? 6,
        compressionLevel: vnc?.compressionLevel ?? 2
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'VNC 连接失败'
      this.emitStatus(sessionId, 'error', message)
      return { success: false, message }
    }
  }

  async disconnect(sessionId: string): Promise<void> {
    await this.proxy.closeSession(sessionId)
    this.sessionConnections.delete(sessionId)
    this.emitStatus(sessionId, 'disconnected')
  }

  async disconnectAll(): Promise<void> {
    for (const sessionId of [...this.sessionConnections.keys()]) {
      await this.disconnect(sessionId)
    }
  }
}
