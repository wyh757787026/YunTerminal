import { FolderOpen, Plus, X } from 'lucide-react'
import type { Session } from '@shared/index'
import { useAppStore } from '@renderer/stores/app-store'

interface TerminalSubTabBarProps {
  link: Session
  onOpenSftp?: () => void
}

export function TerminalSubTabBar({ link, onOpenSftp }: TerminalSubTabBarProps): React.JSX.Element {
  const setActiveTerminal = useAppStore((s) => s.setActiveTerminal)
  const addTerminal = useAppStore((s) => s.addTerminal)
  const removeTerminal = useAppStore((s) => s.removeTerminal)

  return (
    <div className="terminal-sub-tab-strip">
      {link.terminals.map((terminal) => {
        const isActive = link.activeTerminalId === terminal.id
        return (
          <div
            key={terminal.id}
            className={`terminal-sub-tab ${isActive ? 'terminal-sub-tab-active' : ''}`}
          >
            <button
              type="button"
              className="terminal-sub-tab-label"
              onClick={() => setActiveTerminal(link.id, terminal.id)}
            >
              {terminal.title}
            </button>
            <button
              type="button"
              className="terminal-sub-tab-close"
              title="关闭终端"
              onClick={(e) => {
                e.stopPropagation()
                removeTerminal(terminal.id)
              }}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}

      <button
        type="button"
        className="terminal-sub-tab-add"
        title="添加终端"
        onClick={addTerminal}
      >
        <Plus size={16} />
      </button>

      {onOpenSftp && (
        <button
          type="button"
          className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] text-accent-muted transition-colors hover:bg-surface-overlay/60 hover:text-terminal-fg"
          title="SFTP 文件传输"
          onClick={onOpenSftp}
        >
          <FolderOpen size={15} />
          <span>SFTP</span>
        </button>
      )}
    </div>
  )
}
