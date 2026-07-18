import { ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface SettingsRowProps {
  title: string
  description?: string
  children: React.ReactNode
}

export function SettingsRow({ title, description, children }: SettingsRowProps): React.JSX.Element {
  return (
    <div className="settings-row">
      <div className="min-w-0 flex-1 pr-4">
        <div className="text-sm font-medium text-terminal-fg">{title}</div>
        {description ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-accent-muted">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center self-center">{children}</div>
    </div>
  )
}

interface SettingsToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

export function SettingsToggle({ checked, onChange }: SettingsToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`settings-toggle ${checked ? 'settings-toggle-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-thumb" />
    </button>
  )
}

interface SettingsSelectOption<T extends string | number> {
  value: T
  label: string
}

interface SettingsSelectProps<T extends string | number> {
  value: T
  options: SettingsSelectOption<T>[]
  onChange: (value: T) => void
}

const MENU_ITEM_HEIGHT = 36
const MENU_PADDING = 8

export function SettingsSelect<T extends string | number>({
  value,
  options,
  onChange
}: SettingsSelectProps<T>): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = options.find((option) => option.value === value) ?? options[0]

  const updateMenuPosition = (): void => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const menuHeight = options.length * MENU_ITEM_HEIGHT + MENU_PADDING
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < menuHeight + 12

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: openUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
      zIndex: 9999
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPosition()
  }, [open, options.length])

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
  }, [open, options.length])

  return (
    <div ref={rootRef} className={`settings-select-root ${open ? 'settings-select-root-open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="settings-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="truncate">{current.label}</span>
        <ChevronDown size={14} className={`shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="settings-select-menu settings-select-menu-floating"
            style={menuStyle}
          >
            {options.map((option) => {
              const active = option.value === value
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`settings-select-item ${active ? 'settings-select-item-active' : ''}`}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </div>
  )
}
