import { useCallback, useEffect, useMemo, useState } from 'react'
import { Inbox, MoreVertical, Plus, RefreshCw, Search, Terminal, X, Zap } from 'lucide-react'
import type { StoredQuickCommand } from '@shared/types/quick-command'
import { interpolateCommand } from '@renderer/lib/command-template'
import { getActiveTerminal } from '@renderer/lib/session-utils'
import { useAppStore } from '@renderer/stores/app-store'
import { QuickCommandDialog } from './QuickCommandDialog'

type FilterScope = 'all' | 'global' | 'connection'

export function QuickCommandsPanel(): React.JSX.Element {
  const toggleQuickCommandsBar = useAppStore((s) => s.toggleQuickCommandsBar)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const connections = useAppStore((s) => s.connections)
  const sendQuickCommand = useAppStore((s) => s.sendQuickCommand)

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeTerminal = getActiveTerminal(activeSession)
  const isSshActive =
    activeSession?.type === 'ssh' &&
    activeTerminal?.status === 'connected' &&
    Boolean(activeSession.connectionId)
  const connectionId = isSshActive ? activeSession.connectionId : undefined
  const connection = connections.find((c) => c.id === connectionId)

  const [commands, setCommands] = useState<StoredQuickCommand[]>([])
  const [filterScope, setFilterScope] = useState<FilterScope>('all')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCommand, setEditingCommand] = useState<StoredQuickCommand | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const loadCommands = useCallback(async (): Promise<void> => {
    const list = await window.api.quickCommand.list(connectionId)
    setCommands(list)
  }, [connectionId])

  useEffect(() => {
    void loadCommands()
  }, [loadCommands])

  const filteredCommands = useMemo(() => {
    const query = search.trim().toLowerCase()
    return commands.filter((cmd) => {
      if (filterScope === 'global' && cmd.connectionId !== null) return false
      if (filterScope === 'connection' && cmd.connectionId === null) return false
      if (!query) return true
      return (
        cmd.name.toLowerCase().includes(query) || cmd.command.toLowerCase().includes(query)
      )
    })
  }, [commands, filterScope, search])

  const runCommand = (cmd: StoredQuickCommand): void => {
    if (!activeTerminal) return
    const text = interpolateCommand(cmd.command, connection)
    sendQuickCommand(activeTerminal.id, text)
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm('确定删除这条命令？')) return
    await window.api.quickCommand.delete(id)
    setMenuOpenId(null)
    await loadCommands()
  }

  const openCreateDialog = (): void => {
    setEditingCommand(null)
    setDialogOpen(true)
  }

  const openEditDialog = (cmd: StoredQuickCommand): void => {
    setEditingCommand(cmd)
    setDialogOpen(true)
    setMenuOpenId(null)
  }

  return (
    <>
      <div className="panel-card flex w-[340px] shrink-0 flex-col">
        <div className="flex h-10 items-center justify-between border-b border-surface-border/40 px-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="flex h-6 w-6 items-center justify-center rounded-card bg-accent-soft">
              <Zap size={13} className="text-accent" />
            </div>
            快速命令
          </div>
          <button className="btn-icon-sm" onClick={toggleQuickCommandsBar}>
            <X size={12} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-surface-border/40 px-3 py-2">
          <select
            className="input min-w-0 flex-1 py-1.5 text-xs"
            value={filterScope}
            onChange={(e) => setFilterScope(e.target.value as FilterScope)}
          >
            <option value="all">全部命令</option>
            <option value="global">全局命令</option>
            <option value="connection" disabled={!connectionId}>
              当前连接
            </option>
          </select>
          <div className="search-box min-w-0 flex-1 py-1">
            <input
              className="w-full bg-transparent text-xs outline-none placeholder:text-accent-muted/60"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索"
            />
            <Search size={12} className="shrink-0 text-accent-muted" />
          </div>
          <button className="btn-icon-sm shrink-0" title="刷新" onClick={() => void loadCommands()}>
            <RefreshCw size={12} />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-surface-border/40 px-3 py-2">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-accent-muted hover:bg-surface-overlay hover:text-terminal-fg"
            onClick={openCreateDialog}
          >
            +命令
          </button>
          <div className="relative ml-auto">
            <button
              type="button"
              className="btn-icon-sm"
              title="更多"
              onClick={() => setMenuOpenId(menuOpenId ? null : '__more__')}
            >
              <MoreVertical size={12} />
            </button>
            {menuOpenId === '__more__' && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                <div className="dropdown-menu right-0 top-full z-20 min-w-[8rem]">
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      setMenuOpenId(null)
                      void loadCommands()
                    }}
                  >
                    刷新列表
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-accent-muted">
              <Inbox size={36} className="opacity-25" />
              <span className="text-xs">暂无数据</span>
              <button
                type="button"
                className="mt-1 flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-xs text-accent hover:bg-accent/25"
                onClick={openCreateDialog}
              >
                <Plus size={12} />
                新建命令
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredCommands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="group relative rounded-lg border border-surface-border/60 bg-surface-overlay/30 p-2.5 transition-colors hover:border-accent/30 hover:bg-surface-overlay/50"
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      disabled={!isSshActive}
                      onClick={() => runCommand(cmd)}
                      title={!isSshActive ? '请先连接 SSH 终端' : cmd.command}
                    >
                      <div className="truncate text-sm font-medium text-terminal-fg">{cmd.name}</div>
                      <div className="mt-1 truncate font-mono text-[11px] text-accent-muted">
                        {cmd.command}
                      </div>
                      {cmd.connectionId === null ? (
                        <span className="mt-1 inline-block text-[10px] text-accent">全局</span>
                      ) : null}
                    </button>
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        className="btn-icon h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => setMenuOpenId(menuOpenId === cmd.id ? null : cmd.id)}
                      >
                        <MoreVertical size={12} />
                      </button>
                      {menuOpenId === cmd.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                          <div className="dropdown-menu right-0 top-full z-20 min-w-[7rem]">
                            <button
                              type="button"
                              className="dropdown-item"
                              onClick={() => openEditDialog(cmd)}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="dropdown-item flex items-center gap-1"
                              disabled={!isSshActive}
                              onClick={() => {
                                runCommand(cmd)
                                setMenuOpenId(null)
                              }}
                            >
                              <Terminal size={11} />
                              执行
                            </button>
                            <button
                              type="button"
                              className="dropdown-item text-red-400"
                              onClick={() => void handleDelete(cmd.id)}
                            >
                              删除
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isSshActive && filteredCommands.length > 0 && (
          <div className="border-t border-surface-border/40 px-3 py-2 text-[11px] text-accent-muted">
            连接 SSH 终端后可执行命令
          </div>
        )}
      </div>

      {dialogOpen && (
        <QuickCommandDialog
          connectionId={connectionId ?? null}
          command={editingCommand}
          onClose={() => {
            setDialogOpen(false)
            setEditingCommand(null)
          }}
          onSaved={() => void loadCommands()}
        />
      )}
    </>
  )
}
