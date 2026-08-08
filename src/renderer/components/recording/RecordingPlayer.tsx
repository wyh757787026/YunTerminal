import { useEffect, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import type { RecordingFileUrl } from '@shared/types/recording'
import { formatClockTime, formatDuration } from '@renderer/lib/format-utils'

interface RecordingPlayerProps {
  recording: RecordingFileUrl
  onClose: () => void
}

export function RecordingPlayer({ recording, onClose }: RecordingPlayerProps): React.JSX.Element {
  const { meta, url } = recording
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentSec, setCurrentSec] = useState(0)

  const totalSec = Math.max(0, Math.floor((meta.durationMs ?? 0) / 1000))
  const durationLabel = totalSec > 0 ? formatDuration(totalSec) : '—'

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = (): void => {
      setCurrentSec(video.currentTime)
    }
    const onPlay = (): void => setPlaying(true)
    const onPause = (): void => setPlaying(false)
    const onEnded = (): void => {
      setPlaying(false)
      if (totalSec > 0) setCurrentSec(totalSec)
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)

    video.load()
    void video.play().catch(() => {
      // 自动播放可能被拦截
    })

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [url, totalSec])

  const togglePlay = (): void => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  }

  const seekTo = (sec: number): void => {
    const video = videoRef.current
    if (!video) return
    const next = Math.min(Math.max(0, sec), totalSec > 0 ? totalSec : sec)
    video.currentTime = next
    setCurrentSec(next)
  }

  const progressMax = totalSec > 0 ? totalSec : Math.max(currentSec, 1)
  const progressValue = Math.min(currentSec, progressMax)

  return (
    <div className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center">
      <div className="panel flex h-[80vh] w-full max-w-4xl flex-col border shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">{meta.title}</h2>
            <p className="text-[11px] text-accent-muted">
              {new Date(meta.startedAt).toLocaleString()} · {durationLabel} · 窗口录制
            </p>
          </div>
          <button type="button" className="btn-icon h-7 w-7" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-black">
          <div
            className="flex min-h-0 flex-1 cursor-pointer items-center justify-center"
            onClick={togglePlay}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault()
                togglePlay()
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={playing ? '暂停' : '播放'}
          >
            <video
              key={url}
              ref={videoRef}
              className="max-h-full max-w-full"
              src={url}
              playsInline
              preload="auto"
            />
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-white/10 bg-black/90 px-3 py-2">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded text-white hover:bg-white/10"
              onClick={togglePlay}
              title={playing ? '暂停' : '播放'}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>

            <span className="min-w-[3.5rem] font-mono text-[11px] tabular-nums text-white/90">
              {formatClockTime(currentSec)}
            </span>

            <input
              type="range"
              className="h-1 flex-1 cursor-pointer accent-accent"
              min={0}
              max={progressMax}
              step={0.1}
              value={progressValue}
              onChange={(e) => seekTo(Number(e.target.value))}
            />

            <span className="min-w-[3.5rem] text-right font-mono text-[11px] tabular-nums text-white/90">
              {formatClockTime(totalSec)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
