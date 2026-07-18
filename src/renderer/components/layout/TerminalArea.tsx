import { useEffect, useState } from 'react'
import { useAppStore } from '@renderer/stores/app-store'
import { SftpDialog } from '@renderer/components/sftp/SftpDialog'
import { TerminalPane } from '@renderer/components/terminal/TerminalPane'
import { TerminalSubTabBar } from '@renderer/components/terminal/TerminalSubTabBar'

interface TerminalAreaProps {
  embedded?: boolean
}

export function TerminalArea({ embedded = false }: TerminalAreaProps): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const workspaceView = useAppStore((s) => s.workspaceView)
  const terminalSearchOpen = useAppStore((s) => s.terminalSearchOpen)
  const closeTerminalSearch = useAppStore((s) => s.closeTerminalSearch)
  const [sftpOpen, setSftpOpen] = useState(false)

  const link = sessions.find((s) => s.id === activeSessionId)

  useEffect(() => {
    setSftpOpen(false)
  }, [activeSessionId])

  // 从连接列表切回会话时，触发一次布局刷新，避免 xterm 尺寸停留在隐藏态
  useEffect(() => {
    if (workspaceView !== 'session') return
    const id = requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
    })
    return () => cancelAnimationFrame(id)
  }, [workspaceView, activeSessionId])

  if (!link) {
    return (
      <div className="flex h-full items-center justify-center bg-terminal-bg text-sm text-accent-muted">
        请选择一个连接
      </div>
    )
  }

  return (
    <div className={`flex flex-1 flex-col bg-terminal-bg ${embedded ? 'h-full' : ''}`}>
      <TerminalSubTabBar
        link={link}
        onOpenSftp={link.type === 'ssh' ? () => setSftpOpen(true) : undefined}
      />

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
                isActive={isActive && workspaceView === 'session'}
                searchOpen={isActive && workspaceView === 'session' && terminalSearchOpen}
                onSearchClose={closeTerminalSearch}
              />
            </div>
          )
        })}
      </div>

      {sftpOpen && link.type === 'ssh' && <SftpDialog onClose={() => setSftpOpen(false)} />}
    </div>
  )
}
