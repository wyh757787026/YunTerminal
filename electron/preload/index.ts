import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IPC_CHANNELS,
  type ConnectionExportResult,
  type ConnectionImportFileResult,
  type ConnectionImportParams,
  type ConnectionMoveParams,
  type ConnectionReorderItem,
  type ConnectionTestResult,
  type PtyCreateParams,
  type PtyDataEvent,
  type PtyResizeParams,
  type PtyStatusEvent,
  type PtyWriteParams,
  type SshConnectParams,
  type SshDataEvent,
  type SshAuthRequestEvent,
  type SshAuthResponseParams,
  type SshResizeParams,
  type SshStatusEvent,
  type SshWriteParams,
  type TelnetConnectParams,
  type TelnetDataEvent,
  type TelnetResizeParams,
  type TelnetStatusEvent,
  type TelnetWriteParams,
  type VncConnectParams,
  type VncConnectResult,
  type VncStatusEvent
} from '../../src/shared/ipc'
import type {
  ConnectionImportResult,
  ConnectionInput,
  StoredConnection
} from '../../src/shared/types/connection'
import type { Group, GroupInput, GroupReorderItem } from '../../src/shared/types/group'
import type { TerminalSettings } from '../../src/shared/types/settings'
import type {
  FileEntry,
  LocalListParams,
  LocalPathParams,
  LocalWriteParams,
  SftpChmodParams,
  SftpListParams,
  SftpPathParams,
  SftpRenameParams,
  SftpTransferParams,
  SftpTransferProgress,
  SftpWriteParams
} from '../../src/shared/types/sftp'
import type {
  StoredTunnel,
  TunnelInput,
  TunnelStartResult,
  TunnelStatusEvent
} from '../../src/shared/types/tunnel'
import type { QuickCommandInput, StoredQuickCommand } from '../../src/shared/types/quick-command'
import type { NoteInput, StoredNote } from '../../src/shared/types/note'
import type { ServerInfoSummary, ServerMetrics } from '../../src/shared/types/monitor'
import type { AiChatParams, AiChatResult, AiPublicSettings, AiSettingsInput } from '../../src/shared/types/ai'
import type {
  RecordingFile,
  RecordingMeta,
  RecordingStartParams
} from '../../src/shared/types/recording'
import type { RdpLaunchResult } from '../../src/shared/types/rdp'
import type { CredentialInput, StoredCredential } from '../../src/shared/types/credential'

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  window: {
    minimize: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE)
  },
  connection: {
    list: (): Promise<StoredConnection[]> => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_LIST),
    favorites: (): Promise<StoredConnection[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_FAVORITES),
    recent: (): Promise<StoredConnection[]> => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_RECENT),
    get: (id: string): Promise<StoredConnection | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_GET, id),
    create: (input: ConnectionInput): Promise<StoredConnection> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_CREATE, input),
    update: (id: string, input: ConnectionInput): Promise<StoredConnection | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_UPDATE, id, input),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_DELETE, id),
    test: (id: string): Promise<ConnectionTestResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_TEST, id),
    probeLatency: (id: string): Promise<ConnectionTestResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_PROBE_LATENCY, id),
    toggleFavorite: (id: string): Promise<StoredConnection | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_TOGGLE_FAVORITE, id),
    move: (params: ConnectionMoveParams): Promise<StoredConnection | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_MOVE, params),
    reorder: (items: ConnectionReorderItem[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_REORDER, items),
    export: (includeSecrets = false): Promise<ConnectionExportResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_EXPORT, includeSecrets),
    import: (
      params: ConnectionImportParams
    ): Promise<ConnectionImportResult | ConnectionImportFileResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_IMPORT, params)
  },
  group: {
    list: (): Promise<Group[]> => ipcRenderer.invoke(IPC_CHANNELS.GROUP_LIST),
    create: (input: GroupInput): Promise<Group> =>
      ipcRenderer.invoke(IPC_CHANNELS.GROUP_CREATE, input),
    update: (id: string, input: GroupInput): Promise<Group | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GROUP_UPDATE, id, input),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.GROUP_DELETE, id),
    reorder: (items: GroupReorderItem[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GROUP_REORDER, items)
  },
  settings: {
    get: (): Promise<TerminalSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (partial: Partial<TerminalSettings>): Promise<TerminalSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, partial)
  },
  lockScreen: {
    getStatus: (): Promise<{ passwordConfigured: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCK_SCREEN_STATUS),
    setPassword: (
      password: string,
      currentPassword?: string
    ): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCK_SCREEN_SET_PASSWORD, password, currentPassword),
    verify: (password: string): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCK_SCREEN_VERIFY, password),
    clearPassword: (currentPassword: string): Promise<{ success: boolean; message?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCK_SCREEN_CLEAR_PASSWORD, currentPassword)
  },
  ssh: {
    connect: (params: SshConnectParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSH_CONNECT, params),
    disconnect: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSH_DISCONNECT, sessionId),
    write: (params: SshWriteParams): void => ipcRenderer.send(IPC_CHANNELS.SSH_WRITE, params),
    resize: (params: SshResizeParams): void => ipcRenderer.send(IPC_CHANNELS.SSH_RESIZE, params),
    onData: (callback: (event: SshDataEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: SshDataEvent): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.SSH_DATA, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH_DATA, listener)
    },
    onStatus: (callback: (event: SshStatusEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: SshStatusEvent): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.SSH_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH_STATUS, listener)
    },
    respondAuth: (params: SshAuthResponseParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSH_AUTH_RESPONSE, params),
    onAuthRequest: (callback: (event: SshAuthRequestEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: SshAuthRequestEvent): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.SSH_AUTH_REQUEST, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SSH_AUTH_REQUEST, listener)
    }
  },
  telnet: {
    connect: (params: TelnetConnectParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TELNET_CONNECT, params),
    disconnect: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TELNET_DISCONNECT, sessionId),
    write: (params: TelnetWriteParams): void => ipcRenderer.send(IPC_CHANNELS.TELNET_WRITE, params),
    resize: (params: TelnetResizeParams): void =>
      ipcRenderer.send(IPC_CHANNELS.TELNET_RESIZE, params),
    onData: (callback: (event: TelnetDataEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: TelnetDataEvent): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.TELNET_DATA, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TELNET_DATA, listener)
    },
    onStatus: (callback: (event: TelnetStatusEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: TelnetStatusEvent): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.TELNET_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TELNET_STATUS, listener)
    }
  },
  vnc: {
    connect: (params: VncConnectParams): Promise<VncConnectResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.VNC_CONNECT, params),
    disconnect: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.VNC_DISCONNECT, sessionId),
    onStatus: (callback: (event: VncStatusEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: VncStatusEvent): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.VNC_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.VNC_STATUS, listener)
    }
  },
  pty: {
    create: (params: PtyCreateParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PTY_CREATE, params),
    destroy: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.PTY_DESTROY, sessionId),
    write: (params: PtyWriteParams): void => ipcRenderer.send(IPC_CHANNELS.PTY_WRITE, params),
    resize: (params: PtyResizeParams): void => ipcRenderer.send(IPC_CHANNELS.PTY_RESIZE, params),
    onData: (callback: (event: PtyDataEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: PtyDataEvent): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.PTY_DATA, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PTY_DATA, listener)
    },
    onStatus: (callback: (event: PtyStatusEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: PtyStatusEvent): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.PTY_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PTY_STATUS, listener)
    }
  },
  sftp: {
    connect: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_CONNECT, connectionId),
    disconnect: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_DISCONNECT, connectionId),
    list: (params: SftpListParams): Promise<FileEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_LIST, params),
    realpath: (params: SftpPathParams): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_REALPATH, params),
    read: (params: SftpPathParams): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_READ, params),
    write: (params: SftpWriteParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_WRITE, params),
    upload: (params: SftpTransferParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_UPLOAD, params),
    download: (params: SftpTransferParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_DOWNLOAD, params),
    mkdir: (params: SftpPathParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_MKDIR, params),
    remove: (params: SftpPathParams & { isDirectory: boolean }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_REMOVE, params),
    rename: (params: SftpRenameParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_RENAME, params),
    chmod: (params: SftpChmodParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SFTP_CHMOD, params),
    onTransferProgress: (callback: (event: SftpTransferProgress) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: SftpTransferProgress): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.SFTP_TRANSFER_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SFTP_TRANSFER_PROGRESS, listener)
    }
  },
  ftp: {
    connect: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_CONNECT, connectionId),
    disconnect: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_DISCONNECT, connectionId),
    abortTransfer: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_ABORT_TRANSFER, connectionId),
    list: (params: SftpListParams): Promise<FileEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_LIST, params),
    realpath: (params: SftpPathParams): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_REALPATH, params),
    upload: (params: SftpTransferParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_UPLOAD, params),
    download: (params: SftpTransferParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_DOWNLOAD, params),
    mkdir: (params: SftpPathParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_MKDIR, params),
    remove: (params: SftpPathParams & { isDirectory: boolean }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_REMOVE, params),
    rename: (params: SftpRenameParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_RENAME, params),
    copy: (params: SftpRenameParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.FTP_COPY, params),
    onTransferProgress: (callback: (event: SftpTransferProgress) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: SftpTransferProgress): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.FTP_TRANSFER_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.FTP_TRANSFER_PROGRESS, listener)
    }
  },
  local: {
    home: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_HOME),
    list: (params: LocalListParams): Promise<FileEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_LIST, params),
    read: (params: LocalPathParams): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_READ, params),
    write: (params: LocalWriteParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_WRITE, params),
    mkdir: (params: LocalPathParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_MKDIR, params),
    delete: (params: LocalPathParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_DELETE, params),
    rename: (params: { oldPath: string; newPath: string }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_RENAME, params)
  },
  tunnel: {
    list: (connectionId?: string): Promise<StoredTunnel[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_LIST, connectionId),
    create: (input: TunnelInput): Promise<StoredTunnel> =>
      ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_CREATE, input),
    update: (id: string, input: TunnelInput): Promise<StoredTunnel | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_UPDATE, id, input),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_DELETE, id),
    start: (id: string): Promise<TunnelStartResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_START, id),
    stop: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_STOP, id),
    startAutoStart: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_START_AUTOSTART, connectionId),
    stopSharedByConnection: (connectionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_STOP_BY_CONNECTION, connectionId),
    statuses: (connectionId?: string): Promise<TunnelStatusEvent[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TUNNEL_STATUSES, connectionId),
    onStatus: (callback: (event: TunnelStatusEvent) => void): (() => void) => {
      const listener = (_: IpcRendererEvent, event: TunnelStatusEvent): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.TUNNEL_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TUNNEL_STATUS, listener)
    }
  },
  quickCommand: {
    list: (connectionId?: string): Promise<StoredQuickCommand[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUICK_COMMAND_LIST, connectionId),
    create: (input: QuickCommandInput): Promise<StoredQuickCommand> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUICK_COMMAND_CREATE, input),
    update: (id: string, input: QuickCommandInput): Promise<StoredQuickCommand | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUICK_COMMAND_UPDATE, id, input),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.QUICK_COMMAND_DELETE, id)
  },
  note: {
    list: (connectionId: string): Promise<StoredNote[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_LIST, connectionId),
    create: (input: NoteInput): Promise<StoredNote> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_CREATE, input),
    update: (id: string, input: NoteInput): Promise<StoredNote | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTE_UPDATE, id, input),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.NOTE_DELETE, id)
  },
  monitor: {
    collect: (connectionId: string): Promise<ServerMetrics> =>
      ipcRenderer.invoke(IPC_CHANNELS.MONITOR_COLLECT, connectionId),
    getServerInfo: (connectionId: string): Promise<ServerInfoSummary> =>
      ipcRenderer.invoke(IPC_CHANNELS.MONITOR_SERVER_INFO, connectionId)
  },
  ai: {
    getSettings: (): Promise<AiPublicSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SETTINGS_GET),
    updateSettings: (input: AiSettingsInput): Promise<AiPublicSettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SETTINGS_UPDATE, input),
    chat: (params: AiChatParams): Promise<AiChatResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT, params)
  },
  recording: {
    start: (params: RecordingStartParams): Promise<RecordingMeta> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORD_START, params),
    stop: (sessionId: string): Promise<RecordingMeta | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORD_STOP, sessionId),
    isRecording: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORD_STATUS, sessionId),
    list: (): Promise<RecordingMeta[]> => ipcRenderer.invoke(IPC_CHANNELS.RECORD_LIST),
    read: (id: string): Promise<RecordingFile | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.RECORD_READ, id),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.RECORD_DELETE, id)
  },
  rdp: {
    launch: (connectionId: string): Promise<RdpLaunchResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.RDP_LAUNCH, connectionId)
  },
  credential: {
    list: (): Promise<StoredCredential[]> => ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_LIST),
    get: (id: string): Promise<StoredCredential | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_GET, id),
    create: (input: CredentialInput): Promise<StoredCredential> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_CREATE, input),
    update: (id: string, input: CredentialInput): Promise<StoredCredential | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_UPDATE, id, input),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_DELETE, id)
  }
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error(error)
}

export type Api = typeof api
