import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export type ToastTone = 'success' | 'error'

export interface ToastProps {
  message: string
  tone?: ToastTone
  durationMs?: number
  onClose: () => void
}

export function Toast({
  message,
  tone = 'success',
  durationMs = 2200,
  onClose
}: ToastProps): React.JSX.Element {
  useEffect(() => {
    if (durationMs <= 0) return
    const timer = window.setTimeout(onClose, durationMs)
    return () => window.clearTimeout(timer)
  }, [durationMs, onClose])

  const isSuccess = tone === 'success'

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[120] flex justify-center px-4">
      <div
        className={`pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-2xl backdrop-blur-sm ${
          isSuccess
            ? 'border-emerald-500/30 bg-surface-raised/95 text-terminal-fg'
            : 'border-red-500/30 bg-surface-raised/95 text-terminal-fg'
        }`}
        role="status"
      >
        {isSuccess ? (
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
        ) : (
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
        )}
        <p className="min-w-0 flex-1 text-sm leading-snug">{message}</p>
        <button
          type="button"
          className="btn-icon h-6 w-6 shrink-0"
          title="关闭"
          onClick={onClose}
        >
          <X size={12} />
        </button>
      </div>
    </div>,
    document.body
  )
}
