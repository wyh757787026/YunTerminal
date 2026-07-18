import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Copy,
  Cpu,
  GitBranch,
  Globe,
  HardDrive,
  MemoryStick,
  Monitor,
  RefreshCw,
  Settings
} from 'lucide-react'
import type { ServerMetrics } from '@shared/types/monitor'
import { formatBytesCompact, formatSpeed } from '@renderer/lib/format-utils'
import { usePinnedScrollWidth } from '@renderer/hooks/use-pinned-scroll-width'
import { AI_PANEL_WIDTH } from '@renderer/components/layout/layout-constants'
import { useAppStore } from '@renderer/stores/app-store'
import { normalizeMetrics } from './normalize-metrics'
import {
  chartAverage,
  chartLatest,
  chartPeak,
  ResponsiveSmoothLineChart
} from './monitor-charts'

const HISTORY_LEN = 120
const COLLECT_INTERVAL_MS = 3000
const TIME_WINDOW_MINUTES = 6
const CARD_CLASS = 'monitor-card'

function MonitorCard({
  title,
  icon,
  badge,
  extra,
  children,
  className = CARD_CLASS,
  scrollBody = true
}: {
  title: string
  icon: React.ReactNode
  badge?: React.ReactNode
  extra?: React.ReactNode
  children: React.ReactNode
  className?: string
  scrollBody?: boolean
}): React.JSX.Element {
  return (
    <div className={className}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-terminal-fg">
          <span className="text-emerald-400">{icon}</span>
          {title}
        </div>
        <div className="flex items-center gap-1.5">
          {badge}
          {extra}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain">
        {children}
      </div>
    </div>
  )
}

function SegmentedBar({ percent }: { percent: number }): React.JSX.Element {
  const segments = 28
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * segments)
  return (
    <div className="flex flex-1 gap-px">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={`h-3 flex-1 rounded-[1px] ${
            i < filled ? (percent >= 85 ? 'bg-red-400' : 'bg-emerald-400') : 'bg-surface-border'
          }`}
        />
      ))}
    </div>
  )
}

function DiskMountCard({
  mount,
  totalBytes,
  availableBytes,
  usePercent
}: {
  mount: string
  totalBytes: number
  availableBytes: number
  usePercent: number
}): React.JSX.Element {
  const barColor = usePercent >= 90 ? 'bg-red-400' : usePercent >= 75 ? 'bg-amber-400' : 'bg-emerald-400'

  return (
    <div className="rounded-lg border border-surface-border/90 bg-surface-overlay/50 px-2 py-1.5">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="monitor-inset-box min-w-0 flex-1 truncate" title={mount}>
          {mount}
        </span>
        <span className="shrink-0 rounded border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-emerald-400">
          {usePercent.toFixed(0)}%
        </span>
      </div>
      <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-surface-border">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, usePercent))}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="text-accent-muted">
          大小{' '}
          <span className="tabular-nums text-terminal-fg">{formatBytesCompact(totalBytes)}</span>
        </span>
        <span className="text-accent-muted">
          可用{' '}
          <span className="tabular-nums text-terminal-fg">{formatBytesCompact(availableBytes)}</span>
        </span>
      </div>
    </div>
  )
}

function StatPill({
  dot,
  label,
  value
}: {
  dot: string
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="monitor-stat-pill">
      <div className="flex items-center gap-1 text-[10px] text-accent-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-medium text-terminal-fg">{value}</div>
    </div>
  )
}

function pushHistory(prev: number[], value: number): number[] {
  const next = [...prev, value]
  return next.length > HISTORY_LEN ? next.slice(-HISTORY_LEN) : next
}

