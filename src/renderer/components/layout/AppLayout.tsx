import { useAppStore } from '@renderer/stores/app-store'
import { AiAssistantPanel } from '@renderer/components/ai/AiAssistantPanel'
import { QuickCommandsPanel } from '@renderer/components/quick-command/QuickCommandsPanel'
import { ConnectionListPanel } from '@renderer/components/connection/ConnectionListPanel'
import { ConnectionProtocolNav } from '@renderer/components/connection/ConnectionProtocolNav'
import { ConnectionTreeSidebar } from '@renderer/components/connection/ConnectionTreeSidebar'
import { BottomPanel } from './BottomPanel'
import { SessionWorkspace } from './SessionWorkspace'
import { StatusBar } from './StatusBar'
import { TabBar } from './TabBar'
import { TitleBar } from './TitleBar'

export function AppLayout(): React.JSX.Element {
  const { aiPanelOpen, quickCommandsBarOpen, sessions, workspaceView } = useAppStore()
  const hasSessions = sessions.length > 0
  const showConnections = workspaceView === 'connections' || !hasSessions

  return (
    <div className="app-shell flex h-full flex-col">
      <TitleBar />
      <ConnectionProtocolNav />

      <div className="workspace flex flex-1 overflow-hidden">
        {showConnections && <ConnectionTreeSidebar />}

        <div className="main-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* 连接列表视图不显示会话标签，避免 SSH 会话出现在 RDP/FTP 等协议页 */}
          {hasSessions && !showConnections && <TabBar />}

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {/* 有会话时保持挂载；用 opacity 隐藏（xterm canvas 会穿透 visibility:hidden） */}
            {hasSessions && (
              <div
                className={`absolute inset-0 flex flex-col ${
                  showConnections
                    ? 'pointer-events-none z-0 opacity-0'
                    : 'z-10 opacity-100'
                }`}
                aria-hidden={showConnections}
              >
                <SessionWorkspace />
                <BottomPanel />
              </div>
            )}

            {showConnections && (
              <div className="absolute inset-0 z-20 flex min-h-0 flex-col bg-surface-muted">
                <ConnectionListPanel />
              </div>
            )}
          </div>
        </div>

        {aiPanelOpen && <AiAssistantPanel />}
        {quickCommandsBarOpen && <QuickCommandsPanel />}
      </div>

      <StatusBar />
    </div>
  )
}
