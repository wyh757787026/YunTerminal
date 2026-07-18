import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_TERMINAL_SETTINGS,
  type TerminalSettings
} from '../../../src/shared/types/settings'

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
      return { ...DEFAULT_TERMINAL_SETTINGS, ...(JSON.parse(raw) as TerminalSettings) }
    } catch {
      return { ...DEFAULT_TERMINAL_SETTINGS }
    }
  }

  get(): TerminalSettings {
    return { ...this.settings }
  }

  update(partial: Partial<TerminalSettings>): TerminalSettings {
    this.settings = { ...this.settings, ...partial }
    writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
    return this.get()
  }
}
