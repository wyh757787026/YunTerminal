import { useSettingsStore } from '@renderer/stores/settings-store'
import { getTerminalTheme } from '@renderer/lib/terminal-themes'

export function useTerminalOptions() {
  const settings = useSettingsStore((s) => s.settings)
  return {
    theme: getTerminalTheme(settings.theme),
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    cursorBlink: settings.cursorBlink
  }
}
