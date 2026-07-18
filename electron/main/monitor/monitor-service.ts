import type { ServerInfoSummary, ServerMetrics } from '../../../src/shared/types/monitor'

import type { SshManager } from '../ssh/ssh-manager'

import {

  calcCpuPercent,

  getMetricsScript,

  getServerInfoScript,

  parseCpuLine,

  parseMetricsOutput,

  parseServerInfoOutput,

  type RawMetrics

} from './metrics-parser'



interface CpuState {

  sample: ReturnType<typeof parseCpuLine>

}



interface NetworkState {

  rxBytes: number

  txBytes: number

  collectedAt: number

}



interface DiskIoState {

  readSectors: number

  writeSectors: number

  collectedAt: number

}



const SECTOR_BYTES = 512



function emptyMetrics(partial: Partial<ServerMetrics> & Pick<ServerMetrics, 'collectedAt'>): ServerMetrics {

  return {

    platform: 'unknown',

    hostname: 'unknown',

    cpuPercent: 0,

    cpuCores: [],

    memoryTotalBytes: 0,

    memoryUsedBytes: 0,

    memoryFreeBytes: 0,

    memoryCachedBytes: 0,

    memoryPercent: 0,

    loadAverage: [0, 0, 0],

    uptimeSeconds: 0,

    disks: [],

    network: {

      uploadSpeedBps: 0,

      downloadSpeedBps: 0,

      uploadTotalBytes: 0,

      downloadTotalBytes: 0

    },

    diskIo: { readSpeedBps: 0, writeSpeedBps: 0 },

    processes: [],

    osName: '',

    osVersion: '',

    timezone: '',

    fsType: '',

    ...partial

  }

}



export class MonitorService {

  private readonly cpuStates = new Map<string, CpuState>()

  private readonly coreCpuStates = new Map<string, Map<string, CpuState>>()

  private readonly networkStates = new Map<string, NetworkState>()

  private readonly diskIoStates = new Map<string, DiskIoState>()



  constructor(private readonly sshManager: SshManager) {}



  clearState(connectionId: string): void {

    this.cpuStates.delete(connectionId)

    this.coreCpuStates.delete(connectionId)

    this.networkStates.delete(connectionId)

    this.diskIoStates.delete(connectionId)

  }



  async collect(connectionId: string): Promise<ServerMetrics> {

    const { stdout, code } = await this.sshManager.exec(connectionId, getMetricsScript())



    if (code !== 0 && !stdout.trim()) {

      return emptyMetrics({

        collectedAt: new Date().toISOString(),

        unsupported: true,

        message: '无法获取服务器指标'

      })

    }



    const raw = parseMetricsOutput(stdout)

    return this.toMetrics(connectionId, raw)

  }

  async collectServerInfo(connectionId: string): Promise<ServerInfoSummary> {
    const { stdout, code } = await this.sshManager.exec(connectionId, getServerInfoScript())

    if (code !== 0 && !stdout.trim()) {
      return {
        hostname: 'unknown',
        platform: 'unknown',
        osName: '',
        osVersion: '',
        cpuCount: 0,
        memoryTotalBytes: 0,
        diskTotalBytes: 0,
        unsupported: true,
        message: '无法获取服务器信息'
      }
    }

    return parseServerInfoOutput(stdout)
  }

  private calcCorePercents(connectionId: string, raw: RawMetrics): Array<{ id: string; percent: number }> {

    const coreStates = this.coreCpuStates.get(connectionId) ?? new Map<string, CpuState>()

    const cores: Array<{ id: string; percent: number }> = []



    for (const [coreId, line] of Object.entries(raw.cpuCoreLines)) {

      const current = parseCpuLine(line)

      if (!current) continue

      const prev = coreStates.get(coreId)?.sample ?? null

      const percent = calcCpuPercent(prev, current) ?? 0

      coreStates.set(coreId, { sample: current })

      cores.push({

        id: coreId.replace('cpu', ''),

        percent: Math.round(percent * 10) / 10

      })

    }



    cores.sort((a, b) => Number(a.id) - Number(b.id))

    this.coreCpuStates.set(connectionId, coreStates)

    return cores

  }



  private calcNetwork(raw: RawMetrics, connectionId: string): ServerMetrics['network'] {

    const rxTotal = raw.networkDevices.reduce((sum, d) => sum + d.rxBytes, 0)

    const txTotal = raw.networkDevices.reduce((sum, d) => sum + d.txBytes, 0)

    const now = Date.now()

    const prev = this.networkStates.get(connectionId)



    let downloadSpeedBps = 0

    let uploadSpeedBps = 0

    if (prev && now > prev.collectedAt) {

      const seconds = (now - prev.collectedAt) / 1000

      downloadSpeedBps = Math.max(0, (rxTotal - prev.rxBytes) / seconds)

      uploadSpeedBps = Math.max(0, (txTotal - prev.txBytes) / seconds)

    }



    this.networkStates.set(connectionId, { rxBytes: rxTotal, txBytes: txTotal, collectedAt: now })



    return {

      downloadSpeedBps,

      uploadSpeedBps,

      downloadTotalBytes: rxTotal,

      uploadTotalBytes: txTotal

    }

  }



