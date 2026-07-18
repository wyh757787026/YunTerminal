import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  opendirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { basename, dirname, join, resolve, sep } from 'path'
import type { FileEntry } from '../../../src/shared/types/sftp'

function formatPermissions(mode: number): string {
  const types = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  const owner = types[(mode >> 6) & 7]
  const group = types[(mode >> 3) & 7]
  const other = types[mode & 7]
  const prefix = (mode & 0o40000) !== 0 ? 'd' : '-'
  return `${prefix}${owner}${group}${other}`
}

function toAccessErrorMessage(err: unknown, path: string): string {
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
  if (code === 'EPERM' || code === 'EACCES') {
    return `无权访问：${path}`
  }
  if (code === 'EBUSY') {
    return `资源正忙或被锁定：${path}`
  }
  if (code === 'ENOENT') {
    return `路径不存在：${path}`
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return `无法读取目录：${path}`
}

function toEntry(fullPath: string, name: string, isDirectoryHint?: boolean): FileEntry | null {
  try {
    const stat = statSync(fullPath)
    return {
      name,
      path: fullPath,
      isDirectory: stat.isDirectory(),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      permissions: formatPermissions(stat.mode),
      mode: stat.mode & 0o777
    }
  } catch {
    // Locked files (EBUSY etc.): show using Dirent hint when available
    if (isDirectoryHint === undefined) return null
    if (isDirectoryHint) return null // inaccessible dirs are skipped via canListDir
    return {
      name,
      path: fullPath,
      isDirectory: false,
      size: 0,
      modifiedAt: new Date(0).toISOString(),
      permissions: '----------',
      mode: 0
    }
  }
}

function canListDir(dirPath: string): boolean {
  try {
    accessSync(dirPath, constants.R_OK)
    const handle = opendirSync(dirPath)
    handle.closeSync()
    return true
  } catch {
    return false
  }
}

function isWindowsComputerRoot(dirPath: string): boolean {
  const trimmed = dirPath.trim()
  return trimmed === '' || trimmed === '/' || trimmed === '\\'
}

function isWindowsDriveRoot(dirPath: string): boolean {
  return /^[A-Za-z]:[\\/]?$/.test(dirPath.trim())
}

export class LocalFs {
  getHomeDir(): string {
    return homedir()
  }

  listWindowsDrives(): FileEntry[] {
    const drives: FileEntry[] = []
    for (let code = 65; code <= 90; code += 1) {
      const letter = String.fromCharCode(code)
      const root = `${letter}:${sep}`
      try {
        if (!existsSync(root)) continue
        if (!canListDir(root)) continue
        drives.push({
          name: `${letter}:`,
          path: root,
          isDirectory: true,
          size: 0,
          modifiedAt: new Date().toISOString(),
          permissions: 'drwxrwxrwx',
          mode: 0o755
        })
      } catch {
        // Skip inaccessible drive letters
      }
    }
    return drives
  }

  listDir(dirPath: string): FileEntry[] {
    if (process.platform === 'win32' && isWindowsComputerRoot(dirPath)) {
      return this.listWindowsDrives()
    }

    const resolved =
      process.platform === 'win32' && isWindowsDriveRoot(dirPath)
        ? `${dirPath.trim().charAt(0).toUpperCase()}:${sep}`
        : resolve(dirPath)

    if (!existsSync(resolved)) {
      throw new Error(`路径不存在：${resolved}`)
    }

    let entries: Array<{ name: string; isDirectory: () => boolean }>
    try {
      entries = readdirSync(resolved, { withFileTypes: true })
    } catch (err) {
      throw new Error(toAccessErrorMessage(err, resolved))
    }

    const result: FileEntry[] = []

    for (const entry of entries) {
      const fullPath = join(resolved, entry.name)

      // Skip protected system folders (Config.Msi, System Volume Information, ...)
      if (entry.isDirectory() && !canListDir(fullPath)) {
        continue
      }

      const mapped = toEntry(fullPath, entry.name, entry.isDirectory())
      if (mapped) result.push(mapped)
    }

    return result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  readFile(filePath: string): string {
    return readFileSync(resolve(filePath), 'utf-8')
  }

  readFileBuffer(filePath: string): Buffer {
    return readFileSync(resolve(filePath))
  }

  writeFile(filePath: string, content: string): void {
    const resolved = resolve(filePath)
    const dir = dirname(resolved)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(resolved, content, 'utf-8')
  }

  mkdir(dirPath: string): void {
    mkdirSync(resolve(dirPath), { recursive: true })
  }

  deletePath(targetPath: string): void {
    const resolved = resolve(targetPath)
    const stat = statSync(resolved)
    if (stat.isDirectory()) {
      rmSync(resolved, { recursive: true, force: true })
    } else {
      unlinkSync(resolved)
    }
  }

  rename(oldPath: string, newPath: string): void {
    renameSync(resolve(oldPath), resolve(newPath))
  }

  getParentPath(filePath: string): string {
    if (process.platform === 'win32') {
      if (isWindowsComputerRoot(filePath)) return '/'
      if (isWindowsDriveRoot(filePath)) return '/'
    }
    return dirname(resolve(filePath))
  }

  joinPath(dir: string, name: string): string {
    if (process.platform === 'win32' && isWindowsComputerRoot(dir)) {
      const drive = name.replace(/[:\\/]+$/, '')
      return `${drive}:${sep}`
    }
    return join(resolve(dir), name)
  }

  getName(filePath: string): string {
    return basename(resolve(filePath))
  }
}
