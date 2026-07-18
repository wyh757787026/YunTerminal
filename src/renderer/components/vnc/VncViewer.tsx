import { useEffect, useRef } from 'react'
import RFB from '@novnc/novnc'
import type { Session, TerminalWindow } from '@shared/index'
import { useAppStore } from '@renderer/stores/app-store'

interface VncViewerProps {
  linkSession: Session
  terminalWindow: TerminalWindow
  isActive: boolean
}

export function VncViewer({
  linkSession,
  terminalWindow,
  isActive
}: VncViewerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<RFB | null>(null)
  const updateSessionStatus = useAppStore((s) => s.updateSessionStatus)

  useEffect(() => {
    if (!containerRef.current || !linkSession.connectionId) return

    let cancelled = false

    const connect = async (): Promise<void> => {
      const result = await window.api.vnc.connect({
        sessionId: terminalWindow.id,
        connectionId: linkSession.connectionId!
      })

      if (cancelled || !containerRef.current) return

      if (!result.success || !result.proxyPort || !result.sessionId || !result.token) {
        updateSessionStatus(terminalWindow.id, 'error', result.message ?? 'VNC 连接失败')
        return
      }

      const url = `ws://127.0.0.1:${result.proxyPort}/vnc/${encodeURIComponent(result.sessionId)}?token=${encodeURIComponent(result.token)}`

      const rfb = new RFB(containerRef.current, url, {
        credentials: result.credentials
      })

      rfb.viewOnly = result.viewOnly ?? false
      rfb.scaleViewport = result.scaleViewport ?? true
      rfb.clipViewport = result.clipViewport ?? false
      rfb.resizeSession = result.shared ?? true
      rfb.qualityLevel = result.qualityLevel ?? 6
      rfb.compressionLevel = result.compressionLevel ?? 2
      rfb.background = 'rgb(26, 27, 38)'

      rfb.addEventListener('connect', () => {
        if (cancelled) return
        updateSessionStatus(terminalWindow.id, 'connected')
      })

      rfb.addEventListener('disconnect', (event) => {
        if (cancelled) return
        const detail = (event as CustomEvent<{ clean?: boolean }>).detail
        if (!detail?.clean) {
          updateSessionStatus(terminalWindow.id, 'disconnected', '连接已断开')
        } else {
          updateSessionStatus(terminalWindow.id, 'disconnected')
        }
      })

      rfb.addEventListener('securityfailure', (event) => {
        if (cancelled) return
        const detail = (event as CustomEvent<{ status?: number; reason?: string }>).detail
        updateSessionStatus(
          terminalWindow.id,
          'error',
          detail?.reason ?? 'VNC 认证失败'
        )
      })

      rfb.addEventListener('credentialsrequired', () => {
        if (cancelled) return
        updateSessionStatus(terminalWindow.id, 'error', '需要 VNC 认证信息')
      })

      rfbRef.current = rfb
    }

    void connect()

    return () => {
      cancelled = true
      rfbRef.current?.disconnect()
      rfbRef.current = null
      void window.api.vnc.disconnect(terminalWindow.id)
    }
  }, [linkSession.connectionId, terminalWindow.id, updateSessionStatus])

  useEffect(() => {
    if (!rfbRef.current) return
    rfbRef.current.focusOnClick = isActive
  }, [isActive])

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a1b26]">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
