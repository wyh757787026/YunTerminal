import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { SftpBrowser } from './SftpBrowser'

interface SftpDialogProps {
  onClose: () => void
}

const VIEWPORT_PAD = 8
const DEFAULT_WIDTH = 920
const DEFAULT_HEIGHT = 560
const MIN_WIDTH = 640
const MIN_HEIGHT = 400

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface Size {
  width: number
  height: number
}

interface Offset {
  x: number
  y: number
}

function initialSize(): Size {
  return {
    width: Math.min(DEFAULT_WIDTH, window.innerWidth - VIEWPORT_PAD * 2),
    height: Math.min(DEFAULT_HEIGHT, window.innerHeight - VIEWPORT_PAD * 2)
  }
}

function clampSize(width: number, height: number): Size {
  const maxW = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_PAD * 2)
  const maxH = Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_PAD * 2)
  return {
    width: Math.min(Math.max(MIN_WIDTH, width), maxW),
    height: Math.min(Math.max(MIN_HEIGHT, height), maxH)
  }
}

const RESIZE_CURSOR: Record<ResizeDir, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize'
}

export function SftpDialog({ onClose }: SftpDialogProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef<Offset>({ x: 0, y: 0 })
  const sizeRef = useRef<Size>(initialSize())
  const moveDragRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const resizeDragRef = useRef<{
    dir: ResizeDir
    startX: number
    startY: number
    originWidth: number
    originHeight: number
    originX: number
    originY: number
  } | null>(null)

  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  const [size, setSize] = useState<Size>(() => sizeRef.current)

  const clampOffsetForSize = useCallback((x: number, y: number, width: number, height: number): Offset => {
    const panel = panelRef.current
    if (!panel) return { x, y }

    const rect = panel.getBoundingClientRect()
    const baseLeft = rect.left - offsetRef.current.x
    const baseTop = rect.top - offsetRef.current.y
    const maxLeft = window.innerWidth - VIEWPORT_PAD - width
    const maxTop = window.innerHeight - VIEWPORT_PAD - height

    const nextLeft = Math.min(Math.max(VIEWPORT_PAD, baseLeft + x), Math.max(VIEWPORT_PAD, maxLeft))
    const nextTop = Math.min(Math.max(VIEWPORT_PAD, baseTop + y), Math.max(VIEWPORT_PAD, maxTop))

    return {
      x: nextLeft - baseLeft,
      y: nextTop - baseTop
    }
  }, [])

  const applyOffset = useCallback((next: Offset): void => {
    offsetRef.current = next
    setOffset(next)
  }, [])

  const applySize = useCallback((next: Size): void => {
    sizeRef.current = next
    setSize(next)
  }, [])

  const onMoveDrag = useCallback(
    (e: MouseEvent): void => {
      const drag = moveDragRef.current
      if (!drag) return
      applyOffset(
        clampOffsetForSize(
          drag.originX + (e.clientX - drag.startX),
          drag.originY + (e.clientY - drag.startY),
          sizeRef.current.width,
          sizeRef.current.height
        )
      )
    },
    [applyOffset, clampOffsetForSize]
  )

  const endMoveDrag = useCallback((): void => {
    if (!moveDragRef.current) return
    moveDragRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMoveDrag)
    window.removeEventListener('mouseup', endMoveDrag)
  }, [onMoveDrag])

  const startMoveDrag = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    moveDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y
    }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMoveDrag)
    window.addEventListener('mouseup', endMoveDrag)
  }

  const onResizeDrag = useCallback(
    (e: MouseEvent): void => {
      const drag = resizeDragRef.current
      if (!drag) return

      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      let width = drag.originWidth
      let height = drag.originHeight
      let x = drag.originX
      let y = drag.originY

      if (drag.dir.includes('e')) width = drag.originWidth + dx
      if (drag.dir.includes('s')) height = drag.originHeight + dy
      if (drag.dir.includes('w')) {
        width = drag.originWidth - dx
        x = drag.originX + dx
      }
      if (drag.dir.includes('n')) {
        height = drag.originHeight - dy
        y = drag.originY + dy
      }

      const clamped = clampSize(width, height)

      // Keep the opposite edge anchored when hitting min/max size.
      if (drag.dir.includes('w')) {
        x = drag.originX + (drag.originWidth - clamped.width)
      }
      if (drag.dir.includes('n')) {
        y = drag.originY + (drag.originHeight - clamped.height)
      }

      applySize(clamped)
      applyOffset(clampOffsetForSize(x, y, clamped.width, clamped.height))
    },
    [applyOffset, applySize, clampOffsetForSize]
  )

  const endResizeDrag = useCallback((): void => {
    if (!resizeDragRef.current) return
    resizeDragRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onResizeDrag)
    window.removeEventListener('mouseup', endResizeDrag)
  }, [onResizeDrag])

  const startResizeDrag = (dir: ResizeDir) => (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    resizeDragRef.current = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      originWidth: sizeRef.current.width,
      originHeight: sizeRef.current.height,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y
    }
    document.body.style.cursor = RESIZE_CURSOR[dir]
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onResizeDrag)
    window.addEventListener('mouseup', endResizeDrag)
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onMoveDrag)
      window.removeEventListener('mouseup', endMoveDrag)
      window.removeEventListener('mousemove', onResizeDrag)
      window.removeEventListener('mouseup', endResizeDrag)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [onMoveDrag, endMoveDrag, onResizeDrag, endResizeDrag])

  const edge = 'absolute z-20'
  const edgeSize = 4
  const cornerSize = 10

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="panel relative flex flex-col overflow-hidden rounded-lg border shadow-2xl"
        style={{
          width: size.width,
          height: size.height,
          left: offset.x,
          top: offset.y
        }}
      >
        <div
          className="flex shrink-0 cursor-grab items-center justify-between border-b border-surface-border px-4 py-2.5 select-none active:cursor-grabbing"
          onMouseDown={startMoveDrag}
        >
          <h2 className="text-sm font-semibold text-terminal-fg">SFTP 文件传输</h2>
          <button
            type="button"
            className="btn-icon"
            title="关闭"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <SftpBrowser />
        </div>

        {/* Edges */}
        <div
          className={`${edge} left-2 right-2 top-0 cursor-ns-resize`}
          style={{ height: edgeSize }}
          onMouseDown={startResizeDrag('n')}
        />
        <div
          className={`${edge} bottom-0 left-2 right-2 cursor-ns-resize`}
          style={{ height: edgeSize }}
          onMouseDown={startResizeDrag('s')}
        />
        <div
          className={`${edge} top-2 bottom-2 left-0 cursor-ew-resize`}
          style={{ width: edgeSize }}
          onMouseDown={startResizeDrag('w')}
        />
        <div
          className={`${edge} top-2 bottom-2 right-0 cursor-ew-resize`}
          style={{ width: edgeSize }}
          onMouseDown={startResizeDrag('e')}
        />

        {/* Corners */}
        <div
          className={`${edge} left-0 top-0 cursor-nwse-resize`}
          style={{ width: cornerSize, height: cornerSize }}
          onMouseDown={startResizeDrag('nw')}
        />
        <div
          className={`${edge} right-0 top-0 cursor-nesw-resize`}
          style={{ width: cornerSize, height: cornerSize }}
          onMouseDown={startResizeDrag('ne')}
        />
        <div
          className={`${edge} bottom-0 left-0 cursor-nesw-resize`}
          style={{ width: cornerSize, height: cornerSize }}
          onMouseDown={startResizeDrag('sw')}
        />
        <div
          className={`${edge} bottom-0 right-0 cursor-nwse-resize`}
          style={{ width: cornerSize, height: cornerSize }}
          onMouseDown={startResizeDrag('se')}
          title="拖动调整大小"
        />
      </div>
    </div>
  )
}
