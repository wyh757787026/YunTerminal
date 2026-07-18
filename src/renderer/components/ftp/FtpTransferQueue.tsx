import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'

export type FtpTransferDirection = 'upload' | 'download' | 'delete'
export type FtpTransferItemStatus =
  | 'queued'
  | 'transferring'
  | 'paused'
  | 'done'
  | 'error'
  | 'skipped'

export interface FtpTransferItem {
  id: string
  direction: FtpTransferDirection
  localPath: string
  remotePath: string
  size: number
  transferred: number
  status: FtpTransferItemStatus
  message?: string
  /** 删除队列：是否为目录项 */
  isDirectory?: boolean
}

export type FtpTransferQueueTab = 'queue' | 'failed' | 'success'

interface FtpTransferQueueProps {
  items: FtpTransferItem[]
  activeTab: FtpTransferQueueTab
  paused: boolean
  onTabChange: (tab: FtpTransferQueueTab) => void
  onClearTab: (tab: FtpTransferQueueTab) => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

const HEIGHT_STORAGE_KEY = 'yun-ftp-transfer-queue-height'
const DEFAULT_HEIGHT = 144
const MIN_HEIGHT = 96
const MAX_HEIGHT = 480

function readStoredHeight(): number {
  try {
    const raw = localStorage.getItem(HEIGHT_STORAGE_KEY)
    if (!raw) return DEFAULT_HEIGHT
    const value = Number(raw)
    if (!Number.isFinite(value)) return DEFAULT_HEIGHT
    return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, value))
  } catch {
    return DEFAULT_HEIGHT
  }
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function fileName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

function transferPercent(item: FtpTransferItem): number | null {
  const size = Number(item.size)
  const transferred = Number(item.transferred)
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(transferred) || transferred < 0) {
    return null
  }
  return Math.min(100, Math.max(0, Math.round((transferred / size) * 100)))
}

function statusLabel(item: FtpTransferItem): string {
  switch (item.status) {
    case 'queued':
      return item.message || '排队中'
    case 'paused':
      return item.message || '已暂停'
    case 'transferring': {
      if (item.direction === 'delete') {
        return item.message || '删除中'
      }
      const pct = transferPercent(item)
      if (pct !== null) return `${pct}%`
      const transferred = Number(item.transferred)
      return Number.isFinite(transferred) && transferred > 0 ? formatSize(transferred) : '传输中'
    }
    case 'done':
      return item.direction === 'delete' ? '已删除' : '完成'
    case 'skipped':
      return '已跳过'
    case 'error':
      return item.message ? `失败: ${item.message}` : '失败'
    default: {
      const _exhaustive: never = item.status
      return _exhaustive
    }
  }
}

function shouldShowProgressBar(item: FtpTransferItem): boolean {
  if (item.direction === 'delete') return item.status === 'transferring' || item.status === 'done'
  return item.status === 'transferring' || item.status === 'done'
}

function directionIcon(direction: FtpTransferDirection): React.JSX.Element {
  switch (direction) {
    case 'upload':
      return <ArrowUp size={12} className="inline text-accent" />
    case 'download':
      return <ArrowDown size={12} className="inline text-emerald-400" />
    case 'delete':
      return <Trash2 size={12} className="inline text-red-400" />
    default: {
      const _exhaustive: never = direction
      return _exhaustive
    }
  }
}

function filterItems(items: FtpTransferItem[], tab: FtpTransferQueueTab): FtpTransferItem[] {
  switch (tab) {
    case 'queue':
      return items.filter(
        (i) => i.status === 'queued' || i.status === 'transferring' || i.status === 'paused'
      )
    case 'failed':
      return items.filter((i) => i.status === 'error')
    case 'success':
      return items.filter((i) => i.status === 'done' || i.status === 'skipped')
    default: {
      const _exhaustive: never = tab
      return _exhaustive
    }
  }
}

const TABS: Array<{ id: FtpTransferQueueTab; label: string }> = [
  { id: 'queue', label: '队列的文件' },
  { id: 'failed', label: '传输失败' },
  { id: 'success', label: '成功的传输' }
]

