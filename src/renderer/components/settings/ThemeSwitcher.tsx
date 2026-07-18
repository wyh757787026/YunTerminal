import { Check, Palette } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { APP_THEME_OPTIONS, type AppThemeId } from '@shared/types/settings'
import { useSettingsStore } from '@renderer/stores/settings-store'

export function ThemeSwitcher(): React.JSX.Element {
  const appTheme = useSettingsStore((s) => s.settings.appTheme)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const current = APP_THEME_OPTIONS.find((t) => t.id === appTheme) ?? APP_THEME_OPTIONS[0]

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
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

  return (
    <div ref={rootRef} className={`relative ${open ? 'z-50' : ''}`}>
      <button
        type="button"
        className={`status-pill ${open ? 'status-pill-active' : ''}`}
        title={`界面主题：${current.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
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

      {open && (
        <div
          role="listbox"
          aria-label="选择界面主题"
          className="dropdown-menu bottom-full right-0 top-auto mb-1 mt-0 min-w-[11rem]"
        >
          {APP_THEME_OPTIONS.map((theme) => {
            const active = theme.id === appTheme
            return (
              <button
                key={theme.id}
                type="button"
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
        </div>
      )}
    </div>
  )
}
