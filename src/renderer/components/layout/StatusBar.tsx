import { Activity, Bot, PanelBottom, Settings, Zap } from 'lucide-react'
import { ThemeSwitcher } from '@renderer/components/settings/ThemeSwitcher'
import { useAppStore } from '@renderer/stores/app-store'
import { useSettingsStore } from '@renderer/stores/settings-store'

export function StatusBar(): React.JSX.Element {
  const {
    sessions,
    activeSessionId,
    bottomPanelOpen,
    aiPanelOpen,
    quickCommandsBarOpen,
    toggleBottomPanel,
    toggleAiPanel,
    toggleQuickCommandsBar
  } = useAppStore()

  const openSettingsDialog = useSettingsStore((s) => s.openSettingsDialog)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const connectedCount = sessions.filter((s) => s.status === 'connected').length

  return (
    <div className="status-bar">
      <div className="flex min-w-0 items-center gap-3 text-accent-muted">
        {activeSession ? (
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <Activity
              size={11}
              className={activeSession.status === 'connected' ? 'text-emerald-400' : 'opacity-50'}
            />
            <span className="truncate text-terminal-fg/90">{activeSession.title}</span>
            <span className="hidden opacity-40 sm:inline">·</span>
            <span className="hidden sm:inline">
              {activeSession.status === 'connected'
                ? '已连接'
                : activeSession.status === 'connecting'
                  ? '连接中'
                  : activeSession.status === 'error'
                    ? '错误'
                    : '已断开'}
            </span>
          </span>
        ) : (
          <span className="opacity-70">Ctrl+T 新建连接 · Ctrl+Shift+I AI · Ctrl+F 搜索</span>
        )}
        {sessions.length > 0 && (
          <span className="hidden rounded-full bg-surface-overlay/60 px-2 py-px text-[10px] sm:inline">
            {connectedCount}/{sessions.length} 会话
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          className={`status-pill ${aiPanelOpen ? 'status-pill-active' : ''}`}
          onClick={toggleAiPanel}
        >
          <Bot size={12} />
          AI
        </button>
        <button
          className={`status-pill ${quickCommandsBarOpen ? 'status-pill-active' : ''}`}
          onClick={toggleQuickCommandsBar}
          title="快速命令"
        >
          <Zap size={12} />
          命令
        </button>
        <button
          className={`status-pill ${bottomPanelOpen ? 'status-pill-active' : ''}`}
          onClick={toggleBottomPanel}
        >
          <PanelBottom size={12} />
          面板
        </button>
        <ThemeSwitcher />
        <button className="status-pill" onClick={openSettingsDialog}>
          <Settings size={12} />
          设置
        </button>
      </div>
    </div>
  )
}
