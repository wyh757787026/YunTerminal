import { spawn, spawnSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { shell } from 'electron'
import type { RdpSettings } from '../../../src/shared/types/connection'
import type { RdpLaunchResult } from '../../../src/shared/types/rdp'
import type { ConnectionStore } from '../store/connection-store'

function normalizeCredentialTarget(address: string): string {
  const value = address.trim()
  if (!value) return ''
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end > 1 ? value.slice(1, end) : value
  }
  const colonCount = (value.match(/:/g) ?? []).length
  return colonCount <= 1 ? value.replace(/:\d+$/, '') : value
}

function formatRdpUsername(username: string, domain?: string): string {
  if (!domain?.trim()) return username
  if (username.includes('\\') || username.includes('@')) return username
  return `${domain.trim()}\\${username}`
}

function mapRenderQuality(quality: RdpSettings['renderQuality']): string {
  switch (quality) {
    case 'performance':
      return 'connection speed:i:1'
    case 'quality':
      return 'connection speed:i:7'
    case 'balanced':
    default:
      return 'connection speed:i:6'
  }
}

function buildRdpFileContent(
  host: string,
  port: number,
  username: string,
  rdp?: RdpSettings,
  hasPassword?: boolean
): string {
  const lines = [
    `full address:s:${host}:${port}`,
    `username:s:${username}`,
    'authentication level:i:2',
    'redirectprinters:i:0',
    'redirectcomports:i:0',
    'redirectsmartcards:i:0',
    mapRenderQuality(rdp?.renderQuality)
  ]

  if (rdp?.domain?.trim()) {
    lines.push(`domain:s:${rdp.domain.trim()}`)
  }

  const displayMode = rdp?.displayMode ?? 'followWindow'
  if (displayMode === 'fixed') {
    lines.push(`desktopwidth:i:${rdp?.desktopWidth ?? 1920}`)
    lines.push(`desktopheight:i:${rdp?.desktopHeight ?? 1080}`)
    lines.push('screen mode id:i:2')
  } else {
    lines.push('screen mode id:i:2')
    lines.push('dynamic resolution:i:1')
    lines.push('smart sizing:i:1')
  }

  const clipboard = rdp?.enableClipboard !== false
  lines.push(`redirectclipboard:i:${clipboard ? 1 : 0}`)

  if (hasPassword) {
    lines.push('prompt for credentials:i:0')
  } else {
    lines.push('prompt for credentials:i:1')
  }

  return lines.join('\r\n')
}

function setWindowsCredentials(target: string, username: string, password: string): void {
  spawnSync('cmdkey.exe', ['/generic:TERMSRV/' + target, '/user:' + username, '/pass:' + password], {
    stdio: 'ignore'
  })
}

function deleteWindowsCredentials(target: string): void {
  spawnSync('cmdkey.exe', ['/delete:TERMSRV/' + target], { stdio: 'ignore' })
}

function launchWindows(
  host: string,
  port: number,
  username: string,
  password: string | undefined,
  rdp?: RdpSettings
): RdpLaunchResult {
  try {
    const credentialTarget = normalizeCredentialTarget(`${host}:${port}`)
    const rdpUsername = formatRdpUsername(username, rdp?.domain)

    if (password) {
      deleteWindowsCredentials(credentialTarget)
      setWindowsCredentials(credentialTarget, rdpUsername, password)
    }

    const rdpPath = join(tmpdir(), `yunterminal-${Date.now()}.rdp`)
    const content = buildRdpFileContent(host, port, rdpUsername, rdp, Boolean(password))
    writeFileSync(rdpPath, content, 'utf-8')

    const child = spawn('mstsc.exe', [rdpPath], { detached: true, stdio: 'ignore' })
    child.unref()

    setTimeout(() => {
      try {
        unlinkSync(rdpPath)
      } catch {
        // temp file may still be in use
      }
    }, 60_000)

    return { success: true, message: '已启动远程桌面连接' }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : '启动 mstsc 失败'
    }
  }
}

function launchMac(
  host: string,
  port: number,
  username: string,
  rdp?: RdpSettings
): Promise<RdpLaunchResult> {
  const rdpUsername = formatRdpUsername(username, rdp?.domain)
  const address = encodeURIComponent(`${host}:${port}`)
  const user = encodeURIComponent(rdpUsername)
  const url = `rdp://full%20address=s:${address}&username=s:${user}`
  return shell.openExternal(url).then(
    () => ({ success: true, message: '已打开系统远程桌面' }),
    (err: Error) => ({ success: false, message: err.message })
  )
}

function findRdpClient(): string | null {
  for (const client of ['xfreerdp', 'xfreerdp3', 'freerdp']) {
    try {
      spawnSync('which', [client], { stdio: 'ignore' })
      return client
    } catch {
      continue
    }
  }
  return null
}

function launchLinux(
  host: string,
  port: number,
  username: string,
  password: string | undefined,
  rdp?: RdpSettings
): RdpLaunchResult {
  const bin = findRdpClient()

  if (!bin) {
    return {
      success: false,
      message: '未找到 xfreerdp，请安装：sudo apt install freerdp2-x11'
    }
  }

  try {
    const rdpUsername = formatRdpUsername(username, rdp?.domain)
    const args = [`/v:${host}:${port}`, `/u:${rdpUsername}`, '/cert:ignore']

    if (rdp?.domain?.trim() && !username.includes('\\')) {
      args.push(`/d:${rdp.domain.trim()}`)
    }
    if (password) args.push(`/p:${password}`)

    const displayMode = rdp?.displayMode ?? 'followWindow'
    if (displayMode === 'fixed') {
      args.push(`/w:${rdp?.desktopWidth ?? 1920}`)
      args.push(`/h:${rdp?.desktopHeight ?? 1080}`)
    } else {
      args.push('/dynamic-resolution')
    }

    if (rdp?.enableClipboard !== false) {
      args.push('+clipboard')
    } else {
      args.push('-clipboard')
    }

    switch (rdp?.renderQuality) {
      case 'performance':
        args.push('/network:auto', '/compression')
        break
      case 'quality':
        args.push('/network:lan', '/bpp:32')
        break
      case 'balanced':
      default:
        args.push('/network:auto')
        break
    }

    const child = spawn(bin, args, { detached: true, stdio: 'ignore' })
    child.unref()
    return { success: true, message: `已启动 ${bin}` }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : '启动 xfreerdp 失败'
    }
  }
}

export async function launchRdp(
  store: ConnectionStore,
  connectionId: string
): Promise<RdpLaunchResult> {
  const connection = store.getConnection(connectionId)
  if (!connection) {
    return { success: false, message: '连接配置不存在' }
  }
  if (connection.protocol !== 'rdp') {
    return { success: false, message: '该连接不是 RDP 类型' }
  }

  const secrets = store.getConnectionSecrets(connectionId)
  store.recordRecent(connectionId)

  if (process.platform === 'win32') {
    return launchWindows(
      connection.host,
      connection.port,
      connection.username,
      secrets.password,
      connection.rdp
    )
  }
  if (process.platform === 'darwin') {
    return launchMac(connection.host, connection.port, connection.username, connection.rdp)
  }
  return launchLinux(
    connection.host,
    connection.port,
    connection.username,
    secrets.password,
    connection.rdp
  )
}
