import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { basename, dirname, join, resolve } from 'path'
import type { FileEntry } from '../../../src/shared/types/sftp'

function formatPermissions(mode: number): string {
  const types = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  const owner = types[(mode >> 6) & 7]
  const group = types[(mode >> 3) & 7]
  const other = types[mode & 7]
  const prefix = (mode & 0o40000) !== 0 ? 'd' : '-'
  return `${prefix}${owner}${group}${other}`
}

function toEntry(fullPath: string, name: string): FileEntry {
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
}

export class LocalFs {
  getHomeDir(): string {
    return homedir()
  }

  listDir(dirPath: string): FileEntry[] {
    const resolved = resolve(dirPath)
    if (!existsSync(resolved)) {
      throw new Error('路径不存在')
    }

    const entries = readdirSync(resolved, { withFileTypes: true })
    return entries
      .map((entry) => toEntry(join(resolved, entry.name), entry.name))
      .sort((a, b) => {
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
    return dirname(resolve(filePath))
  }

  joinPath(dir: string, name: string): string {
    return join(resolve(dir), name)
  }

  getName(filePath: string): string {
    return basename(resolve(filePath))
  }
}
