import { createServer, type Server, type Socket } from 'net'
import type { Client } from 'ssh2'

const SOCKS_VERSION = 0x05
const CMD_CONNECT = 0x01
const ATYP_IPV4 = 0x01
const ATYP_DOMAIN = 0x03
const ATYP_IPV6 = 0x04
const REPLY_SUCCESS = 0x00
const REPLY_GENERAL_FAILURE = 0x01

function readAddress(
  buffer: Buffer,
  offset: number
): { host: string; port: number; nextOffset: number } | null {
  const atyp = buffer[offset]
  if (atyp === ATYP_IPV4) {
    if (buffer.length < offset + 7) return null
    const host = `${buffer[offset + 1]}.${buffer[offset + 2]}.${buffer[offset + 3]}.${buffer[offset + 4]}`
    const port = buffer.readUInt16BE(offset + 5)
    return { host, port, nextOffset: offset + 7 }
  }
  if (atyp === ATYP_DOMAIN) {
    const len = buffer[offset + 1]
    if (buffer.length < offset + 4 + len) return null
    const host = buffer.subarray(offset + 2, offset + 2 + len).toString('utf-8')
    const port = buffer.readUInt16BE(offset + 2 + len)
    return { host, port, nextOffset: offset + 4 + len }
  }
  if (atyp === ATYP_IPV6) {
    if (buffer.length < offset + 19) return null
    const host = buffer.subarray(offset + 1, offset + 17).toString('hex')
    const port = buffer.readUInt16BE(offset + 17)
    return { host, port, nextOffset: offset + 19 }
  }
  return null
}

function sendReply(socket: Socket, reply: number): void {
  const response = Buffer.from([SOCKS_VERSION, reply, 0x00, ATYP_IPV4, 0, 0, 0, 0, 0, 0])
  socket.write(response)
}

function handleSocksConnection(client: Client, socket: Socket): void {
  let stage: 'greeting' | 'request' = 'greeting'
  let buffer = Buffer.alloc(0)

  const onData = (chunk: Buffer): void => {
    buffer = Buffer.concat([buffer, chunk])

    if (stage === 'greeting') {
      if (buffer.length < 2) return
      const nmethods = buffer[1]
      if (buffer.length < 2 + nmethods) return
      socket.write(Buffer.from([SOCKS_VERSION, 0x00]))
      buffer = buffer.subarray(2 + nmethods)
      stage = 'request'
    }

    if (stage === 'request') {
      if (buffer.length < 4) return
      const cmd = buffer[1]
      if (cmd !== CMD_CONNECT) {
        sendReply(socket, REPLY_GENERAL_FAILURE)
        socket.end()
        socket.removeListener('data', onData)
        return
      }

      const parsed = readAddress(buffer, 3)
      if (!parsed) return

      socket.removeListener('data', onData)
      client.forwardOut('127.0.0.1', 0, parsed.host, parsed.port, (err, stream) => {
        if (err || !stream) {
          sendReply(socket, REPLY_GENERAL_FAILURE)
          socket.end()
          return
        }
        sendReply(socket, REPLY_SUCCESS)
        if (buffer.length > parsed.nextOffset) {
          stream.write(buffer.subarray(parsed.nextOffset))
        }
        socket.pipe(stream).pipe(socket)
      })
    }
  }

  socket.on('data', onData)
  socket.on('error', () => socket.destroy())
}

export function createSocks5Server(client: Client, host: string, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => handleSocksConnection(client, socket))
    server.once('error', reject)
    server.listen(port, host, () => resolve(server))
  })
}
