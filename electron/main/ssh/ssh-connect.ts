import { readFileSync } from 'fs'
import type { Duplex } from 'stream'
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
}

interface ConnectClientOptions {
  authBridge?: SshAuthBridge
  sessionId?: string
  connectionId: string
  connectionName: string
  defaultPassword?: string
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
    const client = new Client()

    if (config.tryKeyboard && options.authBridge) {
      client.on('keyboard-interactive', (name, instructions, _lang, prompts, finish) => {
        void (async () => {
          try {
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
            reject(err instanceof Error ? err : new Error('交互认证失败'))
            client.end()
          }
        })()
      })
    }

    client
      .on('ready', () => resolve(client))
      .on('error', reject)
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
      defaultPassword: store.getConnectionSecrets(firstHop.id).password
    }
  )
  jumpClients.push(currentClient)

  for (let i = 1; i < proxyChain.length; i++) {
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
        defaultPassword: store.getConnectionSecrets(hop.id).password
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
  const connection = store.getConnection(connectionId)
  if (!connection) throw new Error('连接配置不存在')

  const secrets = await resolveConnectionSecrets(connection, store, options)
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

  const client = await connectClient(config, {
    authBridge: options?.authBridge,
    sessionId: options?.sessionId,
    connectionId,
    connectionName: connection.name,
    defaultPassword: secrets.password
  })

  return { client, jumpClients }
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
