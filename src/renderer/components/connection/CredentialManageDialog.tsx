import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { CredentialInput, CredentialType, StoredCredential } from '@shared/types/credential'

interface CredentialManageDialogProps {
  onClose: () => void
  onChanged?: () => void
}

interface FormState {
  name: string
  type: CredentialType
  username: string
  password: string
  privateKeyPath: string
  passphrase: string
}

const emptyForm = (): FormState => ({
  name: '',
  type: 'password',
  username: '',
  password: '',
  privateKeyPath: '',
  passphrase: ''
})

export function CredentialManageDialog({
  onClose,
  onChanged
}: CredentialManageDialogProps): React.JSX.Element {
  const [credentials, setCredentials] = useState<StoredCredential[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadCredentials = useCallback(async (): Promise<void> => {
    const list = await window.api.credential.list()
    setCredentials(list)
  }, [])

  useEffect(() => {
    void loadCredentials()
  }, [loadCredentials])

  const startCreate = (): void => {
    setEditingId('new')
    setForm(emptyForm())
    setError(null)
  }

  const startEdit = (credential: StoredCredential): void => {
    setEditingId(credential.id)
    setForm({
      name: credential.name,
      type: credential.type,
      username: credential.username ?? '',
      password: '',
      privateKeyPath: '',
      passphrase: ''
    })
    setError(null)
  }

  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) {
      setError('请填写凭证名称')
      return
    }

    try {
      setSaving(true)
      setError(null)

      const input: CredentialInput = {
        name: form.name.trim(),
        type: form.type,
        username: form.username.trim() || undefined
      }

      const secrets: CredentialInput['secrets'] = {}
      if (form.type === 'password') {
        if (editingId === 'new' && !form.password) {
          throw new Error('请填写密码')
        }
        if (form.password) secrets.password = form.password
      } else {
        if (editingId === 'new' && !form.privateKeyPath.trim()) {
          throw new Error('请填写私钥路径')
        }
        if (form.privateKeyPath.trim()) secrets.privateKeyPath = form.privateKeyPath.trim()
        if (form.passphrase) secrets.passphrase = form.passphrase
      }

      if (Object.keys(secrets).length > 0) {
        input.secrets = secrets
      }

      if (editingId === 'new') {
        await window.api.credential.create(input)
      } else if (editingId) {
        await window.api.credential.update(editingId, input)
      }

      setEditingId(null)
      setForm(emptyForm())
      await loadCredentials()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm('确定删除此登录凭证？')) return
    await window.api.credential.delete(id)
    if (editingId === id) {
      setEditingId(null)
      setForm(emptyForm())
    }
    await loadCredentials()
    onChanged?.()
  }

  return (
    <div className="modal-overlay fixed inset-0 z-[55] flex items-center justify-center">
      <div className="panel max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold text-terminal-fg">登录凭证库</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-accent-muted">凭证可在多个 SSH 连接中复用</p>
            <button className="btn-primary flex items-center gap-1 px-2 py-1 text-xs" onClick={startCreate}>
              <Plus size={12} />
              新建
            </button>
          </div>

          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-surface-border p-2">
            {credentials.length === 0 ? (
              <p className="text-xs text-accent-muted">暂无凭证</p>
            ) : (
              credentials.map((credential) => (
                <div
                  key={credential.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-overlay/60"
                >
                  <button className="min-w-0 flex-1 text-left text-sm" onClick={() => startEdit(credential)}>
                    <span className="font-medium">{credential.name}</span>
                    <span className="ml-2 text-xs text-accent-muted">
                      {credential.type === 'password' ? '密码' : '私钥'}
                    </span>
                  </button>
                  <button
                    className="btn-icon-sm text-red-400"
                    onClick={() => void handleDelete(credential.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>

          {editingId && (
            <div className="space-y-3 rounded-md border border-surface-border p-3">
              <Field label="名称">
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="生产环境 root"
                />
              </Field>
              <Field label="类型">
                <select
                  className="input"
                  value={form.type}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, type: e.target.value as CredentialType }))
                  }
                >
                  <option value="password">密码</option>
                  <option value="key">私钥</option>
                </select>
              </Field>
              <Field label="用户名提示（可选）">
                <input
                  className="input"
                  value={form.username}
                  onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="root"
                />
              </Field>
              {form.type === 'password' ? (
                <Field label={editingId === 'new' ? '密码' : '密码（留空保持不变）'}>
                  <input
                    className="input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </Field>
              ) : (
                <>
                  <Field label={editingId === 'new' ? '私钥路径' : '私钥路径（留空保持不变）'}>
                    <input
                      className="input"
                      value={form.privateKeyPath}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, privateKeyPath: e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="私钥密码（可选）">
                    <input
                      className="input"
                      type="password"
                      value={form.passphrase}
                      onChange={(e) => setForm((prev) => ({ ...prev, passphrase: e.target.value }))}
                    />
                  </Field>
                </>
              )}
              <div className="flex justify-end gap-2">
                <button
                  className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-accent-muted"
                  onClick={() => {
                    setEditingId(null)
                    setForm(emptyForm())
                  }}
                >
                  取消
                </button>
                <button className="btn-primary" disabled={saving} onClick={() => void handleSave()}>
                  {saving ? '保存中...' : '保存凭证'}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-accent-muted">{label}</span>
      {children}
    </label>
  )
}
