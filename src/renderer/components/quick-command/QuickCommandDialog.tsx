import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { QuickCommandInput, StoredQuickCommand } from '@shared/types/quick-command'

interface QuickCommandDialogProps {
  connectionId: string | null
  command?: StoredQuickCommand | null
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  name: string
  command: string
  scope: 'global' | 'connection'
}

function toFormState(connectionId: string | null, command?: StoredQuickCommand | null): FormState {
  const isGlobal = command ? command.connectionId === null : false
  return {
    name: command?.name ?? '',
    command: command?.command ?? '',
    scope: command ? (isGlobal ? 'global' : 'connection') : connectionId ? 'connection' : 'global'
  }
}

export function QuickCommandDialog({
  connectionId,
  command,
  onClose,
  onSaved
}: QuickCommandDialogProps): React.JSX.Element {
  const [form, setForm] = useState<FormState>(() => toFormState(connectionId, command))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = Boolean(command)

  useEffect(() => {
    setForm(toFormState(connectionId, command))
  }, [connectionId, command])

  const buildInput = (): QuickCommandInput => {
    if (!form.name.trim()) throw new Error('请填写命令名称')
    if (!form.command.trim()) throw new Error('请填写命令内容')

    const scopedConnectionId = form.scope === 'connection' ? connectionId : null
    if (form.scope === 'connection' && !scopedConnectionId) {
      throw new Error('当前无 SSH 连接，无法创建连接专属命令')
    }

    return {
      connectionId: scopedConnectionId,
      name: form.name.trim(),
      command: form.command
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const input = buildInput()
      if (isEditing && command) {
        await window.api.quickCommand.update(command.id, input)
      } else {
        await window.api.quickCommand.create(input)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="panel w-full max-w-lg border shadow-xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-medium">{isEditing ? '编辑快速命令' : '新建快速命令'}</h2>
          <button className="btn-icon h-7 w-7" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <label className="block space-y-1">
            <span className="text-xs text-accent-muted">名称</span>
            <input
              className="input w-full"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="例如：查看磁盘"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-accent-muted">命令</span>
            <textarea
              className="input min-h-24 w-full font-mono text-xs"
              value={form.command}
              onChange={(e) => setForm((prev) => ({ ...prev, command: e.target.value }))}
              placeholder="df -h"
            />
            <span className="text-[11px] text-accent-muted">
              支持变量：{'{{host}}'} {'{{user}}'} {'{{name}}'} {'{{port}}'}
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-accent-muted">作用范围</span>
            <select
              className="input w-full"
              value={form.scope}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, scope: e.target.value as FormState['scope'] }))
              }
            >
              <option value="global">全局（所有连接可用）</option>
              <option value="connection" disabled={!connectionId}>
                当前连接专属
              </option>
            </select>
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={onClose}>
            取消
          </button>
          <button
            className="btn-primary px-3 py-1.5 text-xs"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
