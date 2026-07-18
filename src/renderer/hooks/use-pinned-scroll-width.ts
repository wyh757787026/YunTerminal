import { useEffect, useRef, useState } from 'react'

/**
 * 在 `pinned` 为 true 时锁定内容区为打开前的宽度，由外层 overflow 容器提供滚动条。
 */
export function usePinnedScrollWidth(
  pinned: boolean,
  compensateWidth = 0
): {
  scrollRef: React.RefObject<HTMLDivElement | null>
  pinnedWidth: number | undefined
} {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [baselineWidth, setBaselineWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const updateBaseline = (): void => {
      if (pinned) return
      setBaselineWidth(el.clientWidth)
    }

    updateBaseline()
    const observer = new ResizeObserver(updateBaseline)
    observer.observe(el)
    return () => observer.disconnect()
  }, [pinned])

  useEffect(() => {
    if (!pinned) {
      const el = scrollRef.current
      if (el) setBaselineWidth(el.clientWidth)
      return
    }

    if (baselineWidth > 0) return
    const el = scrollRef.current
    if (!el) return
    setBaselineWidth(el.clientWidth + compensateWidth)
  }, [pinned, baselineWidth, compensateWidth])

  const pinnedWidth =
    pinned && baselineWidth > 0 ? baselineWidth : undefined

  return { scrollRef, pinnedWidth }
}
