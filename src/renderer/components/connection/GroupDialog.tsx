import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Group, GroupInput } from '@shared/index'
import { useAppStore } from '@renderer/stores/app-store'

interface GroupDialogProps {
  group?: Group | null
  defaultParentId?: string | null
  onClose: () => void
}

export function GroupDialog({ group, defaultParentId, onClose }: GroupDialogProps): React.JSX.Element {
  const groups = useAppStore((s) => s.groups)
  const createGroup = useAppStore((s) => s.createGroup)
  const updateGroup = useAppStore((s) => s.updateGroup)
  const deleteGroup = useAppStore((s) => s.deleteGroup)

  const [name, setName] = useState(group?.name ?? '')
  const [parentId, setParentId] = useState(group?.parentId ?? defaultParentId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isEditing = Boolean(group)

  useEffect(() => {
    setName(group?.name ?? '')
    setParentId(group?.parentId ?? defaultParentId ?? '')
  }, [group, defaultParentId])

  const parentOptions = groups.filter((g) => g.id !== group?.id && g.id !== 'default')

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) {
      setError('请填写分组名称')
      return
    }

    const input: GroupInput = {
      name: name.trim(),
      parentId: parentId || undefined
    }

    try {
      setSaving(true)
      setError(null)
      if (isEditing && group) {
        const result = await updateGroup(group.id, input)
        if (!result) {
          setError('无法更新此分组')
          return
        }
      } else {
        await createGroup(input)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!group) return
    if (!confirm(`确定删除分组「${group.name}」？组内连接将移至默认分组。`)) return
    const ok = await deleteGroup(group.id)
    if (!ok) {
      setError('无法删除：请先删除子分组')
      return
    }
    onClose()
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="panel w-full max-w-sm rounded-lg border shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-semibold">{isEditing ? '编辑分组' : '新建分组'}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <label className="block">
            <span className="mb-1 block text-xs text-accent-muted">名称</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="生产环境"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-accent-muted">父分组（可选）</span>
            <select
              className="input"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">无（顶级分组）</option>
              {parentOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-surface-border px-4 py-3">
          <div>
            {isEditing && group?.id !== 'default' && (
              <button
                className="text-sm text-red-400 hover:text-red-300"
                onClick={() => void handleDelete()}
              >
                删除
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-accent-muted"
              onClick={onClose}
            >
              取消
            </button>
            <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
