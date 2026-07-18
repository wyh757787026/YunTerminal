import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  RecordingDirection,
  RecordingEvent,
  RecordingFile,
  RecordingMeta,
  RecordingStartParams
} from '../../../src/shared/types/recording'

interface ActiveRecording {
  meta: RecordingMeta
  startedAtMs: number
  events: RecordingEvent[]
}

interface RecordingHeader {
  type: 'header'
  meta: RecordingMeta
}

interface RecordingEventLine {
  type: 'event'
  offsetMs: number
  dir: RecordingDirection
  data: string
}

interface RecordingFooter {
  type: 'footer'
  endedAt: string
  durationMs: number
}

export class RecordingManager {
  private readonly recordingsDir: string
  private readonly active = new Map<string, ActiveRecording>()

  constructor(userDataPath: string) {
    this.recordingsDir = join(userDataPath, 'recordings')
    if (!existsSync(this.recordingsDir)) {
      mkdirSync(this.recordingsDir, { recursive: true })
    }
  }

  isRecording(sessionId: string): boolean {
    return this.active.has(sessionId)
  }

  listActiveSessionIds(): string[] {
    return [...this.active.keys()]
  }

  start(params: RecordingStartParams): RecordingMeta {
    if (this.active.has(params.sessionId)) {
      throw new Error('该会话已在录制中')
    }

    const id = randomUUID()
    const startedAt = new Date().toISOString()
    const filePath = join(this.recordingsDir, `${id}.yrec`)

    const meta: RecordingMeta = {
      id,
      title: params.title,
      sessionType: params.sessionType,
      connectionId: params.connectionId,
      connectionName: params.connectionName,
      cols: params.cols,
      rows: params.rows,
      startedAt,
      filePath
    }

    this.active.set(params.sessionId, {
      meta,
      startedAtMs: Date.now(),
      events: []
    })

    return meta
  }

  append(sessionId: string, dir: RecordingDirection, data: string): void {
    const recording = this.active.get(sessionId)
    if (!recording || !data) return

    recording.events.push({
      offsetMs: Date.now() - recording.startedAtMs,
      dir,
      data
    })
  }

  stop(sessionId: string): RecordingMeta | null {
    const recording = this.active.get(sessionId)
    if (!recording) return null

    const endedAt = new Date().toISOString()
    const durationMs = Date.now() - recording.startedAtMs
    const meta: RecordingMeta = {
      ...recording.meta,
      endedAt,
      durationMs
    }

    const lines: string[] = [
      JSON.stringify({ type: 'header', meta } satisfies RecordingHeader),
      ...recording.events.map((event) =>
        JSON.stringify({
          type: 'event',
          offsetMs: event.offsetMs,
          dir: event.dir,
          data: event.data
        } satisfies RecordingEventLine)
      ),
      JSON.stringify({ type: 'footer', endedAt, durationMs } satisfies RecordingFooter)
    ]

    writeFileSync(meta.filePath, lines.join('\n'), 'utf-8')
    this.active.delete(sessionId)
    return meta
  }

  stopAll(): void {
    for (const sessionId of [...this.active.keys()]) {
      this.stop(sessionId)
    }
  }

  list(): RecordingMeta[] {
    const files = readdirSync(this.recordingsDir).filter((f) => f.endsWith('.yrec'))
    const metas: RecordingMeta[] = []

    for (const file of files) {
      const filePath = join(this.recordingsDir, file)
      try {
        const firstLine = readFileSync(filePath, 'utf-8').split('\n')[0]
        const parsed = JSON.parse(firstLine) as RecordingHeader
        if (parsed.type === 'header') {
          metas.push({ ...parsed.meta, filePath })
        }
      } catch {
        // skip invalid files
      }
    }

    return metas.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
  }

  read(id: string): RecordingFile | null {
    const filePath = join(this.recordingsDir, `${id}.yrec`)
    if (!existsSync(filePath)) return null

    const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
    let meta: RecordingMeta | null = null
    const events: RecordingEvent[] = []

    for (const line of lines) {
      const parsed = JSON.parse(line) as RecordingHeader | RecordingEventLine | RecordingFooter
      if (parsed.type === 'header') {
        const header = parsed as RecordingHeader
        meta = { ...header.meta, filePath }
      } else if (parsed.type === 'event') {
        const event = parsed as RecordingEventLine
        events.push({
          offsetMs: event.offsetMs,
          dir: event.dir,
          data: event.data
        })
      } else if (parsed.type === 'footer' && meta !== null) {
        const footer = parsed as RecordingFooter
        meta.endedAt = footer.endedAt
        meta.durationMs = footer.durationMs
      }
    }

    if (!meta) return null
    return { meta, events }
  }

  delete(id: string): boolean {
    const filePath = join(this.recordingsDir, `${id}.yrec`)
    if (!existsSync(filePath)) return false
    unlinkSync(filePath)
    return true
  }
}
