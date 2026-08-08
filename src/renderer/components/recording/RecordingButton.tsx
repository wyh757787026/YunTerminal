import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Circle, Loader2 } from 'lucide-react'
import { startWindowRecorder, type WindowRecorderSession } from '@renderer/lib/window-recorder'

interface RecordingButtonProps {
  variant?: 'icon' | 'inline' | 'status'
  onStateChange?: (recording: boolean) => void
}

type SavePhase = 'stopping' | 'saving' | 'error'

interface SaveUiState {
  phase: SavePhase
  message?: string
}

let activeRecorder: WindowRecorderSession | null = null

/** 遮罩最短展示时间，避免保存过快时一闪而过 */
const SAVE_OVERLAY_MIN_MS = 900

function waitAtLeast(startedAt: number, minMs: number): Promise<void> {
  const remaining = minMs - (Date.now() - startedAt)
  if (remaining <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    window.setTimeout(resolve, remaining)
  })
}

function savePhaseLabel(phase: Exclude<SavePhase, 'error'>): string {
  switch (phase) {
    case 'stopping':
      return '正在停止录制…'
    case 'saving':
      return '正在保存…'
    default: {
      const _exhaustive: never = phase
      return _exhaustive
    }
  }
}

export function RecordingButton({
  variant = 'icon',
  onStateChange
}: RecordingButtonProps): React.JSX.Element {
  const [recording, setRecording] = useState(Boolean(activeRecorder))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveUi, setSaveUi] = useState<SaveUiState | null>(null)

  const setRecordingState = (next: boolean): void => {
    setRecording(next)
    onStateChange?.(next)
  }

  const dismissSaveUi = (): void => {
    setSaveUi(null)
    setBusy(false)
  }

  const toggleRecording = async (): Promise<void> => {
    if (busy || saveUi) return
    setBusy(true)
    setError(null)

    let inSaveFlow = false

    try {
      if (activeRecorder) {
        inSaveFlow = true
        const overlayStartedAt = Date.now()
        setSaveUi({ phase: 'stopping' })
        const result = await activeRecorder.stop()
        activeRecorder = null

        setSaveUi({ phase: 'saving' })
        await window.api.recording.save({
          title: `窗口录制 ${new Date(result.startedAt).toLocaleString()}`,
          startedAt: result.startedAt,
          durationMs: result.durationMs,
          mimeType: result.mimeType,
          data: result.data
        })
        await waitAtLeast(overlayStartedAt, SAVE_OVERLAY_MIN_MS)

        setRecordingState(false)
        setSaveUi(null)
        setBusy(false)
        return
      }

      const source = await window.api.recording.getSource()
      if (!source) {
        throw new Error('无法获取主窗口画面，请重试')
      }

      activeRecorder = await startWindowRecorder(source.id)
      setRecordingState(true)
      setBusy(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : '录制失败'
      activeRecorder = null
      setRecordingState(false)
      setError(message)

      if (inSaveFlow) {
        setSaveUi({ phase: 'error', message })
        return
      }

      setSaveUi(null)
      setBusy(false)
    }
  }

  const overlay =
    saveUi &&
    createPortal(
      <div className="modal-overlay fixed inset-0 z-[80] flex items-center justify-center">
        <div className="panel w-full max-w-sm rounded-lg border shadow-2xl">
          <div className="border-b border-surface-border px-4 py-2">
            <span className="text-sm font-medium">保存录制</span>
          </div>
          <div className="flex flex-col gap-3 px-4 py-5">
            {saveUi.phase === 'error' ? (
              <>
                <p className="text-sm text-red-400">{saveUi.message ?? '保存失败'}</p>
                <div className="flex justify-end">
                  <button type="button" className="btn-primary" onClick={dismissSaveUi}>
                    关闭
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-terminal-fg">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  <span>{savePhaseLabel(saveUi.phase)}</span>
                </div>
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
                  <div className="absolute inset-y-0 w-1/3 animate-[recording-save-bar_1.2s_ease-in-out_infinite] rounded-full bg-accent" />
                </div>
                <p className="text-[11px] text-accent-muted">请稍候，保存完成后将自动关闭</p>
              </>
            )}
          </div>
        </div>
      </div>,
      document.body
    )

  if (variant === 'status') {
    return (
      <>
        <button
          type="button"
          className={`status-pill disabled:opacity-50 ${
            recording ? 'status-pill-active text-red-400' : ''
          }`}
          title={error ?? (recording ? '停止录制窗口' : '开始录制窗口')}
          disabled={busy || Boolean(saveUi)}
          onClick={() => void toggleRecording()}
        >
          <Circle size={12} className={recording ? 'fill-red-400' : ''} />
          {recording ? '录制中' : '录制'}
        </button>
        {overlay}
      </>
    )
  }

  if (variant === 'inline') {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
            recording ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'btn-primary'
          }`}
          disabled={busy || Boolean(saveUi)}
          onClick={() => void toggleRecording()}
        >
          <Circle size={14} className={recording ? 'fill-red-400' : ''} />
          {recording ? '停止录制' : '开始录制窗口'}
        </button>
        {error && !saveUi ? (
          <p className="max-w-xs text-center text-[11px] text-red-400">{error}</p>
        ) : null}
        {overlay}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className={`btn-icon h-7 w-7 disabled:opacity-50 ${recording ? 'text-red-400' : ''}`}
        title={error ?? (recording ? '停止录制' : '开始录制窗口')}
        disabled={busy || Boolean(saveUi)}
        onClick={() => void toggleRecording()}
      >
        <Circle size={12} className={recording ? 'fill-red-400' : ''} />
      </button>
      {overlay}
    </>
  )
}