  private calcDiskIo(raw: RawMetrics, connectionId: string): ServerMetrics['diskIo'] {

    if (!raw.diskIo) return { readSpeedBps: 0, writeSpeedBps: 0 }



    const now = Date.now()

    const prev = this.diskIoStates.get(connectionId)

    const readBytes = raw.diskIo.readSectors * SECTOR_BYTES

    const writeBytes = raw.diskIo.writeSectors * SECTOR_BYTES



    let readSpeedBps = 0

    let writeSpeedBps = 0

    if (prev && now > prev.collectedAt) {

      const seconds = (now - prev.collectedAt) / 1000

      readSpeedBps = Math.max(0, (readBytes - prev.readSectors * SECTOR_BYTES) / seconds)

      writeSpeedBps = Math.max(0, (writeBytes - prev.writeSectors * SECTOR_BYTES) / seconds)

    }



    this.diskIoStates.set(connectionId, {

      readSectors: raw.diskIo.readSectors,

      writeSectors: raw.diskIo.writeSectors,

      collectedAt: now

    })



    return { readSpeedBps, writeSpeedBps }

  }



  private toMetrics(connectionId: string, raw: RawMetrics): ServerMetrics {

    const collectedAt = new Date().toISOString()



    if (raw.unsupported) {

      return emptyMetrics({

        platform: raw.platform,

        hostname: raw.hostname,

        collectedAt,

        unsupported: true,

        message: '当前系统暂不支持监控（仅支持 Linux / macOS）'

      })

    }



    let cpuPercent = 0

    if (raw.cpuLine) {

      const current = parseCpuLine(raw.cpuLine)

      if (current) {

        const prev = this.cpuStates.get(connectionId)?.sample ?? null

        const percent = calcCpuPercent(prev, current)

        this.cpuStates.set(connectionId, { sample: current })

        cpuPercent = percent ?? 0

      }

    }



    const cpuCores = this.calcCorePercents(connectionId, raw)



    let memoryTotalBytes = 0

    let memoryUsedBytes = 0

    let memoryFreeBytes = 0

    let memoryCachedBytes = 0

    let memoryPercent = 0



    if (raw.memTotalKb && raw.memAvailKb !== undefined) {

      memoryTotalBytes = raw.memTotalKb * 1024

      const availBytes = raw.memAvailKb * 1024

      memoryUsedBytes = Math.max(0, memoryTotalBytes - availBytes)

      memoryFreeBytes = (raw.memFreeKb ?? 0) * 1024

      memoryCachedBytes = ((raw.memCachedKb ?? 0) + (raw.memBuffersKb ?? 0)) * 1024

      memoryPercent = memoryTotalBytes > 0 ? (memoryUsedBytes / memoryTotalBytes) * 100 : 0

    } else if (raw.memTotalBytes && raw.vmStatPages) {

      const pageSize = 4096

      const { free, active, inactive, wired } = raw.vmStatPages

      const usedPages = active + inactive + wired

      memoryTotalBytes = raw.memTotalBytes

      memoryUsedBytes = usedPages * pageSize

      memoryFreeBytes = free * pageSize

      memoryCachedBytes = inactive * pageSize

      memoryPercent = memoryTotalBytes > 0 ? (memoryUsedBytes / memoryTotalBytes) * 100 : 0

    }



    const disks = raw.disks.map((disk) => {

      const usePercent = disk.total > 0 ? (disk.used / disk.total) * 100 : 0

      return {

        mount: disk.mount,

        totalBytes: disk.total,

        usedBytes: disk.used,

        availableBytes: disk.available,

        usePercent

      }

    })



    const timezone = raw.timezone

      ? raw.tzOffset

        ? `${raw.tzOffset} ${raw.timezone}`

        : raw.timezone

      : raw.tzOffset ?? ''



    return {

      platform: raw.platform,

      hostname: raw.hostname,

      cpuPercent: Math.round(cpuPercent * 10) / 10,

      cpuCores,

      memoryTotalBytes,

      memoryUsedBytes,

      memoryFreeBytes,

      memoryCachedBytes,

      memoryPercent: Math.round(memoryPercent * 10) / 10,

      loadAverage: raw.loadAverage ?? [0, 0, 0],

      uptimeSeconds: raw.uptimeSeconds ?? 0,

      disks,

      network: this.calcNetwork(raw, connectionId),

      diskIo: this.calcDiskIo(raw, connectionId),

      processes: raw.processes,

      osName: raw.osName ?? (raw.platform === 'linux' ? 'Linux' : raw.platform),

      osVersion: raw.osVersion ?? '',

      timezone,

      fsType: raw.fsType ?? '',

      collectedAt

    }

  }

}


