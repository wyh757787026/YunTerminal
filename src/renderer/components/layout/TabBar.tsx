import { useCallback, useState } from 'react'
import { GripVertical, Laptop, Monitor, Network, Plus, Scan, Server, X } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app-store'
import type { Session } from '@shared/index'

function SessionIcon({ session }: { session: Session }): React.JSX.Element {
  const connections = useAppStore((s) => s.connections)

  if (session.type === 'local') return <Laptop size={14} className="shrink-0 opacity-85" />

  const connection = connections.find((c) => c.id === session.connectionId)

  if (session.type === 'telnet' || connection?.protocol === 'telnet') {
    return <Network size={14} className="shrink-0 opacity-85" />
  }

  if (session.type === 'vnc' || connection?.protocol === 'vnc') {
    return <Scan size={14} className="shrink-0 opacity-85" />
  }

  if (connection?.protocol === 'rdp') return <Monitor size={14} className="shrink-0 opacity-85" />

  return <Server size={14} className="shrink-0 opacity-85" />
}

export function TabBar(): React.JSX.Element {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    removeSession,
    reorderSessions,
    openConnectionPicker
  } = useAppStore()

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const handleDrop = useCallback(
    (targetId: string, sourceId: string): void => {
      const fromIndex = sessions.findIndex((s) => s.id === sourceId)
      const toIndex = sessions.findIndex((s) => s.id === targetId)
      if (fromIndex < 0 || toIndex < 0) return
      reorderSessions(fromIndex, toIndex)
    },
    [reorderSessions, sessions]
  )

  return (
    <div className="tab-strip">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId
        const isDragging = draggingId === session.id
        const isDropTarget = dropTargetId === session.id && draggingId !== session.id

        return (
          <div
            key={session.id}
            draggable
            className={`tab-item group ${isActive ? 'tab-item-active' : ''} ${
              isDragging ? 'tab-item-dragging' : ''
            } ${isDropTarget ? 'tab-item-drop-target' : ''}`}
            onClick={() => setActiveSession(session.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', session.id)
              e.dataTransfer.effectAllowed = 'move'
              setDraggingId(session.id)
            }}
            onDragEnd={() => {
              setDraggingId(null)
              setDropTargetId(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (draggingId && draggingId !== session.id) {
                setDropTargetId(session.id)
              }
            }}
            onDragLeave={() => {
              if (dropTargetId === session.id) setDropTargetId(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const sourceId = e.dataTransfer.getData('text/plain')
              if (sourceId) handleDrop(session.id, sourceId)
              setDraggingId(null)
              setDropTargetId(null)
            }}
          >
            <GripVertical
              size={12}
              className="hidden shrink-0 text-accent-muted/50 group-hover:block"
            />
            <SessionIcon session={session} />
            <span className="min-w-0 flex-1 truncate font-medium">{session.title}</span>
            {session.status === 'connecting' && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            )}
            {session.status === 'error' && (
              <span
                className="h-2 w-2 rounded-full bg-red-400"
                title={session.errorMessage}
              />
            )}
            <button
              type="button"
              className="ml-0.5 hidden shrink-0 rounded-md p-1 opacity-60 hover:bg-surface-border/80 hover:opacity-100 group-hover:inline-flex"
              onClick={(e) => {
                e.stopPropagation()
                removeSession(session.id)
              }}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}

      <button
        type="button"
        className="btn-icon mb-0.5 ml-auto h-9 w-9 shrink-0"
        onClick={openConnectionPicker}
        title="新建连接标签"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
