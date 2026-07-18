export type CredentialType = 'password' | 'key'

export interface Credential {
  id: string
  name: string
  type: CredentialType
  username?: string
  createdAt: string
  updatedAt: string
}

export interface CredentialSecrets {
  password?: string
  privateKeyPath?: string
  passphrase?: string
}

export interface CredentialInput {
  name: string
  type: CredentialType
  username?: string
  secrets?: CredentialSecrets
}

export interface StoredCredential extends Credential {
  hasPassword: boolean
  hasPrivateKey: boolean
}
