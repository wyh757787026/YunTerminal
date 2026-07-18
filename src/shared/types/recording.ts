export type RecordingDirection = 'in' | 'out'
export type RecordingSessionType = 'ssh' | 'local' | 'telnet'

export interface RecordingMeta {
  id: string
  title: string
  sessionType: RecordingSessionType
  connectionId?: string
  connectionName?: string
  cols: number
  rows: number
  startedAt: string
  endedAt?: string
  durationMs?: number
  filePath: string
}

export interface RecordingStartParams {
  sessionId: string
  title: string
  sessionType: RecordingSessionType
  connectionId?: string
  connectionName?: string
  cols: number
  rows: number
}

export interface RecordingEvent {
  offsetMs: number
  dir: RecordingDirection
  data: string
}

export interface RecordingFile {
  meta: RecordingMeta
  events: RecordingEvent[]
}
