import { subscribeSessionStatus } from '@renderer/services/ssh-service'
import { useAppStore } from '@renderer/stores/app-store'

function findLinkByTerminalId(terminalId: string): {
  type: string
  connectionId?: string
} | null {
  const sessions = useAppStore.getState().sessions
  for (const link of sessions) {
    if (link.terminals.some((t) => t.id === terminalId)) {
      return { type: link.type, connectionId: link.connectionId }
    }
  }
  return null
}

export function initTunnelListeners(): () => void {
  return subscribeSessionStatus((terminalId, status) => {
    const link = findLinkByTerminalId(terminalId)
    if (!link || link.type !== 'ssh' || !link.connectionId) return

    if (status === 'connected') {
      void window.api.tunnel.startAutoStart(link.connectionId)
      return
    }

    if (status === 'disconnected') {
      const { sessions } = useAppStore.getState()
      const stillConnected = sessions.some(
        (session) =>
          session.type === 'ssh' &&
          session.connectionId === link.connectionId &&
          session.status === 'connected'
      )
      if (!stillConnected) {
        void window.api.tunnel.stopSharedByConnection(link.connectionId)
      }
    }
  })
}
