import type { SessionStatus } from '@shared/types/session'

export type SessionStatusListener = (
  sessionId: string,
  status: SessionStatus,
  message?: string
) => void

const statusListeners = new Set<SessionStatusListener>()

export function subscribeSessionStatus(listener: SessionStatusListener): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

export function initSshListeners(): () => void {
  const notify = (event: { sessionId: string; status: SessionStatus; message?: string }): void => {
    for (const listener of statusListeners) {
      listener(event.sessionId, event.status, event.message)
    }
  }

  const unsubSsh = window.api.ssh.onStatus(notify)
  const unsubTelnet = window.api.telnet.onStatus(notify)
  const unsubVnc = window.api.vnc.onStatus(notify)

  return () => {
    unsubSsh()
    unsubTelnet()
    unsubVnc()
  }
}
