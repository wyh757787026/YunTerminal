import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Edit3,
  File,
  Folder,
  FolderPlus,
  RefreshCw,
  Shield,
  Trash2
} from 'lucide-react'
import type { FileEntry, SftpTransferProgress } from '@shared/types/sftp'
import { getActiveTerminal } from '@renderer/lib/session-utils'
import { useAppStore } from '@renderer/stores/app-store'
import { PromptDialog } from '@renderer/components/common/PromptDialog'
import { ChmodDialog } from './ChmodDialog'
import { FileEditorDialog } from './FileEditorDialog'

type SftpPrompt =
  | { kind: 'mkdir' }
  | { kind: 'chmod'; path: string; mode: number; isDirectory: boolean }

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
  /** 本地面板：支持 Windows 盘符列表（此电脑） */
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

    // Windows 盘符根目录（C:\ / C:/）→ 此电脑（盘符列表）
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
        {title ? (
          <span className="shrink-0 text-xs font-medium text-accent-muted">{title}</span>
        ) : null}
        <button className="btn-icon h-6 w-6" onClick={goUp} title="上级目录">
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
                <th className="w-20 px-2 py-1 font-medium">权限</th>
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
                    selected.has(entry.path)
                      ? 'bg-accent/20 text-accent shadow-[inset_3px_0_0_0_rgb(var(--c-accent))]'
                      : ''
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
                  <td className="whitespace-nowrap px-2 py-0.5 align-middle text-accent-muted">
                    {entry.permissions}
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

