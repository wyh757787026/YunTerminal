export type VncAuthType = 'none' | 'password' | 'usernamePassword'

export interface VncSettings {
  authType?: VncAuthType
  viewOnly?: boolean
  scaleViewport?: boolean
  clipViewport?: boolean
  shared?: boolean
  qualityLevel?: number
  compressionLevel?: number
}

export interface VncCredentials {
  username?: string
  password?: string
}
