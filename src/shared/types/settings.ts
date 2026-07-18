export type TerminalThemeId = 'tokyo-night' | 'one-dark' | 'dracula' | 'solarized-dark' | 'light'

export type AppThemeId = 'tokyo-night' | 'emerald' | 'lavender' | 'sunset' | 'daylight'

export type NoteModeId = 'edit' | 'preview' | 'split'

export type LockIdleTimeoutMin = 0 | 1 | 5 | 15 | 30 | 60

export interface TerminalSettings {
  appTheme: AppThemeId
  theme: TerminalThemeId
  fontSize: number
  fontFamily: string
  cursorBlink: boolean
  noteAutoSave: boolean
  noteAutoSaveIntervalSec: number
  noteSyncScroll: boolean
  noteMode: NoteModeId
  noteEditorFontSize: number
  lockIdleTimeoutMin: LockIdleTimeoutMin
  lockOnStartup: boolean
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  appTheme: 'tokyo-night',
  theme: 'tokyo-night',
  fontSize: 12,
  fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
  cursorBlink: true,
  noteAutoSave: true,
  noteAutoSaveIntervalSec: 10,
  noteSyncScroll: true,
  noteMode: 'split',
  noteEditorFontSize: 18,
  lockIdleTimeoutMin: 0,
  lockOnStartup: false
}

export const LOCK_IDLE_TIMEOUT_OPTIONS: { value: LockIdleTimeoutMin; label: string }[] = [
  { value: 0, label: '不锁屏' },
  { value: 1, label: '1 分钟' },
  { value: 5, label: '5 分钟' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '60 分钟' }
]

export interface LockScreenStatus {
  passwordConfigured: boolean
}

export const NOTE_MODE_OPTIONS: { id: NoteModeId; label: string }[] = [
  { id: 'edit', label: '编辑' },
  { id: 'preview', label: '预览' },
  { id: 'split', label: '编辑 + 预览' }
]

export const NOTE_FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 22, 24] as const

export const APP_THEME_OPTIONS: {
  id: AppThemeId
  label: string
  description: string
  preview: [string, string, string]
}[] = [
  {
    id: 'tokyo-night',
    label: '东京夜',
    description: '深蓝底 + 天蓝强调，默认风格',
    preview: ['#12131a', '#6c9eff', '#1a1c26']
  },
  {
    id: 'emerald',
    label: '翡翠',
    description: '墨绿底 + 青绿强调，护眼沉稳',
    preview: ['#0f1714', '#34d399', '#15201c']
  },
  {
    id: 'lavender',
    label: '薰衣草',
    description: '深紫灰底 + 淡紫强调，柔和雅致',
    preview: ['#13131f', '#a78bfa', '#1a1b28']
  },
  {
    id: 'sunset',
    label: '暮光',
    description: '暖棕底 + 琥珀强调，低对比暖色',
    preview: ['#17110f', '#fb923c', '#211814']
  },
  {
    id: 'daylight',
    label: '日光',
    description: '浅灰白底 + 蓝色强调，明亮清晰',
    preview: ['#f4f6fa', '#2563eb', '#ffffff']
  }
]

export const TERMINAL_THEME_OPTIONS: { id: TerminalThemeId; label: string }[] = [
  { id: 'tokyo-night', label: 'Tokyo Night' },
  { id: 'one-dark', label: 'One Dark' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'solarized-dark', label: 'Solarized Dark' },
  { id: 'light', label: 'Light' }
]

export const FONT_FAMILY_OPTIONS = [
  'JetBrains Mono, Cascadia Code, Consolas, monospace',
  'Cascadia Code, Consolas, monospace',
  'Consolas, monospace',
  'Fira Code, monospace',
  'Source Code Pro, monospace'
]
