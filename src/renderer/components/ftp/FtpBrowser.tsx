import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, File, Folder, FolderPlus, RefreshCw, Trash2 } from 'lucide-react'
import type { FileEntry, SftpTransferProgress } from '@shared/types/sftp'
import { useAppStore } from '@renderer/stores/app-store'
import { PromptDialog } from '@renderer/components/common/PromptDialog'

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

interface PaneProps {
  title: string
  path: string
  entries: FileEntry[]
  selected: Set<string>
  loading: boolean
  onNavigate: (path: string) => void
  onSelect: (path: string, multi: boolean) => void
  onDropTransfer?: (paths: string[]) => void
  dropHint?: string
  windowsComputerRoot?: boolean
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
  windowsComputerRoot = false
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
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', entry.path)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className={`h-6 cursor-pointer border-b border-surface-border/50 hover:bg-surface-overlay ${
                    selected.has(entry.path) ? 'bg-surface-overlay' : ''
                  }`}
                  onClick={(e) => onSelect(entry.path, e.ctrlKey || e.metaKey)}
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
  const [error, setError] = useState<string | null>(null)
  const [transfer, setTransfer] = useState<SftpTransferProgress | null>(null)
  const [showMkdir, setShowMkdir] = useState(false)

  const loadLocal = useCallback(async (path: string) => {
    setLocalLoading(true)
    setError(null)
    try {
      const entries = await window.api.local.list({ path })
      setLocalEntries(entries)
      setLocalPath(path)
      setLocalSelected(new Set())
    } catch (err) {
      const raw = err instanceof Error ? err.message : '加载本地目录失败'
      setError(raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, ''))
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
      } catch (err) {
        const raw = err instanceof Error ? err.message : '加载远程目录失败'
        setError(raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, ''))
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
      setTransfer(event)
      if (event.status === 'done' || event.status === 'error') {
        setTimeout(() => setTransfer(null), 2000)
      }
    })
  }, [])

  const handleLocalSelect = (path: string, multi: boolean): void => {
    setLocalSelected((prev) => {
      const next = new Set(multi ? prev : [])
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleRemoteSelect = (path: string, multi: boolean): void => {
    setRemoteSelected((prev) => {
      const next = new Set(multi ? prev : [])
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const uploadSelected = async (): Promise<void> => {
    if (!connectionId || localSelected.size === 0) return
    for (const localFile of localSelected) {
      const entry = localEntries.find((e) => e.path === localFile)
      if (!entry || entry.isDirectory) continue
      await window.api.ftp.upload({
        connectionId,
        localPath: entry.path,
        remotePath: joinRemotePath(remotePath, entry.name),
        transferId: crypto.randomUUID()
      })
    }
    await loadRemote(remotePath)
  }

  const downloadSelected = async (): Promise<void> => {
    if (!connectionId || remoteSelected.size === 0) return
    if (!localPath || localPath === '/' || localPath === '\\') {
      setError('请先进入具体磁盘目录后再下载')
      return
    }
    for (const remoteFile of remoteSelected) {
      const entry = remoteEntries.find((e) => e.path === remoteFile)
      if (!entry || entry.isDirectory) continue
      const localTarget = `${localPath.replace(/[/\\]$/, '')}\\${entry.name}`
      await window.api.ftp.download({
        connectionId,
        remotePath: entry.path,
        localPath: localTarget,
        transferId: crypto.randomUUID()
      })
    }
    await loadLocal(localPath)
  }

  const deleteRemoteSelected = async (): Promise<void> => {
    if (!connectionId || remoteSelected.size === 0) return
    if (!confirm(`确定删除选中的 ${remoteSelected.size} 项？`)) return
    for (const path of remoteSelected) {
      const entry = remoteEntries.find((e) => e.path === path)
      if (!entry) continue
      await window.api.ftp.remove({
        connectionId,
        path: entry.path,
        isDirectory: entry.isDirectory
      })
    }
    await loadRemote(remotePath)
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

  const transferPercent =
    transfer && transfer.total > 0
      ? Math.min(100, Math.round((transfer.transferred / transfer.total) * 100))
      : transfer?.status === 'done'
        ? 100
        : 0

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
        <button type="button" className="btn-icon h-7 w-7" title="上传" onClick={() => void uploadSelected()}>
          <ArrowUp size={13} />
        </button>
        <button
          type="button"
          className="btn-icon h-7 w-7"
          title="下载"
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
          title="删除远程"
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
            setRemoteSelected(new Set(paths))
            void downloadSelected()
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
            setLocalSelected(new Set(paths))
            void uploadSelected()
          }}
          dropHint="拖拽本地文件到此处上传"
        />
      </div>

      {transfer && (
        <div className="shrink-0 border-t border-surface-border px-3 py-1">
          <div className="flex items-center justify-between text-xs text-accent-muted">
            <span>
              {transfer.status === 'error'
                ? `传输失败: ${transfer.message}`
                : transfer.status === 'done'
                  ? '传输完成'
                  : '传输中...'}
            </span>
            <span>{transferPercent}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded bg-surface">
            <div
              className={`h-full transition-all ${transfer.status === 'error' ? 'bg-red-400' : 'bg-accent'}`}
              style={{ width: `${transferPercent}%` }}
            />
          </div>
        </div>
      )}

      {showMkdir && (
        <PromptDialog
          title="新建远程文件夹"
          label="文件夹名称"
          placeholder="例如 my-folder"
          onConfirm={(value) => void handleMkdirConfirm(value)}
          onClose={() => setShowMkdir(false)}
        />
      )}
    </div>
  )
}
