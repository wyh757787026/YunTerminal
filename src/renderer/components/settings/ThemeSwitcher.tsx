import { Check, Palette } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { APP_THEME_OPTIONS, type AppThemeId } from '@shared/types/settings'
import { useSettingsStore } from '@renderer/stores/settings-store'

const MENU_MIN_WIDTH = 176

export function ThemeSwitcher(): React.JSX.Element {
  const appTheme = useSettingsStore((s) => s.settings.appTheme)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const current = APP_THEME_OPTIONS.find((t) => t.id === appTheme) ?? APP_THEME_OPTIONS[0]

  const updateMenuPosition = (): void => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const menuHeight = menuRef.current?.offsetHeight ?? APP_THEME_OPTIONS.length * 32 + 8
    const menuWidth = Math.max(MENU_MIN_WIDTH, menuRef.current?.offsetWidth ?? MENU_MIN_WIDTH)
    const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)
    const top = Math.max(8, rect.top - menuHeight - 4)

    setMenuStyle({
      position: 'fixed',
      left: Math.max(8, left),
      top,
      minWidth: MENU_MIN_WIDTH,
      zIndex: 9999
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPosition()
  }, [open])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }

    const handleReposition = (): void => {
      updateMenuPosition()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [open])

  const selectTheme = (themeId: AppThemeId): void => {
    if (themeId === appTheme) {
      setOpen(false)
      return
    }
    void updateSettings({ appTheme: themeId })
    setOpen(false)
  }

  const toggleOpen = (): void => {
    if (open) {
      setOpen(false)
      return
    }
    updateMenuPosition()
    setOpen(true)
  }

  return (
    <div ref={rootRef} className={`relative ${open ? 'z-50' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`status-pill ${open ? 'status-pill-active' : ''}`}
        title={`界面主题：${current.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggleOpen}
      >
        <Palette size={12} />
        <span className="hidden sm:inline">{current.label}</span>
        <span className="flex gap-0.5 sm:ml-0.5">
          {current.preview.map((color) => (
            <span
              key={color}
              className="h-2 w-2 rounded-full ring-1 ring-surface-border/60"
              style={{ backgroundColor: color }}
            />
          ))}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="选择界面主题"
            className="dropdown-menu fixed mt-0"
            style={menuStyle}
          >
            {APP_THEME_OPTIONS.map((theme) => {
              const active = theme.id === appTheme
              return (
                <button
                  key={theme.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`dropdown-item flex items-center gap-2 ${active ? 'text-accent' : ''}`}
                  onClick={() => selectTheme(theme.id)}
                >
                  <span className="flex shrink-0 gap-0.5">
                    {theme.preview.map((color) => (
                      <span
                        key={color}
                        className="h-3 w-3 rounded-sm ring-1 ring-surface-border/50"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{theme.label}</span>
                  {active && <Check size={12} className="shrink-0 text-accent" />}
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </div>
  )
}
