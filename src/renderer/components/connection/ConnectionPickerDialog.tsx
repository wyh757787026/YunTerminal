import { useEffect, useMemo, useState } from 'react'
import { HardDrive, Monitor, Plus, Scan, Server, Terminal, X } from 'lucide-react'
import type { StoredConnection } from '@shared/types/connection'
import {
  filterByProtocol,
  filterBySearch,
  getProtocolLabel
} from '@renderer/lib/connection-filters'
import { useAppStore } from '@renderer/stores/app-store'

interface ConnectionPickerDialogProps {
  onClose: () => void
}

function ConnectionIcon({ connection }: { connection: StoredConnection }): React.JSX.Element {
  switch (connection.protocol) {
    case 'rdp':
      return <Monitor size={14} className="shrink-0 text-accent/80" />
    case 'vnc':
      return <Scan size={14} className="shrink-0 text-accent/80" />
    case 'ftp':
      return <HardDrive size={14} className="shrink-0 text-accent/80" />
    case 'telnet':
      return <Terminal size={14} className="shrink-0 text-accent/80" />
    default:
      return <Server size={14} className="shrink-0 text-accent/80" />
  }
}

export function ConnectionPickerDialog({ onClose }: ConnectionPickerDialogProps): React.JSX.Element {
  const connections = useAppStore((s) => s.connections)
  const recent = useAppStore((s) => s.recent)
  const protocolTab = useAppStore((s) => s.protocolTab)
  const connectToServer = useAppStore((s) => s.connectToServer)
  const openConnectionDialog = useAppStore((s) => s.openConnectionDialog)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  const protocolLabel = getProtocolLabel(protocolTab)

  const connectable = useMemo(
    () => filterByProtocol(connections, protocolTab),
    [connections, protocolTab]
  )

  const results = useMemo(() => filterBySearch(connectable, query), [connectable, query])

  const recentConnectable = useMemo(
    () => filterByProtocol(recent, protocolTab).slice(0, 5),
    [recent, protocolTab]
  )

  useEffect(() => {
    setSelected(0)
  }, [query, protocolTab])

  const pick = (connection: StoredConnection): void => {
    connectToServer(connection, { newTab: true })
    onClose()
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
      <div className="panel w-full max-w-xl rounded-lg border shadow-2xl">
        <div className="flex items-center gap-2 border-b border-surface-border px-4 py-3">
          <span className="shrink-0 text-sm text-accent-muted">选择{protocolLabel}连接</span>
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-accent-muted"
            placeholder="搜索名称、主机、用户名..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelected((v) => Math.min(v + 1, Math.max(0, results.length - 1)))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelected((v) => Math.max(v - 1, 0))
              }
              if (e.key === 'Enter' && results[selected]) {
                pick(results[selected])
              }
              if (e.key === 'Escape') onClose()
            }}
          />
          <button className="btn-icon" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-accent-muted">
              {connectable.length === 0
                ? `暂无 ${protocolLabel} 连接，请先新建`
                : '没有匹配的连接'}
            </p>
          ) : (
            results.map((connection, index) => (
              <button
                key={connection.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  index === selected ? 'bg-surface-overlay text-terminal-fg' : 'text-accent-muted'
                }`}
                onClick={() => pick(connection)}
              >
                <ConnectionIcon connection={connection} />
                <span className="min-w-0 flex-1 truncate font-medium">{connection.name}</span>
                <span className="shrink-0 truncate text-xs opacity-70">
                  {connection.host}
                  {connection.protocol !== 'rdp' ? `:${connection.port}` : ''}
                </span>
              </button>
            ))
          )}
        </div>

        {recentConnectable.length > 0 && !query.trim() && (
          <div className="border-t border-surface-border/60 px-4 py-2">
            <p className="mb-1 text-[11px] text-accent-muted">最近连接</p>
            <div className="flex flex-wrap gap-1.5">
              {recentConnectable.map((connection) => (
                <button
                  key={connection.id}
                  type="button"
                  className="rounded-md border border-surface-border/70 px-2 py-1 text-xs text-accent-muted hover:bg-surface-overlay hover:text-terminal-fg"
                  onClick={() => pick(connection)}
                >
                  {connection.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end border-t border-surface-border px-4 py-2">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={() => {
              onClose()
              openConnectionDialog()
            }}
          >
            <Plus size={14} />
            新建{protocolLabel}连接
          </button>
        </div>
      </div>
    </div>
  )
}
