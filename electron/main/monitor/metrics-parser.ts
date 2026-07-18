import type { ServerInfoSummary } from '../../../src/shared/types/monitor'

const METRICS_SCRIPT = `
echo "HOST:$(hostname 2>/dev/null || echo unknown)"
if [ -f /proc/stat ] && [ -f /proc/meminfo ]; then
  grep '^cpu ' /proc/stat | head -1
  grep -E '^cpu[0-9]+' /proc/stat
  awk '/MemTotal:|MemAvailable:|MemFree:|Cached:|Buffers:/ {print}' /proc/meminfo
  awk '{print "LOAD:" $1 "," $2 "," $3}' /proc/loadavg
  awk '{print "UPTIME:" int($1)}' /proc/uptime
  df -P -B1 2>/dev/null | awk 'NR>1 && $1 !~ /tmpfs|devtmpfs|overlay/ {print "DISK:" $6 "|" $2 "|" $3 "|" $4}'
  df -T -P / 2>/dev/null | awk 'NR==2 {print "FSTYPE:" $7}'
  awk 'NR>2 && $1 !~ /lo:/ {gsub(/:/,"",$1); print "NET:" $1 "|" $2 "|" $10}' /proc/net/dev
  awk '$3 == "0" && ($4 ~ /^(sd|vd|nvme|xvd)/) {print "DISKIO:" $4 "|" $6 "|" $10; exit}' /proc/diskstats
  ps -eo pcpu,pmem,comm --no-headers --sort=-pcpu 2>/dev/null | head -5 | while read -r a b c; do echo "PROC:\${a}|\${b}|\${c}"; done
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "OSNAME:\${NAME:-Linux}"
    echo "OSVER:\${PRETTY_NAME:-\$VERSION_ID}"
  fi
  timedatectl show -p Timezone --value 2>/dev/null | awk '{print "TZ:" $0}'
  date +%z 2>/dev/null | awk '{print "TZOFF:" $1}'
  echo "PLATFORM:linux"
elif [ "$(uname -s)" = "Darwin" ]; then
  sysctl -n hw.memsize 2>/dev/null | awk '{print "MEMTOTAL:" $1}'
  vm_stat 2>/dev/null | awk '/Pages free:|Pages active:|Pages inactive:|Pages wired/ {print "VMSTAT:" $0}'
  sysctl -n vm.loadavg 2>/dev/null | tr -d '{}' | awk '{print "LOAD:" $2 "," $3 "," $4}'
  uptime 2>/dev/null | awk -F'up ' '{print "UPTIME:" $2}' | awk '{print "UPTIME:" int($1)}'
  df -k 2>/dev/null | awk 'NR>1 && $1 !~ /devfs/ {print "DISK:" $9 "|" $2*1024 "|" $3*1024 "|" $4*1024}'
  echo "PLATFORM:darwin"
else
  echo "UNSUPPORTED"
fi
`.trim()

export function getMetricsScript(): string {
  return METRICS_SCRIPT
}

const SERVER_INFO_SCRIPT = `
echo "HOST:$(hostname 2>/dev/null || echo unknown)"
if [ -f /proc/meminfo ]; then
  nproc 2>/dev/null | awk '{print "CPUS:" $1}'
  awk '/MemTotal:/ {print "MemTotal: " $2 " " $3}' /proc/meminfo
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "OSNAME:\${NAME:-Linux}"
    echo "OSVER:\${PRETTY_NAME:-\$VERSION_ID}"
  fi
  df -P -B1 / 2>/dev/null | awk 'NR==2 {print "DISKTOTAL:" $2}'
  echo "PLATFORM:linux"
elif [ "$(uname -s)" = "Darwin" ]; then
  sysctl -n hw.ncpu 2>/dev/null | awk '{print "CPUS:" $1}'
  sysctl -n hw.memsize 2>/dev/null | awk '{print "MEMTOTAL:" $1}'
  sw_vers -productName 2>/dev/null | awk '{print "OSNAME:" $0}'
  sw_vers -productVersion 2>/dev/null | awk '{print "OSVER:macOS " $0}'
  df -k / 2>/dev/null | awk 'NR==2 {print "DISKTOTAL:" $2 * 1024}'
  echo "PLATFORM:darwin"
else
  echo "UNSUPPORTED"
fi
`.trim()

export function getServerInfoScript(): string {
  return SERVER_INFO_SCRIPT
}

