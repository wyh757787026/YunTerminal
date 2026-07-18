import { readFileSync } from 'fs'
import type { Duplex } from 'stream'
import net from 'net'
import { Client, type Algorithms, type ConnectConfig } from 'ssh2'
import type {
  AuthType,
  ConnectionSecrets,
  SshSettings,
  StoredConnection
} from '../../../src/shared/types/connection'
import type { ConnectionStore } from '../store/connection-store'
import type { CredentialStore } from '../store/credential-store'
import type { SshAuthBridge } from './ssh-auth-bridge'
import { createProxySocket } from './ssh-proxy'

export interface CreateSshClientOptions {
  sessionId?: string
  authBridge?: SshAuthBridge
  credentialStore?: CredentialStore
  signal?: AbortSignal
}

const ABORT_ERROR_MESSAGE = '连接已取消'

export function isSshAbortError(err: unknown): boolean {
  return err instanceof Error && err.message === ABORT_ERROR_MESSAGE
}

export function formatSshError(err: unknown): string {
  if (isSshAbortError(err)) return ABORT_ERROR_MESSAGE
  const message = err instanceof Error ? err.message : '连接失败'
  if (message.includes('Connection lost before handshake')) {
    return '连接在 SSH 握手完成前断开。请检查主机/端口、网络，或避免重复快速重连'
  }
  if (message.includes('Timed out while waiting for handshake')) {
    return 'SSH 握手超时，请检查网络或增大连接超时时间'
  }
  if (message.includes('All configured authentication methods failed')) {
    return '认证失败，请检查用户名、密码或私钥'
  }
  if (message.includes('ECONNREFUSED')) {
    return '无法连接：目标拒绝连接（请检查主机与端口）'
  }
  if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
    return '无法解析主机名，请检查地址是否正确'
  }
  if (message.includes('ECONNRESET')) {
    return '连接被重置，请检查网络或服务器 SSH 服务'
  }
  return message
}

interface ConnectClientOptions {
  authBridge?: SshAuthBridge
  sessionId?: string
  connectionId: string
  connectionName: string
  defaultPassword?: string
  signal?: AbortSignal
}

function normalizeFingerprint(value: string): string {
  return value.replace(/[^a-fA-F0-9]/g, '').toLowerCase()
}

function parseAlgorithmList(value?: string): string[] | undefined {
  if (!value?.trim()) return undefined
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}

function buildAlgorithms(ssh?: SshSettings): Algorithms | undefined {
  const kex = parseAlgorithmList(ssh?.kex)
  const cipher = parseAlgorithmList(ssh?.cipher)
  const hmac = parseAlgorithmList(ssh?.hmac)
  const serverHostKey = parseAlgorithmList(ssh?.serverHostKey)

  if (!kex && !cipher && !hmac && !serverHostKey) {
    return undefined
  }

  return {
    ...(kex ? { kex: kex as Algorithms['kex'] } : {}),
    ...(cipher ? { cipher: cipher as Algorithms['cipher'] } : {}),
    ...(hmac ? { hmac: hmac as Algorithms['hmac'] } : {}),
    ...(serverHostKey ? { serverHostKey: serverHostKey as Algorithms['serverHostKey'] } : {})
  }
}

async function resolveConnectionSecrets(
  connection: StoredConnection,
  store: ConnectionStore,
  options?: CreateSshClientOptions
): Promise<ConnectionSecrets> {
  if (connection.authType === 'credential') {
    if (!connection.credentialId) {
      throw new Error('未选择登录凭证')
    }
    if (!options?.credentialStore) {
      throw new Error('凭证库不可用')
    }

    const credential = options.credentialStore.getCredential(connection.credentialId)
    if (!credential) {
      throw new Error('登录凭证不存在')
    }

    const secrets = options.credentialStore.getSecrets(connection.credentialId)
    if (!secrets.password && !secrets.privateKeyPath) {
      throw new Error('登录凭证无效')
    }

    return secrets
  }

  const stored = store.getConnectionSecrets(connection.id)

  if (connection.authType !== 'prompt') {
    return stored
  }

  if (!options?.authBridge) {
    throw new Error('每次询问认证需要交互式输入')
  }

  const response = await options.authBridge.requestAuth({
    sessionId: options.sessionId,
    connectionId: connection.id,
    connectionName: connection.name,
    authType: 'prompt'
  })

  if (response.canceled) {
    throw new Error('已取消认证')
  }

  if (!response.password && !response.privateKeyPath) {
    throw new Error('未提供认证凭据')
  }

  return {
    password: response.password,
    privateKeyPath: response.privateKeyPath,
    passphrase: response.passphrase
  }
}

