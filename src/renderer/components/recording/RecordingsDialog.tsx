import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, Play, Trash2, X } from 'lucide-react'
import type { RecordingFileUrl, RecordingMeta } from '@shared/types/recording'
import { formatDuration } from '@renderer/lib/format-utils'
import { RecordingPlayer } from './RecordingPlayer'

interface RecordingsDialogProps {
  onClose: () => void
}

function formatRecordingDuration(meta: RecordingMeta): string {
  if (meta.durationMs) return formatDuration(Math.floor(meta.durationMs / 1000))
  return '—'
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function RecordingsDialog({ onClose }: RecordingsDialogProps): React.JSX.Element {
  const [recordings, setRecordings] = useState<RecordingMeta[]>([])
  const [playing, setPlaying] = useState<RecordingFileUrl | null>(null)

  const loadRecordings = useCallback(async (): Promise<void> => {
    const list = await window.api.recording.list()
    setRecordings(list)
  }, [])

  useEffect(() => {
    void loadRecordings()
  }, [loadRecordings])

  const handlePlay = async (id: string): Promise<void> => {
    const file = await window.api.recording.getUrl(id)
    if (file) setPlaying(file)
  }

  const handleDelete = async (meta: RecordingMeta): Promise<void> => {
    if (!confirm(`确定删除录制「${meta.title}」？`)) return
    await window.api.recording.delete(meta.id)
    await loadRecordings()
  }

  const handleOpenDir = async (): Promise<void> => {
    const ok = await window.api.recording.openDir()
    if (!ok) alert('无法打开录制目录')
  }

  return (
    <>
      <div
        className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="panel flex h-[min(520px,80vh)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-2.5">
            <div>
              <h2 className="text-sm font-semibold text-terminal-fg">窗口录制</h2>
              <p className="text-[11px] text-accent-muted">主窗口画面录制列表（MP4）</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-icon"
                title="打开保存目录"
                onClick={() => void handleOpenDir()}
              >
                <FolderOpen size={16} />
              </button>
              <button type="button" className="btn-icon" title="关闭" onClick={onClose}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {recordings.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-accent-muted">
                <span>暂无窗口录制</span>
                <span className="text-[11px]">点击底部状态栏「录制」开始</span>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-raised text-accent-muted">
                  <tr className="border-b border-surface-border">
                    <th className="px-3 py-2 text-left font-medium">标题</th>
                    <th className="px-3 py-2 text-left font-medium">时长</th>
                    <th className="px-3 py-2 text-left font-medium">大小</th>
                    <th className="px-3 py-2 text-left font-medium">时间</th>
                    <th className="px-3 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {recordings.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-surface-border/50 hover:bg-surface-overlay/30"
                    >
                      <td className="px-3 py-2">{item.title}</td>
                      <td className="px-3 py-2">{formatRecordingDuration(item)}</td>
                      <td className="px-3 py-2">{formatFileSize(item.fileSize)}</td>
                      <td className="px-3 py-2 text-accent-muted">
                        {new Date(item.startedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="btn-icon h-6 w-6"
                            title="播放"
                            onClick={() => void handlePlay(item.id)}
                          >
                            <Play size={12} />
                          </button>
                          <button
                            type="button"
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
      </div>

      {playing && <RecordingPlayer recording={playing} onClose={() => setPlaying(null)} />}
    </>
  )
}
