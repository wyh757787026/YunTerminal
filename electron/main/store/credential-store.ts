import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { safeStorage } from 'electron'
import type {
  Credential,
  CredentialInput,
  CredentialSecrets,
  StoredCredential
} from '../../../src/shared/types/credential'

interface SecretRecord {
  password?: string
  privateKeyPath?: string
  passphrase?: string
}

interface DatabaseSchema {
  credentials: Credential[]
  secrets: Record<string, SecretRecord>
}

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }
  return Buffer.from(value, 'utf-8').toString('base64')
}

function decrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  return Buffer.from(value, 'base64').toString('utf-8')
}

export class CredentialStore {
  private readonly dbPath: string
  private data: DatabaseSchema

  constructor(userDataPath: string) {
    const dir = join(userDataPath, 'data')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.dbPath = join(dir, 'credentials.json')
    this.data = this.load()
  }

  private load(): DatabaseSchema {
    if (!existsSync(this.dbPath)) {
      return { credentials: [], secrets: {} }
    }

    try {
      const raw = readFileSync(this.dbPath, 'utf-8')
      const parsed = JSON.parse(raw) as DatabaseSchema
      return {
        credentials: parsed.credentials ?? [],
        secrets: parsed.secrets ?? {}
      }
    } catch {
      return { credentials: [], secrets: {} }
    }
  }

  private save(): void {
    writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  listCredentials(): StoredCredential[] {
    return this.data.credentials.map((item) => this.toStored(item))
  }

  getCredential(id: string): StoredCredential | null {
    const credential = this.data.credentials.find((item) => item.id === id)
    return credential ? this.toStored(credential) : null
  }

  getSecrets(id: string): CredentialSecrets {
    const record = this.data.secrets[id]
    if (!record) return {}
    return {
      password: record.password ? decrypt(record.password) : undefined,
      privateKeyPath: record.privateKeyPath,
      passphrase: record.passphrase ? decrypt(record.passphrase) : undefined
    }
  }

  createCredential(input: CredentialInput): StoredCredential {
    const now = new Date().toISOString()
    const credential: Credential = {
      id: randomUUID(),
      name: input.name.trim(),
      type: input.type,
      username: input.username?.trim() || undefined,
      createdAt: now,
      updatedAt: now
    }

    this.data.credentials.push(credential)
    this.saveSecrets(credential.id, input.secrets)
    this.save()
    return this.toStored(credential)
  }

  updateCredential(id: string, input: CredentialInput): StoredCredential | null {
    const index = this.data.credentials.findIndex((item) => item.id === id)
    if (index === -1) return null

    const updated: Credential = {
      ...this.data.credentials[index],
      name: input.name.trim(),
      type: input.type,
      username: input.username?.trim() || undefined,
      updatedAt: new Date().toISOString()
    }

    this.data.credentials[index] = updated
    this.saveSecrets(id, input.secrets)
    this.save()
    return this.toStored(updated)
  }

  deleteCredential(id: string): boolean {
    const before = this.data.credentials.length
    this.data.credentials = this.data.credentials.filter((item) => item.id !== id)
    delete this.data.secrets[id]
    this.save()
    return this.data.credentials.length < before
  }

  private saveSecrets(id: string, secrets?: CredentialSecrets): void {
    if (!secrets) return

    const record: SecretRecord = this.data.secrets[id] ?? {}
    if (secrets.password !== undefined) {
      record.password = secrets.password ? encrypt(secrets.password) : undefined
    }
    if (secrets.privateKeyPath !== undefined) {
      record.privateKeyPath = secrets.privateKeyPath || undefined
    }
    if (secrets.passphrase !== undefined) {
      record.passphrase = secrets.passphrase ? encrypt(secrets.passphrase) : undefined
    }

    if (Object.keys(record).length === 0) {
      delete this.data.secrets[id]
    } else {
      this.data.secrets[id] = record
    }
  }

  private toStored(credential: Credential): StoredCredential {
    const secret = this.data.secrets[credential.id]
    return {
      ...credential,
      hasPassword: Boolean(secret?.password),
      hasPrivateKey: Boolean(secret?.privateKeyPath)
    }
  }
}
