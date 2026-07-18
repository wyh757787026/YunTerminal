import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { StoredConnection } from '@shared/types/connection'
import type { StoredTunnel, TunnelInput, TunnelType } from '@shared/types/tunnel'
import {
  getTunnelFieldLabels,
  TUNNEL_QUICK_FILLS,
  TUNNEL_TYPE_OPTIONS
} from '@renderer/lib/tunnel-config'

interface TunnelDialogProps {
  connectionId: string
  tunnel?: StoredTunnel | null
  sshConnections?: StoredConnection[]
  allowConnectionPick?: boolean
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  connectionId: string
  name: string
  type: TunnelType
  bindHost: string
  bindPort: string
  targetHost: string
  targetPort: string
  autoStart: boolean
  autoReconnect: boolean
  note: string
}

function toFormState(connectionId: string, tunnel?: StoredTunnel | null): FormState {
  return {
    connectionId: tunnel?.connectionId ?? connectionId,
    name: tunnel?.name ?? '',
    type: tunnel?.type ?? 'remote',
    bindHost: tunnel?.bindHost ?? '0.0.0.0',
    bindPort: String(tunnel?.bindPort ?? 9000),
    targetHost: tunnel?.targetHost ?? '127.0.0.1',
    targetPort: String(tunnel?.targetPort ?? 3000),
    autoStart: tunnel?.autoStart ?? false,
    autoReconnect: tunnel?.autoReconnect ?? true,
    note: tunnel?.note ?? ''
  }
}

function FormRow({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-4">
      <div className="w-32 shrink-0 whitespace-nowrap pt-2 text-sm text-terminal-fg/90">
        {label}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {children}
        {hint ? <p className="text-[11px] leading-relaxed text-accent-muted/80">{hint}</p> : null}
      </div>
    </div>
  )
}

function AddressPortInput({
  host,
  port,
  onHostChange,
  onPortChange,
  hostPlaceholder = '127.0.0.1',
  portPlaceholder = '8080'
}: {
  host: string
  port: string
  onHostChange: (value: string) => void
  onPortChange: (value: string) => void
  hostPlaceholder?: string
  portPlaceholder?: string
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[1fr_5.5rem] gap-2">
      <input
        className="input w-full font-mono text-sm"
        value={host}
        onChange={(e) => onHostChange(e.target.value)}
        placeholder={hostPlaceholder}
      />
      <input
        className="input w-full font-mono text-sm"
        value={port}
        onChange={(e) => onPortChange(e.target.value)}
        placeholder={portPlaceholder}
      />
    </div>
  )
}

function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-surface-border'
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