export function parseServerInfoOutput(stdout: string): ServerInfoSummary {
  let hostname = 'unknown'
  let platform = 'unknown'
  let osName = ''
  let osVersion = ''
  let cpuCount = 0
  let memoryTotalBytes = 0
  let diskTotalBytes = 0
  let unsupported = false

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('HOST:')) {
      hostname = trimmed.slice(5)
      continue
    }
    if (trimmed.startsWith('PLATFORM:')) {
      platform = trimmed.slice(9)
      continue
    }
    if (trimmed === 'UNSUPPORTED') {
      unsupported = true
      continue
    }
    if (trimmed.startsWith('CPUS:')) {
      cpuCount = Number(trimmed.slice(5)) || 0
      continue
    }
    if (trimmed.startsWith('MemTotal:')) {
      const kb = Number(trimmed.split(/\s+/)[1])
      if (!Number.isNaN(kb)) memoryTotalBytes = kb * 1024
      continue
    }
    if (trimmed.startsWith('MEMTOTAL:')) {
      memoryTotalBytes = Number(trimmed.slice(9)) || 0
      continue
    }
    if (trimmed.startsWith('OSNAME:')) {
      osName = trimmed.slice(7)
      continue
    }
    if (trimmed.startsWith('OSVER:')) {
      osVersion = trimmed.slice(6)
      continue
    }
    if (trimmed.startsWith('DISKTOTAL:')) {
      diskTotalBytes = Number(trimmed.slice(10)) || 0
      continue
    }
  }

  if (unsupported) {
    return {
      hostname,
      platform,
      osName,
      osVersion,
      cpuCount,
      memoryTotalBytes,
      diskTotalBytes,
      unsupported: true,
      message: '当前系统暂不支持获取服务器信息'
    }
  }

  return {
    hostname,
    platform,
    osName,
    osVersion,
    cpuCount,
    memoryTotalBytes,
    diskTotalBytes
  }
}

interface CpuSample {
  total: number
  idle: number
}

export function parseCpuLine(line: string): CpuSample | null {
  const parts = line.trim().split(/\s+/)
  if (parts.length < 5 || !parts[0]?.startsWith('cpu')) return null
  const values = parts.slice(1).map((v) => Number(v))
  if (values.some((v) => Number.isNaN(v))) return null
  const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0] = values
  const idleTotal = idle + iowait
  const total = user + nice + system + idleTotal + irq + softirq
  return { total, idle: idleTotal }
}

export function calcCpuPercent(prev: CpuSample | null, current: CpuSample): number | null {
  if (!prev) return null
  const totalDelta = current.total - prev.total
  const idleDelta = current.idle - prev.idle
  if (totalDelta <= 0) return 0
  return Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100))
}

export interface RawMetrics {
  platform: string
  hostname: string
  cpuLine?: string
  cpuCoreLines: Record<string, string>
  memTotalKb?: number
  memAvailKb?: number
  memFreeKb?: number
  memCachedKb?: number
  memBuffersKb?: number
  memTotalBytes?: number
  vmStatPages?: { free: number; active: number; inactive: number; wired: number }
  loadAverage?: [number, number, number]
  uptimeSeconds?: number
  disks: Array<{ mount: string; total: number; used: number; available: number }>
  networkDevices: Array<{ name: string; rxBytes: number; txBytes: number }>
  diskIo?: { device: string; readSectors: number; writeSectors: number }
  processes: Array<{ cpu: number; mem: number; command: string }>
  osName?: string
  osVersion?: string
  timezone?: string
  tzOffset?: string
  fsType?: string
  unsupported?: boolean
}

