import { useCallback, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@renderer/stores/app-store'
import { Toast, type ToastTone } from '@renderer/components/common/Toast'

interface ExportConnectionsDialogProps {
  onClose: () => void
}

export function ExportConnectionsDialog({ onClose }: ExportConnectionsDialogProps): React.JSX.Element {
  const exportConnections = useAppStore((s) => s.exportConnections)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])

  const handleExport = async (includeSecrets: boolean): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const result = await exportConnections(includeSecrets)
      if (result.canceled) {
        setBusy(false)
        return
      }
      setToast({
        message: result.filePath ? `已导出到: ${result.filePath}` : '导出完成',
        tone: 'success'
      })
      window.setTimeout(onClose, 1800)
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : '导出失败',
        tone: 'error'
      })
      setBusy(false)
    }
  }

  return (
    <>
      {toast ? (
        <Toast
          key={`${toast.tone}:${toast.message}`}
          message={toast.message}
          tone={toast.tone}
          onClose={dismissToast}
        />
      ) : null}
      <div
        className="modal-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onClose()
        }}
      >
        <div className="panel w-full max-w-md rounded-lg border shadow-2xl">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-2.5">
            <h2 className="text-sm font-semibold">导出连接</h2>
            <button type="button" className="btn-icon" title="关闭" disabled={busy} onClick={onClose}>
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3 px-4 py-4">
            <p className="text-sm text-terminal-fg">将所有连接与分组导出为 JSON 文件。</p>
            <p className="text-[11px] leading-relaxed text-accent-muted">
              是否同时导出密码等敏感信息？包含密码便于完整迁移，请妥善保管导出文件。
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={onClose}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => void handleExport(false)}
              >
                {busy ? '导出中…' : '仅连接信息'}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void handleExport(true)}
              >
                {busy ? '导出中…' : '包含密码'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
