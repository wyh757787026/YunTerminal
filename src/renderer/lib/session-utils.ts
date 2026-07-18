import type { Session, TerminalWindow } from '@shared/types/session'

export function createTerminalWindow(title: string): TerminalWindow {
  return {
    id: crypto.randomUUID(),
    title,
    status: 'connecting',
    createdAt: new Date().toISOString()
  }
}

export function nextTerminalTitle(terminals: TerminalWindow[]): string {
  if (terminals.length === 0) return '终端'
  return `终端 ${terminals.length}`
}

export function getActiveTerminal(session: Session | undefined): TerminalWindow | undefined {
  if (!session || session.terminals.length === 0) return undefined
  if (session.activeTerminalId) {
    return session.terminals.find((t) => t.id === session.activeTerminalId)
  }
  return session.terminals[0]
}

export function findLinkByTerminalId(
  sessions: Session[],
  terminalId: string
): { link: Session; terminal: TerminalWindow } | null {
  for (const link of sessions) {
    const terminal = link.terminals.find((t) => t.id === terminalId)
    if (terminal) return { link, terminal }
  }
  return null
}

export function syncLinkStatus(terminals: TerminalWindow[]): Session['status'] {
  if (terminals.some((t) => t.status === 'error')) return 'error'
  if (terminals.some((t) => t.status === 'connecting')) return 'connecting'
  if (terminals.some((t) => t.status === 'connected')) return 'connected'
  return 'disconnected'
}
