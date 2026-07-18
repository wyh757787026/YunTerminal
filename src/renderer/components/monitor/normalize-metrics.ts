import type { ServerMetrics } from '@shared/types/monitor'

const EMPTY_NETWORK: ServerMetrics['network'] = {
  uploadSpeedBps: 0,
  downloadSpeedBps: 0,
  uploadTotalBytes: 0,
  downloadTotalBytes: 0
}

const EMPTY_DISK_IO: ServerMetrics['diskIo'] = {
  readSpeedBps: 0,
  writeSpeedBps: 0
}

export function normalizeMetrics(data: Partial<ServerMetrics> & Pick<ServerMetrics, 'collectedAt'>): ServerMetrics {
  return {
    platform: data.platform ?? 'unknown',
    hostname: data.hostname ?? 'unknown',
    cpuPercent: data.cpuPercent ?? 0,
    cpuCores: data.cpuCores ?? [],
    memoryTotalBytes: data.memoryTotalBytes ?? 0,
    memoryUsedBytes: data.memoryUsedBytes ?? 0,
    memoryFreeBytes: data.memoryFreeBytes ?? 0,
    memoryCachedBytes: data.memoryCachedBytes ?? 0,
    memoryPercent: data.memoryPercent ?? 0,
    loadAverage: data.loadAverage ?? [0, 0, 0],
    uptimeSeconds: data.uptimeSeconds ?? 0,
    disks: data.disks ?? [],
    network: { ...EMPTY_NETWORK, ...data.network },
    diskIo: { ...EMPTY_DISK_IO, ...data.diskIo },
    processes: data.processes ?? [],
    osName: data.osName ?? '',
    osVersion: data.osVersion ?? '',
    timezone: data.timezone ?? '',
    fsType: data.fsType ?? '',
    collectedAt: data.collectedAt,
    unsupported: data.unsupported,
    message: data.message
  }
}
