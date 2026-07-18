import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { globalCommandHistory } from '@renderer/lib/command-history'

interface HistoryPaletteProps {
  onClose: () => void
  onSelect: (command: string) => void
}

export function HistoryPalette({ onClose, onSelect }: HistoryPaletteProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const results = globalCommandHistory.search(query)

  useEffect(() => {
    setSelected(0)
  }, [query])

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="panel w-full max-w-xl rounded-lg border shadow-2xl">
        <div className="flex items-center gap-2 border-b border-surface-border px-4 py-3">
          <span className="text-sm text-accent-muted">命令历史</span>
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none"
            placeholder="搜索历史命令..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelected((v) => Math.min(v + 1, results.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelected((v) => Math.max(v - 1, 0))
              }
              if (e.key === 'Enter' && results[selected]) {
                onSelect(results[selected])
                onClose()
              }
              if (e.key === 'Escape') onClose()
            }}
          />
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-accent-muted">暂无历史命令</p>
          ) : (
            results.map((cmd, index) => (
              <button
                key={`${cmd}-${index}`}
                className={`w-full rounded-md px-3 py-2 text-left font-mono text-sm ${
                  index === selected ? 'bg-surface-overlay text-terminal-fg' : 'text-accent-muted'
                }`}
                onClick={() => {
                  onSelect(cmd)
                  onClose()
                }}
              >
                {cmd}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
