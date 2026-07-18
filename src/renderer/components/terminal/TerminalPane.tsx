import { useCallback, useState } from 'react'
import type { SearchAddon } from '@xterm/addon-search'
import type { Session, TerminalWindow } from '@shared/index'
import { LocalTerminal } from './LocalTerminal'
import { SshTerminal } from './SshTerminal'
import { TelnetTerminal } from './TelnetTerminal'
import { VncViewer } from '@renderer/components/vnc/VncViewer'

interface TerminalPaneProps {
  linkSession: Session
  terminal: TerminalWindow
  isActive: boolean
  searchOpen?: boolean
  onSearchClose?: () => void
  onFocus?: () => void
}

export function TerminalPane({
  linkSession,
  terminal,
  isActive,
  searchOpen = false,
  onSearchClose = () => undefined,
  onFocus
}: TerminalPaneProps): React.JSX.Element {
  const [, setSearchAddon] = useState<SearchAddon | null>(null)

  const handleSearchReady = useCallback((addon: SearchAddon | null) => {
    setSearchAddon(addon)
  }, [])

  return (
    <div
      className={`relative h-full w-full ${isActive ? 'ring-1 ring-inset ring-accent/30' : ''}`}
      onMouseDown={onFocus}
    >
      {linkSession.type === 'ssh' && linkSession.connectionId ? (
        <SshTerminal
          linkSession={linkSession}
          terminalWindow={terminal}
          isActive={isActive}
          searchOpen={searchOpen}
          onSearchClose={onSearchClose}
          onSearchReady={handleSearchReady}
        />
      ) : linkSession.type === 'telnet' && linkSession.connectionId ? (
        <TelnetTerminal
          linkSession={linkSession}
          terminalWindow={terminal}
          isActive={isActive}
          searchOpen={searchOpen}
          onSearchClose={onSearchClose}
          onSearchReady={handleSearchReady}
        />
      ) : linkSession.type === 'vnc' && linkSession.connectionId ? (
        <VncViewer
          linkSession={linkSession}
          terminalWindow={terminal}
          isActive={isActive}
        />
      ) : (
        <LocalTerminal
          linkSession={linkSession}
          terminalWindow={terminal}
          isActive={isActive}
          searchOpen={searchOpen}
          onSearchClose={onSearchClose}
          onSearchReady={handleSearchReady}
        />
      )}
    </div>
  )
}
