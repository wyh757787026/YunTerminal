export interface DiskUsage {
  mount: string
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usePercent: number
}

export interface CpuCoreUsage {
  id: string
  percent: number
}

export interface ProcessUsage {
  cpu: number
  mem: number
  command: string
}

export interface NetworkMetrics {
  uploadSpeedBps: number
  downloadSpeedBps: number
  uploadTotalBytes: number
  downloadTotalBytes: number
}

export interface DiskIoMetrics {
  readSpeedBps: number
  writeSpeedBps: number
}

export interface ServerMetrics {
  platform: string
  hostname: string
  cpuPercent: number
  cpuCores: CpuCoreUsage[]
  memoryTotalBytes: number
  memoryUsedBytes: number
  memoryFreeBytes: number
  memoryCachedBytes: number
  memoryPercent: number
  loadAverage: [number, number, number]
  uptimeSeconds: number
  disks: DiskUsage[]
  network: NetworkMetrics
  diskIo: DiskIoMetrics
  processes: ProcessUsage[]
  osName: string
  osVersion: string
  timezone: string
  fsType: string
  collectedAt: string
  unsupported?: boolean
  message?: string
}

export interface ServerInfoSummary {
  hostname: string
  platform: string
  osName: string
  osVersion: string
  cpuCount: number
  memoryTotalBytes: number
  diskTotalBytes: number
  unsupported?: boolean
  message?: string
}