export function SftpBrowser(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sendQuickCommand = useAppStore((s) => s.sendQuickCommand)
  const sessions = useAppStore((s) => s.sessions)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const connectionId =
    activeSession?.type === 'ssh' || activeSession?.type === 'sftp'
      ? activeSession.connectionId
      : undefined
  const sshReady =
    (activeSession?.type === 'ssh' || activeSession?.type === 'sftp') &&
    activeSession.status === 'connected'
  const sshConnecting =
    (activeSession?.type === 'ssh' || activeSession?.type === 'sftp') &&
    activeSession.status === 'connecting'
  const sshError =
    (activeSession?.type === 'ssh' || activeSession?.type === 'sftp') &&
    activeSession.status === 'error'
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
  const [sftpReady, setSftpReady] = useState(false)
  const [transfer, setTransfer] = useState<SftpTransferProgress | null>(null)
  const [editor, setEditor] = useState<{ path: string; content: string; remote: boolean } | null>(
    null
  )
  const [prompt, setPrompt] = useState<SftpPrompt | null>(null)

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
      if (!connectionId) return
      setRemoteLoading(true)
      setError(null)
      try {
        const entries = await window.api.sftp.list({ connectionId, path })
        setRemoteEntries(entries)
        setRemotePath(path)
        setRemoteSelected(new Set())
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载远程目录失败')
      } finally {
        setRemoteLoading(false)
      }
    },
    [connectionId]
  )

  useEffect(() => {
    void window.api.local.home().then((home) => loadLocal(home))
  }, [loadLocal])

  // 等 SSH 就绪后再挂 SFTP，并复用同一 SSH 客户端，避免二次握手
  useEffect(() => {
    if (!connectionId || !sshReady) {
      setSftpReady(false)
      setRemoteEntries([])
      setRemotePath(FILE_SYSTEM_ROOT)
      return
    }

    let cancelled = false
    setError(null)
    void (async () => {
      try {
        await window.api.sftp.connect(connectionId)
        if (cancelled) return
        setSftpReady(true)
        await loadRemote(FILE_SYSTEM_ROOT)
      } catch (err) {
        if (cancelled) return
        setSftpReady(false)
        const raw = err instanceof Error ? err.message : 'SFTP 连接失败'
        setError(raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, ''))
      }
    })()

    return () => {
      cancelled = true
      setSftpReady(false)
      void window.api.sftp.disconnect(connectionId)
    }
  }, [connectionId, sshReady, loadRemote])

  useEffect(() => {
    return window.api.sftp.onTransferProgress((event) => {
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
      const remoteTarget = joinRemotePath(remotePath, entry.name)
      await window.api.sftp.upload({
        connectionId,
        localPath: entry.path,
        remotePath: remoteTarget,
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
      await window.api.sftp.download({
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
      await window.api.sftp.remove({
        connectionId,
        path: entry.path,
        isDirectory: entry.isDirectory
      })
    }
    await loadRemote(remotePath)
  }

  const createRemoteFolder = (): void => {
    if (!connectionId) return
    setPrompt({ kind: 'mkdir' })
  }

  const chmodRemote = (): void => {
    if (!connectionId) return
    if (remoteSelected.size !== 1) {
      setError('请先在远程列表中选中一项以修改权限')
      return
    }
    const path = [...remoteSelected][0]
    const entry = remoteEntries.find((e) => e.path === path)
    if (!entry) return
    setPrompt({
      kind: 'chmod',
      path: entry.path,
      mode: entry.mode,
      isDirectory: entry.isDirectory
    })
  }

  const handleMkdirConfirm = async (value: string): Promise<void> => {
    if (!connectionId) return
    setPrompt(null)
    setError(null)
    try {
      const path = joinRemotePath(remotePath, value)
      await window.api.sftp.mkdir({ connectionId, path })
      await loadRemote(remotePath)
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleChmodExecute = (command: string): void => {
    if (!activeSessionId) {
      setError('没有活动的终端会话')
      return
    }
    const session = sessions.find((s) => s.id === activeSessionId)
    const terminal = getActiveTerminal(session)
    if (!session || session.type !== 'ssh' || !terminal || terminal.status !== 'connected') {
      setError('请先连接 SSH 终端后再执行命令')
      return
    }
    setPrompt(null)
    setError(null)
    sendQuickCommand(terminal.id, command)
    window.setTimeout(() => void loadRemote(remotePath), 800)
  }

  const editRemoteFile = async (): Promise<void> => {
    if (!connectionId || remoteSelected.size !== 1) return
    const path = [...remoteSelected][0]
    const entry = remoteEntries.find((e) => e.path === path)
    if (!entry || entry.isDirectory) return
    const content = await window.api.sftp.read({ connectionId, path: entry.path })
    setEditor({ path: entry.path, content, remote: true })
  }

  const saveEditor = async (content: string): Promise<void> => {
    if (!editor) return
    if (editor.remote && connectionId) {
      await window.api.sftp.write({ connectionId, path: editor.path, content })
      await loadRemote(remotePath)
    } else {
      await window.api.local.write({ path: editor.path, content })
      await loadLocal(localPath)
    }
    setEditor(null)
  }

  if (!connectionId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-accent-muted">
        请选择一个 SSH 连接以使用 SFTP
      </div>
    )
  }

  if (sshConnecting || (sshReady && !sftpReady && !error && !sshError)) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-accent-muted">
        {sshConnecting ? '等待 SSH 连接…' : '正在建立 SFTP…'}
      </div>
    )
  }

  if (sshError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm">
        <p className="text-red-400">{sshError}</p>
        <p className="text-accent-muted">SSH 连接失败时无法使用 SFTP，请检查认证信息后重试</p>
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
          className="btn-icon h-7 w-7"
          title="刷新"
          onClick={() => {
            void loadLocal(localPath)
            void loadRemote(remotePath)
          }}
        >
          <RefreshCw size={13} />
        </button>
        <button className="btn-icon h-7 w-7" title="上传" onClick={() => void uploadSelected()}>
          <ArrowUp size={13} />
        </button>
        <button className="btn-icon h-7 w-7" title="下载" onClick={() => void downloadSelected()}>
          <ArrowDown size={13} />
        </button>
        <button
          className="btn-icon h-7 w-7"
          title="新建远程文件夹"
          onClick={createRemoteFolder}
        >
          <FolderPlus size={13} />
        </button>
        <button
          className="btn-icon h-7 w-7"
          title="编辑远程文件"
          onClick={() => void editRemoteFile()}
        >
          <Edit3 size={13} />
        </button>
        <button
          className="btn-icon h-7 w-7"
          title="修改权限"
          onClick={chmodRemote}
        >
          <Shield size={13} />
        </button>
        <button
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
          loading={remoteLoading || !sftpReady}
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

      {editor && (
        <FileEditorDialog
          path={editor.path}
          content={editor.content}
          onSave={(content) => void saveEditor(content)}
          onClose={() => setEditor(null)}
        />
      )}

      {prompt?.kind === 'mkdir' && (
        <PromptDialog
          title="新建远程文件夹"
          label="文件夹名称"
          placeholder="例如 my-folder"
          onConfirm={(value) => void handleMkdirConfirm(value)}
          onClose={() => setPrompt(null)}
        />
      )}

      {prompt?.kind === 'chmod' && (
        <ChmodDialog
          path={prompt.path}
          mode={prompt.mode}
          isDirectory={prompt.isDirectory}
          onExecute={handleChmodExecute}
          onClose={() => setPrompt(null)}
        />
      )}
    </div>
  )
}
