import { createServer, type Server as HttpServer } from 'http'
import { randomUUID } from 'crypto'
import net from 'net'
import { WebSocketServer, type WebSocket } from 'ws'

const DEFAULT_VNC_PORT = 5900

interface VncSession {
  sessionId: string
  token: string
  host: string
  port: number
  connections: Set<WebSocket>
}

function toBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data)
}

/** 本地 WebSocket → 远端 VNC TCP 代理，对齐 XTerminal VncProxyService */
export class VncProxyService {
  private server: HttpServer | null = null
  private wsServer: WebSocketServer | null = null
  private port: number | null = null
  private startPromise: Promise<number> | null = null
  private readonly sessions = new Map<string, VncSession>()

  async getProxyPort(): Promise<number> {
    return this.startProxy()
  }

  async startProxy(): Promise<number> {
    if (this.port != null) return this.port
    if (this.startPromise) return this.startPromise

    this.startPromise = this.createServer()
    try {
      this.port = await this.startPromise
      return this.port
    } finally {
      this.startPromise = null
    }
  }

  private createServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer()
      const wss = new WebSocketServer({ noServer: true })

      server.on('upgrade', (request, socket, head) => {
        const hostHeader = request.headers.host ?? '127.0.0.1'
        const url = new URL(request.url ?? '/', `http://${hostHeader}`)
        const match = url.pathname.match(/^\/vnc\/([^/]+)$/)
        if (!match) {
          socket.destroy()
          return
        }

        const sessionId = decodeURIComponent(match[1])
        const token = url.searchParams.get('token')
        const session = this.sessions.get(sessionId)
        if (!session || session.token !== token) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
          socket.destroy()
          return
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          this.attachWebSocket(session, ws)
        })
      })

      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          reject(new Error('VNC 代理绑定失败'))
          return
        }
        this.server = server
        this.wsServer = wss
        resolve(address.port)
      })

      server.on('error', reject)
    })
  }

  private attachWebSocket(session: VncSession, ws: WebSocket): void {
    session.connections.add(ws)

    const tcp = net.createConnection({ host: session.host, port: session.port })

    tcp.on('data', (chunk) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(chunk)
      }
    })

    ws.on('message', (data) => {
      if (!tcp.destroyed) {
        tcp.write(toBuffer(data))
      }
    })

    const cleanup = (): void => {
      session.connections.delete(ws)
      if (!tcp.destroyed) {
        tcp.destroy()
      }
      if (session.connections.size === 0) {
        this.sessions.delete(session.sessionId)
      }
    }

    ws.on('close', cleanup)
    ws.on('error', cleanup)
    tcp.on('close', () => {
      if (ws.readyState === ws.OPEN) {
        ws.close()
      }
    })
    tcp.on('error', () => {
      if (ws.readyState === ws.OPEN) {
        ws.close()
      }
    })
  }

  async createSession(params: {
    sessionId?: string
    host: string
    port?: number
  }): Promise<{ sessionId: string; token: string }> {
    const sessionId = params.sessionId ?? randomUUID()
    const token = randomUUID()

    if (this.sessions.has(sessionId)) {
      await this.closeSession(sessionId)
    }

    this.sessions.set(sessionId, {
      sessionId,
      token,
      host: params.host,
      port: params.port ?? DEFAULT_VNC_PORT,
      connections: new Set()
    })

    return { sessionId, token }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    for (const ws of session.connections) {
      ws.close()
    }
    this.sessions.delete(sessionId)
  }

  async stopAll(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) {
      await this.closeSession(sessionId)
    }

    this.wsServer?.close()
    this.wsServer = null

    await new Promise<void>((resolve) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close(() => resolve())
    })

    this.server = null
    this.port = null
    this.startPromise = null
  }
}
