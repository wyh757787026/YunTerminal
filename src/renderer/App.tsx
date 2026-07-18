import { useEffect } from 'react'
import { ErrorBoundary } from '@renderer/components/common/ErrorBoundary'
import { AppLayout } from '@renderer/components/layout/AppLayout'
import { ConnectionDialog } from '@renderer/components/connection/ConnectionDialog'
import { ConnectionPickerDialog } from '@renderer/components/connection/ConnectionPickerDialog'
import { SshAuthPromptDialog } from '@renderer/components/connection/SshAuthPromptDialog'
import { GroupDialog } from '@renderer/components/connection/GroupDialog'
import { SettingsDialog } from '@renderer/components/settings/SettingsDialog'
import { HistoryPalette } from '@renderer/components/terminal/HistoryPalette'
import { getActiveTerminal } from '@renderer/lib/session-utils'
import { LockScreenOverlay } from '@renderer/components/lock/LockScreenOverlay'
import { useKeyboardShortcuts } from '@renderer/hooks/use-keyboard-shortcuts'
import { useLockScreen } from '@renderer/hooks/use-lock-screen'
import { initSshListeners } from '@renderer/services/ssh-service'
import { initTunnelListeners } from '@renderer/services/tunnel-service'
import { useAppStore } from '@renderer/stores/app-store'
import { useSettingsStore } from '@renderer/stores/settings-store'

export function App(): React.JSX.Element {
  const refreshConnectionData = useAppStore((s) => s.refreshConnectionData)
  const connectionDialogOpen = useAppStore((s) => s.connectionDialogOpen)
  const connectionPickerOpen = useAppStore((s) => s.connectionPickerOpen)
  const editingConnectionId = useAppStore((s) => s.editingConnectionId)
  const groupDialogOpen = useAppStore((s) => s.groupDialogOpen)
  const editingGroupId = useAppStore((s) => s.editingGroupId)
  const connections = useAppStore((s) => s.connections)
  const groups = useAppStore((s) => s.groups)
  const closeConnectionDialog = useAppStore((s) => s.closeConnectionDialog)
  const closeConnectionPicker = useAppStore((s) => s.closeConnectionPicker)
  const closeGroupDialog = useAppStore((s) => s.closeGroupDialog)
  const groupDialogParentId = useAppStore((s) => s.groupDialogParentId)
  const historyPaletteOpen = useAppStore((s) => s.historyPaletteOpen)
  const closeHistoryPalette = useAppStore((s) => s.closeHistoryPalette)
  const activeSessionId = useAppStore((s) => s.activeSessionId)

  const settingsDialogOpen = useSettingsStore((s) => s.settingsDialogOpen)
  const loadSettings = useSettingsStore((s) => s.loadSettings)

  const editingConnection = connections.find((c) => c.id === editingConnectionId) ?? null
  const editingGroup = groups.find((g) => g.id === editingGroupId) ?? null

  useKeyboardShortcuts()
  const { locked, unlock } = useLockScreen()

  useEffect(() => {
    if (!window.api) return

    void refreshConnectionData()
    void loadSettings()
    const unsubSsh = initSshListeners()
    const unsubTunnel = initTunnelListeners()
    return () => {
      unsubSsh()
      unsubTunnel()
    }
  }, [refreshConnectionData, loadSettings])

  const handleHistorySelect = (command: string): void => {
    if (!activeSessionId) return
    const session = useAppStore.getState().sessions.find((s) => s.id === activeSessionId)
    const terminal = getActiveTerminal(session)
    if (!session || !terminal) return

    const payload = `${command}\r`
    if (session.type === 'ssh') {
      window.api.ssh.write({ sessionId: terminal.id, data: payload })
    } else if (session.type === 'telnet') {
      window.api.telnet.write({ sessionId: terminal.id, data: payload })
    } else {
      window.api.pty.write({ sessionId: terminal.id, data: payload })
    }
  }

  return (
    <>
      <ErrorBoundary>
        <AppLayout />
      </ErrorBoundary>
      {connectionPickerOpen && <ConnectionPickerDialog onClose={closeConnectionPicker} />}
      {connectionDialogOpen && (
        <ConnectionDialog connection={editingConnection} onClose={closeConnectionDialog} />
      )}
      {groupDialogOpen && (
        <GroupDialog
          group={editingGroup}
          defaultParentId={groupDialogParentId}
          onClose={closeGroupDialog}
        />
      )}
      {settingsDialogOpen && <SettingsDialog />}
      {historyPaletteOpen && (
        <HistoryPalette onClose={closeHistoryPalette} onSelect={handleHistorySelect} />
      )}
      <SshAuthPromptDialog />
      {locked && <LockScreenOverlay onUnlock={unlock} />}
    </>
  )
}
