export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  const gb = bytes / (1024 * 1024 * 1024)
  return gb >= 10 ? `${gb.toFixed(0)} G` : `${gb.toFixed(1)} G`
}

export function splitBytesDisplay(bytes: number): { value: string; unit: string } {
  if (!Number.isFinite(bytes) || bytes <= 0) return { value: '0', unit: 'B' }
  if (bytes < 1024) return { value: String(bytes), unit: 'B' }
  if (bytes < 1024 * 1024) {
    const num = bytes / 1024
    return { value: num >= 100 ? num.toFixed(0) : num.toFixed(1), unit: 'KB' }
  }
  if (bytes < 1024 * 1024 * 1024) {
    const num = bytes / (1024 * 1024)
    return { value: num >= 100 ? num.toFixed(0) : num.toFixed(1), unit: 'MB' }
  }
  const num = bytes / (1024 * 1024 * 1024)
  return { value: num >= 10 ? num.toFixed(1) : num.toFixed(1), unit: 'G' }
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0.0 B/s'
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(1)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  if (days > 0) return `${days}天 ${hours}小时 ${minutes}分`
  if (hours > 0) return `${hours}小时 ${minutes}分 ${secs}秒`
  if (minutes > 0) return `${minutes}分 ${secs}秒`
  return `${secs}秒`
}

/** 播放器时钟：0:05 / 1:23 / 1:02:03 */
export function formatClockTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function renderSimpleMarkdown(content: string): string {
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mt-3 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-semibold mt-3 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-surface-overlay px-1 py-0.5 font-mono text-[11px]">$1</code>')
    .replace(/\n/g, '<br />')
}
