import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, File, Folder, FolderPlus, RefreshCw, Trash2 } from 'lucide-react'
import type { FileEntry } from '@shared/types/sftp'
import { useAppStore } from '@renderer/stores/app-store'
import { PromptDialog } from '@renderer/components/common/PromptDialog'
import {
  ConflictDialog,
  type ConflictDecision
} from '@renderer/components/common/ConflictDialog'
import {
  FtpTransferQueue,
  type FtpTransferItem,
  type FtpTransferQueueTab
} from '@renderer/components/ftp/FtpTransferQueue'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FILE_SYSTEM_ROOT = '/'

function joinRemotePath(base: string, name: string): string {
  const trimmed = name.trim()
  if (base === '/') return `/${trimmed}`
  return `${base.replace(/\/$/, '')}/${trimmed}`
}

/** relative 可为多级路径，如 `folder/a.txt` */
function joinRemoteRelative(base: string, relative: string): string {
  const parts = relative.replace(/\\/g, '/').split('/').filter(Boolean)
  let result = base
  for (const part of parts) {
    result = joinRemotePath(result, part)
  }
  return result
}

function stripIpcError(raw: string): string {
  return raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
}

function parentRemoteDir(path: string): string {
  const normalized = path.replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return '/'
  return normalized.slice(0, idx) || '/'
}

function isRemotePathUnder(path: string, parent: string): boolean {
  if (path === parent) return true
  const prefix = parent.endsWith('/') ? parent : `${parent}/`
  return path.startsWith(prefix)
}

/** 去掉已被父目录选中覆盖的项，避免重复删除 */
function pickRootRemoteEntries(entries: FileEntry[]): FileEntry[] {
  return entries.filter(
    (entry) =>
      !entries.some(
        (other) =>
          other.isDirectory &&
          other.path !== entry.path &&
          isRemotePathUnder(entry.path, other.path)
      )
  )
}

interface RemoteDeleteTarget {
  path: string
  isDirectory: boolean
  size: number
}

/** 递归展开：文件在前，目录按深度优先（先子后父） */
async function expandRemoteDeleteTargets(
  connectionId: string,
  entries: FileEntry[]
): Promise<RemoteDeleteTarget[]> {
  const roots = pickRootRemoteEntries(entries)
  const files: RemoteDeleteTarget[] = []
  const dirs: RemoteDeleteTarget[] = []
  const seen = new Set<string>()

  const walkDir = async (dirPath: string): Promise<void> => {
    const listing = await window.api.ftp.list({ connectionId, path: dirPath })
    for (const entry of listing) {
      if (seen.has(entry.path)) continue
      seen.add(entry.path)
      if (entry.isDirectory) {
        await walkDir(entry.path)
        dirs.push({ path: entry.path, isDirectory: true, size: 0 })
      } else {
        files.push({ path: entry.path, isDirectory: false, size: entry.size })
      }
    }
  }

  for (const entry of roots) {
    if (seen.has(entry.path)) continue
    seen.add(entry.path)
    if (entry.isDirectory) {
      await walkDir(entry.path)
      dirs.push({ path: entry.path, isDirectory: true, size: 0 })
    } else {
      files.push({ path: entry.path, isDirectory: false, size: entry.size })
    }
  }

  return [...files, ...dirs]
}

function remoteBaseName(path: string): string {
  const normalized = path.replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

interface UploadFileJob {
  localPath: string
  relativePath: string
  size: number
}

/** 展开选中项：单文件原样；目录则递归收集其下全部文件，并记录需创建的远程目录 */
async function expandLocalUploadSelection(
  selectedPaths: string[],
  knownEntries: FileEntry[]
): Promise<{ dirs: string[]; files: UploadFileJob[] }> {
  const dirs = new Set<string>()
  const files: UploadFileJob[] = []

  const walkDir = async (dirPath: string, relativePrefix: string): Promise<void> => {
    dirs.add(relativePrefix.replace(/\\/g, '/'))
    const entries = await window.api.local.list({ path: dirPath })
    for (const entry of entries) {
      const rel = `${relativePrefix}/${entry.name}`.replace(/\\/g, '/')
      if (entry.isDirectory) {
        await walkDir(entry.path, rel)
      } else {
        files.push({ localPath: entry.path, relativePath: rel, size: entry.size })
      }
    }
  }

  for (const path of selectedPaths) {
    const entry = knownEntries.find((e) => e.path === path)
    if (!entry) continue
    if (entry.isDirectory) {
      await walkDir(entry.path, entry.name)
    } else {
      files.push({ localPath: entry.path, relativePath: entry.name, size: entry.size })
    }
  }

  const sortedDirs = [...dirs].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
  return { dirs: sortedDirs, files }
}

type SelectModifiers = { ctrl: boolean; shift: boolean }

function applyListSelection(
  entries: FileEntry[],
  prev: Set<string>,
  path: string,
  mods: SelectModifiers,
  anchor: string | null
): { selected: Set<string>; anchor: string } {
  const paths = entries.map((e) => e.path)

  if (mods.shift && anchor) {
    const a = paths.indexOf(anchor)
    const b = paths.indexOf(path)
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a < b ? [a, b] : [b, a]
      return { selected: new Set(paths.slice(lo, hi + 1)), anchor }
    }
  }

  if (mods.ctrl) {
    const next = new Set(prev)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return { selected: next, anchor: path }
  }

  return { selected: new Set([path]), anchor: path }
}

