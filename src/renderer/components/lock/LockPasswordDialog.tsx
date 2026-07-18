import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface LockPasswordDialogProps {
  configured: boolean
  onClose: () => void
  onSaved: () => void
}

export function LockPasswordDialog({
  configured,
  onClose,
  onSaved
}: LockPasswordDialogProps): React.JSX.Element {
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSave = async (): Promise<void> => {
    setError(null)

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setSaving(true)
    try {
      const result = await window.api.lockScreen.setPassword(
        password,
        configured ? currentPassword : undefined
      )
      if (!result.success) {
        setError(result.message ?? '设置失败')
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async (): Promise<void> => {
    if (!configured) return
    if (!currentPassword.trim()) {
      setError('请输入当前密码以清除锁屏密码')
      return
    }

    setSaving(true)
    try {
      const result = await window.api.lockScreen.clearPassword(currentPassword)
      if (!result.success) {
        setError(result.message ?? '清除失败')
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center">
      <div className="panel w-full max-w-sm overflow-hidden rounded-lg border shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold">{configured ? '修改锁屏密码' : '设置锁屏密码'}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {configured && (
            <label className="block">
              <span className="mb-1 block text-xs text-accent-muted">当前密码</span>
              <input
                className="input font-mono"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoFocus
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs text-accent-muted">新密码</span>
            <input
              className="input font-mono"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus={!configured}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-accent-muted">确认密码</span>
            <input
              className="input font-mono"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
              }}
            />
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-between gap-2 border-t border-surface-border px-4 py-3">
          {configured ? (
            <button
              className="text-sm text-red-400 hover:text-red-300"
              disabled={saving}
              onClick={() => void handleClear()}
            >
              清除密码
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-accent-muted"
              onClick={onClose}
            >
              取消
            </button>
            <button className="btn-primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