function applyAuthToConfig(
  config: ConnectConfig,
  authType: AuthType,
  secrets: ConnectionSecrets
): void {
  switch (authType) {
    case 'password':
      if (!secrets.password) throw new Error('未配置密码')
      config.password = secrets.password
      break
    case 'key':
      if (!secrets.privateKeyPath) throw new Error('未配置私钥路径')
      config.privateKey = readFileSync(secrets.privateKeyPath)
      if (secrets.passphrase) config.passphrase = secrets.passphrase
      break
    case 'keyboard-interactive':
      config.tryKeyboard = true
      if (secrets.password) config.password = secrets.password
      break
    case 'credential':
      if (secrets.privateKeyPath) {
        config.privateKey = readFileSync(secrets.privateKeyPath)
        if (secrets.passphrase) config.passphrase = secrets.passphrase
      } else if (secrets.password) {
        config.password = secrets.password
      } else {
        throw new Error('登录凭证无效')
      }
      break
    case 'prompt':
      if (secrets.privateKeyPath) {
        config.privateKey = readFileSync(secrets.privateKeyPath)
        if (secrets.passphrase) config.passphrase = secrets.passphrase
      } else if (secrets.password) {
        config.password = secrets.password
      } else {
        throw new Error('未提供认证凭据')
      }
      break
    default: {
      const _exhaustive: never = authType
      return _exhaustive
    }
  }
}

export function buildConnectConfig(
  connection: StoredConnection,
  secrets: ConnectionSecrets
): ConnectConfig {
  const ssh = connection.ssh
  const config: ConnectConfig = {
    host: connection.host,
    port: connection.port,
    username: connection.username,
    readyTimeout: ssh?.readyTimeout ?? 20000,
    keepaliveInterval: ssh?.keepaliveInterval ?? 10000
  }

  const algorithms = buildAlgorithms(ssh)
  if (algorithms) {
    config.algorithms = algorithms
  }

  if (ssh?.hostFingerprint?.trim()) {
    const expected = normalizeFingerprint(ssh.hostFingerprint)
    config.hostHash = 'sha256'
    config.hostVerifier = (fingerprint: string) => normalizeFingerprint(fingerprint) === expected
  }

  applyAuthToConfig(config, connection.authType, secrets)
  return config
}

export function connectClient(
  config: ConnectConfig,
  options: ConnectClientOptions
): Promise<Client> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error(ABORT_ERROR_MESSAGE))
      return
    }

    const client = new Client()
    let settled = false

    const settle = (fn: () => void): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      fn()
    }

    const onAbort = (): void => {
      settle(() => {
        try {
          client.end()
        } catch {
          // ignore
        }
        reject(new Error(ABORT_ERROR_MESSAGE))
      })
    }

    options.signal?.addEventListener('abort', onAbort, { once: true })

    if (config.tryKeyboard && options.authBridge) {
      client.on('keyboard-interactive', (name, instructions, _lang, prompts, finish) => {
        void (async () => {
          try {
            if (options.signal?.aborted) {
              finish([])
              client.end()
              return
            }

            const autoResponses = prompts.map((prompt) => {
              if (!prompt.echo && options.defaultPassword) {
                return options.defaultPassword
              }
              return ''
            })

            const canAutoFill =
              autoResponses.length === prompts.length &&
              autoResponses.every((value, index) => !prompts[index].echo || value)

            if (canAutoFill) {
              finish(autoResponses)
              return
            }

            const response = await options.authBridge!.requestAuth({
              sessionId: options.sessionId,
              connectionId: options.connectionId,
              connectionName: options.connectionName,
              authType: 'keyboard-interactive',
              instructions: [name, instructions].filter(Boolean).join('\n') || undefined,
              prompts: prompts.map((prompt) => ({
                prompt: prompt.prompt,
                echo: prompt.echo ?? false
              }))
            })

            if (response.canceled) {
              finish([])
              client.end()
              return
            }

            const answers =
              response.responses && response.responses.length === prompts.length
                ? response.responses
                : autoResponses

            finish(answers)
          } catch (err) {
            settle(() => {
              reject(err instanceof Error ? err : new Error('交互认证失败'))
              client.end()
            })
          }
        })()
      })
    }

    client
      .on('ready', () => {
        settle(() => resolve(client))
      })
      .on('error', (err) => {
        settle(() => {
          if (options.signal?.aborted) {
            reject(new Error(ABORT_ERROR_MESSAGE))
            return
          }
          reject(err)
        })
      })
      .connect(config)
  })
}

async function openForwardStream(
  client: Client,
  targetHost: string,
  targetPort: number
): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
      if (err) reject(err)
      else resolve(stream)
    })
  })
}

