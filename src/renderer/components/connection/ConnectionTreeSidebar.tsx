import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderPlus,
  Plus,
  RefreshCw
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ConnectionSection } from '@renderer/stores/app-store'
import { useAppStore } from '@renderer/stores/app-store'
import { getProtocolLabel } from '@renderer/lib/connection-filters'
import type { ConnectionProtocol, Group } from '@shared/index'

function matchesProtocolTab(protocol: ConnectionProtocol | undefined, tab: string): boolean {
  const value = protocol ?? 'ssh'
  if (tab === 'rdp') return value === 'rdp'
  if (tab === 'telnet') return value === 'telnet'
  if (tab === 'vnc') return value === 'vnc'
  if (tab === 'ssh' || tab === 'tunnel') return value === 'ssh'
  if (tab === 'ftp') return value === 'ftp'
  return true
}

function GroupTreeNode({
  group,
  allGroups,
  depth = 0
}: {
  group: Group
  allGroups: Group[]
  depth?: number
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const connectionSection = useAppStore((s) => s.connectionSection)
  const setConnectionSection = useAppStore((s) => s.setConnectionSection)
  const connections = useAppStore((s) => s.connections)
  const protocolTab = useAppStore((s) => s.protocolTab)

  const childGroups = allGroups.filter((g) => g.parentId === group.id)
  const sectionId: ConnectionSection = `group:${group.id}`
  const isActive = connectionSection === sectionId
  const count = connections.filter((c) => {
    const matchGroup = (c.groupId ?? 'default') === group.id
    return matchGroup && matchesProtocolTab(c.protocol, protocolTab)
  }).length

  return (
    <div>
      <button
        className={`tree-item w-full ${isActive ? 'tree-item-active' : ''}`}
        style={{ paddingLeft: `${10 + depth * 12}px` }}
        onClick={() => setConnectionSection(sectionId)}
      >
        <span
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          {childGroups.length > 0 ? (
            expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )
          ) : (
            <span className="inline-block w-3" />
          )}
        </span>
        <Folder size={13} className="shrink-0 text-amber-400/70" />
        <span className="truncate">{group.name}</span>
        <span className="ml-auto text-[11px] text-accent-muted">({count})</span>
      </button>
      {expanded &&
        childGroups.map((child) => (
          <GroupTreeNode key={child.id} group={child} allGroups={allGroups} depth={depth + 1} />
        ))}
    </div>
  )
}

export function ConnectionTreeSidebar(): React.JSX.Element {
  const {
    connections,
    groups,
    favorites,
    recent,
    protocolTab,
    connectionSection,
    sidebarCollapsed,
    setConnectionSection,
    toggleSidebar,
    openConnectionDialog,
    openGroupDialog,
    refreshConnectionData
  } = useAppStore()

  const rootGroups = groups.filter((g) => !g.parentId)
  const protocolLabel = getProtocolLabel(protocolTab)

  const counts = useMemo(() => {
    const byProtocol = (list: typeof connections) =>
      list.filter((c) => matchesProtocolTab(c.protocol, protocolTab))
    return {
      favorites: byProtocol(favorites).length,
      recent: byProtocol(recent).length,
      common: byProtocol(
        connections.filter((c) => c.tags?.some((t) => t === '常用' || t.toLowerCase() === 'common'))
      ).length
    }
  }, [connections, favorites, recent, protocolTab])

  const sectionButton = (id: ConnectionSection, label: string, count: number): React.JSX.Element => (
    <button
      className={`tree-item w-full ${connectionSection === id ? 'tree-item-active' : ''}`}
      onClick={() => setConnectionSection(id)}
    >
      <Folder size={13} className="shrink-0 text-accent-muted/60" />
      <span className="truncate">{label}</span>
      <span className="ml-auto text-[11px] text-accent-muted">({count})</span>
    </button>
  )

  if (sidebarCollapsed) {
    return (
      <div className="panel-card flex w-11 shrink-0 flex-col items-center gap-1 py-2">
        <button className="btn-icon-sm" title="展开" onClick={toggleSidebar}>
          <ChevronRight size={15} />
        </button>
        <button className="btn-icon-sm" title={`新建${protocolLabel}`} onClick={() => openConnectionDialog()}>
          <Plus size={15} />
        </button>
      </div>
    )
  }

  return (
    <div className="panel-card flex w-[200px] shrink-0 flex-col">
      <div className="flex items-center gap-1 border-b border-surface-border/40 px-2 py-2">
        <button className="btn-icon-sm" title="收起" onClick={toggleSidebar}>
          <ChevronLeft size={14} />
        </button>
        <button
          className="btn-icon-sm"
          title="刷新"
          onClick={() => void refreshConnectionData()}
        >
          <RefreshCw size={13} />
        </button>
        <button className="btn-icon-sm" title="新建分组" onClick={() => openGroupDialog()}>
          <FolderPlus size={13} />
        </button>
        <button
          className="ml-auto flex items-center gap-1 rounded-lg bg-accent/15 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/25"
          onClick={() => openConnectionDialog()}
        >
          <Plus size={12} />
          {protocolLabel}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <p className="section-label mb-1">全部</p>
        {sectionButton('all', '全部', connections.length)}
        {sectionButton('recent', '最近', counts.recent)}
        {sectionButton('common', '常用', counts.common)}
        {sectionButton('favorites', '收藏', counts.favorites)}

        <p className="section-label mb-1 mt-3">分组</p>
        {rootGroups.map((group) => (
          <GroupTreeNode key={group.id} group={group} allGroups={groups} />
        ))}
      </div>
    </div>
  )
}
