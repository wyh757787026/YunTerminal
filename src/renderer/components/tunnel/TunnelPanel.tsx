import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit3, Network, Play, Plus, Square, Trash2 } from 'lucide-react'
import type { StoredTunnel, TunnelStatus, TunnelStatusEvent } from '@shared/types/tunnel'
import { TUNNEL_TYPE_LABELS } from '@shared/types/tunnel'
import { useAppStore } from '@renderer/stores/app-store'
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

interface TunnelPanelProps {
  /** 限定某个 SSH 连接；不传则显示全部规则 */
  connectionId?: string
  /** 是否显示关联连接列 */
  showConnection?: boolean
}

export function TunnelPanel({
  connectionId,
  showConnection = !connectionId
}: TunnelPanelProps): React.JSX.Element {
  const connections = useAppStore((s) => s.connections)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const resolvedConnectionId =
    connectionId ??
    (activeSession?.type === 'ssh' ? activeSession.connectionId : undefined)

  const sshConnections = useMemo(
    () => connections.filter((c) => (c.protocol ?? 'ssh') === 'ssh'),
    [connections]
  )

  const connectionNameMap = useMemo(
    () => new Map(connections.map((c) => [c.id, c.name])),
    [connections]
  )

  const [tunnels, setTunnels] = useState<StoredTunnel[]>([])
  const [statuses, setStatuses] = useState<TunnelStatusEvent[]>([])
  const [dialogTunnel, setDialogTunnel] = useState<StoredTunnel | null | undefined>(undefined)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadTunnels = useCallback(async (): Promise<void> => {
    const [list, statusList] = await Promise.all([
      window.api.tunnel.list(connectionId),
      window.api.tunnel.statuses(connectionId)
    ])
    setTunnels(list)
    setStatuses(statusList)
  }, [connectionId])

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
    if (!confirm(`确定删除转发规则「${tunnel.name}」？`)) return
    await window.api.tunnel.delete(tunnel.id)
    await loadTunnels()
  }

  const defaultConnectionId =
    resolvedConnectionId ?? sshConnections[0]?.id

  const rows = mergeTunnelStatus(tunnels, statuses)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-surface-border px-3 py-1.5">
        <span className="text-xs text-accent-muted">
          {connectionId ? '当前连接的转发规则' : '全部端口转发规则'}
        </span>
        <button
          className="btn-secondary flex items-center gap-1 px-2 py-1 text-xs"
          disabled={!defaultConnectionId}
          onClick={() => setDialogTunnel(null)}
        >
          <Plus size={12} />
          新建隧道
        </button>
      </div>

      {!defaultConnectionId && (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-accent-muted">
          请先添加 SSH 连接，再创建端口转发规则
        </div>
      )}

      {defaultConnectionId && (
        <>
          {actionError && (
            <div className="border-b border-surface-border bg-red-500/10 px-3 py-1 text-xs text-red-400">
              {actionError}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto">
            {rows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-overlay/40">
                  <Network size={24} className="text-accent-muted/40" />
                </div>
                <p className="text-sm text-terminal-fg/80">暂无隧道</p>
                <p className="text-xs text-accent-muted">点击「新建规则」添加</p>
                <button
                  className="btn-primary mt-1 flex items-center gap-1.5 text-xs"
                  onClick={() => setDialogTunnel(null)}
                >
                  <Plus size={13} />
                  新建隧道
                </button>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-base text-accent-muted">
                  <tr className="border-b border-surface-border">
                    <th className="px-3 py-1.5 text-left font-medium">名称</th>
                    {showConnection && (
                      <th className="px-3 py-1.5 text-left font-medium">SSH 连接</th>
                    )}
                    <th className="px-3 py-1.5 text-left font-medium">类型</th>
                    <th className="px-3 py-1.5 text-left font-medium">绑定</th>
                    <th className="px-3 py-1.5 text-left font-medium">目标</th>
                    <th className="px-3 py-1.5 text-left font-medium">状态</th>
                    <th className="px-3 py-1.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((tunnel) => (
                    <tr
                      key={tunnel.id}
                      className="border-b border-surface-border/50 hover:bg-surface-overlay/30"
                    >
                      <td className="px-3 py-2">
                        <div>{tunnel.name}</div>
                        {tunnel.autoStart && (
                          <span className="text-[10px] text-accent">自动启动</span>
                        )}
                        {tunnel.autoReconnect && (
                          <span className="ml-1 text-[10px] text-accent-muted">自动重连</span>
                        )}
                        {tunnel.note && (
                          <div className="mt-0.5 truncate text-[10px] text-accent-muted" title={tunnel.note}>
                            {tunnel.note}
                          </div>
                        )}
                      </td>
                      {showConnection && (
                        <td className="px-3 py-2 text-accent-muted">
                          {connectionNameMap.get(tunnel.connectionId) ?? tunnel.connectionId}
                        </td>
                      )}
                      <td className="px-3 py-2" title={TUNNEL_TYPE_LABELS[tunnel.type]}>
                        {TYPE_SHORT[tunnel.type]}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {tunnel.bindHost}:{tunnel.bindPort}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {tunnel.type === 'dynamic'
                          ? 'SOCKS5'
                          : `${tunnel.targetHost}:${tunnel.targetPort}`}
                      </td>
                      <td className={`px-3 py-2 ${STATUS_COLOR[tunnel.status]}`}>
                        {STATUS_LABEL[tunnel.status]}
                        {tunnel.errorMessage && (
                          <span className="ml-1 text-accent-muted" title={tunnel.errorMessage}>
                            ⓘ
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {tunnel.status === 'running' || tunnel.status === 'connecting' ? (
                            <button
                              className="btn-icon h-6 w-6"
                              title="停止"
                              onClick={() => void handleStop(tunnel.id)}
                            >
                              <Square size={12} />
                            </button>
                          ) : (
                            <button
                              className="btn-icon h-6 w-6"
                              title="启动"
                              onClick={() => void handleStart(tunnel.id)}
                            >
                              <Play size={12} />
                            </button>
                          )}
                          <button
                            className="btn-icon h-6 w-6"
                            title="编辑"
                            onClick={() => setDialogTunnel(tunnel)}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            className="btn-icon h-6 w-6 text-red-400"
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
        </>
      )}

      {dialogTunnel !== undefined && defaultConnectionId && (
        <TunnelDialog
          connectionId={dialogTunnel?.connectionId ?? defaultConnectionId}
          tunnel={dialogTunnel}
          sshConnections={sshConnections}
          allowConnectionPick={!connectionId}
          onClose={() => setDialogTunnel(undefined)}
          onSaved={() => void loadTunnels()}
        />
      )}
    </div>
  )
}
