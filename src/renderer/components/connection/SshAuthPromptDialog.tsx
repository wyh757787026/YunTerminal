import { useEffect, useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import type { SshAuthRequestEvent } from '@shared/ipc'

export function SshAuthPromptDialog(): React.JSX.Element | null {
  const [request, setRequest] = useState<SshAuthRequestEvent | null>(null)
  const [password, setPassword] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [responses, setResponses] = useState<string[]>([])
  const [promptMode, setPromptMode] = useState<'password' | 'key'>('password')

  useEffect(() => {
    return window.api.ssh.onAuthRequest((event) => {
      setRequest(event)
      setPassword('')
      setPrivateKeyPath('')
      setPassphrase('')
      setResponses(event.prompts?.map(() => '') ?? [])
      setPromptMode('password')
    })
  }, [])

  if (!request) return null

  const closeWithCancel = (): void => {
    void window.api.ssh.respondAuth({ requestId: request.requestId, canceled: true })
    setRequest(null)
  }

  const submitPrompt = (): void => {
    if (promptMode === 'password') {
      if (!password.trim()) return
      void window.api.ssh.respondAuth({
        requestId: request.requestId,
        password: password.trim()
      })
    } else {
      if (!privateKeyPath.trim()) return
      void window.api.ssh.respondAuth({
        requestId: request.requestId,
        privateKeyPath: privateKeyPath.trim(),
        passphrase: passphrase || undefined
      })
    }
    setRequest(null)
  }

  const submitKeyboardInteractive = (): void => {
    void window.api.ssh.respondAuth({
      requestId: request.requestId,
      responses
    })
    setRequest(null)
  }

  const isPrompt = request.authType === 'prompt'

  return (
    <div className="modal-overlay fixed inset-0 z-[60] flex items-center justify-center">
      <div className="panel w-full max-w-md rounded-lg border shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-terminal-fg">
              {isPrompt ? '连接认证' : '交互认证'}
            </h2>
          </div>
          <button className="btn-icon" onClick={closeWithCancel}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-sm text-terminal-fg">{request.connectionName}</p>
          {request.instructions && (
            <p className="whitespace-pre-wrap text-xs text-accent-muted">{request.instructions}</p>
          )}

          {isPrompt ? (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs ${
                    promptMode === 'password'
                      ? 'bg-accent/20 text-terminal-fg'
                      : 'text-accent-muted hover:text-terminal-fg'
                  }`}
                  onClick={() => setPromptMode('password')}
                >
                  密码
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1 text-xs ${
                    promptMode === 'key'
                      ? 'bg-accent/20 text-terminal-fg'
                      : 'text-accent-muted hover:text-terminal-fg'
                  }`}
                  onClick={() => setPromptMode('key')}
                >
                  私钥
                </button>
              </div>

              {promptMode === 'password' ? (
                <label className="block">
                  <span className="mb-1 block text-xs text-accent-muted">密码</span>
                  <input
                    className="input"
                    type="password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitPrompt()
                    }}
                    placeholder="••••••••"
                  />
                </label>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-accent-muted">私钥路径</span>
                    <input
                      className="input"
                      autoFocus
                      value={privateKeyPath}
                      onChange={(e) => setPrivateKeyPath(e.target.value)}
                      placeholder="C:\Users\you\.ssh\id_rsa"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-accent-muted">私钥密码（可选）</span>
                    <input
                      className="input"
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="••••••••"
                    />
                  </label>
                </>
              )}
            </>
          ) : (
            request.prompts?.map((prompt, index) => (
              <label key={`${prompt.prompt}-${index}`} className="block">
                <span className="mb-1 block text-xs text-accent-muted">{prompt.prompt}</span>
                <input
                  className="input"
                  type={prompt.echo ? 'text' : 'password'}
                  autoFocus={index === 0}
                  value={responses[index] ?? ''}
                  onChange={(e) => {
                    setResponses((prev) => {
                      const next = [...prev]
                      next[index] = e.target.value
                      return next
                    })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitKeyboardInteractive()
                  }}
                />
              </label>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
          <button
            className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-accent-muted hover:text-terminal-fg"
            onClick={closeWithCancel}
          >
            取消
          </button>
          <button
            className="btn-primary"
            onClick={isPrompt ? submitPrompt : submitKeyboardInteractive}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
