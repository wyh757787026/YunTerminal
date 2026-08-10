import {
  ArrowDownUp,
  Clock,
  Copy,
  Eye,
  EyeOff,
  HardDrive,
  Monitor,
  MoreVertical,
  FolderOutput,
  Plus,
  RefreshCw,
  Scan,
  Search,
  Server,
  Star,
  Trash2
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAppStore } from '@renderer/stores/app-store'
import { ExportConnectionsDialog } from '@renderer/components/connection/ExportConnectionsDialog'
import {
  getLatencyDisplay,
  getServerInfoDisplay
} from '@renderer/lib/connection-display'
import { useConnectionLatency } from '@renderer/hooks/use-connection-latency'
import { useConnectionServerInfo, type ServerInfoEntry } from '@renderer/hooks/use-connection-server-info'
import {
  filterByProtocol,
  filterBySearch,
  filterBySection,
  getProtocolLabel
} from '@renderer/lib/connection-filters'
import type { StoredConnection } from '@shared/types/connection'
import { TunnelGlobalPanel } from '@renderer/components/tunnel/TunnelGlobalPanel'

type SortKey = 'name' | 'host'
type SortDir = 'asc' | 'desc'

function maskHost(host: string, visible: boolean): string {
  if (visible) return host
  const parts = host.split('.')
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`
  }
  return host.replace(/\d/g, '*')
}

function ConnectionRow({
  connection,
  showHosts,
  selected,
  onToggleSelect,
  latency,
  serverInfo
}: {
  connection: StoredConnection
  showHosts: boolean
  selected: boolean
  onToggleSelect: () => void
  latency: { status: 'idle' | 'pending' | 'ok' | 'fail' | 'skip'; ms?: number; message?: string }
  serverInfo: ServerInfoEntry
}): React.JSX.Element {
  const connectToServer = useAppStore((s) => s.connectToServer)
  const openConnectionDialog = useAppStore((s) => s.openConnectionDialog)
  const toggleFavorite = useAppStore((s) => s.toggleFavorite)
  const deleteConnection = useAppStore((s) => s.deleteConnection)
  const sessions = useAppStore((s) => s.sessions)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const isRdp = connection.protocol === 'rdp'
  const isVnc = connection.protocol === 'vnc'
  const isFtp = connection.protocol === 'ftp'
  const activeSession = sessions.find(
    (s) => s.connectionId === connection.id && s.status !== 'disconnected'
  )

  const latencyDisplay = getLatencyDisplay(latency)
  const serverInfoDisplay = getServerInfoDisplay(serverInfo)

  const copyAddress = async (): Promise<void> => {
    await navigator.clipboard.writeText(connection.host)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <tr className="group border-b border-surface-border/30 hover:bg-surface-overlay/30">
      <td className="w-8 px-2 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="rounded border-surface-border"
        />
      </td>
      <td className="w-8 px-1 py-2.5">
        <button
          className="btn-icon-sm"
          title={connection.favorite ? '取消收藏' : '收藏'}
          onClick={() => void toggleFavorite(connection.id)}
        >
          <Star
            size={13}
            className={
              connection.favorite
                ? 'fill-amber-400/90 text-amber-400/90'
                : 'text-accent-muted/50 hover:text-amber-400/80'
            }
          />
        </button>
      </td>
      <td className="w-10 px-1 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded border border-surface-border/60 bg-surface-overlay/40">
          {isRdp ? (
            <Monitor size={14} className="text-accent" />
          ) : isVnc ? (
            <Scan size={14} className="text-accent" />
          ) : isFtp ? (
            <HardDrive size={14} className="text-accent" />
          ) : (
            <Server size={14} className="text-accent" />
          )}
        </div>
      </td>
      <td className="w-20 px-2 py-2.5">
        <span
          className={`inline-flex items-center gap-1 text-xs tabular-nums ${latencyDisplay.className}`}
          title={latencyDisplay.title}
        >
          <Clock size={11} className="shrink-0 opacity-80" />
          {latencyDisplay.text}
        </span>
      </td>
      <td className="min-w-[100px] px-2 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm text-terminal-fg">{connection.name}</span>
          {activeSession?.status === 'connected' && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
          )}
        </div>
      </td>
      <td className="min-w-[140px] px-2 py-2.5">
        <div className="flex items-center gap-1">
          <span className="truncate font-mono text-xs text-accent-muted">
            {maskHost(connection.host, showHosts)}
            {!isRdp && showHosts && `:${connection.port}`}
          </span>
          <button
            className="btn-icon-sm shrink-0 opacity-0 group-hover:opacity-100"
            title={copied ? '已复制' : '复制地址'}
            onClick={() => void copyAddress()}
          >
            <Copy size={11} className={copied ? 'text-emerald-400' : ''} />
          </button>
        </div>
      </td>
      <td className="min-w-[240px] px-2 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5" title={serverInfoDisplay.title}>
          {serverInfoDisplay.loading ? (
            <span className="text-xs text-accent-muted/70">…</span>
          ) : serverInfoDisplay.tags.length === 0 ? (
            <span className="text-xs text-accent-muted/40" title={serverInfoDisplay.title}>
              —
            </span>
          ) : (
            serverInfoDisplay.tags.map((tag, index) => (
              <span
                key={tag}
                className={`server-info-tag ${index === 0 ? 'max-w-[168px] truncate' : ''}`}
                title={tag}
              >
                {tag}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="w-[200px] px-2 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <button className="btn-primary px-3 py-1 text-xs" onClick={() => connectToServer(connection)}>
            连接
          </button>
          <button
            className="text-xs text-accent-muted hover:text-terminal-fg"
            onClick={() => openConnectionDialog(connection.id)}
          >
            编辑
          </button>
          <div className="relative">
            <button className="btn-icon-sm" onClick={() => setMenuOpen((v) => !v)}>
              <MoreVertical size={13} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="dropdown-menu right-0 top-8 z-20 w-28">
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setMenuOpen(false)
                      void toggleFavorite(connection.id)
                    }}
                  >
                    {connection.favorite ? '取消收藏' : '收藏'}
                  </button>
                  <button
                    className="dropdown-item text-red-400"
                    onClick={() => {
                      setMenuOpen(false)
                      if (confirm(`确定删除连接「${connection.name}」？`)) {
                        void deleteConnection(connection.id)
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

export function ConnectionListPanel(): React.JSX.Element {
  const {
    connections,
    favorites,
    recent,
    sessions,
    protocolTab,
    connectionSection,
    searchQuery,
    setSearchQuery,
    openConnectionDialog,
    refreshConnectionData,
    favoriteConnections,
    deleteConnections
  } = useAppStore()

  const [showHosts, setShowHosts] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const protocolLabel = getProtocolLabel(protocolTab)

  const filtered = useMemo(() => {
    // 先按分区取列表，再按当前协议过滤（最近/收藏也必须同类型）
    let list = filterBySection(connections, connectionSection, favorites, recent)
    list = filterByProtocol(list, protocolTab)
    list = filterBySearch(list, searchQuery)
    list.sort((a, b) => {
      const av = sortKey === 'name' ? a.name : a.host
      const bv = sortKey === 'name' ? b.name : b.host
      const cmp = av.localeCompare(bv, 'zh-CN')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [connections, favorites, recent, protocolTab, connectionSection, searchQuery, sortKey, sortDir])

  // 正在握手的连接先跳过服务器信息拉取，避免与正式连接抢 SSH
  const connectingIds = useMemo(
    () =>
      new Set(
        sessions
          .filter((s) => s.status === 'connecting' && Boolean(s.connectionId))
          .map((s) => s.connectionId as string)
      ),
    [sessions]
  )
  const serverInfoTargets = useMemo(
    () => filtered.filter((c) => !connectingIds.has(c.id)),
    [filtered, connectingIds]
  )

  const { latencyMap, refreshLatency } = useConnectionLatency(filtered, true)
  const { serverInfoMap, refreshServerInfo } = useConnectionServerInfo(serverInfoTargets, true)

  const handleRefresh = (): void => {
    void refreshConnectionData()
    refreshLatency()
    refreshServerInfo()
  }

  const sectionTitle = useMemo(() => {
    switch (connectionSection) {
      case 'all':
        return '全部'
      case 'favorites':
        return '收藏'
      case 'recent':
        return '最近'
      case 'common':
        return '常用'
      default:
        return connectionSection.startsWith('group:') ? '分组' : '全部'
    }
  }, [connectionSection])

  const toggleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (): void => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)))
    }
  }

  const selectedInView = useMemo(
    () => filtered.filter((c) => selectedIds.has(c.id)),
    [filtered, selectedIds]
  )

  const handleBulkFavorite = async (): Promise<void> => {
    if (bulkBusy || selectedInView.length === 0) return
    setBulkBusy(true)
    try {
      await favoriteConnections(selectedInView.map((c) => c.id))
    } finally {
      setBulkBusy(false)
    }
  }

  const handleBulkDelete = async (): Promise<void> => {
    if (bulkBusy || selectedInView.length === 0) return
    const count = selectedInView.length
    if (!confirm(`确定删除选中的 ${count} 个连接？此操作不可恢复。`)) return
    setBulkBusy(true)
    try {
      await deleteConnections(selectedInView.map((c) => c.id))
      setSelectedIds(new Set())
    } finally {
      setBulkBusy(false)
    }
  }

  if (protocolTab === 'tunnel') {
    return <TunnelGlobalPanel />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-surface-border/40 px-3">
        <span className="shrink-0 text-sm font-medium text-terminal-fg/90">{sectionTitle}</span>
        <div className="search-box mx-2 max-w-md flex-1">
          <Search size={13} className="shrink-0 text-accent-muted" />
          <input
            type="text"
            placeholder={`${protocolLabel.toLowerCase()} root@** / 搜索`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-accent-muted/60"
          />
        </div>
        <button className="btn-icon-sm" title="刷新" onClick={handleRefresh}>
          <RefreshCw size={13} />
        </button>
        <button
          className="btn-icon-sm"
          title={showHosts ? '隐藏地址' : '显示地址'}
          onClick={() => setShowHosts((v) => !v)}
        >
          {showHosts ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button
          className="btn-icon-sm text-accent"
          title={`新建${protocolLabel}`}
          onClick={() => openConnectionDialog()}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="btn-icon-sm"
          title="导出全部连接为 JSON"
          onClick={() => setExportOpen(true)}
        >
          <FolderOutput size={13} />
        </button>
        <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-surface-border/50 pl-2">
          <button
            type="button"
            className="btn-icon-sm disabled:opacity-35"
            title={
              selectedInView.length > 0
                ? `批量收藏选中的 ${selectedInView.length} 个连接`
                : '请先勾选连接'
            }
            disabled={bulkBusy || selectedInView.length === 0}
            onClick={() => void handleBulkFavorite()}
          >
            <Star size={13} className="fill-amber-400/90 text-amber-400/90" />
          </button>
          <button
            type="button"
            className="btn-icon-sm text-red-400 hover:text-red-400 disabled:opacity-35"
            title={
              selectedInView.length > 0
                ? `批量删除选中的 ${selectedInView.length} 个连接`
                : '请先勾选连接'
            }
            disabled={bulkBusy || selectedInView.length === 0}
            onClick={() => void handleBulkDelete()}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-overlay/40">
              <Server size={28} className="text-accent-muted/40" />
            </div>
            <p className="text-sm text-terminal-fg/80">暂无{protocolLabel}连接</p>
            <p className="text-xs text-accent-muted">点击右上角 + 添加首个连接</p>
            <button className="btn-primary mt-2 flex items-center gap-1.5" onClick={() => openConnectionDialog()}>
              <Plus size={14} />
              新建{protocolLabel}连接
            </button>
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-surface-raised/95 backdrop-blur-sm">
              <tr className="border-b border-surface-border/50 text-[11px] text-accent-muted">
                <th className="w-8 px-2 py-2 font-normal">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="rounded border-surface-border"
                  />
                </th>
                <th className="w-8 px-1 py-2 font-normal" />
                <th className="w-10 px-1 py-2 font-normal">系统</th>
                <th className="w-20 px-2 py-2 font-normal">延迟</th>
                <th className="px-2 py-2 font-normal">
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 hover:text-terminal-fg"
                    onClick={() => toggleSort('name')}
                  >
                    名称
                    <ArrowDownUp size={10} className={sortKey === 'name' ? 'text-accent' : ''} />
                  </button>
                </th>
                <th className="px-2 py-2 font-normal">
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 hover:text-terminal-fg"
                    onClick={() => toggleSort('host')}
                  >
                    地址
                    <ArrowDownUp size={10} className={sortKey === 'host' ? 'text-accent' : ''} />
                  </button>
                </th>
                <th className="px-2 py-2 font-normal">信息</th>
                <th className="px-2 py-2 text-right font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((conn) => (
                <ConnectionRow
                  key={conn.id}
                  connection={conn}
                  showHosts={showHosts}
                  selected={selectedIds.has(conn.id)}
                  onToggleSelect={() => toggleSelect(conn.id)}
                  latency={latencyMap[conn.id] ?? { status: 'idle' }}
                  serverInfo={serverInfoMap[conn.id] ?? { status: 'idle' }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {exportOpen ? <ExportConnectionsDialog onClose={() => setExportOpen(false)} /> : null}
    </div>
  )
}
