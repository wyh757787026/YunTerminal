import { create } from 'zustand'
import type { ConnectionInput, StoredConnection } from '@shared/types/connection'
import type { Group, GroupInput, Session, SessionStatus } from '@shared/index'
import {
  createTerminalWindow,
  nextTerminalTitle,
  syncLinkStatus
} from '@renderer/lib/session-utils'
export type SplitDirection = 'horizontal' | 'vertical'
export type FocusedPane = 'primary' | 'secondary'
export type ProtocolTab = 'ssh' | 'rdp' | 'telnet' | 'tunnel' | 'vnc' | 'ftp'
export type WorkspaceView = 'connections' | 'session'
export type BottomPanelTab = 'tunnel' | 'notes' | 'monitor' | 'recordings'
export type ConnectionSection = 'all' | 'favorites' | 'recent' | 'common' | `group:${string}`

interface SplitState {
  enabled: boolean
  direction: SplitDirection
  primarySessionId: string | null
  secondarySessionId: string | null
  focusedPane: FocusedPane
}

interface AppState {
  connections: StoredConnection[]
  groups: Group[]
  favorites: StoredConnection[]
  recent: StoredConnection[]
  sessions: Session[]
  activeSessionId: string | null
  /** connections=协议连接列表；session=当前会话工作区 */
  workspaceView: WorkspaceView
  split: SplitState
  sidebarCollapsed: boolean
  bottomPanelOpen: boolean
  bottomPanelTab: BottomPanelTab
  aiPanelOpen: boolean
  quickCommandsBarOpen: boolean
  searchQuery: string
  protocolTab: ProtocolTab
  connectionSection: ConnectionSection
  connectionDialogOpen: boolean
  connectionPickerOpen: boolean
  editingConnectionId: string | null
  groupDialogOpen: boolean
  editingGroupId: string | null
  groupDialogParentId: string | null
  terminalSearchOpen: boolean
  historyPaletteOpen: boolean
  pendingQuickCommand: { sessionId: string; command: string } | null

  setSearchQuery: (query: string) => void
  setProtocolTab: (tab: ProtocolTab) => void
  setWorkspaceView: (view: WorkspaceView) => void
  setConnectionSection: (section: ConnectionSection) => void
  toggleSidebar: () => void
  toggleBottomPanel: () => void
  openBottomPanel: (tab?: BottomPanelTab) => void
  setBottomPanelTab: (tab: BottomPanelTab) => void
  toggleAiPanel: () => void
  toggleQuickCommandsBar: () => void
  openConnectionDialog: (connectionId?: string) => void
  closeConnectionDialog: () => void
  openConnectionPicker: () => void
  closeConnectionPicker: () => void
  openGroupDialog: (groupId?: string, parentId?: string) => void
  closeGroupDialog: () => void
  openTerminalSearch: () => void
  closeTerminalSearch: () => void
  openHistoryPalette: () => void
  closeHistoryPalette: () => void
  sendQuickCommand: (sessionId: string, command: string) => void
  clearPendingQuickCommand: () => void
  loadConnections: () => Promise<void>
  loadGroups: () => Promise<void>
  loadFavorites: () => Promise<void>
  loadRecent: () => Promise<void>
  refreshConnectionData: () => Promise<void>
  createConnection: (input: ConnectionInput) => Promise<StoredConnection>
  updateConnection: (id: string, input: ConnectionInput) => Promise<StoredConnection | null>
  deleteConnection: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  moveConnection: (id: string, groupId: string) => Promise<void>
  createGroup: (input: GroupInput) => Promise<Group>
  updateGroup: (id: string, input: GroupInput) => Promise<Group | null>
  deleteGroup: (id: string) => Promise<boolean>
  exportConnections: (includeSecrets?: boolean) => Promise<void>
  importConnections: (mode: 'merge' | 'replace') => Promise<void>
  connectToServer: (connection: StoredConnection, options?: { newTab?: boolean }) => void
  addLocalSession: () => void
  addTerminal: () => void
  removeTerminal: (terminalId?: string) => void
  setActiveTerminal: (linkId: string, terminalId: string) => void
  addSession: (session: Session) => void
  reorderSessions: (fromIndex: number, toIndex: number) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  updateSessionStatus: (id: string, status: SessionStatus, errorMessage?: string) => void
  enableSplit: (direction: SplitDirection) => void
  closeSplit: () => void
  setFocusedPane: (pane: FocusedPane) => void
  assignSessionToFocusedPane: (sessionId: string) => void
}

