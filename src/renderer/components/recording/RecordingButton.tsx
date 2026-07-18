import { useEffect, useState } from 'react'
import { Circle } from 'lucide-react'
import { getActiveTerminal } from '@renderer/lib/session-utils'
import { useAppStore } from '@renderer/stores/app-store'

interface RecordingButtonProps {
  variant?: 'icon' | 'inline'
  onStateChange?: (recording: boolean) => void
}

export function RecordingButton({
  variant = 'icon',
  onStateChange
}: RecordingButtonProps): React.JSX.Element | null {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const allSessions = useAppStore((s) => s.sessions)
  const connections = useAppStore((s) => s.connections)
  const activeSession = allSessions.find((s) => s.id === activeSessionId)
  const activeTerminal = getActiveTerminal(activeSession)

  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!activeTerminal) {
      setRecording(false)
      return
    }
    void window.api.recording.isRecording(activeTerminal.id).then(setRecording)
  }, [activeTerminal?.id])

  const canRecord = Boolean(
    activeSession &&
      activeSession.type !== 'vnc' &&
      activeSession.type !== 'sftp' &&
      activeSession.type !== 'ftp' &&
      activeTerminal?.status === 'connected'
  )

  const setRecordingState = (next: boolean): void => {
    setRecording(next)
    onStateChange?.(next)
  }

  const toggleRecording = async (): Promise<void> => {
    if (!activeSession || !activeTerminal) return
    if (
      activeSession.type === 'vnc' ||
      activeSession.type === 'sftp' ||
      activeSession.type === 'ftp'
    ) {
      return
    }

    if (recording) {
      await window.api.recording.stop(activeTerminal.id)
      setRecordingState(false)
      return
    }

    const connection = connections.find((c) => c.id === activeSession.connectionId)
    await window.api.recording.start({
      sessionId: activeTerminal.id,
      title: activeSession.title,
      sessionType: activeSession.type,
      connectionId: activeSession.connectionId,
      connectionName: connection?.name,
      cols: 120,
      rows: 30
    })
    setRecordingState(true)
  }

  if (variant === 'inline') {
    if (!canRecord) {
      return (
        <p className="text-xs text-accent-muted/80">请先连接一个终端会话后再录制</p>
      )
    }

    return (
      <button
        type="button"
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          recording
            ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
            : 'btn-primary'
        }`}
        onClick={() => void toggleRecording()}
      >
        <Circle size={14} className={recording ? 'fill-red-400' : ''} />
        {recording ? '停止录制' : '开始录制'}
      </button>
    )
  }

  if (!canRecord) return null

  return (
    <button
      type="button"
      className={`btn-icon h-7 w-7 ${recording ? 'text-red-400' : ''}`}
      title={recording ? '停止录制' : '开始录制'}
      onClick={() => void toggleRecording()}
    >
      <Circle size={12} className={recording ? 'fill-red-400' : ''} />
    </button>
  )
}
