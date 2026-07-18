import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, FolderPlus, RefreshCw } from 'lucide-react'
import type { FileEntry } from '@shared/types/sftp'
import { PromptDialog } from '@renderer/components/common/PromptDialog'
import { useAppStore } from '@renderer/stores/app-store'

const FILE_SYSTEM_ROOT = '/'

function joinRemotePath(base: string, name: string): string {
  const trimmed = name.trim()
  if (base === '/') return `/${trimmed}`
  return `${base.replace(/\/$/, '')}/${trimmed}`
}

interface TreeNodeProps {
  entry: FileEntry
  depth: number
  expanded: Set<string>
  childrenMap: Map<string, FileEntry[]>
  loadingPaths: Set<string>
  selectedPath: string | null
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}

function TreeNode({
  entry,
  depth,
  expanded,
  childrenMap,
  loadingPaths,
  selectedPath,
  onToggle,
  onSelect
}: TreeNodeProps): React.JSX.Element {
  const isExpanded = expanded.has(entry.path)
  const children = childrenMap.get(entry.path) ?? []
  const isLoading = loadingPaths.has(entry.path)
  const indent = depth * 14 + 6

  if (!entry.isDirectory) {
    return (
      <div
        className={`flex cursor-pointer items-center gap-1 py-0.5 pr-2 text-xs hover:bg-surface-overlay/80 ${
          selectedPath === entry.path ? 'bg-surface-overlay' : ''
        }`}
        style={{ paddingLeft: indent + 14 }}
        onClick={() => onSelect(entry.path)}
      >
        <File size={12} className="shrink-0 text-accent/80" />
        <span className="truncate">{entry.name}</span>
      </div>
    )
  }

  return (
    <>
      <div
        className={`flex cursor-pointer items-center gap-0.5 py-0.5 pr-2 text-xs hover:bg-surface-overlay/80 ${
          selectedPath === entry.path ? 'bg-surface-overlay' : ''
        }`}
        style={{ paddingLeft: indent }}
        onClick={() => onSelect(entry.path)}
      >
        <button
          type="button"
          className="flex h-4 w-4 shrink-0 items-center justify-center text-accent-muted hover:text-terminal-fg"
          onClick={(e) => {
            e.stopPropagation()
            void onToggle(entry.path)
          }}
        >
          {isLoading ? (
            <span className="text-[9px]">…</span>
          ) : isExpanded ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
        </button>
        <Folder size={12} className="shrink-0 text-yellow-500/75" />
        <span className="truncate">{depth === 0 ? entry.path : entry.name}</span>
      </div>
      {isExpanded &&
        children.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            expanded={expanded}
            childrenMap={childrenMap}
            loadingPaths={loadingPaths}
            selectedPath={selectedPath}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  )
}

export function SftpFileTree(): React.JSX.Element {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const connectionId = activeSession?.type === 'ssh' ? activeSession.connectionId : undefined

  const [rootPath, setRootPath] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [childrenMap, setChildrenMap] = useState<Map<string, FileEntry[]>>(new Map())
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMkdirPrompt, setShowMkdirPrompt] = useState(false)

  const loadDir = useCallback(
    async (path: string): Promise<FileEntry[]> => {
      if (!connectionId) return []
      setLoadingPaths((prev) => new Set(prev).add(path))
      setError(null)
      try {
        const entries = await window.api.sftp.list({ connectionId, path })
        setChildrenMap((prev) => new Map(prev).set(path, entries))
        return entries
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载目录失败')
        return []
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev)
          next.delete(path)
          return next
        })
      }
    },
    [connectionId]
  )

  useEffect(() => {
    if (!connectionId) return

    let cancelled = false
    void (async () => {
      try {
        await window.api.sftp.connect(connectionId)
        if (cancelled) return
        setRootPath(FILE_SYSTEM_ROOT)
        setExpanded(new Set([FILE_SYSTEM_ROOT]))
        setChildrenMap(new Map())
        await loadDir(FILE_SYSTEM_ROOT)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '连接 SFTP 失败')
        }
      }
    })()

    return () => {
      cancelled = true
      void window.api.sftp.disconnect(connectionId)
    }
  }, [connectionId, loadDir])

  const handleToggle = useCallback(
    async (path: string): Promise<void> => {
      const next = new Set(expanded)
      if (next.has(path)) {
        next.delete(path)
        setExpanded(next)
        return
      }
      next.add(path)
      setExpanded(next)
      if (!childrenMap.has(path)) {
        await loadDir(path)
      }
    },
    [childrenMap, expanded, loadDir]
  )

  const handleRefresh = useCallback(async (): Promise<void> => {
    if (!rootPath) return
    const paths = [...expanded]
    setChildrenMap(new Map())
    for (const path of paths) {
      await loadDir(path)
    }
  }, [expanded, loadDir, rootPath])

  const handleCreateFolder = (): void => {
    if (!connectionId || !rootPath) return
    setShowMkdirPrompt(true)
  }

  const handleMkdirConfirm = useCallback(
    async (name: string): Promise<void> => {
      if (!connectionId || !rootPath) return
      setShowMkdirPrompt(false)
      setError(null)

      let base = rootPath
      if (selectedPath) {
        base = expanded.has(selectedPath)
          ? selectedPath
          : selectedPath.includes('/')
            ? selectedPath.slice(0, selectedPath.lastIndexOf('/'))
            : rootPath
      }

      try {
        const path = joinRemotePath(base, name)
        await window.api.sftp.mkdir({ connectionId, path })
        await loadDir(base)
      } catch (err) {
        setError(err instanceof Error ? err.message : '创建文件夹失败')
      }
    },
    [connectionId, expanded, loadDir, rootPath, selectedPath]
  )

  if (!connectionId) {
    return (
      <div className="flex flex-1 items-center justify-center p-3 text-xs text-accent-muted">
        请选择一个 SSH 连接
      </div>
    )
  }

  if (!rootPath) {
    return (
      <div className="flex flex-1 items-center justify-center p-3 text-xs text-accent-muted">
        {error ?? '加载远程目录…'}
      </div>
    )
  }

  const rootEntry: FileEntry = {
    name: rootPath.split('/').filter(Boolean).pop() ?? rootPath,
    path: rootPath,
    isDirectory: true,
    size: 0,
    modifiedAt: '',
    permissions: '',
    mode: 0
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-surface-border/40 px-1.5 py-1">
        <button
          type="button"
          className="btn-icon h-7 w-7"
          title="刷新"
          onClick={() => void handleRefresh()}
        >
          <RefreshCw size={13} />
        </button>
        <button
          type="button"
          className="btn-icon h-7 w-7"
          title="新建文件夹"
          onClick={handleCreateFolder}
        >
          <FolderPlus size={13} />
        </button>
        {error && <span className="ml-1 truncate text-[10px] text-red-400">{error}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <TreeNode
          entry={rootEntry}
          depth={0}
          expanded={expanded}
          childrenMap={childrenMap}
          loadingPaths={loadingPaths}
          selectedPath={selectedPath}
          onToggle={(path) => void handleToggle(path)}
          onSelect={setSelectedPath}
        />
      </div>

      {showMkdirPrompt && (
        <PromptDialog
          title="新建远程文件夹"
          label="文件夹名称"
          placeholder="例如 my-folder"
          onConfirm={(value) => void handleMkdirConfirm(value)}
          onClose={() => setShowMkdirPrompt(false)}
        />
      )}
    </div>
  )
}
