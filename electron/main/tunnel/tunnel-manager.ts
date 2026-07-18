import { connect, createServer, type Server } from 'net'
import type { BrowserWindow } from 'electron'
import type { Client } from 'ssh2'
import { IPC_CHANNELS } from '../../../src/shared/ipc'
import type { StoredTunnel, TunnelStatusEvent } from '../../../src/shared/types/tunnel'
import type { ConnectionStore } from '../store/connection-store'
import type { CredentialStore } from '../store/credential-store'
import type { TunnelStore } from '../store/tunnel-store'
import type { SshAuthBridge } from '../ssh/ssh-auth-bridge'
import type { SshManager } from '../ssh/ssh-manager'
import { createSshClient } from '../ssh/ssh-connect'
import { isPortAvailable } from './port-utils'
import { createSocks5Server } from './socks5-server'

interface RunningTunnel {
  tunnelId: string
  connectionId: string
  client: Client
  jumpClients: Client[]
  servers: Server[]
  sharedClient: boolean
  tcpHandler?: (info: unknown, accept: () => import('stream').Duplex, reject: () => void) => void
}

export class TunnelManager {
  private readonly running = new Map<string, RunningTunnel>()
  private readonly statuses = new Map<string, TunnelStatusEvent>()
  private readonly stopping = new Set<string>()
  private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly connectionStore: ConnectionStore,
    private readonly tunnelStore: TunnelStore,
    private readonly getWindow: () => BrowserWindow | null,
    private readonly sshManager?: SshManager,
    private readonly authBridge?: SshAuthBridge,
    private readonly credentialStore?: CredentialStore
  ) {}

  listStatuses(connectionId?: string): TunnelStatusEvent[] {
    const tunnels = this.tunnelStore.listTunnels(connectionId)
    return tunnels.map((tunnel) => {
      const runtime = this.statuses.get(tunnel.id)
      return runtime ?? { tunnelId: tunnel.id, status: 'stopped' as const }
    })
  }

  private emitStatus(event: TunnelStatusEvent): void {
    this.statuses.set(event.tunnelId, event)
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.TUNNEL_STATUS, event)
    }
  }

  private isPortUsedByOtherTunnel(host: string, port: number, excludeId: string): boolean {
    for (const [tunnelId, session] of this.running) {
      if (tunnelId === excludeId) continue
      const tunnel = this.tunnelStore.getTunnel(tunnelId)
      if (!tunnel) continue
      if (tunnel.bindHost === host && tunnel.bindPort === port) return true
    }
    return false
  }

  async startAutoStartForConnection(connectionId: string): Promise<void> {
    const tunnels = this.tunnelStore.listTunnels(connectionId).filter((t) => t.autoStart)
    for (const tunnel of tunnels) {
      if (!this.running.has(tunnel.id)) {
        await this.start(tunnel.id, { preferShared: true })
      }
    }
  }

  async stopByConnectionId(connectionId: string, sharedOnly = false): Promise<void> {
    const toStop = [...this.running.entries()].filter(([, session]) => {
      if (session.connectionId !== connectionId) return false
      return sharedOnly ? session.sharedClient : true
    })
    await Promise.all(toStop.map(([tunnelId]) => this.stop(tunnelId)))
  }

  async start(
    tunnelId: string,
    options?: { preferShared?: boolean }
  ): Promise<{ success: boolean; message?: string }> {
    if (this.running.has(tunnelId)) {
      return { success: true }
    }

    const tunnel = this.tunnelStore.getTunnel(tunnelId)
    if (!tunnel) {
      return { success: false, message: '转发规则不存在' }
    }

    if (!this.connectionStore.getConnection(tunnel.connectionId)) {
      return { success: false, message: '关联 SSH 连接不存在' }
    }

    const duplicate = this.tunnelStore
      .listTunnels(tunnel.connectionId)
      .find(
        (item) =>
          item.id !== tunnel.id &&
          item.bindHost === tunnel.bindHost &&
          item.bindPort === tunnel.bindPort
      )
    if (duplicate) {
      return {
        success: false,
        message: `端口 ${tunnel.bindHost}:${tunnel.bindPort} 已被规则「${duplicate.name}」使用`
      }
    }

    if (tunnel.type !== 'remote') {
      if (this.isPortUsedByOtherTunnel(tunnel.bindHost, tunnel.bindPort, tunnelId)) {
        return { success: false, message: `端口 ${tunnel.bindPort} 已被其他转发规则占用` }
      }
      const available = await isPortAvailable(tunnel.bindHost, tunnel.bindPort)
      if (!available) {
        return { success: false, message: `端口 ${tunnel.bindHost}:${tunnel.bindPort} 已被占用` }
      }
    }

    this.emitStatus({ tunnelId, status: 'connecting' })

    let client: Client | null = null
    let jumpClients: Client[] = []
    let sharedClient = false

    try {
      const existing =
        options?.preferShared !== false
          ? this.sshManager?.getClientForConnection(tunnel.connectionId)
          : null

      if (existing) {
        client = existing
        sharedClient = true
      } else {
        const result = await createSshClient(this.connectionStore, tunnel.connectionId, {
          authBridge: this.authBridge,
          credentialStore: this.credentialStore
        })
        client = result.client
        jumpClients = result.jumpClients
      }

      const session: RunningTunnel = {
        tunnelId,
        connectionId: tunnel.connectionId,
        client,
        jumpClients,
        servers: [],
        sharedClient
      }
      this.running.set(tunnelId, session)

      if (tunnel.type === 'local') {
        const server = await this.startLocalForward(client, tunnel)
        session.servers.push(server)
      } else if (tunnel.type === 'remote') {
        session.tcpHandler = await this.startRemoteForward(client, tunnel)
      } else {
        const server = await createSocks5Server(client, tunnel.bindHost, tunnel.bindPort)
        session.servers.push(server)
      }

      if (!sharedClient) {
        client.on('close', () => {
          void this.handleUnexpectedDisconnect(tunnelId)
        })
        client.on('error', (err) => {
          this.emitStatus({
            tunnelId,
            status: 'error',
            errorMessage: err.message
          })
          void this.handleUnexpectedDisconnect(tunnelId)
        })
      }

      this.emitStatus({ tunnelId, status: 'running' })
      return { success: true }
    } catch (err) {
      if (client && !sharedClient) {
        client.end()
        for (const jump of jumpClients) jump.end()
      }
      await this.stop(tunnelId, false)
      const message = err instanceof Error ? err.message : '启动转发失败'
      this.emitStatus({ tunnelId, status: 'error', errorMessage: message })
      return { success: false, message }
    }
  }

  private startLocalForward(client: Client, tunnel: StoredTunnel): Promise<Server> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => {
        client.forwardOut(
          socket.remoteAddress ?? '127.0.0.1',
          socket.remotePort ?? 0,
          tunnel.targetHost,
          tunnel.targetPort,
          (err, stream) => {
            if (err || !stream) {
              socket.end()
              return
            }
            socket.pipe(stream).pipe(socket)
          }
        )
      })
      server.once('error', reject)
      server.listen(tunnel.bindPort, tunnel.bindHost, () => resolve(server))
    })
  }

  private startRemoteForward(
    client: Client,
    tunnel: StoredTunnel
  ): Promise<RunningTunnel['tcpHandler']> {
    return new Promise((resolve, reject) => {
      const handler = (
        _info: unknown,
        accept: () => import('stream').Duplex,
        rejectChannel: () => void
      ): void => {
        const stream = accept()
        const local = connect(tunnel.targetPort, tunnel.targetHost, () => {
          stream.pipe(local).pipe(stream)
        })
        local.on('error', () => {
          rejectChannel()
          stream.end()
        })
        stream.on('error', () => local.destroy())
      }

      client.on('tcp connection', handler)
      client.forwardIn(tunnel.bindHost, tunnel.bindPort, (err) => {
        if (err) {
          client.removeListener('tcp connection', handler)
          reject(err)
          return
        }
        resolve(handler)
      })
    })
  }

  async stop(tunnelId: string, emitStopped = true): Promise<void> {
    this.stopping.add(tunnelId)
    const reconnectTimer = this.reconnectTimers.get(tunnelId)
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      this.reconnectTimers.delete(tunnelId)
    }

    const session = this.running.get(tunnelId)
    if (!session) {
      this.stopping.delete(tunnelId)
      if (emitStopped) {
        this.emitStatus({ tunnelId, status: 'stopped' })
      }
      return
    }

    if (session.tcpHandler) {
      session.client.removeListener('tcp connection', session.tcpHandler)
    }

    for (const server of session.servers) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    }

    if (!session.sharedClient) {
      session.client.end()
      for (const jump of session.jumpClients) {
        jump.end()
      }
    }

    this.running.delete(tunnelId)
    this.stopping.delete(tunnelId)
    if (emitStopped) {
      this.emitStatus({ tunnelId, status: 'stopped' })
    }
  }

  private async handleUnexpectedDisconnect(tunnelId: string): Promise<void> {
    if (this.stopping.has(tunnelId)) return

    const tunnel = this.tunnelStore.getTunnel(tunnelId)
    await this.stop(tunnelId, true)

    if (tunnel?.autoReconnect) {
      this.scheduleReconnect(tunnelId)
    }
  }

  private scheduleReconnect(tunnelId: string): void {
    const existing = this.reconnectTimers.get(tunnelId)
    if (existing) clearTimeout(existing)

    this.emitStatus({ tunnelId, status: 'connecting' })
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(tunnelId)
      void this.start(tunnelId, { preferShared: true })
    }, 3000)
    this.reconnectTimers.set(tunnelId, timer)
  }

  stopAll(): void {
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer)
    }
    this.reconnectTimers.clear()
    for (const tunnelId of [...this.running.keys()]) {
      void this.stop(tunnelId)
    }
  }

  isRunning(tunnelId: string): boolean {
    return this.running.has(tunnelId)
  }

  onSshClientClosed(connectionId: string): void {
    const affected = [...this.running.entries()].filter(
      ([, session]) => session.connectionId === connectionId && session.sharedClient
    )
    for (const [tunnelId] of affected) {
      void this.handleUnexpectedDisconnect(tunnelId)
    }
  }
}
