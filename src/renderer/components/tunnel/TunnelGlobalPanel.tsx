import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownUp,
  Edit3,
  Eye,
  EyeOff,
  Network,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2
} from 'lucide-react'
import type { StoredTunnel, TunnelStatus, TunnelStatusEvent } from '@shared/types/tunnel'
import { TUNNEL_TYPE_LABELS } from '@shared/types/tunnel'
import { useAppStore } from '@renderer/stores/app-store'
import {
  filterByProtocol,
  filterBySearch,
  filterBySection
} from '@renderer/lib/connection-filters'
import { TunnelDialog } from './TunnelDialog'

const TYPE_SHORT: Record<StoredTunnel['type'], string> = {
  local: 'L',
  remote: 'R',
  dynamic: 'D'
}

const STATUS_LABEL: Record<TunnelStatus, string> = {
  stopped: '已停止',
  connecting: '连接中',
  running: '运行中',
  error: '错误'
}

const STATUS_COLOR: Record<TunnelStatus, string> = {
  stopped: 'text-accent-muted',
  connecting: 'text-yellow-400',
  running: 'text-green-400',
  error: 'text-red-400'
}

type SortKey = 'name' | 'bind'

function mergeTunnelStatus(
  tunnels: StoredTunnel[],
  statuses: TunnelStatusEvent[]
): Array<StoredTunnel & { status: TunnelStatus; errorMessage?: string }> {
  const statusMap = new Map(statuses.map((s) => [s.tunnelId, s]))
  return tunnels.map((tunnel) => {
    const runtime = statusMap.get(tunnel.id)
    return {
      ...tunnel,
      status: runtime?.status ?? 'stopped',
      errorMessage: runtime?.errorMessage
    }
  })
}

function filterTunnelsBySearch(tunnels: StoredTunnel[], query: string): StoredTunnel[] {
  if (!query.trim()) return tunnels
  const q = query.toLowerCase()
  return tunnels.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.bindHost.toLowerCase().includes(q) ||
      t.targetHost.toLowerCase().includes(q) ||
      t.note?.toLowerCase().includes(q)
  )
}

