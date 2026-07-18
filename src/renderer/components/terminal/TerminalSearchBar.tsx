import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { SearchAddon } from '@xterm/addon-search'

interface TerminalSearchBarProps {
  searchAddon: SearchAddon | null
  onClose: () => void
}

export function TerminalSearchBar({
  searchAddon,
  onClose
}: TerminalSearchBarProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!searchAddon) return
    searchAddon.findNext(query, { caseSensitive: false })
  }, [query, searchAddon])

  if (!searchAddon) return null

  return (
    <div className="absolute right-3 top-2 z-20 flex items-center gap-1 rounded-md border border-surface-border bg-surface-raised px-2 py-1 shadow-lg">
      <input
        autoFocus
        className="w-48 bg-transparent text-sm outline-none"
        placeholder="搜索终端内容..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.shiftKey
              ? searchAddon.findPrevious(query, { caseSensitive: false })
              : searchAddon.findNext(query, { caseSensitive: false })
          }
          if (e.key === 'Escape') onClose()
        }}
      />
      <button
        className="btn-icon h-6 w-6"
        onClick={() => searchAddon.findPrevious(query, { caseSensitive: false })}
        title="上一个"
      >
        <ChevronUp size={14} />
      </button>
      <button
        className="btn-icon h-6 w-6"
        onClick={() => searchAddon.findNext(query, { caseSensitive: false })}
        title="下一个"
      >
        <ChevronDown size={14} />
      </button>
      <button className="btn-icon h-6 w-6" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  )
}
