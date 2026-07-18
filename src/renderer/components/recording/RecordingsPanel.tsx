import { useCallback, useEffect, useState } from 'react'
import { Play, Trash2 } from 'lucide-react'
import type { RecordingFile, RecordingMeta } from '@shared/types/recording'
import { formatDuration } from '@renderer/lib/format-utils'
import { RecordingButton } from './RecordingButton'
import { RecordingPlayer } from './RecordingPlayer'

function formatRecordingDuration(meta: RecordingMeta): string {
  if (meta.durationMs) return formatDuration(Math.floor(meta.durationMs / 1000))
  return '—'
}

export function RecordingsPanel(): React.JSX.Element {
  const [recordings, setRecordings] = useState<RecordingMeta[]>([])
  const [playing, setPlaying] = useState<RecordingFile | null>(null)

  const loadRecordings = useCallback(async (): Promise<void> => {
    const list = await window.api.recording.list()
    setRecordings(list)
  }, [])

  useEffect(() => {
    void loadRecordings()
  }, [loadRecordings])

  const handlePlay = async (id: string): Promise<void> => {
    const file = await window.api.recording.read(id)
    if (file) setPlaying(file)
  }

  const handleDelete = async (meta: RecordingMeta): Promise<void> => {
    if (!confirm(`确定删除录制「${meta.title}」？`)) return
    await window.api.recording.delete(meta.id)
    await loadRecordings()
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-surface-border px-3 py-1.5">
          <span className="text-xs text-accent-muted">终端会话录制列表</span>
          <RecordingButton
            onStateChange={(recording) => {
              if (!recording) void loadRecordings()
            }}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {recordings.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-accent-muted">
              <span>暂无录制</span>
              <RecordingButton
                variant="inline"
                onStateChange={(recording) => {
                  if (!recording) void loadRecordings()
                }}
              />
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-base text-accent-muted">
                <tr className="border-b border-surface-border">
                  <th className="px-3 py-1.5 text-left font-medium">标题</th>
                  <th className="px-3 py-1.5 text-left font-medium">类型</th>
                  <th className="px-3 py-1.5 text-left font-medium">时长</th>
                  <th className="px-3 py-1.5 text-left font-medium">时间</th>
                  <th className="px-3 py-1.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {recordings.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-surface-border/50 hover:bg-surface-overlay/30"
                  >
                    <td className="px-3 py-2">{item.title}</td>
                    <td className="px-3 py-2 uppercase">{item.sessionType}</td>
                    <td className="px-3 py-2">{formatRecordingDuration(item)}</td>
                    <td className="px-3 py-2 text-accent-muted">
                      {new Date(item.startedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="btn-icon h-6 w-6"
                          title="播放"
                          onClick={() => void handlePlay(item.id)}
                        >
                          <Play size={12} />
                        </button>
                        <button
                          className="btn-icon h-6 w-6 text-red-400"
                          title="删除"
                          onClick={() => void handleDelete(item)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {playing && <RecordingPlayer recording={playing} onClose={() => setPlaying(null)} />}
    </>
  )
}
