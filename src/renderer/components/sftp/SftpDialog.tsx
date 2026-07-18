import { X } from 'lucide-react'
import { SftpBrowser } from './SftpBrowser'

interface SftpDialogProps {
  onClose: () => void
}

export function SftpDialog({ onClose }: SftpDialogProps): React.JSX.Element {
  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="panel flex h-[min(860px,90vh)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-2.5">
          <h2 className="text-sm font-semibold text-terminal-fg">SFTP 文件传输</h2>
          <button type="button" className="btn-icon" title="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <SftpBrowser />
        </div>
      </div>
    </div>
  )
}