export function TunnelDialog({
  connectionId,
  tunnel,
  sshConnections = [],
  allowConnectionPick = false,
  onClose,
  onSaved
}: TunnelDialogProps): React.JSX.Element {
  const [form, setForm] = useState<FormState>(() => toFormState(connectionId, tunnel))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = Boolean(tunnel)

  const showServerPick = allowConnectionPick && sshConnections.length > 0
  const selectedServer = useMemo(
    () => sshConnections.find((c) => c.id === form.connectionId),
    [form.connectionId, sshConnections]
  )

  const typeMeta = TUNNEL_TYPE_OPTIONS.find((item) => item.value === form.type)
  const fieldLabels = getTunnelFieldLabels(form.type)
  const isDynamic = form.type === 'dynamic'

  useEffect(() => {
    setForm(toFormState(connectionId, tunnel))
  }, [connectionId, tunnel])

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  const applyQuickFill = (preset: (typeof TUNNEL_QUICK_FILLS)[number]): void => {
    setForm((prev) => ({
      ...prev,
      type: preset.type,
      bindHost: preset.bindHost,
      bindPort: preset.bindPort,
      targetHost: preset.targetHost,
      targetPort: preset.targetPort
    }))
    setError(null)
  }

  const buildInput = (): TunnelInput => {
    const bindPort = Number(form.bindPort)
    const targetPort = Number(form.targetPort)

    if (!form.name.trim()) throw new Error('请填写名称')
    if (!Number.isFinite(bindPort) || bindPort < 1 || bindPort > 65535) {
      throw new Error('监听端口无效')
    }
    if (!isDynamic) {
      if (!form.targetHost.trim()) throw new Error('请填写目标地址')
      if (!Number.isFinite(targetPort) || targetPort < 1 || targetPort > 65535) {
        throw new Error('目标端口无效')
      }
    }

    return {
      connectionId: form.connectionId,
      name: form.name.trim(),
      type: form.type,
      bindHost: form.bindHost.trim() || '127.0.0.1',
      bindPort,
      targetHost: isDynamic ? '' : form.targetHost.trim(),
      targetPort: isDynamic ? 0 : targetPort,
      autoStart: form.autoStart,
      autoReconnect: form.autoReconnect,
      note: form.note.trim() || undefined
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const input = buildInput()
      if (isEditing && tunnel) {
        await window.api.tunnel.update(tunnel.id, input)
      } else {
        await window.api.tunnel.create(input)
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
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="panel flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-sm font-medium">{isEditing ? '编辑隧道' : '新建隧道'}</h2>
          <button className="btn-icon h-7 w-7" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <FormRow label="类型">
            <select
              className="input w-full"
              value={form.type}
              onChange={(e) => updateField('type', e.target.value as TunnelType)}
            >
              {TUNNEL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {typeMeta ? (
              <p className="text-[11px] leading-relaxed text-accent-muted/80">{typeMeta.description}</p>
            ) : null}
          </FormRow>

          <FormRow label="服务器">
            {showServerPick ? (
              <select
                className="input w-full"
                value={form.connectionId}
                onChange={(e) => updateField('connectionId', e.target.value)}
              >
                {sshConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input w-full cursor-not-allowed opacity-80"
                value={selectedServer?.name ?? '当前 SSH 连接'}
                readOnly
              />
            )}
          </FormRow>

          <FormRow label="名称">
            <input
              className="input w-full"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="本地3000端口 / 服务器Redis数据库"
            />
          </FormRow>

          <FormRow
            label="自动重连"
            hint="隧道连接意外断开后，将自动尝试恢复（仅对本条隧道生效）。"
          >
            <div className="flex items-center gap-2 pt-1">
              <Toggle
                checked={form.autoReconnect}
                onChange={(value) => updateField('autoReconnect', value)}
              />
              <span className="text-xs text-accent-muted">{form.autoReconnect ? '开启' : '关闭'}</span>
            </div>
          </FormRow>

          <FormRow
            label="自动启动"
            hint="SSH 终端连接成功后，自动启动本条隧道。"
          >
            <div className="flex items-center gap-2 pt-1">
              <Toggle checked={form.autoStart} onChange={(value) => updateField('autoStart', value)} />
              <span className="text-xs text-accent-muted">{form.autoStart ? '开启' : '关闭'}</span>
            </div>
          </FormRow>

          <div className="rounded-lg border border-surface-border/60 bg-surface-overlay/20 p-3 space-y-3">
            <FormRow label={fieldLabels.bindTitle} hint={fieldLabels.bindHint}>
              <AddressPortInput
                host={form.bindHost}
                port={form.bindPort}
                onHostChange={(value) => updateField('bindHost', value)}
                onPortChange={(value) => updateField('bindPort', value)}
              />
            </FormRow>

            {!isDynamic && (
              <FormRow label={fieldLabels.targetTitle} hint={fieldLabels.targetHint}>
                <AddressPortInput
                  host={form.targetHost}
                  port={form.targetPort}
                  onHostChange={(value) => updateField('targetHost', value)}
                  onPortChange={(value) => updateField('targetPort', value)}
                />
              </FormRow>
            )}

            <div className="space-y-2 border-t border-surface-border/40 pt-3">
              <div className="text-xs text-accent-muted">快速填充</div>
              <div className="flex flex-wrap gap-1.5">
                {TUNNEL_QUICK_FILLS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="rounded-md border border-surface-border/60 bg-surface-overlay/40 px-2 py-1 text-[11px] text-accent-muted transition-colors hover:border-accent/30 hover:text-terminal-fg"
                    onClick={() => applyQuickFill(preset)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <FormRow label="备注">
            <textarea
              className="input min-h-[56px] w-full resize-y"
              value={form.note}
              onChange={(e) => updateField('note', e.target.value)}
              placeholder="可选"
            />
          </FormRow>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-surface-border px-4 py-3">
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
