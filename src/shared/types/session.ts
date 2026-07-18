export type SessionType = 'ssh' | 'local' | 'telnet' | 'vnc'
export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface TerminalWindow {
  id: string
  title: string
  status: SessionStatus
  errorMessage?: string
  createdAt: string
}

/** 链接标签：一个连接可包含多个终端窗口 */
export interface Session {
  id: string
  type: SessionType
  connectionId?: string
  title: string
  status: SessionStatus
  errorMessage?: string
  createdAt: string
  terminals: TerminalWindow[]
  activeTerminalId: string | null
}
