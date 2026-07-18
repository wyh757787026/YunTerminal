import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface PromptDialogProps {
  title: string
  label?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onClose: () => void
}

export function PromptDialog({
  title,
  label,
  defaultValue = '',
  placeholder,
  confirmLabel = '确定',
  onConfirm,
  onClose
}: PromptDialogProps): React.JSX.Element {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = (): void => {
    const trimmed = value.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="panel w-full max-w-sm rounded-lg border shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
          <span className="text-sm font-medium">{title}</span>
          <button className="btn-icon" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-3">
          {label ? <label className="mb-1.5 block text-xs text-accent-muted">{label}</label> : null}
          <input
            ref={inputRef}
            className="input w-full"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') onClose()
            }}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-2">
          <button
            className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-accent-muted"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button className="btn-primary" onClick={submit} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