interface RemoteClipboardEntry {
  path: string
  name: string
  isDirectory: boolean
}

interface RemoteClipboard {
  mode: 'copy' | 'cut'
  entries: RemoteClipboardEntry[]
}

interface ContextMenuState {
  x: number
  y: number
  /** 空区域右键时为 null */
  targetPath: string | null
}

interface PaneProps {
  title: string
  path: string
  entries: FileEntry[]
  selected: Set<string>
  loading: boolean
  onNavigate: (path: string) => void
  onSelect: (path: string, mods: SelectModifiers) => void
  onDropTransfer?: (paths: string[]) => void
  dropHint?: string
  windowsComputerRoot?: boolean
  cutPaths?: Set<string>
  onContextMenu?: (e: React.MouseEvent, path: string | null) => void
}

function FilePane({
  title,
  path,
  entries,
  selected,
  loading,
  onNavigate,
  onSelect,
  onDropTransfer,
  dropHint,
  windowsComputerRoot = false,
  cutPaths,
  onContextMenu
}: PaneProps): React.JSX.Element {
  const [dragOver, setDragOver] = useState(false)

  const goUp = (): void => {
    const normalized = path.replace(/\\/g, '/')
    if (normalized === '/' || normalized === '') return

    if (windowsComputerRoot && /^[A-Za-z]:\/?$/.test(normalized)) {
      onNavigate(FILE_SYSTEM_ROOT)
      return
    }

    if (normalized.startsWith('/') && !normalized.includes(':')) {
      const parts = normalized.split('/').filter(Boolean)
      parts.pop()
      onNavigate(parts.length ? `/${parts.join('/')}` : FILE_SYSTEM_ROOT)
      return
    }

    const parts = normalized.split('/').filter(Boolean)
    parts.pop()
    if (parts.length === 0) {
      onNavigate(windowsComputerRoot ? FILE_SYSTEM_ROOT : '.')
      return
    }
    if (parts.length === 1 && parts[0].includes(':')) {
      onNavigate(`${parts[0]}/`)
      return
    }
    onNavigate(parts.join('/'))
  }

  const pathLabel =
    windowsComputerRoot && (path === '/' || path === '') ? '此电脑' : path || '.'

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-1 flex-col border-r border-surface-border last:border-r-0 ${
        dragOver ? 'bg-surface-overlay/40' : ''
      }`}
      onDragOver={(e) => {
        if (!onDropTransfer) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (!onDropTransfer) return
        const raw = e.dataTransfer.getData('text/plain')
        if (raw) onDropTransfer(raw.split('|'))
      }}
      onContextMenu={(e) => {
        if (!onContextMenu) return
        if ((e.target as HTMLElement).closest('tr[data-entry]')) return
        e.preventDefault()
        onContextMenu(e, null)
      }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-surface-border px-2 py-1">
        <span className="shrink-0 text-xs font-medium text-accent-muted">{title}</span>
        <button type="button" className="btn-icon h-6 w-6" onClick={goUp} title="上级目录">
          <ArrowUp size={12} />
        </button>
        <span className="truncate text-xs text-terminal-fg">{pathLabel}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <p className="p-3 text-xs text-accent-muted">加载中...</p>
        ) : entries.length === 0 ? (
          <p className="p-3 text-xs text-accent-muted">{dropHint ?? '空目录'}</p>
        ) : (
          <table className="w-full border-collapse text-left text-xs leading-none">
            <thead className="sticky top-0 z-10 bg-surface-raised text-accent-muted">
              <tr>
                <th className="px-2 py-1 font-medium">名称</th>
                <th className="w-16 px-2 py-1 font-medium">大小</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.path}
                  data-entry
                  draggable
                  onDragStart={(e) => {
                    const paths =
                      selected.has(entry.path) && selected.size > 1
                        ? [...selected]
                        : [entry.path]
                    e.dataTransfer.setData('text/plain', paths.join('|'))
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className={`h-6 cursor-pointer border-b border-surface-border/50 transition-colors hover:bg-surface-overlay/70 ${
                    selected.has(entry.path)
                      ? 'bg-accent/20 text-accent shadow-[inset_3px_0_0_0_rgb(var(--c-accent))]'
                      : ''
                  } ${cutPaths?.has(entry.path) ? 'opacity-50' : ''}`}
                  onClick={(e) =>
                    onSelect(entry.path, {
                      ctrl: e.ctrlKey || e.metaKey,
                      shift: e.shiftKey
                    })
                  }
                  onContextMenu={(e) => {
                    if (!onContextMenu) return
                    e.preventDefault()
                    e.stopPropagation()
                    onContextMenu(e, entry.path)
                  }}
                  onDoubleClick={() => {
                    if (entry.isDirectory) onNavigate(entry.path)
                  }}
                >
                  <td className="max-w-0 px-2 py-0.5 align-middle">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {entry.isDirectory ? (
                        <Folder size={12} className="shrink-0 text-yellow-500/80" />
                      ) : (
                        <File size={12} className="shrink-0 text-accent" />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-0.5 align-middle text-accent-muted">
                    {entry.isDirectory ? '-' : formatSize(entry.size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function FtpBrowser(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const connectionId = activeSession?.type === 'ftp' ? activeSession.connectionId : undefined
  const ftpReady = activeSession?.type === 'ftp' && activeSession.status === 'connected'
  const ftpConnecting = activeSession?.type === 'ftp' && activeSession.status === 'connecting'
  const ftpError =
    activeSession?.type === 'ftp' && activeSession.status === 'error'
      ? activeSession.errorMessage
      : undefined

  const [localPath, setLocalPath] = useState('')
  const [remotePath, setRemotePath] = useState(FILE_SYSTEM_ROOT)
  const [localEntries, setLocalEntries] = useState<FileEntry[]>([])
  const [remoteEntries, setRemoteEntries] = useState<FileEntry[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set())
  const [remoteSelected, setRemoteSelected] = useState<Set<string>>(new Set())
  const [localAnchor, setLocalAnchor] = useState<string | null>(null)
  const [remoteAnchor, setRemoteAnchor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transfers, setTransfers] = useState<FtpTransferItem[]>([])
  const [transferTab, setTransferTab] = useState<FtpTransferQueueTab>('queue')
  const [showMkdir, setShowMkdir] = useState(false)
  const [clipboard, setClipboard] = useState<RemoteClipboard | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [conflict, setConflict] = useState<{
    fileName: string
    remainingConflicts: number
  } | null>(null)
  const conflictResolverRef = useRef<((decision: ConflictDecision) => void) | null>(null)
  const transferControlRef = useRef<{
    mode: 'run' | 'paused' | 'stopped'
    resumeResolvers: Array<() => void>
  }>({ mode: 'run', resumeResolvers: [] })
  const transferEpochRef = useRef(0)
  const [transferPaused, setTransferPaused] = useState(false)

  const patchTransfer = useCallback((id: string, patch: Partial<FtpTransferItem>): void => {
    setTransfers((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const wakePauseWaiters = useCallback((): void => {
    const resolvers = transferControlRef.current.resumeResolvers
    transferControlRef.current.resumeResolvers = []
    for (const resolve of resolvers) resolve()
  }, [])

  /** 开始新一批传输；返回 epoch，循环中若 epoch 变化则退出 */
  const beginTransferBatch = useCallback((): number => {
    transferEpochRef.current += 1
    const epoch = transferEpochRef.current
    transferControlRef.current.mode = 'run'
    wakePauseWaiters()
    setTransferPaused(false)
    setTransfers((prev) =>
      prev.map((item) =>
        item.status === 'queued' ||
        item.status === 'transferring' ||
        item.status === 'paused'
          ? { ...item, status: 'error' as const, message: '已中止' }
          : item
      )
    )
    if (connectionId) void window.api.ftp.abortTransfer(connectionId)
    return epoch
  }, [connectionId, wakePauseWaiters])

  const waitWhilePaused = useCallback(async (): Promise<void> => {
    while (transferControlRef.current.mode === 'paused') {
      await new Promise<void>((resolve) => {
        transferControlRef.current.resumeResolvers.push(resolve)
      })
    }
  }, [])

  const awaitTransferGate = useCallback(
    async (epoch: number): Promise<'ok' | 'stop'> => {
      await waitWhilePaused()
      if (transferEpochRef.current !== epoch) return 'stop'
      return transferControlRef.current.mode === 'stopped' ? 'stop' : 'ok'
    },
    [waitWhilePaused]
  )

  const pauseTransfers = useCallback((): void => {
    if (!connectionId) return
    if (transferControlRef.current.mode === 'stopped') return
    transferControlRef.current.mode = 'paused'
    setTransferPaused(true)
    setTransfers((prev) =>
      prev.map((item) =>
        item.status === 'queued' || item.status === 'transferring'
          ? { ...item, status: 'paused' as const, message: '已暂停' }
          : item
      )
    )
    void window.api.ftp.abortTransfer(connectionId)
  }, [connectionId])

  const resumeTransfers = useCallback((): void => {
    transferControlRef.current.mode = 'run'
    setTransferPaused(false)
    setTransfers((prev) =>
      prev.map((item) =>
        item.status === 'paused'
          ? { ...item, status: 'queued' as const, message: '排队中' }
          : item
      )
    )
    wakePauseWaiters()
  }, [wakePauseWaiters])

  const stopTransfers = useCallback((): void => {
    transferEpochRef.current += 1
    transferControlRef.current.mode = 'stopped'
    setTransferPaused(false)
    wakePauseWaiters()
    if (conflictResolverRef.current) {
      const resolve = conflictResolverRef.current
      conflictResolverRef.current = null
      setConflict(null)
      resolve('cancel')
    }
    setTransfers((prev) =>
      prev.map((item) =>
        item.status === 'queued' ||
        item.status === 'transferring' ||
        item.status === 'paused'
          ? { ...item, status: 'error' as const, message: '已终止' }
          : item
      )
    )
    setTransferTab('failed')
    if (connectionId) void window.api.ftp.abortTransfer(connectionId)
  }, [connectionId, wakePauseWaiters])

  const loadLocal = useCallback(async (path: string) => {
    setLocalLoading(true)
    setError(null)
    try {
      const entries = await window.api.local.list({ path })
      setLocalEntries(entries)
      setLocalPath(path)
      setLocalSelected(new Set())
      setLocalAnchor(null)
    } catch (err) {
      const raw = err instanceof Error ? err.message : '加载本地目录失败'
      setError(stripIpcError(raw))
    } finally {
      setLocalLoading(false)
    }
  }, [])

  const loadRemote = useCallback(
    async (path: string) => {
      if (!connectionId || !ftpReady) return
      setRemoteLoading(true)
      setError(null)
      try {
        const entries = await window.api.ftp.list({ connectionId, path })
        setRemoteEntries(entries)
        setRemotePath(path)
        setRemoteSelected(new Set())
        setRemoteAnchor(null)
      } catch (err) {
        const raw = err instanceof Error ? err.message : '加载远程目录失败'
        setError(stripIpcError(raw))
      } finally {
        setRemoteLoading(false)
      }
    },
    [connectionId, ftpReady]
  )

  useEffect(() => {
    void window.api.local.home().then((home) => loadLocal(home))
  }, [loadLocal])

  useEffect(() => {
    if (!ftpReady || !connectionId) {
      setRemoteEntries([])
      setRemotePath(FILE_SYSTEM_ROOT)
      setClipboard(null)
      return
    }
    void (async () => {
      try {
        const home = await window.api.ftp.realpath({ connectionId, path: '.' })
        await loadRemote(home || FILE_SYSTEM_ROOT)
      } catch {
        await loadRemote(FILE_SYSTEM_ROOT)
      }
    })()
  }, [ftpReady, connectionId, loadRemote])

  useEffect(() => {
    return window.api.ftp.onTransferProgress((event) => {
      setTransfers((prev) =>
        prev.map((item) => {
          if (item.id !== event.transferId) return item
          // 暂停/终止后忽略进度，避免覆盖队列状态
          if (
            item.status === 'paused' ||
            item.status === 'done' ||
            item.status === 'skipped' ||
            (item.status === 'error' && item.message === '已终止')
          ) {
            return item
          }
          if (event.status === 'progress') {
            const transferred = Number(event.transferred)
            const total = Number(event.total)
            return {
              ...item,
              status: 'transferring',
              transferred: Number.isFinite(transferred) ? transferred : item.transferred,
              size: Number.isFinite(total) && total > 0 ? total : item.size
            }
          }
          if (event.status === 'done') {
            const total = Number(event.total)
            const doneSize = Number.isFinite(total) && total > 0 ? total : item.size
            return {
              ...item,
              status: 'done',
              transferred: doneSize,
              size: doneSize
            }
          }
          if (event.status === 'error') {
            if (
              transferControlRef.current.mode === 'paused' ||
              transferControlRef.current.mode === 'stopped'
            ) {
              return item
            }
            return { ...item, status: 'error', message: event.message }
          }
          return item
        })
      )
    })
  }, [])

  const askConflict = (fileName: string, remainingConflicts: number): Promise<ConflictDecision> => {
    return new Promise((resolve) => {
      conflictResolverRef.current = resolve
      setConflict({ fileName, remainingConflicts })
    })
  }

  const handleLocalSelect = (path: string, mods: SelectModifiers): void => {
    const result = applyListSelection(localEntries, localSelected, path, mods, localAnchor)
    setLocalSelected(result.selected)
    setLocalAnchor(result.anchor)
  }

  const handleRemoteSelect = (path: string, mods: SelectModifiers): void => {
    const result = applyListSelection(remoteEntries, remoteSelected, path, mods, remoteAnchor)
    setRemoteSelected(result.selected)
    setRemoteAnchor(result.anchor)
  }

  const uploadFiles = async (paths: string[]): Promise<void> => {
    if (!connectionId || paths.length === 0) return
    const epoch = beginTransferBatch()
    setError(null)
    setTransferTab('queue')

    // 立刻给出反馈，避免大目录扫描时队列长时间空白
    const prepareId = crypto.randomUUID()
    setTransfers((prev) => [
      {
        id: prepareId,
        direction: 'upload',
        localPath: '正在扫描本地文件…',
        remotePath: remotePath,
        size: 0,
        transferred: 0,
        status: 'queued',
        message: '准备中'
      },
      ...prev
    ])

    let expanded: { dirs: string[]; files: UploadFileJob[] }
    try {
      expanded = await expandLocalUploadSelection(paths, localEntries)
    } catch (err) {
      const raw = err instanceof Error ? err.message : '读取本地目录失败'
      patchTransfer(prepareId, { status: 'error', message: stripIpcError(raw) })
      setError(stripIpcError(raw))
      setTransferTab('failed')
      return
    }

    if (expanded.files.length === 0 && expanded.dirs.length === 0) {
      patchTransfer(prepareId, { status: 'error', message: '没有可上传的文件或文件夹' })
      setError('没有可上传的文件或文件夹')
      setTransferTab('failed')
      return
    }

    // 扫描完成后立刻把文件列入队列（冲突处理前即可看见）
    const pendingItems: Array<{ id: string; file: UploadFileJob; remote: string }> =
      expanded.files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        remote: joinRemoteRelative(remotePath, file.relativePath)
      }))

    setTransfers((prev) => {
      const rest = prev.filter((i) => i.id !== prepareId)
      const rows: FtpTransferItem[] = pendingItems.map((item) => ({
        id: item.id,
        direction: 'upload',
        localPath: item.file.localPath,
        remotePath: item.remote,
        size: item.file.size,
        transferred: 0,
        status: 'queued',
        message: '准备中'
      }))
      return [...rows, ...rest]
    })

    if (pendingItems.length === 0) {
      // 仅目录：按需建好后刷新
      for (const dirRel of expanded.dirs) {
        try {
          await window.api.ftp.mkdir({
            connectionId,
            path: joinRemoteRelative(remotePath, dirRel)
          })
        } catch {
          // 目录已存在等情况忽略
        }
      }
      await loadRemote(remotePath)
      return
    }

    // 按需 mkdir / list：决定覆盖/跳过后立刻上传，不等待扫完全部
    const listingCache = new Map<string, Set<string>>()
    const ensuredDirs = new Set<string>()

    const ensureRemoteDir = async (dir: string): Promise<void> => {
      if (!dir || dir === '/' || ensuredDirs.has(dir)) return
      const parent = parentRemoteDir(dir)
      if (parent !== dir) await ensureRemoteDir(parent)
      try {
        await window.api.ftp.mkdir({ connectionId, path: dir })
      } catch {
        // 已存在等忽略
      }
      ensuredDirs.add(dir)
    }

    const remoteHasName = async (parent: string, name: string): Promise<boolean> => {
      await ensureRemoteDir(parent)
      let names = listingCache.get(parent)
      if (!names) {
        try {
          const entries = await window.api.ftp.list({ connectionId, path: parent })
          names = new Set(entries.map((e) => e.name))
        } catch {
          names = new Set()
        }
        listingCache.set(parent, names)
      }
      return names.has(name)
    }

    const uploadOne = async (item: {
      id: string
      file: UploadFileJob
      remote: string
    }): Promise<void> => {
      await ensureRemoteDir(parentRemoteDir(item.remote))
      patchTransfer(item.id, { status: 'transferring', message: undefined })
      await window.api.ftp.upload({
        connectionId,
        localPath: item.file.localPath,
        remotePath: item.remote,
        transferId: item.id
      })
      patchTransfer(item.id, {
        status: 'done',
        transferred: item.file.size,
        size: item.file.size
      })
    }

    let policy: 'ask' | 'overwrite' | 'skip' = 'ask'
    let uploaded = 0
    let aborted = false

    try {
      for (let i = 0; i < pendingItems.length; i++) {
        if (aborted) break
        if ((await awaitTransferGate(epoch)) === 'stop') {
          aborted = true
          break
        }

        const item = pendingItems[i]
        const parent = parentRemoteDir(item.remote)
        const name = remoteBaseName(item.remote)

        try {
          // 全部覆盖：不再 list，立刻上传
          if (policy === 'overwrite') {
            await uploadOne(item)
            uploaded += 1
            continue
          }

          if (policy === 'skip') {
            const exists = await remoteHasName(parent, name)
            if (exists) {
              patchTransfer(item.id, { status: 'skipped', message: '同名已跳过' })
            } else {
              await uploadOne(item)
              uploaded += 1
            }
            continue
          }

          const exists = await remoteHasName(parent, name)
          if (!exists) {
            await uploadOne(item)
            uploaded += 1
            continue
          }

          const remaining = pendingItems.length - i - 1
          const decision = await askConflict(item.file.relativePath, Math.max(0, remaining))
          if ((await awaitTransferGate(epoch)) === 'stop') {
            aborted = true
            break
          }

          if (decision === 'cancel') {
            patchTransfer(item.id, { status: 'error', message: '已取消' })
            for (let j = i + 1; j < pendingItems.length; j++) {
              patchTransfer(pendingItems[j].id, { status: 'error', message: '已取消' })
            }
            aborted = true
            break
          }

          if (decision === 'skip') {
            patchTransfer(item.id, { status: 'skipped', message: '同名已跳过' })
            continue
          }

          if (decision === 'skip_all') {
            policy = 'skip'
            patchTransfer(item.id, { status: 'skipped', message: '同名已跳过' })
            continue
          }

          if (decision === 'overwrite_all') policy = 'overwrite'
          await uploadOne(item)
          uploaded += 1
        } catch (err) {
          if (transferControlRef.current.mode === 'paused') {
            patchTransfer(item.id, { status: 'paused', message: '已暂停' })
            await waitWhilePaused()
            if (
              transferControlRef.current.mode === 'stopped' ||
              transferEpochRef.current !== epoch
            ) {
              aborted = true
              break
            }
            i -= 1
            continue
          }
          if (
            transferControlRef.current.mode === 'stopped' ||
            transferEpochRef.current !== epoch
          ) {
            aborted = true
            break
          }
          const raw = err instanceof Error ? err.message : '上传失败'
          patchTransfer(item.id, { status: 'error', message: stripIpcError(raw) })
          for (let j = i + 1; j < pendingItems.length; j++) {
            patchTransfer(pendingItems[j].id, { status: 'error', message: '已中止' })
          }
          setTransferTab('failed')
          setError(stripIpcError(raw))
          aborted = true
          break
        }
      }
    } finally {
      setConflict(null)
      conflictResolverRef.current = null
    }

    // 补建无文件的空目录
    if (!aborted) {
      for (const dirRel of expanded.dirs) {
        await ensureRemoteDir(joinRemoteRelative(remotePath, dirRel))
      }
    }

    if (uploaded > 0 || (!aborted && expanded.dirs.length > 0)) {
      await loadRemote(remotePath)
    }
  }

  const downloadFiles = async (paths: string[]): Promise<void> => {
    if (!connectionId || paths.length === 0) return
    if (!localPath || localPath === '/' || localPath === '\\') {
      setError('请先进入具体磁盘目录后再下载')
      return
    }
    const epoch = beginTransferBatch()
    setError(null)

    const files = paths
      .map((p) => remoteEntries.find((e) => e.path === p))
      .filter((e): e is FileEntry => !!e && !e.isDirectory)

    if (files.length === 0) {
      setError('没有可下载的文件（不支持下载文件夹）')
      return
    }

    const batch: FtpTransferItem[] = files.map((entry) => ({
      id: crypto.randomUUID(),
      direction: 'download',
      localPath: `${localPath.replace(/[/\\]$/, '')}\\${entry.name}`,
      remotePath: entry.path,
      size: entry.size,
      transferred: 0,
      status: 'queued'
    }))
    setTransfers((prev) => [...batch, ...prev])
    setTransferTab('queue')

    try {
      for (let i = 0; i < files.length; i++) {
        if ((await awaitTransferGate(epoch)) === 'stop') break
        const entry = files[i]
        const item = batch[i]
        patchTransfer(item.id, { status: 'transferring' })
        try {
          await window.api.ftp.download({
            connectionId,
            remotePath: entry.path,
            localPath: item.localPath,
            transferId: item.id
          })
          patchTransfer(item.id, {
            status: 'done',
            transferred: entry.size,
            size: entry.size
          })
        } catch (err) {
          if (transferControlRef.current.mode === 'paused') {
            patchTransfer(item.id, { status: 'paused', message: '已暂停' })
            await waitWhilePaused()
            if (
              transferControlRef.current.mode === 'stopped' ||
              transferEpochRef.current !== epoch
            ) {
              break
            }
            i -= 1
            continue
          }
          if (
            transferControlRef.current.mode === 'stopped' ||
            transferEpochRef.current !== epoch
          ) {
            break
          }
          const raw = err instanceof Error ? err.message : '下载失败'
          patchTransfer(item.id, { status: 'error', message: stripIpcError(raw) })
          for (let j = i + 1; j < files.length; j++) {
            patchTransfer(batch[j].id, { status: 'error', message: '已中止' })
          }
          setTransferTab('failed')
          throw err
        }
      }
      await loadLocal(localPath)
    } catch (err) {
      if (
        transferControlRef.current.mode === 'paused' ||
        transferControlRef.current.mode === 'stopped'
      ) {
        return
      }
      const raw = err instanceof Error ? err.message : '下载失败'
      setError(stripIpcError(raw))
    }
  }

  const uploadSelected = async (): Promise<void> => {
    await uploadFiles([...localSelected])
  }

  const downloadSelected = async (): Promise<void> => {
    await downloadFiles([...remoteSelected])
  }

  const deleteRemotePaths = async (paths: string[]): Promise<void> => {
    if (!connectionId || paths.length === 0) return
    if (!confirm(`确定删除选中的 ${paths.length} 项？`)) return
    const epoch = beginTransferBatch()
    setError(null)
    setTransferTab('queue')

    const entries = paths
      .map((p) => remoteEntries.find((e) => e.path === p))
      .filter((e): e is FileEntry => !!e)

    if (entries.length === 0) return

    const prepareId = crypto.randomUUID()
    setTransfers((prev) => [
      {
        id: prepareId,
        direction: 'delete',
        localPath: '正在枚举要删除的文件…',
        remotePath: remotePath,
        size: 0,
        transferred: 0,
        status: 'queued',
        message: '准备中'
      },
      ...prev
    ])

    let targets: RemoteDeleteTarget[]
    try {
      targets = await expandRemoteDeleteTargets(connectionId, entries)
    } catch (err) {
      const raw = err instanceof Error ? err.message : '枚举远程文件失败'
      patchTransfer(prepareId, { status: 'error', message: stripIpcError(raw) })
      setError(stripIpcError(raw))
      setTransferTab('failed')
      return
    }

    if (targets.length === 0) {
      patchTransfer(prepareId, { status: 'error', message: '没有可删除的项目' })
      return
    }

    const batch: FtpTransferItem[] = targets.map((target) => ({
      id: crypto.randomUUID(),
      direction: 'delete',
      localPath: target.path,
      remotePath: target.path,
      size: target.isDirectory ? 1 : Math.max(1, target.size),
      transferred: 0,
      status: 'queued',
      isDirectory: target.isDirectory,
      message: target.isDirectory ? '等待删除目录' : '等待删除'
    }))

    setTransfers((prev) => {
      const rest = prev.filter((i) => i.id !== prepareId)
      return [...batch, ...rest]
    })

    try {
      for (let i = 0; i < targets.length; i++) {
        if ((await awaitTransferGate(epoch)) === 'stop') break
        const target = targets[i]
        const item = batch[i]
        patchTransfer(item.id, {
          status: 'transferring',
          message: target.isDirectory ? '正在删除目录…' : '正在删除…'
        })
        try {
          await window.api.ftp.remove({
            connectionId,
            path: target.path,
            isDirectory: target.isDirectory
          })
          patchTransfer(item.id, {
            status: 'done',
            transferred: item.size,
            size: item.size,
            message: undefined
          })
        } catch (err) {
          if (transferControlRef.current.mode === 'paused') {
            patchTransfer(item.id, { status: 'paused', message: '已暂停' })
            await waitWhilePaused()
            if (
              transferControlRef.current.mode === 'stopped' ||
              transferEpochRef.current !== epoch
            ) {
              break
            }
            i -= 1
            continue
          }
          if (
            transferControlRef.current.mode === 'stopped' ||
            transferEpochRef.current !== epoch
          ) {
            break
          }
          const raw = err instanceof Error ? err.message : '删除失败'
          patchTransfer(item.id, { status: 'error', message: stripIpcError(raw) })
          for (let j = i + 1; j < batch.length; j++) {
            patchTransfer(batch[j].id, { status: 'error', message: '已中止' })
          }
          setTransferTab('failed')
          throw err
        }
      }
      await loadRemote(remotePath)
    } catch (err) {
      if (
        transferControlRef.current.mode === 'paused' ||
        transferControlRef.current.mode === 'stopped'
      ) {
        return
      }
      const raw = err instanceof Error ? err.message : '删除失败'
      setError(stripIpcError(raw))
    }
  }

  const deleteRemoteSelected = async (): Promise<void> => {
    await deleteRemotePaths([...remoteSelected])
  }

  const setClipboardFromSelection = (mode: 'copy' | 'cut', paths: string[]): void => {
    const entries = paths
      .map((p) => remoteEntries.find((e) => e.path === p))
      .filter((e): e is FileEntry => !!e)
      .map((e) => ({ path: e.path, name: e.name, isDirectory: e.isDirectory }))
    if (entries.length === 0) {
      setError('没有可操作的项目')
      return
    }
    setClipboard({ mode, entries })
    setError(null)
  }

  const pasteClipboard = async (): Promise<void> => {
    if (!connectionId || !clipboard || clipboard.entries.length === 0) return
    setError(null)
    const remoteNames = new Set(remoteEntries.map((e) => e.name))
    let done = 0
    let skipped = 0
    const notes: string[] = []

    try {
      for (const entry of clipboard.entries) {
        if (clipboard.mode === 'copy' && entry.isDirectory) {
          notes.push(`跳过文件夹复制: ${entry.name}`)
          skipped += 1
          continue
        }

        const target = joinRemotePath(remotePath, entry.name)
        const sameFolder = parentRemoteDir(entry.path) === remotePath

        if (clipboard.mode === 'cut' && sameFolder) {
          skipped += 1
          continue
        }

        if (remoteNames.has(entry.name)) {
          notes.push(`目标已存在，已跳过: ${entry.name}`)
          skipped += 1
          continue
        }

        if (clipboard.mode === 'cut') {
          await window.api.ftp.rename({
            connectionId,
            oldPath: entry.path,
            newPath: target
          })
        } else {
          await window.api.ftp.copy({
            connectionId,
            oldPath: entry.path,
            newPath: target
          })
        }
        done += 1
        remoteNames.add(entry.name)
      }

      if (clipboard.mode === 'cut') setClipboard(null)
      if (notes.length > 0 || skipped > 0) {
        setError([`完成 ${done} 项`, ...notes].filter(Boolean).join('；'))
      }
      await loadRemote(remotePath)
    } catch (err) {
      const raw = err instanceof Error ? err.message : '粘贴失败'
      setError(stripIpcError(raw))
    }
  }

  const closeContextMenu = (): void => setContextMenu(null)

  const handleRemoteContextMenu = (e: React.MouseEvent, path: string | null): void => {
    if (path) {
      if (!remoteSelected.has(path)) {
        setRemoteSelected(new Set([path]))
        setRemoteAnchor(path)
      }
    }
    setContextMenu({ x: e.clientX, y: e.clientY, targetPath: path })
  }

  const contextSelection = (): string[] => {
    if (remoteSelected.size > 0) return [...remoteSelected]
    if (contextMenu?.targetPath) return [contextMenu.targetPath]
    return []
  }

  const handleMkdirConfirm = async (value: string): Promise<void> => {
    if (!connectionId) return
    setShowMkdir(false)
    try {
      await window.api.ftp.mkdir({ connectionId, path: joinRemotePath(remotePath, value) })
      await loadRemote(remotePath)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建文件夹失败')
    }
  }

  if (!connectionId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-accent-muted">
        请选择一个 FTP 连接
      </div>
    )
  }

  if (ftpConnecting) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-accent-muted">
        正在连接 FTP…
      </div>
    )
  }

  if (ftpError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm">
        <p className="max-w-lg whitespace-pre-line text-red-400">{ftpError}</p>
        <p className="text-accent-muted">请关闭此标签后重试，并确认主机、端口与认证信息正确</p>
      </div>
    )
  }

  const cutPaths =
    clipboard?.mode === 'cut' ? new Set(clipboard.entries.map((e) => e.path)) : undefined

  const clearTransferTab = (tab: FtpTransferQueueTab): void => {
    setTransfers((prev) =>
      prev.filter((item) => {
        if (tab === 'queue') {
          return (
            item.status !== 'queued' &&
            item.status !== 'transferring' &&
            item.status !== 'paused'
          )
        }
        if (tab === 'failed') return item.status !== 'error'
        return item.status !== 'done' && item.status !== 'skipped'
      })
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-surface-border/40 px-1.5 py-1">
        <button
          type="button"
          className="btn-icon h-7 w-7"
          title="刷新"
          onClick={() => {
            void loadLocal(localPath)
            void loadRemote(remotePath)
          }}
        >
          <RefreshCw size={13} />
        </button>
        <button
          type="button"
          className="btn-icon h-7 w-7"
          title="上传选中的本地文件"
          onClick={() => void uploadSelected()}
        >
          <ArrowUp size={13} />
        </button>
        <button
          type="button"
          className="btn-icon h-7 w-7"
          title="下载选中的远程文件"
          onClick={() => void downloadSelected()}
        >
          <ArrowDown size={13} />
        </button>
        <button
          type="button"
          className="btn-icon h-7 w-7"
          title="新建远程文件夹"
          onClick={() => setShowMkdir(true)}
        >
          <FolderPlus size={13} />
        </button>
        <button
          type="button"
          className="btn-icon h-7 w-7 text-red-400"
          title="删除远程选中项"
          onClick={() => void deleteRemoteSelected()}
        >
          <Trash2 size={13} />
        </button>
        {error && <span className="ml-1 truncate text-[10px] text-red-400">{error}</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        <FilePane
          title="本地"
          path={localPath}
          entries={localEntries}
          selected={localSelected}
          loading={localLoading}
          onNavigate={loadLocal}
          onSelect={handleLocalSelect}
          onDropTransfer={(paths) => {
            void downloadFiles(paths)
          }}
          dropHint="拖拽远程文件到此处下载"
          windowsComputerRoot
        />
        <FilePane
          title="远程"
          path={remotePath}
          entries={remoteEntries}
          selected={remoteSelected}
          loading={remoteLoading}
          onNavigate={loadRemote}
          onSelect={handleRemoteSelect}
          onDropTransfer={(paths) => {
            void uploadFiles(paths)
          }}
          dropHint="拖拽本地文件到此处上传"
          cutPaths={cutPaths}
          onContextMenu={handleRemoteContextMenu}
        />
      </div>

      <FtpTransferQueue
        items={transfers}
        activeTab={transferTab}
        paused={transferPaused}
        onTabChange={setTransferTab}
        onClearTab={clearTransferTab}
        onPause={pauseTransfers}
        onResume={resumeTransfers}
        onStop={stopTransfers}
      />

      {showMkdir && (
        <PromptDialog
          title="新建远程文件夹"
          label="文件夹名称"
          placeholder="例如 my-folder"
          onConfirm={(value) => void handleMkdirConfirm(value)}
          onClose={() => setShowMkdir(false)}
        />
      )}

      {conflict && (
        <ConflictDialog
          fileName={conflict.fileName}
          remainingConflicts={conflict.remainingConflicts}
          onDecision={(decision) => {
            const resolve = conflictResolverRef.current
            setConflict(null)
            conflictResolverRef.current = null
            resolve?.(decision)
          }}
        />
      )}

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
            onContextMenu={(e) => {
              e.preventDefault()
              closeContextMenu()
            }}
          />
          <div
            className="dropdown-menu fixed z-50 min-w-[7.5rem]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.targetPath ? (
              <>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setClipboardFromSelection('copy', contextSelection())
                    closeContextMenu()
                  }}
                >
                  复制
                </button>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setClipboardFromSelection('cut', contextSelection())
                    closeContextMenu()
                  }}
                >
                  剪切
                </button>
                <button
                  type="button"
                  className="dropdown-item text-red-400"
                  onClick={() => {
                    const paths = contextSelection()
                    closeContextMenu()
                    void deleteRemotePaths(paths)
                  }}
                >
                  删除
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="dropdown-item disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              disabled={!clipboard || clipboard.entries.length === 0}
              onClick={() => {
                closeContextMenu()
                void pasteClipboard()
              }}
            >
              粘贴
            </button>
          </div>
        </>
      )}
    </div>
  )
}
