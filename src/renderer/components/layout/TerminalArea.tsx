import { useAppStore } from '@renderer/stores/app-store'
import { TerminalPane } from '@renderer/components/terminal/TerminalPane'
import { TerminalSubTabBar } from '@renderer/components/terminal/TerminalSubTabBar'

interface TerminalAreaProps {
  embedded?: boolean
}

export function TerminalArea({ embedded = false }: TerminalAreaProps): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const terminalSearchOpen = useAppStore((s) => s.terminalSearchOpen)
  const closeTerminalSearch = useAppStore((s) => s.closeTerminalSearch)

  const link = sessions.find((s) => s.id === activeSessionId)

  if (!link) {
    return (
      <div className="flex h-full items-center justify-center bg-terminal-bg text-sm text-accent-muted">
        请选择一个连接
      </div>
    )
  }

  return (
    <div className={`flex flex-1 flex-col bg-terminal-bg ${embedded ? 'h-full' : ''}`}>
      <TerminalSubTabBar link={link} />

      <div className="relative min-h-0 flex-1">
        {link.terminals.map((terminal) => {
          const isActive = terminal.id === link.activeTerminalId
          return (
            <div
              key={terminal.id}
              className={`absolute inset-0 ${isActive ? 'visible' : 'invisible'}`}
            >
              <TerminalPane
                linkSession={link}
                terminal={terminal}
                isActive={isActive}
                searchOpen={isActive && terminalSearchOpen}
                onSearchClose={closeTerminalSearch}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
