import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { Session, TerminalWindow } from '@shared/index'
import { useTerminalOptions } from '@renderer/hooks/use-terminal-options'
import { globalCommandHistory } from '@renderer/lib/command-history'
import { colorizeMotdChunk, type MotdColorState } from '@renderer/lib/terminal-output-colors'
import { useSettingsStore } from '@renderer/stores/settings-store'
import { useAppStore } from '@renderer/stores/app-store'
import { TerminalSearchBar } from './TerminalSearchBar'
import '@xterm/xterm/css/xterm.css'

const CONTEXT_MENU_WIDTH = 112
const CONTEXT_MENU_EST_HEIGHT = 72
const CONTEXT_MENU_PAD = 8

interface ContextMenuState {
  x: number
  y: number
  hasSelection: boolean
}

function clampContextMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number
): { left: number; top: number } {
  const maxLeft = window.innerWidth - width - CONTEXT_MENU_PAD
  const maxTop = window.innerHeight - height - CONTEXT_MENU_PAD
  const left = Math.max(CONTEXT_MENU_PAD, Math.min(x, maxLeft))
  const top =
    y + height + CONTEXT_MENU_PAD > window.innerHeight
      ? Math.max(CONTEXT_MENU_PAD, y - height)
      : Math.max(CONTEXT_MENU_PAD, Math.min(y, maxTop))
  return { left, top }
}

interface SshTerminalProps {
  linkSession: Session
  terminalWindow: TerminalWindow
  isActive: boolean
  searchOpen: boolean
  onSearchClose: () => void
  onSearchReady: (addon: SearchAddon | null) => void
}

