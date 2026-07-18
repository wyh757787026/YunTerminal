import { Duplex } from 'node:stream'
import net from 'node:net'
import tls from 'node:tls'
import type { FTPContext, FTPResponse } from 'basic-ftp'

/**
 * basic-ftp 在发 LIST/RETR/STOR 前就要求 dataSocket 已存在；
 * 主动模式是服务端在收到传输命令后才连入，因此用代理套接字延迟绑定真实连接。
 */
class DeferredDataSocket extends Duplex {
  private target: net.Socket | null = null
  private writeQueue: Buffer[] = []
  private endRequested = false
  private pendingTimeoutMs: number | undefined
  private pendingTimeoutCb: (() => void) | undefined
  private server: net.Server | null = null

  bindServer(server: net.Server): void {
    this.server = server
  }

  attach(socket: net.Socket): void {
    if (this.target) {
      socket.destroy()
      return
    }
    this.target = socket
    socket.on('data', (chunk: Buffer) => {
      if (!this.push(chunk)) socket.pause()
    })
    socket.on('end', () => {
      this.push(null)
    })
    socket.on('error', (err) => {
      this.destroy(err)
    })
    socket.on('close', () => {
      if (!this.destroyed && !this.readableEnded) this.push(null)
    })
    if (this.pendingTimeoutMs !== undefined) {
      socket.setTimeout(this.pendingTimeoutMs, this.pendingTimeoutCb)
    }
    for (const chunk of this.writeQueue) {
      socket.write(chunk)
    }
    this.writeQueue = []
    if (this.endRequested) socket.end()
    if ('encrypted' in socket) {
      this.emit('secureConnect')
    }
  }

  /** basic-ftp 上传前用 getCipher 判断 TLS 是否就绪 */
  getCipher(): tls.CipherNameAndProtocol | undefined {
    const sock = this.target
    if (sock && 'getCipher' in sock && typeof sock.getCipher === 'function') {
      return sock.getCipher() ?? undefined
    }
    return undefined
  }

  setTimeout(ms: number, callback?: () => void): this {
    this.pendingTimeoutMs = ms
    this.pendingTimeoutCb = callback
    this.target?.setTimeout(ms, callback)
    return this
  }

  override _read(): void {
    this.target?.resume()
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    if (!this.target) {
      this.writeQueue.push(Buffer.from(chunk))
      callback()
      return
    }
    this.target.write(chunk, callback)
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.endRequested = true
    if (!this.target) {
      callback()
      return
    }
    this.target.end(callback)
  }

  override destroy(error?: Error): this {
    try {
      this.server?.close()
    } catch {
      // ignore
    }
    this.server = null
    this.target?.destroy(error)
    return super.destroy(error)
  }
}

function normalizeIp(address: string): string {
  return address.replace(/^::ffff:/i, '')
}

function isIPv4(address: string): boolean {
  return net.isIPv4(normalizeIp(address))
}

function buildPortCommand(ip: string, port: number): string {
  const parts = normalizeIp(ip).split('.')
  const p1 = (port >> 8) & 255
  const p2 = port & 255
  return `PORT ${parts.join(',')},${p1},${p2}`
}

function buildEprtCommand(ip: string, port: number): string {
  const host = normalizeIp(ip)
  const family = isIPv4(host) ? 1 : 2
  return `EPRT |${family}|${host}|${port}|`
}

/**
 * 主动模式（PORT/EPRT）：客户端监听，服务端反向连入数据通道。
 */
export async function enterActiveMode(ftp: FTPContext): Promise<FTPResponse> {
  const localAddress = ftp.socket.localAddress
  if (!localAddress) {
    throw new Error('无法获取本地地址，主动模式不可用')
  }

  const listenHost = normalizeIp(localAddress)
  const deferred = new DeferredDataSocket()

  return await new Promise<FTPResponse>((resolve, reject) => {
    let settled = false
    const server = net.createServer()
    deferred.bindServer(server)

    const fail = (err: Error): void => {
      if (settled) return
      settled = true
      try {
        server.close()
      } catch {
        // ignore
      }
      deferred.destroy()
      reject(err)
    }

    server.once('error', (err) => {
      fail(err instanceof Error ? err : new Error(String(err)))
    })

    server.once('connection', (rawSocket) => {
      const upgrade =
        ftp.socket instanceof tls.TLSSocket
          ? tls.connect({
              ...(ftp.tlsOptions ?? {}),
              socket: rawSocket,
              session: ftp.tlsSessionStore ?? ftp.socket.getSession()
            })
          : rawSocket

      const attach = (): void => {
        deferred.attach(upgrade)
      }

      if (upgrade instanceof tls.TLSSocket) {
        upgrade.once('session', (session) => {
          ftp.tlsSessionStore = session
        })
        if (upgrade.getCipher()) {
          attach()
        } else {
          upgrade.once('secureConnect', attach)
        }
      } else {
        attach()
      }
    })

    server.listen(0, listenHost, () => {
      void (async () => {
        try {
          const addr = server.address()
          if (!addr || typeof addr === 'string') {
            fail(new Error('主动模式监听失败'))
            return
          }

          const port = addr.port
          const advertisedIp =
            addr.address === '0.0.0.0' || addr.address === '::'
              ? listenHost
              : normalizeIp(addr.address)

          const command = isIPv4(advertisedIp)
            ? buildPortCommand(advertisedIp, port)
            : buildEprtCommand(advertisedIp, port)

          // 先挂上代理套接字，再发 PORT；真实连接在传输命令之后到达
          ftp.dataSocket = deferred as unknown as net.Socket
          const response = await ftp.request(command)
          if (settled) return
          settled = true
          resolve(response)
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)))
        }
      })()
    })
  })
}
