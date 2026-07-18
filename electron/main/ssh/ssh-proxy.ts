import net from 'net'
import { SocksClient } from 'socks'

function decodeCredential(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function createHttpConnectSocket(
  proxyUrl: URL,
  destHost: string,
  destPort: number
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const port = Number(proxyUrl.port) || (proxyUrl.protocol === 'https:' ? 443 : 80)
    const socket = net.connect(port, proxyUrl.hostname)

    const auth =
      proxyUrl.username.length > 0
        ? `Proxy-Authorization: Basic ${Buffer.from(
            `${decodeCredential(proxyUrl.username)}:${decodeCredential(proxyUrl.password)}`
          ).toString('base64')}\r\n`
        : ''

    const connectReq = `CONNECT ${destHost}:${destPort} HTTP/1.1\r\nHost: ${destHost}:${destPort}\r\n${auth}\r\n`

    socket.once('connect', () => {
      socket.write(connectReq)
    })

    let header = ''
    const onData = (chunk: Buffer): void => {
      header += chunk.toString('utf-8')
      if (!header.includes('\r\n\r\n')) return

      socket.removeListener('data', onData)
      const statusLine = header.split('\r\n')[0] ?? ''
      const status = Number(statusLine.split(' ')[1])
      if (status >= 200 && status < 300) {
        const bodyStart = header.indexOf('\r\n\r\n') + 4
        if (bodyStart < header.length) {
          socket.unshift(Buffer.from(header.slice(bodyStart)))
        }
        resolve(socket)
        return
      }

      socket.destroy()
      reject(new Error(`HTTP 代理连接失败: ${statusLine}`))
    }

    socket.on('data', onData)
    socket.once('error', reject)
  })
}

export async function createProxySocket(
  proxyUrl: string,
  destHost: string,
  destPort: number
): Promise<net.Socket> {
  const url = new URL(proxyUrl)
  const protocol = url.protocol.replace(':', '').toLowerCase()

  if (protocol === 'socks5' || protocol === 'socks4' || protocol === 'socks4a') {
    const result = await SocksClient.createConnection({
      proxy: {
        host: url.hostname,
        port: Number(url.port) || 1080,
        type: protocol === 'socks4' || protocol === 'socks4a' ? 4 : 5,
        userId: url.username ? decodeCredential(url.username) : undefined,
        password: url.password ? decodeCredential(url.password) : undefined
      },
      command: 'connect',
      destination: { host: destHost, port: destPort }
    })
    return result.socket
  }

  if (protocol === 'http' || protocol === 'https') {
    return createHttpConnectSocket(url, destHost, destPort)
  }

  throw new Error(`不支持的代理协议: ${protocol}，支持 socks5/socks4/http/https`)
}
