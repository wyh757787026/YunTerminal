import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export type ConflictDecision = 'overwrite' | 'skip' | 'overwrite_all' | 'skip_all' | 'cancel'

interface ConflictDialogProps {
  fileName: string
  /** 本次批次中后续待处理的文件数量（不含当前） */
  remainingConflicts: number
  onDecision: (decision: ConflictDecision) => void
}

export function ConflictDialog({
  fileName,
  remainingConflicts,
  onDecision
}: ConflictDialogProps): React.JSX.Element {
  const showApplyAll = remainingConflicts > 0
  const [applyAll, setApplyAll] = useState(showApplyAll)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDecision('cancel')
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onDecision(applyAll && showApplyAll ? 'overwrite_all' : 'overwrite')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyAll, onDecision, showApplyAll])

  const chooseOverwrite = (): void => {
    onDecision(applyAll && showApplyAll ? 'overwrite_all' : 'overwrite')
  }

  const chooseSkip = (): void => {
    onDecision(applyAll && showApplyAll ? 'skip_all' : 'skip')
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="w-full max-w-[360px] overflow-hidden rounded-lg border border-surface-border/80 bg-surface-raised"
        style={{ boxShadow: 'var(--app-float-shadow)' }}
        role="dialog"
        aria-labelledby="conflict-dialog-title"
      >
        <div className="flex items-center justify-between gap-2 border-b border-surface-border/70 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle size={15} className="shrink-0 text-warning" strokeWidth={2} />
            <h2
              id="conflict-dialog-title"
              className="truncate text-sm font-medium text-terminal-fg"
            >
              文件已存在
            </h2>
          </div>
          <button
            className="btn-icon-sm shrink-0"
            onClick={() => onDecision('cancel')}
            type="button"
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3 px-3 py-3">
          <p className="text-xs text-accent-muted">远程已有同名文件，请选择覆盖或跳过：</p>
          <div
            className="rounded-md border border-surface-border/70 bg-surface-overlay/60 px-2.5 py-1.5"
            title={fileName}
          >
            <p className="truncate font-mono text-[12px] text-terminal-fg">{fileName}</p>
          </div>

          {showApplyAll ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-accent-muted hover:text-terminal-fg">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 rounded border-surface-border"
                checked={applyAll}
                onChange={(e) => setApplyAll(e.target.checked)}
              />
              <span>
                后续同名文件使用相同操作
                <span className="text-accent-muted/80">（{remainingConflicts}）</span>
              </span>
            </label>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-border/70 px-3 py-2">
          <button
            type="button"
            className="rounded-md px-2.5 py-1.5 text-xs text-accent-muted transition-colors hover:bg-surface-overlay hover:text-terminal-fg"
            onClick={() => onDecision('cancel')}
          >
            取消
          </button>
          <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" onClick={chooseSkip}>
            跳过
          </button>
          <button
            type="button"
            className="btn-primary px-2.5 py-1.5 text-xs"
            autoFocus
            onClick={chooseOverwrite}
          >
            覆盖
          </button>
        </div>
      </div>
    </div>
  )
}
