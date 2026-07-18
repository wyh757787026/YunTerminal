export type TunnelType = 'local' | 'remote' | 'dynamic'

export type TunnelStatus = 'stopped' | 'connecting' | 'running' | 'error'

export interface StoredTunnel {
  id: string
  connectionId: string
  name: string
  type: TunnelType
  bindHost: string
  bindPort: number
  targetHost: string
  targetPort: number
  autoStart: boolean
  autoReconnect: boolean
  note?: string
  createdAt: string
  updatedAt: string
}

export interface Tunnel extends StoredTunnel {
  status: TunnelStatus
  errorMessage?: string
}

export interface TunnelInput {
  connectionId: string
  name: string
  type: TunnelType
  bindHost: string
  bindPort: number
  targetHost: string
  targetPort: number
  autoStart?: boolean
  autoReconnect?: boolean
  note?: string
}

export interface TunnelStatusEvent {
  tunnelId: string
  status: TunnelStatus
  errorMessage?: string
}

export interface TunnelStartResult {
  success: boolean
  message?: string
}

export const TUNNEL_TYPE_LABELS: Record<TunnelType, string> = {
  local: '本地转发',
  remote: '远程转发',
  dynamic: '动态代理'
}