/** 隧道协议页主列表，布局对齐 RDP/SSH 连接列表 */
export function TunnelGlobalPanel(): React.JSX.Element {
  const {
    connections,
    favorites,
    recent,
    connectionSection,
    searchQuery,
    setSearchQuery
  } = useAppStore()

  const sshConnections = useMemo(
    () => connections.filter((c) => (c.protocol ?? 'ssh') === 'ssh'),
    [connections]
  )

  const connectionNameMap = useMemo(
    () => new Map(connections.map((c) => [c.id, c.name])),
    [connections]
  )

  const sectionConnectionIds = useMemo(() => {
    const list = filterByProtocol(connections, 'ssh')
    const sectionList = filterBySection(list, connectionSection, favorites, recent)
    const searched = filterBySearch(sectionList, searchQuery)
    return new Set(searched.map((c) => c.id))
  }, [connections, connectionSection, favorites, recent, searchQuery])

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

  const [tunnels, setTunnels] = useState<StoredTunnel[]>([])
  const [statuses, setStatuses] = useState<TunnelStatusEvent[]>([])
  const [dialogTunnel, setDialogTunnel] = useState<StoredTunnel | null | undefined>(undefined)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showHosts, setShowHosts] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const loadTunnels = useCallback(async (): Promise<void> => {
    const [list, statusList] = await Promise.all([
      window.api.tunnel.list(),
      window.api.tunnel.statuses()
    ])
    setTunnels(list)
    setStatuses(statusList)
  }, [])

  useEffect(() => {
    void loadTunnels()
  }, [loadTunnels])

  useEffect(() => {
    const unsubscribe = window.api.tunnel.onStatus((event) => {
      setStatuses((prev) => {
        const next = prev.filter((s) => s.tunnelId !== event.tunnelId)
        return [...next, event]
      })
    })
    return unsubscribe
  }, [])

  const filtered = useMemo(() => {
    let list = tunnels.filter((t) => sectionConnectionIds.has(t.connectionId))
    list = filterTunnelsBySearch(list, searchQuery)
    list.sort((a, b) => {
      const av = sortKey === 'name' ? a.name : `${a.bindHost}:${a.bindPort}`
      const bv = sortKey === 'name' ? b.name : `${b.bindHost}:${b.bindPort}`
      const cmp = av.localeCompare(bv, 'zh-CN')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [tunnels, sectionConnectionIds, searchQuery, sortKey, sortDir])

  const rows = mergeTunnelStatus(filtered, statuses)
  const defaultConnectionId = sshConnections[0]?.id

  const toggleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleStart = async (id: string): Promise<void> => {
    setActionError(null)
    const result = await window.api.tunnel.start(id)
    if (!result.success) {
      setActionError(result.message ?? '启动失败')
    }
  }

  const handleStop = async (id: string): Promise<void> => {
    setActionError(null)
    await window.api.tunnel.stop(id)
  }

  const handleDelete = async (tunnel: StoredTunnel): Promise<void> => {
    if (!confirm(`确定删除隧道「${tunnel.name}」？`)) return
    await window.api.tunnel.delete(tunnel.id)
    await loadTunnels()
  }

  const openCreateDialog = (): void => {
    if (!defaultConnectionId) return
    setDialogTunnel(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-surface-border/40 px-3">
        <span className="shrink-0 text-sm font-medium text-terminal-fg/90">{sectionTitle}</span>
        <div className="search-box mx-2 max-w-md flex-1">
          <Search size={13} className="shrink-0 text-accent-muted" />
          <input
            type="text"
            placeholder="隧道 名称 / 搜索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-accent-muted/60"
          />
        </div>
        <button className="btn-icon-sm" title="刷新" onClick={() => void loadTunnels()}>
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
          title="新建隧道"
          disabled={!defaultConnectionId}
          onClick={openCreateDialog}
        >
          <Plus size={15} />
        </button>
      </div>

      {actionError && (
        <div className="border-b border-surface-border bg-red-500/10 px-3 py-1 text-xs text-red-400">
          {actionError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {!defaultConnectionId ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-overlay/40">
              <Network size={28} className="text-accent-muted/40" />
            </div>
            <p className="text-sm text-terminal-fg/80">暂无 SSH 连接</p>
            <p className="text-xs text-accent-muted">请先添加 SSH 连接，再创建隧道</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-overlay/40">
              <Network size={28} className="text-accent-muted/40" />
            </div>
            <p className="text-sm text-terminal-fg/80">暂无隧道</p>
            <p className="text-xs text-accent-muted">点击右上角 + 添加首个隧道</p>
            <button className="btn-primary mt-2 flex items-center gap-1.5" onClick={openCreateDialog}>
              <Plus size={14} />
              新建隧道
            </button>
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-surface-raised/95 backdrop-blur-sm">
              <tr className="border-b border-surface-border/50 text-[11px] text-accent-muted">
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
                <th className="px-2 py-2 font-normal">SSH 连接</th>
                <th className="px-2 py-2 font-normal">类型</th>
                <th className="px-2 py-2 font-normal">
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 hover:text-terminal-fg"
                    onClick={() => toggleSort('bind')}
                  >
                    绑定
                    <ArrowDownUp size={10} className={sortKey === 'bind' ? 'text-accent' : ''} />
                  </button>
                </th>
                <th className="px-2 py-2 font-normal">目标</th>
                <th className="px-2 py-2 font-normal">状态</th>
                <th className="px-2 py-2 text-right font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tunnel) => (
                <tr
                  key={tunnel.id}
                  className="group border-b border-surface-border/30 hover:bg-surface-overlay/30"
                >
                  <td className="px-2 py-2.5">
                    <div className="text-sm text-terminal-fg">{tunnel.name}</div>
                    {(tunnel.autoStart || tunnel.autoReconnect) && (
                      <div className="mt-0.5 text-[10px] text-accent-muted">
                        {tunnel.autoStart ? '自动启动' : ''}
                        {tunnel.autoStart && tunnel.autoReconnect ? ' · ' : ''}
                        {tunnel.autoReconnect ? '自动重连' : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-sm text-accent-muted">
                    {connectionNameMap.get(tunnel.connectionId) ?? '—'}
                  </td>
                  <td className="px-2 py-2.5 text-sm" title={TUNNEL_TYPE_LABELS[tunnel.type]}>
                    {TYPE_SHORT[tunnel.type]}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-sm">
                    {showHosts ? `${tunnel.bindHost}:${tunnel.bindPort}` : `***:${tunnel.bindPort}`}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-sm">
                    {tunnel.type === 'dynamic'
                      ? 'SOCKS5'
                      : showHosts
                        ? `${tunnel.targetHost}:${tunnel.targetPort}`
                        : `***:${tunnel.targetPort}`}
                  </td>
                  <td className={`px-2 py-2.5 text-sm ${STATUS_COLOR[tunnel.status]}`}>
                    {STATUS_LABEL[tunnel.status]}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {tunnel.status === 'running' || tunnel.status === 'connecting' ? (
                        <button
                          className="btn-icon h-7 w-7"
                          title="停止"
                          onClick={() => void handleStop(tunnel.id)}
                        >
                          <Square size={12} />
                        </button>
                      ) : (
                        <button
                          className="btn-icon h-7 w-7"
                          title="启动"
                          onClick={() => void handleStart(tunnel.id)}
                        >
                          <Play size={12} />
                        </button>
                      )}
                      <button
                        className="btn-icon h-7 w-7"
                        title="编辑"
                        onClick={() => setDialogTunnel(tunnel)}
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        className="btn-icon h-7 w-7 text-red-400"
                        title="删除"
                        onClick={() => void handleDelete(tunnel)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialogTunnel !== undefined && defaultConnectionId && (
        <TunnelDialog
          connectionId={dialogTunnel?.connectionId ?? defaultConnectionId}
          tunnel={dialogTunnel}
          sshConnections={sshConnections}
          allowConnectionPick
          onClose={() => setDialogTunnel(undefined)}
          onSaved={() => void loadTunnels()}
        />
      )}
    </div>
  )
}
