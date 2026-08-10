import { useState } from 'react'
import {
  Cloud,
  FolderInput,
  FolderOutput,
  Keyboard,
  Plus,
  Server,
  Settings,
  Sparkles,
  Terminal
} from 'lucide-react'
import { useAppStore } from '@renderer/stores/app-store'
import { useSettingsStore } from '@renderer/stores/settings-store'
import { filterByProtocol } from '@renderer/lib/connection-filters'
import { ExportConnectionsDialog } from '@renderer/components/connection/ExportConnectionsDialog'

const shortcuts = [
  { keys: 'Ctrl+T', label: '新建连接' },
  { keys: 'Ctrl+Shift+I', label: 'AI 助手' },
  { keys: 'Ctrl+F', label: '搜索' },
  { keys: 'Ctrl+,', label: '设置' },
  { keys: 'Ctrl+Shift+D', label: '垂直分屏' }
]

export function WelcomeScreen(): React.JSX.Element {
  const {
    connections,
    recent,
    protocolTab,
    openConnectionDialog,
    addLocalSession,
    importConnections,
    connectToServer,
    toggleBottomPanel,
    toggleAiPanel
  } = useAppStore()
  const openSettingsDialog = useSettingsStore((s) => s.openSettingsDialog)
  const [exportOpen, setExportOpen] = useState(false)

  const typedConnections = filterByProtocol(connections, protocolTab)
  const quickRecent = filterByProtocol(recent, protocolTab).slice(0, 3)

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-terminal-bg">
      <div className="welcome-glow pointer-events-none absolute inset-0" />

      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center px-6 py-8">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-app bg-accent-soft ring-1 ring-accent/20">
          <Terminal size={26} className="text-accent" strokeWidth={1.75} />
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-terminal-fg">YunTerminal</h1>
        <p className="mt-1.5 max-w-sm text-center text-[13px] leading-relaxed text-accent-muted">
          SSH · SFTP · 端口转发 · AI 助手，一站管理你的服务器
        </p>

        <div className="mt-7 grid w-full grid-cols-2 gap-2.5">
          <button
            className="welcome-card group col-span-2 sm:col-span-1"
            onClick={() => openConnectionDialog()}
          >
            <Plus size={18} className="text-accent" />
            <span className="mt-2 text-[13px] font-medium">新建连接</span>
          </button>
          <button className="welcome-card group col-span-2 sm:col-span-1" onClick={addLocalSession}>
            <Terminal size={18} className="text-accent" />
            <span className="mt-2 text-[13px] font-medium">本地终端</span>
          </button>
          <button className="welcome-card group" onClick={() => void importConnections('merge')}>
            <FolderInput size={17} className="text-accent" />
            <span className="mt-2 text-[13px] font-medium">导入配置</span>
          </button>
          <button className="welcome-card group" onClick={() => setExportOpen(true)}>
            <FolderOutput size={17} className="text-accent" />
            <span className="mt-2 text-[13px] font-medium">导出配置</span>
          </button>
          <button className="welcome-card group" onClick={openSettingsDialog}>
            <Settings size={17} className="text-accent" />
            <span className="mt-2 text-[13px] font-medium">偏好设置</span>
          </button>
        </div>

        {quickRecent.length > 0 && (
          <div className="mt-6 w-full">
            <p className="section-label">最近连接</p>
            <div className="mt-1 space-y-1">
              {quickRecent.map((conn) => (
                <button
                  key={conn.id}
                  className="tree-item w-full bg-surface-raised/30"
                  onClick={() => connectToServer(conn)}
                >
                  <Server size={14} className="shrink-0 text-accent" />
                  <span className="truncate font-medium">{conn.name}</span>
                  <span className="ml-auto truncate text-[11px] text-accent-muted/70">
                    {conn.host}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button className="status-pill" onClick={toggleBottomPanel}>
            SFTP / 转发 / 笔记
          </button>
          <button className="status-pill" onClick={toggleAiPanel}>
            <Sparkles size={11} />
            AI 助手
          </button>
          {typedConnections.length > 0 && (
            <span className="status-pill opacity-70">
              <Cloud size={11} />
              {typedConnections.length} 个连接
            </span>
          )}
        </div>

        <div className="mt-8 w-full rounded-app border border-surface-border/50 bg-surface-raised/30 p-3.5">
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] text-accent-muted">
            <Keyboard size={11} />
            快捷键
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {shortcuts.map((item) => (
              <div key={item.keys} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-accent-muted">{item.label}</span>
                <kbd className="rounded border border-surface-border/60 bg-surface/80 px-1.5 py-px font-mono text-[10px] text-terminal-fg/80">
                  {item.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>

      {exportOpen ? <ExportConnectionsDialog onClose={() => setExportOpen(false)} /> : null}
    </div>
  )
}
