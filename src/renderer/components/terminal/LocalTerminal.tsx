import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { Session, TerminalWindow } from '@shared/index'
import { useTerminalOptions } from '@renderer/hooks/use-terminal-options'
import { globalCommandHistory } from '@renderer/lib/command-history'
import { useSettingsStore } from '@renderer/stores/settings-store'
import { useAppStore } from '@renderer/stores/app-store'
import { TerminalSearchBar } from './TerminalSearchBar'
import '@xterm/xterm/css/xterm.css'

interface LocalTerminalProps {
  linkSession: Session
  terminalWindow: TerminalWindow
  isActive: boolean
  searchOpen: boolean
  onSearchClose: () => void
  onSearchReady: (addon: SearchAddon | null) => void
}

export function LocalTerminal({
  linkSession: _linkSession,
  terminalWindow,
  isActive,
  searchOpen,
  onSearchClose,
  onSearchReady
}: LocalTerminalProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const connectedRef = useRef(false)
  const inputBufferRef = useRef('')
  const options = useTerminalOptions()
  const settingsVersion = useSettingsStore((s) => s.settingsVersion)
  const updateSessionStatus = useAppStore((s) => s.updateSessionStatus)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: options.cursorBlink,
      fontSize: options.fontSize,
      fontFamily: options.fontFamily,
      theme: options.theme,
      drawBoldTextInBrightColors: true,
      lineHeight: 1.15
    })

    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(searchAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon
    onSearchReady(searchAddon)
    connectedRef.current = false

    void window.api.pty.create({
      sessionId: terminalWindow.id,
      cols: term.cols,
      rows: term.rows
    })

    const unsubData = window.api.pty.onData((event) => {
      if (event.sessionId !== terminalWindow.id) return
      term.write(event.data)
    })

    const unsubStatus = window.api.pty.onStatus((event) => {
      if (event.sessionId !== terminalWindow.id) return
      const status = event.status === 'connected' ? 'connected' : 'disconnected'
      updateSessionStatus(event.sessionId, status)
      connectedRef.current = event.status === 'connected'
      if (event.status === 'connected') term.focus()
    })

    const dataDisposable = term.onData((data) => {
      if (!connectedRef.current) return

      if (data === '\r') {
        globalCommandHistory.add(inputBufferRef.current)
        inputBufferRef.current = ''
      } else if (data === '\x7f') {
        inputBufferRef.current = inputBufferRef.current.slice(0, -1)
      } else if (data >= ' ') {
        inputBufferRef.current += data
      }

      window.api.pty.write({ sessionId: terminalWindow.id, data })
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      if (connectedRef.current) {
        window.api.pty.resize({
          sessionId: terminalWindow.id,
          cols: term.cols,
          rows: term.rows
        })
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      dataDisposable.dispose()
      unsubData()
      unsubStatus()
      resizeObserver.disconnect()
      void window.api.pty.destroy(terminalWindow.id)
      onSearchReady(null)
      term.dispose()
      terminalRef.current = null
    }
  }, [terminalWindow.id, updateSessionStatus, onSearchReady])

  useEffect(() => {
    const term = terminalRef.current
    if (!term) return
    term.options.theme = options.theme
    term.options.fontSize = options.fontSize
    term.options.fontFamily = options.fontFamily
    term.options.cursorBlink = options.cursorBlink
    fitAddonRef.current?.fit()
  }, [settingsVersion, options])

  useEffect(() => {
    if (isActive) {
      fitAddonRef.current?.fit()
      terminalRef.current?.focus()
    }
  }, [isActive])

  return (
    <div className="relative h-full w-full">
      {searchOpen && (
        <TerminalSearchBar searchAddon={searchAddonRef.current} onClose={onSearchClose} />
      )}
      <div ref={containerRef} className="h-full w-full p-1" />
    </div>
  )
}
