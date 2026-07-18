import type { VncSettings } from './vnc'

export type AuthType = 'password' | 'key' | 'keyboard-interactive' | 'prompt' | 'credential'
export type ConnectionProtocol = 'ssh' | 'rdp' | 'telnet' | 'vnc'
export type RdpDisplayMode = 'followWindow' | 'fixed'
export type RdpRenderQuality = 'balanced' | 'performance' | 'quality'

export interface SshSettings {
  proxyUrl?: string
  terminalType?: string
  encoding?: string
  keepaliveInterval?: number
  readyTimeout?: number
  initScript?: string
  kex?: string
  cipher?: string
  hmac?: string
  serverHostKey?: string
  hostFingerprint?: string
  enableX11?: boolean
}

export interface RdpSettings {
  domain?: string
  displayMode?: RdpDisplayMode
  desktopWidth?: number
  desktopHeight?: number
  renderQuality?: RdpRenderQuality
  enableClipboard?: boolean
}

export interface TelnetSettings {
  terminalType?: string
  encoding?: string
  timeout?: number
  loginPrompt?: string
  passwordPrompt?: string
}

export interface Connection {
  id: string
  name: string
  protocol?: ConnectionProtocol
  host: string
  port: number
  username: string
  authType: AuthType
  credentialId?: string
  groupId?: string
  proxyChain?: string[]
  tags?: string[]
  note?: string
  ssh?: SshSettings
  rdp?: RdpSettings
  telnet?: TelnetSettings
  vnc?: VncSettings
  favorite?: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ConnectionSecrets {
  password?: string
  privateKeyPath?: string
  passphrase?: string
}

export interface ConnectionInput {
  name: string
  protocol?: ConnectionProtocol
  host: string
  port: number
  username: string
  authType: AuthType
  credentialId?: string
  groupId?: string
  proxyChain?: string[]
  tags?: string[]
  note?: string
  ssh?: SshSettings
  rdp?: RdpSettings
  telnet?: TelnetSettings
  vnc?: VncSettings
  favorite?: boolean
  secrets?: ConnectionSecrets
}

export interface StoredConnection extends Connection {
  hasPassword: boolean
  hasPrivateKey: boolean
}

import type { Group } from './group'

export interface ConnectionExportBundle {
  version: 1
  exportedAt: string
  groups: Group[]
  connections: Connection[]
  includeSecrets: boolean
}

export interface ConnectionImportResult {
  importedGroups: number
  importedConnections: number
  skippedConnections: number
}
