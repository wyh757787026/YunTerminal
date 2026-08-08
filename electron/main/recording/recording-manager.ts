import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'fs'
import { isAbsolute, join } from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { createRequire } from 'module'
import { shell } from 'electron'
import type {
  RecordingDirInfo,
  RecordingMeta,
  RecordingSaveParams
} from '../../../src/shared/types/recording'

const require = createRequire(import.meta.url)

function resolveFfmpegPath(): string | null {
  try {
    const ffmpegStatic = require('ffmpeg-static') as string | null
    return ffmpegStatic
  } catch {
    return null
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  const ffmpegPath = resolveFfmpegPath()
  if (!ffmpegPath) {
    return Promise.reject(new Error('未找到 ffmpeg，无法处理视频'))
  }

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `ffmpeg 退出码 ${code}`))
    })
  })
}

function convertWebmToMp4(inputPath: string, outputPath: string): Promise<void> {
  return runFfmpeg([
    '-y',
    '-fflags',
    '+genpts',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-movflags',
    '+faststart',
    outputPath
  ])
}

/** 对已是 MP4 的录制做 remux，补齐时长/索引，避免播放器时长从短变长 */
function remuxMp4(inputPath: string, outputPath: string): Promise<void> {
  return runFfmpeg([
    '-y',
    '-fflags',
    '+genpts',
    '-i',
    inputPath,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    outputPath
  ])
}

export class RecordingManager {
  private readonly defaultDir: string
  private readonly getCustomDir: () => string

  constructor(userDataPath: string, getCustomDir: () => string = () => '') {
    this.defaultDir = join(userDataPath, 'recordings')
    this.getCustomDir = getCustomDir
    this.ensureDir()
  }

  getDirInfo(): RecordingDirInfo {
    const custom = this.getCustomDir().trim()
    const isCustom = Boolean(custom && isAbsolute(custom))
    return {
      currentDir: this.resolveDir(),
      defaultDir: this.defaultDir,
      isCustom
    }
  }

  async save(params: RecordingSaveParams): Promise<RecordingMeta> {
    const recordingsDir = this.ensureDir()
    const id = randomUUID()
    const endedAt = new Date().toISOString()
    const isMp4 =
      params.mimeType.includes('mp4') ||
      params.mimeType.includes('avc1') ||
      params.mimeType.includes('h264')

    const buffer = Buffer.from(params.data)
    let filePath = join(recordingsDir, `${id}.mp4`)
    let mimeType = 'video/mp4'

    if (isMp4) {
      const tempMp4 = join(recordingsDir, `${id}.raw.mp4`)
      writeFileSync(tempMp4, buffer)
      try {
        await remuxMp4(tempMp4, filePath)
      } catch (err) {
        console.error('MP4 remux 失败，使用原始文件:', err)
        writeFileSync(filePath, buffer)
      } finally {
        if (existsSync(tempMp4)) {
          try {
            unlinkSync(tempMp4)
          } catch {
            // ignore
          }
        }
      }
    } else {
      const tempWebm = join(recordingsDir, `${id}.webm`)
      writeFileSync(tempWebm, buffer)
      try {
        await convertWebmToMp4(tempWebm, filePath)
      } catch (err) {
        // 转换失败时保留 webm，避免录制结果丢失
        filePath = tempWebm
        mimeType = params.mimeType || 'video/webm'
        console.error('MP4 转换失败，已保留原始视频:', err)
      } finally {
        if (filePath.endsWith('.mp4') && existsSync(tempWebm)) {
          try {
            unlinkSync(tempWebm)
          } catch {
            // ignore
          }
        }
      }
    }

    const meta: RecordingMeta = {
      id,
      title: params.title.trim() || '窗口录制',
      startedAt: params.startedAt,
      endedAt,
      durationMs: params.durationMs,
      filePath,
      mimeType,
      fileSize: existsSync(filePath) ? statSync(filePath).size : buffer.byteLength
    }

    writeFileSync(this.metaPath(id), JSON.stringify(meta, null, 2), 'utf-8')
    return meta
  }

  list(): RecordingMeta[] {
    const recordingsDir = this.ensureDir()
    const files = readdirSync(recordingsDir).filter((f) => f.endsWith('.json'))
    const metas: RecordingMeta[] = []

    for (const file of files) {
      try {
        const meta = JSON.parse(readFileSync(join(recordingsDir, file), 'utf-8')) as RecordingMeta
        if (meta?.id && meta.filePath && existsSync(meta.filePath)) {
          metas.push({
            ...meta,
            fileSize: statSync(meta.filePath).size
          })
        }
      } catch {
        // skip invalid
      }
    }

    return metas.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
  }

  getFileUrl(id: string): { meta: RecordingMeta; url: string } | null {
    const meta = this.readMeta(id)
    if (!meta || !existsSync(meta.filePath)) return null
    // 每次打开带唯一 query，避免 Chromium 复用上次不完整的媒体缓存（时长卡住、无法再播）
    return {
      meta: { ...meta, fileSize: statSync(meta.filePath).size },
      url: `ytrec://${id}?t=${Date.now()}`
    }
  }

  getFilePath(id: string): string | null {
    const meta = this.readMeta(id)
    if (!meta || !existsSync(meta.filePath)) return null
    return meta.filePath
  }

  async openDir(): Promise<boolean> {
    const dir = this.ensureDir()
    const error = await shell.openPath(dir)
    if (error) {
      console.error('打开录制目录失败:', error)
      return false
    }
    return true
  }

  delete(id: string): boolean {
    const meta = this.readMeta(id)
    const metaFile = this.metaPath(id)
    let removed = false

    if (meta?.filePath && existsSync(meta.filePath)) {
      unlinkSync(meta.filePath)
      removed = true
    }
    if (existsSync(metaFile)) {
      unlinkSync(metaFile)
      removed = true
    }
    return removed
  }

  private resolveDir(): string {
    const custom = this.getCustomDir().trim()
    if (custom && isAbsolute(custom)) return custom
    return this.defaultDir
  }

  private ensureDir(): string {
    const dir = this.resolveDir()
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  private metaPath(id: string): string {
    return join(this.ensureDir(), `${id}.json`)
  }

  private readMeta(id: string): RecordingMeta | null {
    const filePath = this.metaPath(id)
    if (!existsSync(filePath)) return null
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8')) as RecordingMeta
    } catch {
      return null
    }
  }
}