const initialSplit: SplitState = {
  enabled: false,
  direction: 'vertical',
  primarySessionId: null,
  secondarySessionId: null,
  focusedPane: 'primary'
}

function getPaneSessionId(split: SplitState, pane: FocusedPane): string | null {
  return pane === 'primary' ? split.primarySessionId : split.secondarySessionId
}

function createLinkSession(
  type: Session['type'],
  title: string,
  connectionId?: string
): Session {
  if (type === 'sftp' || type === 'ftp') {
    return {
      id: crypto.randomUUID(),
      type,
      connectionId,
      title,
      status: 'connecting',
      createdAt: new Date().toISOString(),
      terminals: [],
      activeTerminalId: null
    }
  }

  const terminal = createTerminalWindow('终端')
  return {
    id: crypto.randomUUID(),
    type,
    connectionId,
    title,
    status: 'connecting',
    createdAt: new Date().toISOString(),
    terminals: [terminal],
    activeTerminalId: terminal.id
  }
}

function disconnectLink(session: Session): void {
  if (session.type === 'sftp') {
    if (session.connectionId) {
      void window.api.sftp.disconnect(session.connectionId)
    }
    return
  }
  if (session.type === 'ftp') {
    if (session.connectionId) {
      void window.api.ftp.disconnect(session.connectionId)
    }
    return
  }

  for (const terminal of session.terminals) {
    void window.api.recording.stop(terminal.id)
    if (session.type === 'ssh') {
      void window.api.ssh.disconnect(terminal.id)
    }
    if (session.type === 'telnet') {
      void window.api.telnet.disconnect(terminal.id)
    }
    if (session.type === 'vnc') {
      void window.api.vnc.disconnect(terminal.id)
    }
    if (session.type === 'local') {
      void window.api.pty.destroy(terminal.id)
    }
  }

  // SSH 会话关闭时一并释放同连接上的 SFTP 通道
  if (session.type === 'ssh' && session.connectionId) {
    void window.api.sftp.disconnect(session.connectionId)
  }
}
export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  groups: [],
  favorites: [],
  recent: [],
  sessions: [],
  activeSessionId: null,
  workspaceView: 'connections',
  split: initialSplit,
  sidebarCollapsed: false,
  bottomPanelOpen: false,
  bottomPanelTab: 'tunnel',
  aiPanelOpen: false,
  quickCommandsBarOpen: false,
  searchQuery: '',
  protocolTab: 'ssh',
  connectionSection: 'all',
  connectionDialogOpen: false,
  connectionPickerOpen: false,
  editingConnectionId: null,
  groupDialogOpen: false,
  editingGroupId: null,
  groupDialogParentId: null,
  terminalSearchOpen: false,
  historyPaletteOpen: false,
  pendingQuickCommand: null,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setProtocolTab: (tab) => {
    set({ protocolTab: tab, searchQuery: '' })

    // 已有对应协议会话时，切回协议 Tab 直接回到终端/会话页，而不是连接列表
    const sessionType =
      tab === 'ssh'
        ? 'ssh'
        : tab === 'telnet'
          ? 'telnet'
          : tab === 'vnc'
            ? 'vnc'
            : tab === 'ftp'
              ? 'ftp'
              : null

    if (!sessionType) {
      set({ workspaceView: 'connections' })
      return
    }

    const { sessions, activeSessionId } = get()
    const active = sessions.find((s) => s.id === activeSessionId)
    const preferred =
      active?.type === sessionType && active.status !== 'disconnected'
        ? active
        : (sessions.find(
            (s) => s.type === sessionType && s.status === 'connected'
          ) ??
          sessions.find(
            (s) => s.type === sessionType && s.status !== 'disconnected'
          ) ??
          sessions.find((s) => s.type === sessionType))

    if (preferred) {
      get().setActiveSession(preferred.id)
      return
    }

    set({ workspaceView: 'connections' })
  },
  setWorkspaceView: (view) => set({ workspaceView: view }),
  setConnectionSection: (section) => set({ connectionSection: section }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleBottomPanel: () => set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),
  openBottomPanel: (tab) =>
    set((s) => ({
      bottomPanelOpen: true,
      bottomPanelTab: tab ?? s.bottomPanelTab
    })),
  setBottomPanelTab: (tab) => set({ bottomPanelTab: tab }),
  toggleAiPanel: () =>
    set((s) => {
      const opening = !s.aiPanelOpen
      return {
        aiPanelOpen: opening,
        ...(opening ? { quickCommandsBarOpen: false } : {})
      }
    }),
  toggleQuickCommandsBar: () =>
    set((s) => {
      const opening = !s.quickCommandsBarOpen
      return {
        quickCommandsBarOpen: opening,
        ...(opening ? { aiPanelOpen: false } : {})
      }
    }),
  openConnectionDialog: (connectionId) =>
    set({ connectionDialogOpen: true, editingConnectionId: connectionId ?? null }),
  closeConnectionDialog: () => set({ connectionDialogOpen: false, editingConnectionId: null }),
  openConnectionPicker: () => set({ connectionPickerOpen: true }),
  closeConnectionPicker: () => set({ connectionPickerOpen: false }),
  openGroupDialog: (groupId, parentId) =>
    set({
      groupDialogOpen: true,
      editingGroupId: groupId ?? null,
      groupDialogParentId: parentId ?? null
    }),
  closeGroupDialog: () =>
    set({ groupDialogOpen: false, editingGroupId: null, groupDialogParentId: null }),
  openTerminalSearch: () => set({ terminalSearchOpen: true }),
  closeTerminalSearch: () => set({ terminalSearchOpen: false }),
  openHistoryPalette: () => set({ historyPaletteOpen: true }),
  closeHistoryPalette: () => set({ historyPaletteOpen: false }),
  sendQuickCommand: (sessionId, command) =>
    set({ pendingQuickCommand: { sessionId, command } }),
  clearPendingQuickCommand: () => set({ pendingQuickCommand: null }),

  loadConnections: async () => {
    const connections = await window.api.connection.list()
    set({ connections })
  },

  loadGroups: async () => {
    const groups = await window.api.group.list()
    set({ groups })
  },

  loadFavorites: async () => {
    const favorites = await window.api.connection.favorites()
    set({ favorites })
  },

  loadRecent: async () => {
    const recent = await window.api.connection.recent()
    set({ recent })
  },

  refreshConnectionData: async () => {
    await Promise.all([
      get().loadConnections(),
      get().loadGroups(),
      get().loadFavorites(),
      get().loadRecent()
    ])
  },

  createConnection: async (input) => {
    const connection = await window.api.connection.create(input)
    await get().refreshConnectionData()
    return connection
  },

  updateConnection: async (id, input) => {
    const connection = await window.api.connection.update(id, input)
    await get().refreshConnectionData()
    return connection
  },

  deleteConnection: async (id) => {
    await window.api.connection.delete(id)
    await get().refreshConnectionData()
  },

  toggleFavorite: async (id) => {
    await window.api.connection.toggleFavorite(id)
    await get().refreshConnectionData()
  },

  moveConnection: async (id, groupId) => {
    await window.api.connection.move({ id, groupId })
    await get().refreshConnectionData()
  },

  createGroup: async (input) => {
    const group = await window.api.group.create(input)
    await get().refreshConnectionData()
    return group
  },

  updateGroup: async (id, input) => {
    const group = await window.api.group.update(id, input)
    await get().refreshConnectionData()
    return group
  },

  deleteGroup: async (id) => {
    const ok = await window.api.group.delete(id)
    if (ok) await get().refreshConnectionData()
    return ok
  },

  exportConnections: async (includeSecrets = false) => {
    const result = await window.api.connection.export(includeSecrets)
    if (!result.canceled && result.filePath) {
      alert(`已导出到: ${result.filePath}`)
    }
  },

  importConnections: async (mode) => {
    const result = await window.api.connection.import({ content: '', mode })
    if ('canceled' in result && result.canceled) return
    if ('importedConnections' in result) {
      alert(
        `导入完成：${result.importedConnections} 个连接，${result.importedGroups} 个分组，跳过 ${result.skippedConnections} 个重复项`
      )
    } else if (result.result) {
      alert(
        `导入完成：${result.result.importedConnections} 个连接，${result.result.importedGroups} 个分组`
      )
    }
    await get().refreshConnectionData()
  },

  connectToServer: (connection, options) => {
    if (connection.protocol === 'rdp') {
      void window.api.rdp.launch(connection.id).then((result) => {
        if (!result.success && result.message) {
          alert(result.message)
        }
      })
      return
    }

    const sessionType =
      connection.protocol === 'telnet'
        ? 'telnet'
        : connection.protocol === 'vnc'
          ? 'vnc'
          : connection.protocol === 'ftp'
            ? 'ftp'
            : 'ssh'

    if (!options?.newTab) {
      const existing = get().sessions.find(
        (s) =>
          s.type === sessionType &&
          s.connectionId === connection.id &&
          s.status !== 'disconnected'
      )
      if (existing) {
        get().setActiveSession(existing.id)
        return
      }
    }

    const session = createLinkSession(sessionType, connection.name, connection.id)

    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: session.id,
      workspaceView: 'session'
    }))
    get().assignSessionToFocusedPane(session.id)

    // SSH 建连由会话生命周期发起；SFTP 在 SSH 就绪后复用同一连接
    if (sessionType === 'ssh' && session.activeTerminalId) {
      void window.api.ssh.connect({
        sessionId: session.activeTerminalId,
        connectionId: connection.id,
        cols: 80,
        rows: 24
      })
    }

    if (sessionType === 'ftp') {
      void window.api.ftp
        .connect(connection.id)
        .then(() => {
          const current = get().sessions.find((s) => s.id === session.id)
          if (!current) return
          get().updateSessionStatus(session.id, 'connected')
        })
        .catch((err: unknown) => {
          const current = get().sessions.find((s) => s.id === session.id)
          if (!current) return
          const raw = err instanceof Error ? err.message : 'FTP 连接失败'
          const message = raw.replace(
            /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i,
            ''
          )
          get().updateSessionStatus(session.id, 'error', message)
        })
    }
  },

  addLocalSession: () => {
    const index = get().sessions.filter((s) => s.type === 'local').length + 1
    const session = createLinkSession(
      'local',
      index === 1 ? '本地终端' : `本地终端 ${index}`
    )

    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: session.id,
      workspaceView: 'session'
    }))
    get().assignSessionToFocusedPane(session.id)
  },

  addTerminal: () => {
    const { activeSessionId, sessions } = get()
    if (!activeSessionId) return

    const link = sessions.find((s) => s.id === activeSessionId)
    if (!link || link.type === 'sftp' || link.type === 'ftp') return

    const terminal = createTerminalWindow(nextTerminalTitle(link.terminals))

    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === link.id
          ? {
              ...sess,
              terminals: [...sess.terminals, terminal],
              activeTerminalId: terminal.id,
              status: 'connecting'
            }
          : sess
      )
    }))

    if (link.type === 'ssh' && link.connectionId) {
      void window.api.ssh.connect({
        sessionId: terminal.id,
        connectionId: link.connectionId,
        cols: 80,
        rows: 24
      })
    }
  },

  removeTerminal: (terminalId) => {
    const { activeSessionId, sessions } = get()
    const link = sessions.find((s) => s.id === activeSessionId)
    if (!link) return

    if (link.type === 'sftp' || link.type === 'ftp') {
      get().removeSession(link.id)
      return
    }

    const targetId = terminalId ?? link.activeTerminalId
    if (!targetId) return

    if (link.terminals.length <= 1) {
      get().removeSession(link.id)
      return
    }

    void window.api.recording.stop(targetId)
    if (link.type === 'ssh') {
      void window.api.ssh.disconnect(targetId)
    }
    if (link.type === 'telnet') {
      void window.api.telnet.disconnect(targetId)
    }
    if (link.type === 'vnc') {
      void window.api.vnc.disconnect(targetId)
    }
    if (link.type === 'local') {
      void window.api.pty.destroy(targetId)
    }

    const removedIndex = link.terminals.findIndex((t) => t.id === targetId)
    const remaining = link.terminals.filter((t) => t.id !== targetId)
    const nextActiveId =
      link.activeTerminalId === targetId
        ? (remaining[Math.max(0, removedIndex - 1)]?.id ?? remaining[0]?.id ?? null)
        : link.activeTerminalId

    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === link.id
          ? {
              ...sess,
              terminals: remaining,
              activeTerminalId: nextActiveId,
              status: syncLinkStatus(remaining)
            }
          : sess
      )
    }))
  },

  setActiveTerminal: (linkId, terminalId) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === linkId ? { ...sess, activeTerminalId: terminalId } : sess
      )
    }))
  },

  addSession: (session) => {
    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionId: session.id,
      workspaceView: 'session'
    }))
    get().assignSessionToFocusedPane(session.id)
  },

  reorderSessions: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    set((s) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= s.sessions.length || toIndex >= s.sessions.length) {
        return s
      }
      const sessions = [...s.sessions]
      const [moved] = sessions.splice(fromIndex, 1)
      sessions.splice(toIndex, 0, moved)
      return { sessions }
    })
  },

  removeSession: (id) => {
    const session = get().sessions.find((s) => s.id === id)
    if (session) disconnectLink(session)
    set((s) => {
      const sessions = s.sessions.filter((sess) => sess.id !== id)

      const split = { ...s.split }
      if (split.primarySessionId === id) split.primarySessionId = null
      if (split.secondarySessionId === id) split.secondarySessionId = null

      if (split.primarySessionId && split.secondarySessionId) {
        // 分屏中仍有双窗，保持不变
      } else if (split.primarySessionId || split.secondarySessionId) {
        const remaining = split.primarySessionId ?? split.secondarySessionId
        split.enabled = false
        split.primarySessionId = remaining
        split.secondarySessionId = null
        split.focusedPane = 'primary'
      } else {
        split.enabled = false
      }

      const nextActiveId =
        s.activeSessionId === id
          ? (split.primarySessionId ?? sessions.at(-1)?.id ?? null)
          : s.activeSessionId

      return {
        sessions,
        activeSessionId: nextActiveId,
        split,
        workspaceView: sessions.length === 0 ? 'connections' : s.workspaceView
      }
    })
  },

  setActiveSession: (id) => {
    const session = id ? get().sessions.find((s) => s.id === id) : null
    const protocolTab =
      session?.type === 'telnet'
        ? 'telnet'
        : session?.type === 'vnc'
          ? 'vnc'
          : session?.type === 'ftp'
            ? 'ftp'
            : session?.type === 'ssh' || session?.type === 'sftp'
              ? 'ssh'
              : get().protocolTab

    set({
      activeSessionId: id,
      protocolTab,
      workspaceView: id ? 'session' : 'connections'
    })
    if (id) get().assignSessionToFocusedPane(id)
  },

  updateSessionStatus: (id, status, errorMessage) =>
    set((s) => ({
      sessions: s.sessions.map((link) => {
        if ((link.type === 'sftp' || link.type === 'ftp') && link.id === id) {
          return { ...link, status, errorMessage }
        }

        const hasTerminal = link.terminals.some((t) => t.id === id)
        if (!hasTerminal) return link

        const terminals = link.terminals.map((terminal) =>
          terminal.id === id ? { ...terminal, status, errorMessage } : terminal
        )

        return {
          ...link,
          terminals,
          status: syncLinkStatus(terminals)
        }
      })
    })),
  enableSplit: (direction) => {
    const { activeSessionId } = get()
    set({
      split: {
        enabled: true,
        direction,
        primarySessionId: activeSessionId,
        secondarySessionId: null,
        focusedPane: 'secondary'
      }
    })
  },

  closeSplit: () => {
    const { split } = get()
    const keepSessionId = split.primarySessionId ?? split.secondarySessionId
    set({
      split: initialSplit,
      activeSessionId: keepSessionId
    })
  },

  setFocusedPane: (pane) =>
    set((s) => ({
      split: { ...s.split, focusedPane: pane },
      activeSessionId: getPaneSessionId(s.split, pane) ?? s.activeSessionId
    })),

  assignSessionToFocusedPane: (sessionId) => {
    set((s) => {
      if (!s.split.enabled) {
        return {
          activeSessionId: sessionId,
          workspaceView: 'session',
          split: { ...s.split, primarySessionId: sessionId }
        }
      }

      const split = { ...s.split }
      if (split.focusedPane === 'primary') {
        split.primarySessionId = sessionId
      } else {
        split.secondarySessionId = sessionId
      }
      return { activeSessionId: sessionId, workspaceView: 'session', split }
    })
  }
}))
