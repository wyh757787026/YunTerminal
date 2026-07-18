import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { safeStorage } from 'electron'
import {
  DEFAULT_AI_SETTINGS,
  type AiPublicSettings,
  type AiSettingsInput
} from '../../../src/shared/types/ai'

interface AiSettingsRecord {
  enabled: boolean
  provider: AiPublicSettings['provider']
  baseUrl: string
  model: string
  apiKey?: string
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

export class AiSettingsStore {
  private readonly settingsPath: string
  private record: AiSettingsRecord

  constructor(userDataPath: string) {
    const dir = join(userDataPath, 'data')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.settingsPath = join(dir, 'ai-settings.json')
    this.record = this.load()
  }

  private load(): AiSettingsRecord {
    if (!existsSync(this.settingsPath)) {
      return {
        enabled: DEFAULT_AI_SETTINGS.enabled,
        provider: DEFAULT_AI_SETTINGS.provider,
        baseUrl: DEFAULT_AI_SETTINGS.baseUrl,
        model: DEFAULT_AI_SETTINGS.model
      }
    }

    try {
      const raw = readFileSync(this.settingsPath, 'utf-8')
      const parsed = JSON.parse(raw) as AiSettingsRecord
      return {
        enabled: parsed.enabled ?? DEFAULT_AI_SETTINGS.enabled,
        provider: parsed.provider ?? DEFAULT_AI_SETTINGS.provider,
        baseUrl: parsed.baseUrl ?? DEFAULT_AI_SETTINGS.baseUrl,
        model: parsed.model ?? DEFAULT_AI_SETTINGS.model,
        apiKey: parsed.apiKey
      }
    } catch {
      return {
        enabled: DEFAULT_AI_SETTINGS.enabled,
        provider: DEFAULT_AI_SETTINGS.provider,
        baseUrl: DEFAULT_AI_SETTINGS.baseUrl,
        model: DEFAULT_AI_SETTINGS.model
      }
    }
  }

  private save(): void {
    writeFileSync(this.settingsPath, JSON.stringify(this.record, null, 2), 'utf-8')
  }

  getPublicSettings(): AiPublicSettings {
    return {
      enabled: this.record.enabled,
      provider: this.record.provider,
      baseUrl: this.record.baseUrl,
      model: this.record.model,
      apiKeyConfigured: Boolean(this.record.apiKey)
    }
  }

  getApiKey(): string | null {
    if (!this.record.apiKey) return null
    try {
      return decrypt(this.record.apiKey)
    } catch {
      return null
    }
  }

  update(input: AiSettingsInput): AiPublicSettings {
    if (input.enabled !== undefined) this.record.enabled = input.enabled
    if (input.provider !== undefined) this.record.provider = input.provider
    if (input.baseUrl !== undefined) this.record.baseUrl = input.baseUrl.trim()
    if (input.model !== undefined) this.record.model = input.model.trim()
    if (input.apiKey !== undefined) {
      const trimmed = input.apiKey.trim()
      if (trimmed) {
        this.record.apiKey = encrypt(trimmed)
      } else {
        delete this.record.apiKey
      }
    }
    this.save()
    return this.getPublicSettings()
  }
}