export function SshTerminal({
  linkSession,
  terminalWindow,
  isActive,
  searchOpen,
  onSearchClose,
  onSearchReady
}: SshTerminalProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const connectedRef = useRef(false)
  const inputBufferRef = useRef('')
  const motdStateRef = useRef<MotdColorState>({ active: true })
  const options = useTerminalOptions()
  const settingsVersion = useSettingsStore((s) => s.settingsVersion)
  const updateSessionStatus = useAppStore((s) => s.updateSessionStatus)
  const pendingQuickCommand = useAppStore((s) => s.pendingQuickCommand)
  const clearPendingQuickCommand = useAppStore((s) => s.clearPendingQuickCommand)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const updateSessionStatusRef = useRef(updateSessionStatus)
  const onSearchReadyRef = useRef(onSearchReady)
  updateSessionStatusRef.current = updateSessionStatus
  onSearchReadyRef.current = onSearchReady

  useEffect(() => {
    if (!containerRef.current || !linkSession.connectionId) return

    let cancelled = false

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
    onSearchReadyRef.current(searchAddon)
    connectedRef.current = false
    motdStateRef.current = { active: true }

    const copySelection = async (): Promise<boolean> => {
      if (!term.hasSelection()) return false
      const text = term.getSelection()
      if (!text) return false
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        return false
      }
    }

    // 选中即复制；有选区时 Ctrl+C 只复制，无选区时 Ctrl+C 为中断；Ctrl+V 粘贴。
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true
      const mod = ev.ctrlKey || ev.metaKey
      if (!mod || ev.altKey || ev.shiftKey) return true
      const key = ev.key.toLowerCase()
      if (key === 'c') {
        ev.preventDefault()
        if (term.hasSelection()) {
          void copySelection()
          return false
        }
        return true
      }
      if (key === 'v') {
        ev.preventDefault()
        if (connectedRef.current) {
          void navigator.clipboard
            .readText()
            .then((text) => {
              if (text) {
                window.api.ssh.write({ sessionId: terminalWindow.id, data: text })
              }
            })
            .catch(() => {
              // Clipboard may be unavailable; ignore quietly.
            })
        }
        return false
      }
      return true
    })

    const host = containerRef.current
    const onMouseUp = (): void => {
      if (term.hasSelection()) {
        void copySelection()
      }
    }
    const blockNativeClipboard = (e: Event): void => {
      e.preventDefault()
      e.stopPropagation()
    }
    host.addEventListener('mouseup', onMouseUp)
    host.addEventListener('copy', blockNativeClipboard)
    host.addEventListener('cut', blockNativeClipboard)
    host.addEventListener('paste', blockNativeClipboard)

    // 建连由 store 在创建会话时发起；此处只同步尺寸 / 复用已有连接，避免组件重挂载重复握手
    void window.api.ssh.connect({
      sessionId: terminalWindow.id,
      connectionId: linkSession.connectionId,
      cols: term.cols,
      rows: term.rows
    })

    const unsubData = window.api.ssh.onData((event) => {
      if (cancelled || event.sessionId !== terminalWindow.id) return
      const data = colorizeMotdChunk(event.data, motdStateRef.current)
      term.write(data)
    })

    const unsubStatus = window.api.ssh.onStatus((event) => {
      if (cancelled || event.sessionId !== terminalWindow.id) return

      updateSessionStatusRef.current(event.sessionId, event.status, event.message)

      if (event.status === 'connected') {
        connectedRef.current = true
        window.api.ssh.resize({
          sessionId: terminalWindow.id,
          cols: term.cols,
          rows: term.rows
        })
        term.focus()
      }

      if (event.status === 'error' && event.message) {
        term.writeln(`\r\n\x1b[31m[错误] ${event.message}\x1b[0m`)
      }

      if (event.status === 'disconnected') {
        term.writeln('\r\n\x1b[33m[连接已断开]\x1b[0m')
        connectedRef.current = false
      }
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

      window.api.ssh.write({ sessionId: terminalWindow.id, data })
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      if (connectedRef.current) {
        window.api.ssh.resize({
          sessionId: terminalWindow.id,
          cols: term.cols,
          rows: term.rows
        })
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      cancelled = true
      dataDisposable.dispose()
      unsubData()
      unsubStatus()
      resizeObserver.disconnect()
      host.removeEventListener('mouseup', onMouseUp)
      host.removeEventListener('copy', blockNativeClipboard)
      host.removeEventListener('cut', blockNativeClipboard)
      host.removeEventListener('paste', blockNativeClipboard)
      // 不断开 SSH：连接由会话生命周期管理（关闭标签时 disconnect），
      // 避免切换标签 / 组件重挂载时打断握手或误杀会话。
      onSearchReadyRef.current(null)
      term.dispose()
      terminalRef.current = null
    }
  }, [terminalWindow.id, linkSession.connectionId])

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

  useEffect(() => {
    if (!pendingQuickCommand || pendingQuickCommand.sessionId !== terminalWindow.id) return
    if (!connectedRef.current) {
      clearPendingQuickCommand()
      return
    }
    window.api.ssh.write({ sessionId: terminalWindow.id, data: `${pendingQuickCommand.command}\r` })
    clearPendingQuickCommand()
  }, [pendingQuickCommand, terminalWindow.id, clearPendingQuickCommand])

  const closeContextMenu = (): void => setContextMenu(null)

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    if (!connectedRef.current || !terminalRef.current) return
    const selection = terminalRef.current.getSelection()
    const pos = clampContextMenuPosition(
      e.clientX,
      e.clientY,
      CONTEXT_MENU_WIDTH,
      CONTEXT_MENU_EST_HEIGHT
    )
    setMenuStyle({
      position: 'fixed',
      left: pos.left,
      top: pos.top,
      width: CONTEXT_MENU_WIDTH,
      zIndex: 9999
    })
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      hasSelection: selection.length > 0
    })
  }

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const { offsetWidth, offsetHeight } = contextMenuRef.current
    const pos = clampContextMenuPosition(
      contextMenu.x,
      contextMenu.y,
      offsetWidth || CONTEXT_MENU_WIDTH,
      offsetHeight || CONTEXT_MENU_EST_HEIGHT
    )
    setMenuStyle({
      position: 'fixed',
      left: pos.left,
      top: pos.top,
      width: CONTEXT_MENU_WIDTH,
      zIndex: 9999
    })
  }, [contextMenu])

  const handleCopy = async (): Promise<void> => {
    const term = terminalRef.current
    if (!term) return
    const text = term.getSelection()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      term.clearSelection()
    } catch {
      // Clipboard may be unavailable; ignore quietly.
    }
    closeContextMenu()
  }

  const handlePaste = async (): Promise<void> => {
    if (!connectedRef.current) {
      closeContextMenu()
      return
    }
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        window.api.ssh.write({ sessionId: terminalWindow.id, data: text })
      }
    } catch {
      // Clipboard may be unavailable; ignore quietly.
    }
    closeContextMenu()
    terminalRef.current?.focus()
  }

  return (
    <div className="relative h-full w-full" onContextMenu={handleContextMenu}>
      {searchOpen && (
        <TerminalSearchBar searchAddon={searchAddonRef.current} onClose={onSearchClose} />
      )}
      <div ref={containerRef} className="h-full w-full p-1" />
      {contextMenu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={closeContextMenu}
              onContextMenu={(e) => {
                e.preventDefault()
                closeContextMenu()
              }}
            />
            <div ref={contextMenuRef} className="dropdown-menu fixed mt-0 w-28" style={menuStyle}>
              <button
                type="button"
                className="dropdown-item disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                disabled={!contextMenu.hasSelection}
                onClick={() => void handleCopy()}
              >
                复制
              </button>
              <button type="button" className="dropdown-item" onClick={() => void handlePaste()}>
                粘贴
              </button>
            </div>
          </>,
          document.body
        )}
    </div>
  )
}
