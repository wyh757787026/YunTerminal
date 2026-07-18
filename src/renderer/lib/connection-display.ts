import type { ServerInfoSummary } from '@shared/types/monitor'
import type { ServerInfoEntry } from '@renderer/hooks/use-connection-server-info'

export function getLatencyDisplay(entry: {
  status: 'idle' | 'pending' | 'ok' | 'fail' | 'skip'
  ms?: number
  message?: string
}): { text: string; className: string; title?: string } {
  switch (entry.status) {
    case 'idle':
    case 'pending':
      return { text: '…', className: 'text-accent-muted/70' }
    case 'skip':
      return { text: '--', className: 'text-accent-muted/50', title: entry.message }
    case 'fail':
      return {
        text: '--',
        className: 'text-red-400/80',
        title: entry.message ?? '连接失败'
      }
    case 'ok': {
      const ms = entry.ms ?? 0
      if (ms < 80) return { text: `${ms}ms`, className: 'text-emerald-400' }
      if (ms < 200) return { text: `${ms}ms`, className: 'text-yellow-400/90' }
      return { text: `${ms}ms`, className: 'text-orange-400/90' }
    }
    default: {
      const _exhaustive: never = entry.status
      return _exhaustive
    }
  }
}

function formatCapacityG(bytes: number): string {
  if (bytes <= 0) return ''
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${Math.round(gb)}G`
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))}M`
}

function formatOsLabel(info: ServerInfoSummary): string {
  const version = info.osVersion.trim()
  const name = info.osName.trim()

  if (version) {
    if (name && !version.toLowerCase().includes(name.toLowerCase())) {
      return `${name} ${version}`
    }
    return version
  }

  return name
}

function buildTagsFromSummary(info: ServerInfoSummary): string[] {
  const tags: string[] = []

  const os = formatOsLabel(info)
  if (os) tags.push(os)
  if (info.cpuCount > 0) tags.push(`${info.cpuCount} 核`)

  const memory = formatCapacityG(info.memoryTotalBytes)
  if (memory) tags.push(`${memory} 内存`)

  const disk = formatCapacityG(info.diskTotalBytes)
  if (disk) tags.push(`${disk} 硬盘`)

  return tags
}

export function getServerInfoDisplay(entry: ServerInfoEntry): {
  tags: string[]
  title?: string
  loading: boolean
} {
  switch (entry.status) {
    case 'idle':
    case 'pending':
      return { tags: [], loading: true }
    case 'skip':
      return { tags: [], title: entry.message, loading: false }
    case 'fail':
      return { tags: [], title: entry.message ?? '无法获取服务器信息', loading: false }
    case 'ok':
      if (!entry.info) return { tags: [], loading: false }
      return {
        tags: buildTagsFromSummary(entry.info),
        title: [entry.info.hostname, entry.info.osVersion].filter(Boolean).join(' · '),
        loading: false
      }
    default: {
      const _exhaustive: never = entry.status
      return _exhaustive
    }
  }
}
