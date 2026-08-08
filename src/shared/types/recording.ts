export interface RecordingMeta {
  id: string
  title: string
  startedAt: string
  endedAt?: string
  durationMs?: number
  filePath: string
  mimeType: string
  fileSize?: number
}

export interface RecordingSaveParams {
  title: string
  startedAt: string
  durationMs: number
  mimeType: string
  /** MP4/WebM 二进制内容 */
  data: ArrayBuffer
}

export interface RecordingFileUrl {
  meta: RecordingMeta
  /** 可供 <video> 使用的本地协议 URL */
  url: string
}

export interface RecordingDirInfo {
  /** 当前实际使用的保存目录 */
  currentDir: string
  /** 应用默认目录（未自定义时使用） */
  defaultDir: string
  /** 是否正在使用自定义目录 */
  isCustom: boolean
}
