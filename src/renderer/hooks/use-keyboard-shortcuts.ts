import { useEffect } from 'react'
import { useAppStore } from '@renderer/stores/app-store'
import { useSettingsStore } from '@renderer/stores/settings-store'

export function useKeyboardShortcuts(): void {
  const {
    activeSessionId,
    sessions,
    removeTerminal,
    setActiveSession,
    openConnectionPicker,
    openTerminalSearch,
    openHistoryPalette,
    enableSplit,
    closeSplit,
    split,
    toggleAiPanel
  } = useAppStore()
  const openSettingsDialog = useSettingsStore((s) => s.openSettingsDialog)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key === 't') {
        e.preventDefault()
        openConnectionPicker()
      }

      if (mod && e.key === 'w') {
        e.preventDefault()
        if (activeSessionId) removeTerminal()
      }

      if (mod && e.key === 'Tab') {
        e.preventDefault()
        if (sessions.length === 0) return
        const currentIndex = sessions.findIndex((s) => s.id === activeSessionId)
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + sessions.length) % sessions.length
          : (currentIndex + 1) % sessions.length
        setActiveSession(sessions[nextIndex]?.id ?? null)
      }

      if (mod && e.key === 'f') {
        e.preventDefault()
        openTerminalSearch()
      }

      if (mod && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        toggleAiPanel()
      }

      if (mod && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        openHistoryPalette()
      }

      if (mod && e.key === ',') {
        e.preventDefault()
        openSettingsDialog()
      }

      if (mod && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        if (split.enabled) closeSplit()
        else enableSplit('vertical')
      }

      if (mod && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        if (split.enabled) closeSplit()
        else enableSplit('horizontal')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    activeSessionId,
    sessions,
    openConnectionPicker,
    removeTerminal,
    setActiveSession,
    openTerminalSearch,
    openHistoryPalette,
    toggleAiPanel,
    openSettingsDialog,
    enableSplit,
    closeSplit,
    split.enabled
  ])
}
