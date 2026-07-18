import type { ConnectOptions } from 'telnet-client'
import type { ConnectionSecrets, StoredConnection } from '../../../src/shared/types/connection'
import type { ConnectionStore } from '../store/connection-store'
import type { CredentialStore } from '../store/credential-store'
import type { SshAuthBridge } from '../ssh/ssh-auth-bridge'

export interface ResolveTelnetCredentialsOptions {
  sessionId?: string
  authBridge?: SshAuthBridge
  credentialStore?: CredentialStore
}

export interface TelnetCredentials {
  username: string
  password: string
  disableLogon: boolean
}

export async function resolveTelnetCredentials(
  connection: StoredConnection,
  store: ConnectionStore,
  options?: ResolveTelnetCredentialsOptions
): Promise<TelnetCredentials> {
  const username = connection.username.trim()
  let password = ''

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
    if (!secrets.password) {
      throw new Error('登录凭证未包含密码')
    }
    password = secrets.password
  } else if (connection.authType === 'prompt') {
    if (!options?.authBridge) {
      throw new Error('每次询问认证需要交互式输入')
    }

    const response = await options.authBridge.requestAuth({
      sessionId: options.sessionId,
      connectionId: connection.id,
      connectionName: connection.name,
      authType: 'prompt'
    })

    if (response.canceled || !response.password) {
      throw new Error('已取消认证')
    }

    password = response.password
  } else {
    const secrets: ConnectionSecrets = store.getConnectionSecrets(connection.id)
    password = secrets.password ?? ''
  }

  if (!username && !password) {
    return { username: '', password: '', disableLogon: true }
  }

  return { username, password, disableLogon: false }
}

export function buildTelnetConnectOptions(
  connection: StoredConnection,
  credentials: TelnetCredentials,
  cols: number,
  rows: number
): ConnectOptions {
  const telnet = connection.telnet

  return {
    host: connection.host,
    port: connection.port,
    username: credentials.username,
    password: credentials.password,
    disableLogon: credentials.disableLogon,
    terminalWidth: cols,
    terminalHeight: rows,
    encoding: (telnet?.encoding ?? 'utf-8') as BufferEncoding,
    timeout: telnet?.timeout ?? 10000,
    negotiationMandatory: false,
    ...(telnet?.loginPrompt ? { loginPrompt: new RegExp(telnet.loginPrompt, 'i') } : {}),
    ...(telnet?.passwordPrompt ? { passwordPrompt: new RegExp(telnet.passwordPrompt, 'i') } : {})
  } satisfies ConnectOptions
}
