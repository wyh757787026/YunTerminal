import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  AI_PROVIDER_OPTIONS,
  DEFAULT_AI_SETTINGS,
  aiProviderRequiresApiKey,
  type AiPublicSettings,
  type AiProvider
} from '@shared/types/ai'
import {
  APP_THEME_OPTIONS,
  FONT_FAMILY_OPTIONS,
  LOCK_IDLE_TIMEOUT_OPTIONS,
  NOTE_FONT_SIZE_OPTIONS,
  NOTE_MODE_OPTIONS,
  TERMINAL_THEME_OPTIONS,
  type TerminalSettings
} from '@shared/types/settings'
import { useSettingsStore } from '@renderer/stores/settings-store'
import { SettingsRow, SettingsSelect, SettingsToggle } from '@renderer/components/settings/SettingsRow'
import { LockPasswordDialog } from '@renderer/components/lock/LockPasswordDialog'
import { Toast, type ToastTone } from '@renderer/components/common/Toast'

type SettingsTab = 'terminal' | 'notes' | 'lock' | 'ai'

export function SettingsDialog(): React.JSX.Element {
  const { settings, updateSettings, closeSettingsDialog } = useSettingsStore()
  const [tab, setTab] = useState<SettingsTab>('terminal')
  const [terminalDraft, setTerminalDraft] = useState(settings)
  const [aiDraft, setAiDraft] = useState<AiPublicSettings>(DEFAULT_AI_SETTINGS)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [lockPasswordConfigured, setLockPasswordConfigured] = useState(false)
  const [lockPasswordDialogOpen, setLockPasswordDialogOpen] = useState(false)
  const [defaultRecordingDir, setDefaultRecordingDir] = useState('')
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    setTerminalDraft(settings)
  }, [settings])

  useEffect(() => {
    void window.api.ai.getSettings().then(setAiDraft)
    void window.api.lockScreen.getStatus().then((status) => {
      setLockPasswordConfigured(status.passwordConfigured)
    })
    void window.api.recording.getDir().then((info) => {
      setDefaultRecordingDir(info.defaultDir)
    })
  }, [])

  const handlePickRecordingDir = async (): Promise<void> => {
    const dir = await window.api.recording.pickDir()
    if (dir) updateTerminalField('recordingSaveDir', dir)
  }

  const updateTerminalField = <K extends keyof TerminalSettings>(
    key: K,
    value: TerminalSettings[K]
  ): void => {
    setTerminalDraft((prev) => {
      if (key === 'appTheme') {
        const appTheme = value as TerminalSettings['appTheme']
        let theme = prev.theme
        if (appTheme === 'daylight') {
          theme = 'light'
        } else if (prev.appTheme === 'daylight' && prev.theme === 'light') {
          theme = 'tokyo-night'
        }
        return { ...prev, appTheme, theme }
      }
      return { ...prev, [key]: value }
    })
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await updateSettings(terminalDraft)
      await window.api.ai.updateSettings({
        enabled: aiDraft.enabled,
        provider: aiDraft.provider,
        baseUrl: aiDraft.baseUrl,
        model: aiDraft.model,
        apiKey: apiKey || undefined
      })
      if (apiKey) setApiKey('')
      const nextAi = await window.api.ai.getSettings()
      setAiDraft(nextAi)
      setToast({ message: '设置已保存', tone: 'success' })
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : '保存设置失败',
        tone: 'error'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center">
      {toast ? (
        <Toast
          key={`${toast.tone}:${toast.message}`}
          message={toast.message}
          tone={toast.tone}
          onClose={dismissToast}
        />
      ) : null}
      <div className="panel max-h-[90vh] w-full max-w-lg overflow-hidden rounded-lg border shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold">设置</h2>
          <button className="btn-icon" onClick={closeSettingsDialog}>
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-surface-border px-4 pt-2">
          {(
            [
              ['terminal', '终端'],
              ['notes', '笔记'],
              ['lock', '锁屏'],
              ['ai', 'AI 助手']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`rounded-t-md px-3 py-1.5 text-xs ${
                tab === id ? 'bg-surface-overlay text-terminal-fg' : 'text-accent-muted'
              }`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className={`max-h-[60vh] space-y-4 p-4 ${tab === 'notes' || tab === 'lock' ? 'overflow-visible' : 'overflow-auto'}`}
        >
          {tab === 'terminal' && (
            <>
              <div>
                <span className="mb-2 block text-xs text-accent-muted">界面主题</span>
                <div className="grid grid-cols-2 gap-2">
                  {APP_THEME_OPTIONS.map((theme) => {
                    const active = terminalDraft.appTheme === theme.id
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        className={`rounded-lg border p-2.5 text-left transition-colors ${
                          active
                            ? 'border-accent/50 bg-accent/10'
                            : 'border-surface-border bg-surface-overlay/30 hover:border-surface-border hover:bg-surface-overlay/50'
                        }`}
                        onClick={() => updateTerminalField('appTheme', theme.id)}
                      >
                        <div className="mb-1.5 flex gap-1">
                          {theme.preview.map((color) => (
                            <span
                              key={color}
                              className="h-4 flex-1 rounded-sm ring-1 ring-surface-border/40"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <div className="text-xs font-medium text-terminal-fg">{theme.label}</div>
                        <div className="mt-0.5 text-[10px] leading-snug text-accent-muted">
                          {theme.description}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs text-accent-muted">终端配色</span>
                <select
                  className="input"
                  value={terminalDraft.theme}
                  onChange={(e) =>
                    updateTerminalField('theme', e.target.value as TerminalSettings['theme'])
                  }
                >
                  {TERMINAL_THEME_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-accent-muted">字体</span>
                <select
                  className="input"
                  value={terminalDraft.fontFamily}
                  onChange={(e) => updateTerminalField('fontFamily', e.target.value)}
                >
                  {FONT_FAMILY_OPTIONS.map((font) => (
                    <option key={font} value={font}>
                      {font.split(',')[0]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-accent-muted">
                  字号: {terminalDraft.fontSize}px
                </span>
                <input
                  type="range"
                  min={10}
                  max={24}
                  value={terminalDraft.fontSize}
                  onChange={(e) => updateTerminalField('fontSize', Number(e.target.value))}
                  className="w-full"
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={terminalDraft.cursorBlink}
                  onChange={(e) => updateTerminalField('cursorBlink', e.target.checked)}
                />
                光标闪烁
              </label>

              <div className="space-y-1.5">
                <span className="block text-xs text-accent-muted">录屏保存目录</span>
                <p className="text-[11px] leading-snug text-accent-muted">
                  未自定义时使用应用默认目录。更改后新录制将保存到新位置，列表仅显示当前目录中的文件。
                </p>
                <div className="flex gap-2">
                  <input
                    className="input min-w-0 flex-1 font-mono text-[11px]"
                    value={terminalDraft.recordingSaveDir}
                    placeholder={defaultRecordingDir || '应用默认目录'}
                    onChange={(e) => updateTerminalField('recordingSaveDir', e.target.value)}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    onClick={() => void handlePickRecordingDir()}
                  >
                    浏览
                  </button>
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    disabled={!terminalDraft.recordingSaveDir}
                    onClick={() => updateTerminalField('recordingSaveDir', '')}
                  >
                    默认
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'notes' && (
            <div className="space-y-3">
              <SettingsRow
                title="启动自动保存"
                description={`编辑笔记时，笔记内容变化将会自动保存，触发保存时间间隔为 ${terminalDraft.noteAutoSaveIntervalSec}s。`}
              >
                <SettingsToggle
                  checked={terminalDraft.noteAutoSave}
                  onChange={(checked) => updateTerminalField('noteAutoSave', checked)}
                />
              </SettingsRow>

              <SettingsRow
                title="启动同步滚动"
                description="编辑和预览笔记时，按内容滚动百分比同步滚动编辑区域和预览区域。"
              >
                <SettingsToggle
                  checked={terminalDraft.noteSyncScroll}
                  onChange={(checked) => updateTerminalField('noteSyncScroll', checked)}
                />
              </SettingsRow>

              <SettingsRow
                title="笔记模式"
                description="打开笔记时，初始是编辑模式、预览模式或者编辑预览模式并存。"
              >
                <SettingsSelect
                  value={terminalDraft.noteMode}
                  options={NOTE_MODE_OPTIONS.map((opt) => ({ value: opt.id, label: opt.label }))}
                  onChange={(value) => updateTerminalField('noteMode', value)}
                />
              </SettingsRow>

              <SettingsRow title="编辑器字体大小" description="设置编辑器字体大小">
                <SettingsSelect
                  value={terminalDraft.noteEditorFontSize}
                  options={NOTE_FONT_SIZE_OPTIONS.map((size) => ({
                    value: size,
                    label: String(size)
                  }))}
                  onChange={(value) => updateTerminalField('noteEditorFontSize', value)}
                />
              </SettingsRow>
            </div>
          )}

          {tab === 'lock' && (
            <div className="space-y-3">
              <SettingsRow title="锁屏密码" description="锁屏密码用于解锁锁屏状态">
                <button
                  type="button"
                  className="settings-action-btn"
                  onClick={() => setLockPasswordDialogOpen(true)}
                >
                  {lockPasswordConfigured ? '修改' : '设置'}
                </button>
              </SettingsRow>

              <SettingsRow
                title="长时间未操作"
                description="长时间未操作，系统自动进入锁屏状态。"
              >
                <SettingsSelect
                  value={terminalDraft.lockIdleTimeoutMin}
                  options={LOCK_IDLE_TIMEOUT_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label
                  }))}
                  onChange={(value) => updateTerminalField('lockIdleTimeoutMin', value)}
                />
              </SettingsRow>

              <SettingsRow title="启动锁屏" description="启动时，是否需要输入密码解锁">
                <SettingsToggle
                  checked={terminalDraft.lockOnStartup}
                  onChange={(checked) => updateTerminalField('lockOnStartup', checked)}
                />
              </SettingsRow>

              {!lockPasswordConfigured && terminalDraft.lockOnStartup && (
                <p className="text-[11px] text-amber-400">请先设置锁屏密码，启动锁屏才会生效。</p>
              )}
            </div>
          )}

          {tab === 'ai' && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={aiDraft.enabled}
                  onChange={(e) => setAiDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                />
                启用 AI 助手
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-accent-muted">提供商</span>
                <select
                  className="input"
                  value={aiDraft.provider}
                  onChange={(e) => {
                    const provider = e.target.value as AiProvider
                    const option = AI_PROVIDER_OPTIONS.find((o) => o.id === provider)
                    setAiDraft((prev) => ({
                      ...prev,
                      provider,
                      baseUrl:
                        provider === 'custom' ? prev.baseUrl : (option?.baseUrl ?? prev.baseUrl),
                      model:
                        provider === 'custom' ? prev.model : (option?.defaultModel ?? prev.model)
                    }))
                  }}
                >
                  {AI_PROVIDER_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-accent-muted">API Base URL</span>
                <input
                  className="input"
                  value={aiDraft.baseUrl}
                  onChange={(e) => setAiDraft((prev) => ({ ...prev, baseUrl: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-accent-muted">模型</span>
                <input
                  className="input"
                  value={aiDraft.model}
                  onChange={(e) => setAiDraft((prev) => ({ ...prev, model: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-accent-muted">
                  API Key
                  {aiDraft.apiKeyConfigured && ' (已配置，留空则不修改)'}
                  {!aiProviderRequiresApiKey(aiDraft.provider) && '（可选）'}
                </span>
                <input
                  className="input font-mono"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-surface-border px-4 py-3">
          <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {lockPasswordDialogOpen && (
        <LockPasswordDialog
          configured={lockPasswordConfigured}
          onClose={() => setLockPasswordDialogOpen(false)}
          onSaved={() => {
            void window.api.lockScreen.getStatus().then((status) => {
              setLockPasswordConfigured(status.passwordConfigured)
            })
          }}
        />
      )}
    </div>
  )
}
