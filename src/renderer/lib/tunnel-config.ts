import type { TunnelType } from '@shared/types/tunnel'

export const TUNNEL_TYPE_OPTIONS: Array<{
  value: TunnelType
  label: string
  description: string
}> = [
  {
    value: 'remote',
    label: '远程转发',
    description:
      '远程转发（让远端访问本机）。示例：47.94.231.221:80 → 我这台电脑 127.0.0.1:3000'
  },
  {
    value: 'local',
    label: '本地转发',
    description:
      '本地转发（访问远端服务）。示例：本机 127.0.0.1:3307 → 远端 127.0.0.1:3306'
  },
  {
    value: 'dynamic',
    label: '动态代理',
    description: '动态代理（SOCKS5）。在本地开启代理端口，由程序自动选择目标地址。'
  }
]

export interface TunnelFieldLabels {
  bindTitle: string
  bindHint: string
  targetTitle: string
  targetHint: string
}

export function getTunnelFieldLabels(type: TunnelType): TunnelFieldLabels {
  switch (type) {
    case 'remote':
      return {
        bindTitle: '服务器监听地址',
        bindHint: '服务器将在此地址监听，0.0.0.0 表示可被外网访问。',
        targetTitle: '回连目标地址',
        targetHint: '回连到你本机或局域网服务，通常为 127.0.0.1。'
      }
    case 'local':
      return {
        bindTitle: '本地监听地址',
        bindHint: '在本机监听此地址，通过 SSH 隧道转发到远端。',
        targetTitle: '远程目标地址',
        targetHint: 'SSH 服务器能访问到的目标主机与端口。'
      }
    case 'dynamic':
      return {
        bindTitle: '本地 SOCKS 监听',
        bindHint: '在本机开启 SOCKS5 代理，浏览器或应用可指向此地址。',
        targetTitle: '',
        targetHint: ''
      }
    default: {
      const _exhaustive: never = type
      return _exhaustive
    }
  }
}

export interface TunnelQuickFill {
  label: string
  type: TunnelType
  bindHost: string
  bindPort: string
  targetHost: string
  targetPort: string
}

export const TUNNEL_QUICK_FILLS: TunnelQuickFill[] = [
  {
    label: '动态代理：SOCKS5 1080',
    type: 'dynamic',
    bindHost: '127.0.0.1',
    bindPort: '1080',
    targetHost: '',
    targetPort: '0'
  },
  {
    label: '本地转发：MySQL 3306 → 3307',
    type: 'local',
    bindHost: '127.0.0.1',
    bindPort: '3307',
    targetHost: '127.0.0.1',
    targetPort: '3306'
  },
  {
    label: '本地转发：Web 80 → 8080',
    type: 'local',
    bindHost: '127.0.0.1',
    bindPort: '8080',
    targetHost: '127.0.0.1',
    targetPort: '80'
  },
  {
    label: '远程转发：服务器9000 → 本机3000',
    type: 'remote',
    bindHost: '0.0.0.0',
    bindPort: '9000',
    targetHost: '127.0.0.1',
    targetPort: '3000'
  }
]
