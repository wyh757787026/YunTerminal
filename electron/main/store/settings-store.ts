import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_TERMINAL_SETTINGS,
  LOCK_IDLE_TIMEOUT_OPTIONS,
  type LockIdleTimeoutMin,
  type TerminalSettings
} from '../../../src/shared/types/settings'

const LOCK_IDLE_TIMEOUT_VALUES = new Set<number>(
  LOCK_IDLE_TIMEOUT_OPTIONS.map((option) => option.value)
)

function normalizeSettings(input: Partial<TerminalSettings>): TerminalSettings {
  const merged = { ...DEFAULT_TERMINAL_SETTINGS, ...input }
  const idle = Number(merged.lockIdleTimeoutMin)
  const lockIdleTimeoutMin = (
    LOCK_IDLE_TIMEOUT_VALUES.has(idle) ? idle : DEFAULT_TERMINAL_SETTINGS.lockIdleTimeoutMin
  ) as LockIdleTimeoutMin

  return {
    ...merged,
    lockIdleTimeoutMin,
    lockOnStartup: merged.lockOnStartup === true,
    recordingSaveDir:
      typeof merged.recordingSaveDir === 'string' ? merged.recordingSaveDir.trim() : ''
  }
}

export class SettingsStore {
  private readonly settingsPath: string
  private settings: TerminalSettings

  constructor(userDataPath: string) {
    const dir = join(userDataPath, 'data')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.settingsPath = join(dir, 'settings.json')
    this.settings = this.load()
  }

  private load(): TerminalSettings {
    if (!existsSync(this.settingsPath)) {
      return { ...DEFAULT_TERMINAL_SETTINGS }
    }

    try {
      const raw = readFileSync(this.settingsPath, 'utf-8')
      return normalizeSettings(JSON.parse(raw) as Partial<TerminalSettings>)
    } catch {
      return { ...DEFAULT_TERMINAL_SETTINGS }
    }
  }

  get(): TerminalSettings {
    return { ...this.settings }
  }

  update(partial: Partial<TerminalSettings>): TerminalSettings {
    this.settings = normalizeSettings({ ...this.settings, ...partial })
    writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
    return this.get()
  }
}