export async function establishJumpChain(
  store: ConnectionStore,
  proxyChain: string[],
  target: StoredConnection,
  options?: CreateSshClientOptions
): Promise<{ sock: Duplex; jumpClients: Client[] }> {
  const jumpClients: Client[] = []

  const firstHop = store.getConnection(proxyChain[0])
  if (!firstHop) throw new Error(`跳板机不存在: ${proxyChain[0]}`)

  let currentClient = await connectClient(
    buildConnectConfig(firstHop, await resolveConnectionSecrets(firstHop, store, options)),
    {
      authBridge: options?.authBridge,
      sessionId: options?.sessionId,
      connectionId: firstHop.id,
      connectionName: firstHop.name,
      defaultPassword: store.getConnectionSecrets(firstHop.id).password,
      signal: options?.signal
    }
  )
  jumpClients.push(currentClient)

  for (let i = 1; i < proxyChain.length; i++) {
    if (options?.signal?.aborted) throw new Error(ABORT_ERROR_MESSAGE)
    const hop = store.getConnection(proxyChain[i])
    if (!hop) throw new Error(`跳板机不存在: ${proxyChain[i]}`)
    const stream = await openForwardStream(currentClient, hop.host, hop.port)
    currentClient = await connectClient(
      {
        ...buildConnectConfig(hop, await resolveConnectionSecrets(hop, store, options)),
        sock: stream
      },
      {
        authBridge: options?.authBridge,
        sessionId: options?.sessionId,
        connectionId: hop.id,
        connectionName: hop.name,
        defaultPassword: store.getConnectionSecrets(hop.id).password,
        signal: options?.signal
      }
    )
    jumpClients.push(currentClient)
  }

  const stream = await openForwardStream(currentClient, target.host, target.port)
  return { sock: stream, jumpClients }
}

export async function createSshClient(
  store: ConnectionStore,
  connectionId: string,
  options?: CreateSshClientOptions
): Promise<{ client: Client; jumpClients: Client[] }> {
  if (options?.signal?.aborted) throw new Error(ABORT_ERROR_MESSAGE)

  const connection = store.getConnection(connectionId)
  if (!connection) throw new Error('连接配置不存在')

  // 同一 host:port 串行握手，避免列表延迟检测/服务器信息与正式连接并发导致握手失败
  const lockKey = `${connection.host}:${connection.port}`
  return withHostLock(lockKey, async () => {
    if (options?.signal?.aborted) throw new Error(ABORT_ERROR_MESSAGE)

    const secrets = await resolveConnectionSecrets(connection, store, options)
    if (options?.signal?.aborted) throw new Error(ABORT_ERROR_MESSAGE)

    let jumpClients: Client[] = []
    let config = buildConnectConfig(connection, secrets)

    if (connection.proxyChain && connection.proxyChain.length > 0) {
      const chain = await establishJumpChain(store, connection.proxyChain, connection, options)
      jumpClients = chain.jumpClients
      config = { ...config, sock: chain.sock }
    } else if (connection.ssh?.proxyUrl?.trim()) {
      const sock = await createProxySocket(
        connection.ssh.proxyUrl.trim(),
        connection.host,
        connection.port
      )
      config = { ...config, sock }
    }

    if (options?.signal?.aborted) {
      for (const jump of jumpClients) jump.end()
      throw new Error(ABORT_ERROR_MESSAGE)
    }

    const client = await connectClient(config, {
      authBridge: options?.authBridge,
      sessionId: options?.sessionId,
      connectionId,
      connectionName: connection.name,
      defaultPassword: secrets.password,
      signal: options?.signal
    })

    return { client, jumpClients }
  })
}

const hostLocks = new Map<string, Promise<void>>()

async function withHostLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = hostLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const next = previous.catch(() => undefined).then(() => gate)
  hostLocks.set(key, next)

  await previous.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
    if (hostLocks.get(key) === next) {
      hostLocks.delete(key)
    }
  }
}

/** 仅 TCP 探测，不走 SSH 握手，避免与正式连接并发冲突 */
export function probeTcpLatency(
  store: ConnectionStore,
  connectionId: string,
  timeoutMs = 5000
): Promise<{ success: boolean; latencyMs?: number; message?: string }> {
  const connection = store.getConnection(connectionId)
  if (!connection) {
    return Promise.resolve({ success: false, message: '连接配置不存在' })
  }
  if (connection.protocol === 'rdp') {
    return Promise.resolve({ success: false, message: 'RDP 暂不支持延迟检测' })
  }

  return new Promise((resolve) => {
    const startedAt = Date.now()
    const socket = net.connect({ host: connection.host, port: connection.port })
    let settled = false

    const done = (result: { success: boolean; latencyMs?: number; message?: string }): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      done({ success: true, latencyMs: Date.now() - startedAt })
    })
    socket.once('timeout', () => {
      done({ success: false, message: '连接超时' })
    })
    socket.once('error', (err) => {
      done({ success: false, message: err.message })
    })
  })
}

export function getShellOptions(connection: StoredConnection): {
  term: string
  x11?: boolean
} {
  return {
    term: connection.ssh?.terminalType?.trim() || 'xterm-256color',
    ...(connection.ssh?.enableX11 ? { x11: true } : {})
  }
}

export function getInitScript(connection: StoredConnection): string | undefined {
  const script = connection.ssh?.initScript?.trim()
  return script || undefined
}