export function parseMetricsOutput(stdout: string): RawMetrics {
  const result: RawMetrics = {
    platform: 'unknown',
    hostname: 'unknown',
    cpuCoreLines: {},
    disks: [],
    networkDevices: [],
    processes: []
  }

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('HOST:')) {
      result.hostname = trimmed.slice(5)
      continue
    }
    if (trimmed.startsWith('PLATFORM:')) {
      result.platform = trimmed.slice(9)
      continue
    }
    if (trimmed === 'UNSUPPORTED') {
      result.unsupported = true
      continue
    }
    if (/^cpu[0-9]+ /.test(trimmed)) {
      const id = trimmed.split(/\s+/)[0] ?? ''
      result.cpuCoreLines[id] = trimmed
      continue
    }
    if (trimmed.startsWith('cpu ')) {
      result.cpuLine = trimmed
      continue
    }
    if (trimmed.startsWith('MemTotal:')) {
      result.memTotalKb = Number(trimmed.split(/\s+/)[1])
      continue
    }
    if (trimmed.startsWith('MemAvailable:')) {
      result.memAvailKb = Number(trimmed.split(/\s+/)[1])
      continue
    }
    if (trimmed.startsWith('MemFree:')) {
      result.memFreeKb = Number(trimmed.split(/\s+/)[1])
      continue
    }
    if (trimmed.startsWith('Cached:')) {
      result.memCachedKb = Number(trimmed.split(/\s+/)[1])
      continue
    }
    if (trimmed.startsWith('Buffers:')) {
      result.memBuffersKb = Number(trimmed.split(/\s+/)[1])
      continue
    }
    if (trimmed.startsWith('MEMTOTAL:')) {
      result.memTotalBytes = Number(trimmed.slice(9))
      continue
    }
    if (trimmed.startsWith('VMSTAT:')) {
      const content = trimmed.slice(7)
      if (!result.vmStatPages) {
        result.vmStatPages = { free: 0, active: 0, inactive: 0, wired: 0 }
      }
      const match = content.match(/Pages\s+(\w+):\s+(\d+)/)
      if (match) {
        const key = match[1].toLowerCase()
        const value = Number(match[2])
        if (key === 'free') result.vmStatPages.free = value
        if (key === 'active') result.vmStatPages.active = value
        if (key === 'inactive') result.vmStatPages.inactive = value
        if (key === 'wired') result.vmStatPages.wired = value
      }
      continue
    }
    if (trimmed.startsWith('LOAD:')) {
      const parts = trimmed.slice(5).split(',').map(Number)
      if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
        result.loadAverage = [parts[0], parts[1], parts[2]]
      }
      continue
    }
    if (trimmed.startsWith('UPTIME:')) {
      const value = trimmed.slice(7).replace(/[^0-9]/g, '')
      result.uptimeSeconds = Number(value) || 0
      continue
    }
    if (trimmed.startsWith('DISK:')) {
      const parts = trimmed.slice(5).split('|')
      if (parts.length === 4) {
        const total = Number(parts[1])
        const used = Number(parts[2])
        const available = Number(parts[3])
        if ([total, used, available].every((n) => !Number.isNaN(n))) {
          result.disks.push({ mount: parts[0], total, used, available })
        }
      }
      continue
    }
    if (trimmed.startsWith('FSTYPE:')) {
      result.fsType = trimmed.slice(7)
      continue
    }
    if (trimmed.startsWith('NET:')) {
      const parts = trimmed.slice(4).split('|')
      if (parts.length === 3) {
        const rxBytes = Number(parts[1])
        const txBytes = Number(parts[2])
        if (!Number.isNaN(rxBytes) && !Number.isNaN(txBytes)) {
          result.networkDevices.push({ name: parts[0], rxBytes, txBytes })
        }
      }
      continue
    }
    if (trimmed.startsWith('DISKIO:')) {
      const parts = trimmed.slice(7).split('|')
      if (parts.length === 3) {
        const readSectors = Number(parts[1])
        const writeSectors = Number(parts[2])
        if (!Number.isNaN(readSectors) && !Number.isNaN(writeSectors)) {
          result.diskIo = { device: parts[0], readSectors, writeSectors }
        }
      }
      continue
    }
    if (trimmed.startsWith('PROC:')) {
      const parts = trimmed.slice(5).split('|')
      if (parts.length === 3) {
        const cpu = Number(parts[0])
        const mem = Number(parts[1])
        if (!Number.isNaN(cpu) && !Number.isNaN(mem)) {
          result.processes.push({ cpu, mem, command: parts[2] })
        }
      }
      continue
    }
    if (trimmed.startsWith('OSNAME:')) {
      result.osName = trimmed.slice(7)
      continue
    }
    if (trimmed.startsWith('OSVER:')) {
      result.osVersion = trimmed.slice(6)
      continue
    }
    if (trimmed.startsWith('TZ:')) {
      result.timezone = trimmed.slice(3)
      continue
    }
    if (trimmed.startsWith('TZOFF:')) {
      result.tzOffset = trimmed.slice(6)
      continue
    }
  }

  return result
}
