import { useAppStore } from '@renderer/stores/app-store'
import { SftpFileTree } from '@renderer/components/sftp/SftpFileTree'
import { TerminalArea } from './TerminalArea'

function PanelChrome({
  title,
  children,
  className = ''
}: {
  title?: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-surface-border/50 bg-surface-raised/25 ${className}`}
    >
      {title ? (
        <div className="flex h-9 shrink-0 items-center border-b border-surface-border/40 px-3">
          <span className="text-xs font-medium text-terminal-fg/90">{title}</span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

export function SessionWorkspace(): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const isSsh = activeSession?.type === 'ssh' && Boolean(activeSession.connectionId)

  return (
    <div className="flex h-full min-h-0 flex-1 gap-2 p-2 pt-1">
      {isSsh && (
        <PanelChrome title="文件工作区" className="w-[240px] shrink-0">
          <SftpFileTree />
        </PanelChrome>
      )}

      <PanelChrome className="min-h-0 min-w-0 flex-1">
        <TerminalArea embedded />
      </PanelChrome>
    </div>
  )
}