export function FtpTransferQueue({
  items,
  activeTab,
  paused,
  onTabChange,
  onClearTab,
  onPause,
  onResume,
  onStop
}: FtpTransferQueueProps): React.JSX.Element {
  const visible = filterItems(items, activeTab)
  const counts = {
    queue: filterItems(items, 'queue').length,
    failed: filterItems(items, 'failed').length,
    success: filterItems(items, 'success').length
  }
  const hasActive = counts.queue > 0

  const [height, setHeight] = useState(readStoredHeight)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const onResizeMove = useCallback((e: MouseEvent): void => {
    const drag = dragRef.current
    if (!drag) return
    const delta = drag.startY - e.clientY
    const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, drag.startHeight + delta))
    setHeight(next)
  }, [])

  const onResizeEnd = useCallback((): void => {
    if (!dragRef.current) return
    dragRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', onResizeEnd)
    setHeight((current) => {
      try {
        localStorage.setItem(HEIGHT_STORAGE_KEY, String(current))
      } catch {
        // ignore
      }
      return current
    })
  }, [onResizeMove])

  const onResizeStart = (e: React.MouseEvent): void => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: height }
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', onResizeEnd)
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onResizeMove)
      window.removeEventListener('mouseup', onResizeEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [onResizeMove, onResizeEnd])

  return (
    <div
      className="relative flex shrink-0 flex-col border-t border-surface-border bg-surface-raised/80"
      style={{ height }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="拖动调整传输队列高度"
        title="拖动调整高度"
        className="absolute inset-x-0 -top-1 z-20 flex h-2 cursor-ns-resize items-center justify-center"
        onMouseDown={onResizeStart}
      >
        <div className="h-0.5 w-10 rounded-full bg-surface-border transition-colors hover:bg-accent/60" />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-[11px] leading-none">
          <thead className="sticky top-0 z-10 bg-surface-raised text-accent-muted">
            <tr className="border-b border-surface-border">
              <th className="px-2 py-1.5 font-medium">本地文件</th>
              <th className="w-10 px-1 py-1.5 text-center font-medium">方向</th>
              <th className="px-2 py-1.5 font-medium">远程文件</th>
              <th className="w-20 px-2 py-1.5 font-medium">大小</th>
              <th className="w-40 px-2 py-1.5 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-accent-muted">
                  暂无记录
                </td>
              </tr>
            ) : (
              visible.map((item) => {
                const pct =
                  item.status === 'done'
                    ? 100
                    : item.direction === 'delete' && item.status === 'transferring'
                      ? 50
                      : transferPercent(item)
                const showBar = shouldShowProgressBar(item)
                const localLabel =
                  item.direction === 'delete'
                    ? fileName(item.remotePath)
                    : fileName(item.localPath) || item.localPath
                return (
                  <Fragment key={item.id}>
                    <tr
                      className={`hover:bg-surface-overlay/40 ${showBar ? '' : 'border-b border-surface-border/40'}`}
                      title={item.message}
                    >
                      <td
                        className="max-w-0 truncate px-2 py-1 text-terminal-fg"
                        title={item.direction === 'delete' ? item.remotePath : item.localPath}
                      >
                        {localLabel}
                      </td>
                      <td className="px-1 py-1 text-center">{directionIcon(item.direction)}</td>
                      <td
                        className="max-w-0 truncate px-2 py-1 text-terminal-fg"
                        title={item.remotePath}
                      >
                        {fileName(item.remotePath)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-accent-muted">
                        {item.direction === 'delete'
                          ? item.isDirectory
                            ? '目录'
                            : item.size > 1
                              ? formatSize(item.size)
                              : '-'
                          : formatSize(item.size)}
                      </td>
                      <td
                        className={`truncate px-2 py-1 ${
                          item.status === 'error'
                            ? 'text-red-400'
                            : item.status === 'done'
                              ? 'text-emerald-400'
                              : item.status === 'transferring'
                                ? 'text-accent'
                                : item.status === 'paused'
                                  ? 'text-warning'
                                  : 'text-accent-muted'
                        }`}
                      >
                        {statusLabel(item)}
                      </td>
                    </tr>
                    {showBar ? (
                      <tr className="border-b border-surface-border/40">
                        <td colSpan={5} className="px-2 pb-1.5 pt-0">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-border/70">
                              <div
                                className={`h-full rounded-full transition-[width] duration-150 ${
                                  item.status === 'done'
                                    ? 'bg-emerald-400'
                                    : item.direction === 'delete'
                                      ? 'bg-red-400'
                                      : 'bg-accent'
                                }`}
                                style={{ width: `${pct ?? 0}%` }}
                              />
                            </div>
                            <span className="shrink-0 whitespace-nowrap text-[10px] text-accent-muted">
                              {item.direction === 'delete'
                                ? item.status === 'done'
                                  ? '删除完成'
                                  : '正在删除…'
                                : `${formatSize(item.transferred)} / ${formatSize(item.size)}${
                                    pct !== null ? ` · ${pct}%` : ''
                                  }`}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-surface-border/60 px-1.5 py-0.5">
        <div className="flex items-center gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`rounded px-2 py-1 text-[11px] transition-colors ${
                activeTab === tab.id
                  ? 'bg-accent/15 text-accent'
                  : 'text-accent-muted hover:bg-surface-overlay hover:text-terminal-fg'
              }`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
              {counts[tab.id] > 0 ? ` (${counts[tab.id]})` : ''}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {paused ? (
            <button
              type="button"
              className="rounded px-2 py-1 text-[11px] text-accent hover:bg-accent/15 disabled:opacity-40"
              disabled={!hasActive}
              onClick={onResume}
              title="继续传输"
            >
              继续
            </button>
          ) : (
            <button
              type="button"
              className="rounded px-2 py-1 text-[11px] text-accent-muted hover:bg-surface-overlay hover:text-terminal-fg disabled:opacity-40"
              disabled={!hasActive}
              onClick={onPause}
              title="暂停传输"
            >
              暂停
            </button>
          )}
          <button
            type="button"
            className="rounded px-2 py-1 text-[11px] text-red-400/90 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
            disabled={!hasActive}
            onClick={onStop}
            title="终止全部传输"
          >
            终止
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-[11px] text-accent-muted hover:bg-surface-overlay hover:text-terminal-fg disabled:opacity-40"
            disabled={visible.length === 0}
            onClick={() => onClearTab(activeTab)}
          >
            清空此页
          </button>
        </div>
      </div>
    </div>
  )
}
