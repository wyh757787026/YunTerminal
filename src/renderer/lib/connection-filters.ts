import type { ConnectionSection, ProtocolTab } from '@renderer/stores/app-store'
import type { StoredConnection } from '@shared/types/connection'

export function filterByProtocol(
  connections: StoredConnection[],
  tab: ProtocolTab
): StoredConnection[] {
  switch (tab) {
    case 'ssh':
      return connections.filter((c) => (c.protocol ?? 'ssh') === 'ssh')
    case 'rdp':
      return connections.filter((c) => c.protocol === 'rdp')
    case 'telnet':
      return connections.filter((c) => c.protocol === 'telnet')
    case 'vnc':
      return connections.filter((c) => c.protocol === 'vnc')
    case 'tunnel':
      return connections.filter((c) => (c.protocol ?? 'ssh') === 'ssh')
    case 'ftp':
      return connections.filter((c) => c.protocol === 'ftp')
    default: {
      const _exhaustive: never = tab
      return _exhaustive
    }
  }
}

export function filterBySection(
  connections: StoredConnection[],
  section: ConnectionSection,
  favorites: StoredConnection[],
  recent: StoredConnection[]
): StoredConnection[] {
  switch (section) {
    case 'all':
      return connections
    case 'favorites':
      // 调用方需再按协议过滤；此处返回完整收藏顺序
      return favorites
    case 'recent':
      // 调用方需再按协议过滤；此处返回完整最近顺序
      return recent
    case 'common':
      return connections.filter(
        (c) => c.tags?.some((t) => t === '常用' || t.toLowerCase() === 'common')
      )
    default:
      if (section.startsWith('group:')) {
        const groupId = section.slice('group:'.length)
        return connections.filter((c) => (c.groupId ?? 'default') === groupId)
      }
      return connections
  }
}

export function filterBySearch(
  connections: StoredConnection[],
  query: string
): StoredConnection[] {
  if (!query.trim()) return connections
  const q = query.toLowerCase()
  return connections.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.host.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      c.tags?.some((t) => t.toLowerCase().includes(q))
  )
}

export function getProtocolLabel(tab: ProtocolTab): string {
  switch (tab) {
    case 'ssh':
      return 'SSH'
    case 'rdp':
      return 'RDP'
    case 'telnet':
      return 'Telnet'
    case 'tunnel':
      return '隧道'
    case 'vnc':
      return 'VNC'
    case 'ftp':
      return 'FTP'
    default: {
      const _exhaustive: never = tab
      return _exhaustive
    }
  }
}