export function MonitorPanel(): React.JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const connections = useAppStore((s) => s.connections)
  const { scrollRef, pinnedWidth } = usePinnedScrollWidth(aiPanelOpen, AI_PANEL_WIDTH)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const connectionId = activeSession?.type === 'ssh' ? activeSession.connectionId : undefined
  const connection = connections.find((c) => c.id === connectionId)

  const [metrics, setMetrics] = useState<ServerMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [memoryHistory, setMemoryHistory] = useState<number[]>([])
  const [uploadHistory, setUploadHistory] = useState<number[]>([])
  const [downloadHistory, setDownloadHistory] = useState<number[]>([])
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | null>(null)

  const host = connection?.host ?? metrics?.hostname ?? ''

  const collect = useCallback(async (): Promise<void> => {
    if (!connectionId) return
    setLoading(true)
    setError(null)
    try {
      const data = normalizeMetrics(await window.api.monitor.collect(connectionId))
      setMetrics(data)
      if (!data.unsupported) {
        setCpuHistory((prev) => pushHistory(prev, data.cpuPercent))
        setMemoryHistory((prev) => pushHistory(prev, data.memoryPercent))
        setUploadHistory((prev) => pushHistory(prev, data.network.uploadSpeedBps))
        setDownloadHistory((prev) => pushHistory(prev, data.network.downloadSpeedBps))
      }
      if (data.unsupported && data.message) {
        setError(data.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '采集失败')
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    setMetrics(null)
    setCpuHistory([])
    setMemoryHistory([])
    setUploadHistory([])
    setDownloadHistory([])
  }, [connectionId])

  useEffect(() => {
    void collect()
  }, [collect])

  useEffect(() => {
    if (!connectionId) return
    const timer = window.setInterval(() => {
      void collect()
    }, COLLECT_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [connectionId, collect])

  useEffect(() => {
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current)
    }
  }, [])

  const copyHost = async (): Promise<void> => {
    if (!host) return
    await navigator.clipboard.writeText(host)
    setCopied(true)
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 1500)
  }

  if (!connectionId) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-accent-muted">
        请先打开 SSH 连接
      </div>
    )
  }

  const rootDisk = metrics?.disks.find((d) => d.mount === '/') ?? metrics?.disks[0]
  const otherDisks = metrics?.disks.filter((d) => d.mount !== rootDisk?.mount) ?? []
  const uptimeDays = metrics ? Math.floor(metrics.uptimeSeconds / 86400) : 0
  const cores =
    (metrics?.cpuCores?.length ?? 0) > 0
      ? metrics!.cpuCores
      : metrics
        ? [{ id: '0', percent: metrics.cpuPercent }]
        : []

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-muted">
      {error && <div className="banner-warning shrink-0 py-1">{error}</div>}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-2">
        {!metrics || metrics.unsupported ? (
          <div className="flex h-full min-h-[200px] items-center justify-center text-xs text-accent-muted">
            {loading ? '正在采集…' : '等待监控数据'}
          </div>
        ) : (
          <div
            className={`grid grid-cols-6 gap-2 ${pinnedWidth ? 'shrink-0' : 'w-full'}`}
            style={
              pinnedWidth
                ? { width: pinnedWidth, minWidth: pinnedWidth }
                : undefined
            }
          >
            {/* 系统 */}
            <MonitorCard
              title="系统"
              icon={<Monitor size={14} />}
              extra={
                <button
                  type="button"
                  className="monitor-icon-btn"
                  title="刷新"
                  onClick={() => void collect()}
                >
                  <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
              }
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm text-terminal-fg">{host}</span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      className="monitor-icon-btn hover:text-emerald-400"
                      title={copied ? '已复制' : '复制 IP'}
                      onClick={() => void copyHost()}
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      type="button"
                      className="monitor-icon-btn"
                      title="设置"
                    >
                      <Settings size={12} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {metrics.osName && (
                    <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-400">
                      {metrics.osName}
                    </span>
                  )}
                  {metrics.osVersion && (
                    <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-400">
                      {metrics.osVersion}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-accent-muted">时区</div>
                    <div className="mt-0.5 truncate text-terminal-fg/90">{metrics.timezone || '-'}</div>
                  </div>
                  <div>
                    <div className="text-accent-muted">运行时间</div>
                    <div className="mt-0.5 text-emerald-400">{uptimeDays} 天</div>
                  </div>
                </div>
              </div>
            </MonitorCard>

            {/* CPU */}
            <MonitorCard
              title="CPU"
              icon={<Cpu size={14} />}
              badge={
                <span className="rounded border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-400">
                  {metrics.cpuPercent.toFixed(1)}%
                </span>
              }
            >
              <div className="space-y-2">
                <ResponsiveSmoothLineChart
                  series={[
                    {
                      values: cpuHistory,
                      color: '#34d399',
                      fillId: 'cpu-area-fill',
                      label: 'CPU'
                    }
                  ]}
                  height={72}
                  maxValue={100}
                  timeWindowMinutes={TIME_WINDOW_MINUTES}
                  formatY={(v) => `${Math.round(v)}%`}
                />
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <StatPill dot="bg-emerald-400" label="当前" value={`${chartLatest(cpuHistory).toFixed(1)}%`} />
                  <StatPill dot="bg-amber-400" label="峰值" value={`${chartPeak(cpuHistory).toFixed(1)}%`} />
                  <StatPill dot="bg-accent-muted" label="均值" value={`${chartAverage(cpuHistory).toFixed(1)}%`} />
                </div>
                <div className="space-y-1.5 border-t border-surface-border/80 pt-2">
                  {cores.map((core) => (
                    <div key={core.id} className="flex items-center gap-2">
                      <span className="w-3 shrink-0 text-[10px] text-accent-muted">{core.id}</span>
                      <SegmentedBar percent={core.percent} />
                      <span className="w-10 shrink-0 text-right text-[10px] text-terminal-fg/90">
                        {core.percent.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-accent-muted">
                  负载 {metrics.loadAverage.map((n) => n.toFixed(2)).join(' / ')}
                </div>
              </div>
            </MonitorCard>

            {/* 内存 */}
            <MonitorCard
              title="内存"
              icon={<MemoryStick size={14} />}
              badge={
                <span className="rounded border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-400">
                  {metrics.memoryPercent.toFixed(1)}%
                </span>
              }
            >
              <div className="space-y-1.5">
                <ResponsiveSmoothLineChart
                  series={[
                    {
                      values: memoryHistory,
                      color: '#f87171',
                      fillId: 'mem-area-fill',
                      label: '内存'
                    }
                  ]}
                  height={72}
                  maxValue={100}
                  timeWindowMinutes={TIME_WINDOW_MINUTES}
                  formatY={(v) => `${Math.round(v)}%`}
                />
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <StatPill
                    dot="bg-red-400"
                    label="当前"
                    value={`${chartLatest(memoryHistory).toFixed(1)}%`}
                  />
                  <StatPill
                    dot="bg-amber-400"
                    label="峰值"
                    value={`${chartPeak(memoryHistory).toFixed(1)}%`}
                  />
                  <StatPill
                    dot="bg-accent-muted"
                    label="均值"
                    value={`${chartAverage(memoryHistory).toFixed(1)}%`}
                  />
                </div>
                <div className="grid grid-cols-3 gap-1 border-t border-surface-border/80 pt-1.5 text-[10px]">
                  <StatPill
                    dot="bg-red-400"
                    label="已用"
                    value={formatBytesCompact(metrics.memoryUsedBytes)}
                  />
                  <StatPill
                    dot="bg-accent-muted"
                    label="缓存"
                    value={formatBytesCompact(metrics.memoryCachedBytes)}
                  />
                  <StatPill
                    dot="bg-emerald-400"
                    label="空闲"
                    value={formatBytesCompact(metrics.memoryFreeBytes)}
                  />
                </div>
              </div>
            </MonitorCard>

            {/* 网络 */}
            <MonitorCard title="网络" icon={<Globe size={14} />}>
              <div className="space-y-2">
                <ResponsiveSmoothLineChart
                  series={[
                    {
                      values: downloadHistory,
                      color: '#34d399',
                      fillId: 'net-down-fill',
                      label: '下载'
                    },
                    {
                      values: uploadHistory,
                      color: '#60a5fa',
                      fillId: 'net-up-fill',
                      label: '上传'
                    }
                  ]}
                  height={72}
                  timeWindowMinutes={TIME_WINDOW_MINUTES}
                  formatY={(v) => {
                    if (v < 1024) return `${Math.round(v)} B`
                    if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`
                    return `${(v / (1024 * 1024)).toFixed(1)} MB`
                  }}
                />
                <div className="flex items-center gap-3 text-[10px] text-accent-muted">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    下载
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    上传
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <StatPill
                    dot="bg-emerald-400"
                    label="下载速度"
                    value={formatSpeed(metrics.network.downloadSpeedBps)}
                  />
                  <StatPill
                    dot="bg-blue-400"
                    label="上传速度"
                    value={formatSpeed(metrics.network.uploadSpeedBps)}
                  />
                  <StatPill
                    dot="bg-emerald-400/60"
                    label="下载峰值"
                    value={formatSpeed(chartPeak(downloadHistory))}
                  />
                  <StatPill
                    dot="bg-blue-400/60"
                    label="上传峰值"
                    value={formatSpeed(chartPeak(uploadHistory))}
                  />
                </div>
              </div>
            </MonitorCard>

            {/* 磁盘 */}
            <MonitorCard
              title="磁盘"
              icon={<HardDrive size={14} />}
              scrollBody={true}
              badge={
                rootDisk ? (
                  <span className="rounded border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-400">
                    {formatBytesCompact(rootDisk.usedBytes)} / {formatBytesCompact(rootDisk.totalBytes)}
                  </span>
                ) : null
              }
            >
              <div className="flex flex-col gap-2">
                {metrics.disks.length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-accent-muted">暂无磁盘数据</p>
                ) : (
                  <>
                    {rootDisk && (
                      <div className="shrink-0 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="flex min-w-0 items-center gap-1 text-terminal-fg/90">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                            <span className="truncate font-mono">{rootDisk.mount}</span>
                          </span>
                          {metrics.fsType && (
                            <span className="shrink-0 rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-400">
                              {metrics.fsType}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <div className="flex h-12 w-5 shrink-0 flex-col justify-end overflow-hidden rounded border border-surface-border/80 bg-surface-border/30 p-0.5">
                            <div
                              className="w-full rounded-sm bg-emerald-400/90 transition-all"
                              style={{ height: `${Math.max(8, rootDisk.usePercent)}%` }}
                            />
                          </div>
                          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
                            <StatPill
                              dot="bg-accent-muted"
                              label="读/s"
                              value={formatSpeed(metrics.diskIo.readSpeedBps)}
                            />
                            <StatPill
                              dot="bg-accent-muted"
                              label="写/s"
                              value={formatSpeed(metrics.diskIo.writeSpeedBps)}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {otherDisks.length > 0 && (
                      <div className="flex flex-col gap-1.5 overflow-x-hidden border-t border-surface-border/80 pt-2">
                        {otherDisks.map((disk) => (
                          <DiskMountCard
                            key={disk.mount}
                            mount={disk.mount}
                            totalBytes={disk.totalBytes}
                            availableBytes={disk.availableBytes}
                            usePercent={disk.usePercent}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </MonitorCard>

            {/* 进程 */}
            <MonitorCard title="进程管理" icon={<GitBranch size={14} />}>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-accent-muted">
                    <th className="pb-1.5 text-left font-normal">CPU</th>
                    <th className="pb-1.5 text-left font-normal">MEM</th>
                    <th className="pb-1.5 text-left font-normal">CMD</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.processes.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-3 text-center text-accent-muted">
                        暂无热点进程
                      </td>
                    </tr>
                  ) : (
                    metrics.processes.map((proc, i) => (
                      <tr key={`${proc.command}-${i}`} className="text-terminal-fg/90">
                        <td className="py-0.5 pr-2">{proc.cpu.toFixed(1)}%</td>
                        <td className="py-0.5 pr-2">{proc.mem.toFixed(1)}%</td>
                        <td className="max-w-[120px] truncate py-0.5 font-mono">{proc.command}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </MonitorCard>
          </div>
        )}
      </div>
    </div>
  )
}
