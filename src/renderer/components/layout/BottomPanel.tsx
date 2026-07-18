import { Activity, FolderOpen, Film, Network, StickyNote, X } from 'lucide-react'
import { useAppStore, type BottomPanelTab } from '@renderer/stores/app-store'
import { SftpBrowser } from '@renderer/components/sftp/SftpBrowser'
import { TunnelPanel } from '@renderer/components/tunnel/TunnelPanel'
import { NotesPanel } from '@renderer/components/notes/NotesPanel'
import { ErrorBoundary } from '@renderer/components/common/ErrorBoundary'
import { MonitorPanel } from '@renderer/components/monitor/MonitorPanel'
import { RecordingsPanel } from '@renderer/components/recording/RecordingsPanel'
import { BOTTOM_PANEL_HEIGHT_CLASS } from './layout-constants'

type PanelTab = BottomPanelTab

const tabs: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'sftp', label: '文件传输', icon: <FolderOpen size={13} /> },
  { id: 'tunnel', label: '端口转发', icon: <Network size={13} /> },
  { id: 'notes', label: '笔记', icon: <StickyNote size={13} /> },
  { id: 'monitor', label: '监控', icon: <Activity size={13} /> },
  { id: 'recordings', label: '录制', icon: <Film size={13} /> }
]

export function BottomPanel(): React.JSX.Element | null {
  const { bottomPanelOpen, bottomPanelTab, toggleBottomPanel, setBottomPanelTab } = useAppStore()

  if (!bottomPanelOpen) return null

  return (
    <div
      className={`flex ${BOTTOM_PANEL_HEIGHT_CLASS} shrink-0 flex-col border-t border-surface-border/50 bg-surface-muted/40`}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-surface-border/40 px-2">
        <div className="flex items-center gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`panel-tab ${bottomPanelTab === tab.id ? 'panel-tab-active' : ''}`}
              onClick={() => setBottomPanelTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <button className="btn-icon-sm" onClick={toggleBottomPanel}>
          <X size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-1">
        {bottomPanelTab === 'sftp' && <SftpBrowser />}
        {bottomPanelTab === 'tunnel' && <TunnelPanel />}
        {bottomPanelTab === 'notes' && <NotesPanel />}
        {bottomPanelTab === 'monitor' && (
          <ErrorBoundary>
            <MonitorPanel />
          </ErrorBoundary>
        )}
        {bottomPanelTab === 'recordings' && <RecordingsPanel />}
      </div>
    </div>
  )
}
