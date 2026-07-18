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
  const { aiPanelOpen, quickCommandsBarOpen, sessions } = useAppStore()
  const hasSessions = sessions.length > 0

  return (
    <div className="app-shell flex h-full flex-col">
      <TitleBar />
      <ConnectionProtocolNav />

      <div className="workspace flex flex-1 overflow-hidden">
        {!hasSessions && <ConnectionTreeSidebar />}

        <div className="main-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {hasSessions ? (
            <>
              <TabBar />
              <SessionWorkspace />
              <BottomPanel />
            </>
          ) : (
            <ConnectionListPanel />
          )}
        </div>

        {aiPanelOpen && <AiAssistantPanel />}
        {quickCommandsBarOpen && <QuickCommandsPanel />}
      </div>

      <StatusBar />
    </div>
  )
}
