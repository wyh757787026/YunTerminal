import { Minus, Square, Terminal, X } from 'lucide-react'

export function TitleBar(): React.JSX.Element {
  return (
    <div className="title-bar">
      <div
        className="title-bar-drag flex min-w-0 flex-1 items-center gap-2 px-3"
        onDoubleClick={() => window.api.window.maximize()}
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/15">
          <Terminal size={12} className="text-accent" strokeWidth={2} />
        </div>
        <span className="truncate text-[13px] font-medium text-terminal-fg">YunTerminal</span>
      </div>

      <div className="title-bar-controls flex shrink-0">
        <button
          type="button"
          className="title-bar-control"
          aria-label="最小化"
          onClick={() => window.api.window.minimize()}
        >
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="title-bar-control"
          aria-label="最大化"
          onClick={() => window.api.window.maximize()}
        >
          <Square size={11} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="title-bar-control title-bar-control-close"
          aria-label="关闭"
          onClick={() => window.api.window.close()}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
