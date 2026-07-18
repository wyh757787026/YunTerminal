import { useState } from 'react'
import { X } from 'lucide-react'

interface FileEditorDialogProps {
  path: string
  content: string
  onSave: (content: string) => void
  onClose: () => void
}

export function FileEditorDialog({
  path,
  content,
  onSave,
  onClose
}: FileEditorDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState(content)

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="panel flex h-[70vh] w-full max-w-3xl flex-col rounded-lg border shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
          <span className="truncate text-sm font-medium">编辑: {path}</span>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <textarea
          className="flex-1 resize-none bg-terminal-bg p-3 font-mono text-sm text-terminal-fg outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
        <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-2">
          <button
            className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-accent-muted"
            onClick={onClose}
          >
            取消
          </button>
          <button className="btn-primary" onClick={() => onSave(draft)}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
