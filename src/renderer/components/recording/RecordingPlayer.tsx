import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, X } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { RecordingFile } from '@shared/types/recording'
import '@xterm/xterm/css/xterm.css'

interface RecordingPlayerProps {
  recording: RecordingFile
  onClose: () => void
}

export function RecordingPlayer({ recording, onClose }: RecordingPlayerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const timersRef = useRef<number[]>([])

  const stopPlayback = useCallback((): void => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer)
    }
    timersRef.current = []
    setPlaying(false)
  }, [])

  useEffect(() => {
    return () => stopPlayback()
  }, [stopPlayback])

  const startPlayback = (): void => {
    if (!containerRef.current || playing) return
    stopPlayback()
    containerRef.current.innerHTML = ''

    const terminal = new Terminal({
      cols: recording.meta.cols,
      rows: recording.meta.rows,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      disableStdin: true,
      cursorBlink: false
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    fitAddon.fit()
    terminal.reset()

    setPlaying(true)
    const durationMs = recording.meta.durationMs ?? recording.events.at(-1)?.offsetMs ?? 0

    for (const event of recording.events) {
      const timer = window.setTimeout(() => {
        if (event.dir === 'out' || event.dir === 'in') {
          terminal.write(event.data)
        }
        setProgress(durationMs > 0 ? (event.offsetMs / durationMs) * 100 : 0)
      }, event.offsetMs)
      timersRef.current.push(timer)
    }

    const endTimer = window.setTimeout(() => {
      setPlaying(false)
      setProgress(100)
    }, durationMs + 100)
    timersRef.current.push(endTimer)
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="panel flex h-[80vh] w-full max-w-4xl flex-col border shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">{recording.meta.title}</h2>
            <p className="text-[11px] text-accent-muted">
              {new Date(recording.meta.startedAt).toLocaleString()} ·{' '}
              {recording.meta.sessionType.toUpperCase()} · {recording.events.length} 事件
            </p>
          </div>
          <button className="btn-icon h-7 w-7" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-terminal-bg p-2">
          <div ref={containerRef} className="h-full w-full" />
        </div>

        <div className="border-t border-surface-border px-4 py-3">
          <div className="mb-2 h-1.5 rounded-full bg-surface-border">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={stopPlayback}>
              停止
            </button>
            <button
              className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
              onClick={startPlayback}
              disabled={playing}
            >
              <Play size={12} />
              {playing ? '播放中…' : '播放'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
