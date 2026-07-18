import { create } from 'zustand'
import {
  DEFAULT_TERMINAL_SETTINGS,
  type TerminalSettings
} from '@shared/types/settings'
import { applyAppTheme } from '@renderer/lib/apply-app-theme'

interface SettingsState {
  settings: TerminalSettings
  settingsDialogOpen: boolean
  settingsVersion: number
  loadSettings: () => Promise<void>
  updateSettings: (partial: Partial<TerminalSettings>) => Promise<void>
  openSettingsDialog: () => void
  closeSettingsDialog: () => void
}

function withAppThemeTerminalSync(
  current: TerminalSettings,
  partial: Partial<TerminalSettings>
): Partial<TerminalSettings> {
  if (partial.appTheme === undefined || partial.theme !== undefined) {
    return partial
  }

  if (partial.appTheme === 'daylight') {
    return { ...partial, theme: 'light' }
  }

  if (current.appTheme === 'daylight' && current.theme === 'light') {
    return { ...partial, theme: 'tokyo-night' }
  }

  return partial
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_TERMINAL_SETTINGS,
  settingsDialogOpen: false,
  settingsVersion: 0,

  loadSettings: async () => {
    const settings = await window.api.settings.get()
    applyAppTheme(settings.appTheme)
    set((s) => ({ settings, settingsVersion: s.settingsVersion + 1 }))
  },

  updateSettings: async (partial) => {
    const mergedPartial = withAppThemeTerminalSync(get().settings, partial)
    const settings = await window.api.settings.update(mergedPartial)
    if (mergedPartial.appTheme !== undefined) {
      applyAppTheme(settings.appTheme)
    }
    set((s) => ({ settings, settingsVersion: s.settingsVersion + 1 }))
  },

  openSettingsDialog: () => set({ settingsDialogOpen: true }),
  closeSettingsDialog: () => set({ settingsDialogOpen: false })
}))
