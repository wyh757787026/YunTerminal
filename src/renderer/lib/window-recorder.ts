/** Electron desktop capture 约束（Chromium 扩展字段） */
interface ElectronDesktopVideoConstraint {
  mandatory: {
    chromeMediaSource: 'desktop'
    chromeMediaSourceId: string
    minWidth?: number
    maxWidth?: number
    minHeight?: number
    maxHeight?: number
  }
}

export interface WindowRecorderSession {
  mimeType: string
  startedAt: string
  startedAtMs: number
  stop: () => Promise<{
    data: ArrayBuffer
    mimeType: string
    durationMs: number
    startedAt: string
  }>
}

function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

export async function startWindowRecorder(sourceId: string): Promise<WindowRecorderSession> {
  const mimeType = pickMimeType()
  if (!mimeType) {
    throw new Error('当前环境不支持视频录制')
  }

  const videoConstraint: ElectronDesktopVideoConstraint = {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
      minWidth: 640,
      maxWidth: 3840,
      minHeight: 360,
      maxHeight: 2160
    }
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: videoConstraint as unknown as MediaTrackConstraints
  })

  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000
  })

  recorder.ondataavailable = (event): void => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()
  recorder.start(1000)

  return {
    mimeType,
    startedAt,
    startedAtMs,
    stop: () =>
      new Promise((resolve, reject) => {
        const finish = async (): Promise<void> => {
          try {
            for (const track of stream.getTracks()) track.stop()
            const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
            const data = await blob.arrayBuffer()
            resolve({
              data,
              mimeType: recorder.mimeType || mimeType,
              durationMs: Date.now() - startedAtMs,
              startedAt
            })
          } catch (err) {
            reject(err)
          }
        }

        recorder.onerror = () => {
          for (const track of stream.getTracks()) track.stop()
          reject(new Error('录制失败'))
        }

        if (recorder.state === 'inactive') {
          void finish()
          return
        }

        recorder.onstop = () => {
          void finish()
        }
        recorder.stop()
      })
  }
}
