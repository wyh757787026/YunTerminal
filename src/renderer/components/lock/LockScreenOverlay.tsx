import { Lock, Terminal } from 'lucide-react'
import { useState } from 'react'

interface LockScreenOverlayProps {
  onUnlock: (password: string) => Promise<{ success: boolean; message?: string }>
}

export function LockScreenOverlay({ onUnlock }: LockScreenOverlayProps): React.JSX.Element {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (): Promise<void> => {
    if (!password.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await onUnlock(password)
      if (!result.success) {
        setError(result.message ?? '密码不正确')
        setPassword('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="lock-screen-overlay">
      <div className="lock-screen-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-app bg-accent/15 ring-1 ring-accent/20">
          <Terminal size={24} className="text-accent" strokeWidth={1.75} />
        </div>
        <div className="mb-1 flex items-center justify-center gap-2 text-lg font-semibold text-terminal-fg">
          <Lock size={18} className="text-accent" />
          YunTerminal 已锁定
        </div>
        <p className="mb-5 text-center text-xs text-accent-muted">输入锁屏密码以继续</p>

        <input
          className="input mb-3 text-center font-mono"
          type="password"
          value={password}
          placeholder="锁屏密码"
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit()
          }}
        />

        {error && <p className="mb-3 text-center text-xs text-red-400">{error}</p>}

        <button
          className="btn-primary w-full"
          disabled={submitting || !password.trim()}
          onClick={() => void handleSubmit()}
        >
          {submitting ? '验证中…' : '解锁'}
        </button>
      </div>
    </div>
  )
}
