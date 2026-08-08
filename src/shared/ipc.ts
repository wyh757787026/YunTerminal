import type { ConnectionImportResult } from './types/connection'

export const IPC_CHANNELS = {
  APP_GET_VERSION: 'app:get-version',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  CONNECTION_LIST: 'connection:list',
  CONNECTION_GET: 'connection:get',
  CONNECTION_CREATE: 'connection:create',
  CONNECTION_UPDATE: 'connection:update',
  CONNECTION_DELETE: 'connection:delete',
  CONNECTION_TEST: 'connection:test',
  CONNECTION_PROBE_LATENCY: 'connection:probe-latency',
  CONNECTION_EXPORT: 'connection:export',
  CONNECTION_IMPORT: 'connection:import',
  CONNECTION_MOVE: 'connection:move',
  CONNECTION_REORDER: 'connection:reorder',
  CONNECTION_TOGGLE_FAVORITE: 'connection:toggle-favorite',
  CONNECTION_RECENT: 'connection:recent',
  CONNECTION_FAVORITES: 'connection:favorites',
  GROUP_LIST: 'group:list',
  GROUP_CREATE: 'group:create',
  GROUP_UPDATE: 'group:update',
  GROUP_DELETE: 'group:delete',
  GROUP_REORDER: 'group:reorder',

  SSH_CONNECT: 'ssh:connect',
  SSH_DISCONNECT: 'ssh:disconnect',
  SSH_WRITE: 'ssh:write',
  SSH_RESIZE: 'ssh:resize',
  SSH_DATA: 'ssh:data',
  SSH_STATUS: 'ssh:status',
  SSH_ERROR: 'ssh:error',
  SSH_AUTH_REQUEST: 'ssh:auth-request',
  SSH_AUTH_RESPONSE: 'ssh:auth-response',

  TELNET_CONNECT: 'telnet:connect',
  TELNET_DISCONNECT: 'telnet:disconnect',
  TELNET_WRITE: 'telnet:write',
  TELNET_RESIZE: 'telnet:resize',
  TELNET_DATA: 'telnet:data',
  TELNET_STATUS: 'telnet:status',

  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_DESTROY: 'pty:destroy',
  PTY_DATA: 'pty:data',
  PTY_STATUS: 'pty:status',

  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  LOCK_SCREEN_STATUS: 'lock-screen:status',
  LOCK_SCREEN_SET_PASSWORD: 'lock-screen:set-password',
  LOCK_SCREEN_VERIFY: 'lock-screen:verify',
  LOCK_SCREEN_CLEAR_PASSWORD: 'lock-screen:clear-password',

  SFTP_CONNECT: 'sftp:connect',
  SFTP_DISCONNECT: 'sftp:disconnect',
  SFTP_LIST: 'sftp:list',
  SFTP_REALPATH: 'sftp:realpath',
  SFTP_READ: 'sftp:read',
  SFTP_WRITE: 'sftp:write',
  SFTP_UPLOAD: 'sftp:upload',
  SFTP_DOWNLOAD: 'sftp:download',
  SFTP_MKDIR: 'sftp:mkdir',
  SFTP_REMOVE: 'sftp:remove',
  SFTP_RENAME: 'sftp:rename',
  SFTP_COPY: 'sftp:copy',
  SFTP_OPEN_LOCAL: 'sftp:open-local',
  SFTP_CHMOD: 'sftp:chmod',
  SFTP_TRANSFER_PROGRESS: 'sftp:transfer-progress',

  FTP_CONNECT: 'ftp:connect',
  FTP_DISCONNECT: 'ftp:disconnect',
  FTP_LIST: 'ftp:list',
  FTP_REALPATH: 'ftp:realpath',
  FTP_UPLOAD: 'ftp:upload',
  FTP_DOWNLOAD: 'ftp:download',
  FTP_MKDIR: 'ftp:mkdir',
  FTP_REMOVE: 'ftp:remove',
  FTP_RENAME: 'ftp:rename',
  FTP_COPY: 'ftp:copy',
  FTP_TRANSFER_PROGRESS: 'ftp:transfer-progress',
  FTP_ABORT_TRANSFER: 'ftp:abort-transfer',

  LOCAL_HOME: 'local:home',
  LOCAL_LIST: 'local:list',
  LOCAL_READ: 'local:read',
  LOCAL_WRITE: 'local:write',
  LOCAL_MKDIR: 'local:mkdir',
  LOCAL_DELETE: 'local:delete',
  LOCAL_RENAME: 'local:rename',

  TUNNEL_LIST: 'tunnel:list',
  TUNNEL_CREATE: 'tunnel:create',
  TUNNEL_UPDATE: 'tunnel:update',
  TUNNEL_DELETE: 'tunnel:delete',
  TUNNEL_START: 'tunnel:start',
  TUNNEL_STOP: 'tunnel:stop',
  TUNNEL_START_AUTOSTART: 'tunnel:start-autostart',
  TUNNEL_STOP_BY_CONNECTION: 'tunnel:stop-by-connection',
  TUNNEL_STATUSES: 'tunnel:statuses',
  TUNNEL_STATUS: 'tunnel:status',

  QUICK_COMMAND_LIST: 'quick-command:list',
  QUICK_COMMAND_CREATE: 'quick-command:create',
  QUICK_COMMAND_UPDATE: 'quick-command:update',
  QUICK_COMMAND_DELETE: 'quick-command:delete',

  NOTE_LIST: 'note:list',
  NOTE_CREATE: 'note:create',
  NOTE_UPDATE: 'note:update',
  NOTE_DELETE: 'note:delete',

  MONITOR_COLLECT: 'monitor:collect',
  MONITOR_SERVER_INFO: 'monitor:server-info',

  AI_SETTINGS_GET: 'ai:settings-get',
  AI_SETTINGS_UPDATE: 'ai:settings-update',
  AI_CHAT: 'ai:chat',

  RECORD_GET_SOURCE: 'record:get-source',
  RECORD_SAVE: 'record:save',
  RECORD_LIST: 'record:list',
  RECORD_GET_URL: 'record:get-url',
  RECORD_DELETE: 'record:delete',
  RECORD_OPEN_DIR: 'record:open-dir',
  RECORD_GET_DIR: 'record:get-dir',
  RECORD_PICK_DIR: 'record:pick-dir',

  RDP_LAUNCH: 'rdp:launch',

  VNC_CONNECT: 'vnc:connect',
  VNC_DISCONNECT: 'vnc:disconnect',
  VNC_STATUS: 'vnc:status',

  CREDENTIAL_LIST: 'credential:list',
  CREDENTIAL_GET: 'credential:get',
  CREDENTIAL_CREATE: 'credential:create',
  CREDENTIAL_UPDATE: 'credential:update',
  CREDENTIAL_DELETE: 'credential:delete'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export interface SshConnectParams {
  sessionId: string
  connectionId: string
  cols: number
  rows: number
}

export interface SshWriteParams {
  sessionId: string
  data: string
}

export interface SshResizeParams {
  sessionId: string
  cols: number
  rows: number
}

export interface SshDataEvent {
  sessionId: string
  data: string
}

export interface SshStatusEvent {
  sessionId: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  message?: string
}

export interface SshAuthPrompt {
  prompt: string
  echo: boolean
}

export interface SshAuthRequestEvent {
  requestId: string
  sessionId?: string
  connectionId: string
  connectionName: string
  authType: 'prompt' | 'keyboard-interactive'
  instructions?: string
  prompts?: SshAuthPrompt[]
}

export interface SshAuthResponseParams {
  requestId: string
  canceled?: boolean
  password?: string
  privateKeyPath?: string
  passphrase?: string
  responses?: string[]
}

export type TelnetConnectParams = SshConnectParams
export type TelnetWriteParams = SshWriteParams
export type TelnetResizeParams = SshResizeParams
export type TelnetDataEvent = SshDataEvent
export type TelnetStatusEvent = SshStatusEvent

export interface VncConnectParams {
  sessionId: string
  connectionId: string
}

export interface VncConnectResult {
  success: boolean
  message?: string
  proxyPort?: number
  sessionId?: string
  token?: string
  credentials?: { username?: string; password?: string }
  viewOnly?: boolean
  scaleViewport?: boolean
  clipViewport?: boolean
  shared?: boolean
  qualityLevel?: number
  compressionLevel?: number
}

export type VncStatusEvent = SshStatusEvent

export interface ConnectionTestResult {
  success: boolean
  latencyMs?: number
  message?: string
}

export interface PtyCreateParams {
  sessionId: string
  cols: number
  rows: number
}

export interface PtyWriteParams {
  sessionId: string
  data: string
}

export interface PtyResizeParams {
  sessionId: string
  cols: number
  rows: number
}

export interface PtyDataEvent {
  sessionId: string
  data: string
}

export interface PtyStatusEvent {
  sessionId: string
  status: 'connected' | 'disconnected'
}

export interface ConnectionMoveParams {
  id: string
  groupId: string
  sortOrder?: number
}

export interface ConnectionReorderItem {
  id: string
  sortOrder: number
  groupId?: string
}

export interface ConnectionImportParams {
  content: string
  mode: 'merge' | 'replace'
}

export interface ConnectionExportResult {
  canceled: boolean
  filePath?: string
}

export interface ConnectionImportFileResult {
  canceled: boolean
  result?: ConnectionImportResult
}
