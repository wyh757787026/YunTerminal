import type { VncSettings } from './vnc'

export type AuthType = 'password' | 'key' | 'keyboard-interactive' | 'prompt' | 'credential'
export type ConnectionProtocol = 'ssh' | 'rdp' | 'telnet' | 'vnc' | 'ftp'
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

/** plain=明文 FTP；explicit=显式 FTPS（AUTH TLS，常见 21）；implicit=隐式 FTPS（常见 990） */
export type FtpSecureMode = 'plain' | 'explicit' | 'implicit'

export interface FtpSettings {
  /** 加密方式；优先于旧字段 secure */
  secureMode?: FtpSecureMode
  /** @deprecated 使用 secureMode；true 等价于 explicit */
  secure?: boolean
  /**
   * 传输模式：true=被动(PASV，默认)，false=主动(PORT)
   * @default true
   */
  passive?: boolean
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
  ftp?: FtpSettings
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
  ftp?: FtpSettings
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
