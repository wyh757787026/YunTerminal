import { useMemo, useState } from 'react'
import { X } from 'lucide-react'

interface PermissionSet {
  read: boolean
  write: boolean
  execute: boolean
}

export interface ChmodPermissions {
  owner: PermissionSet
  group: PermissionSet
  other: PermissionSet
}

type PermissionRole = keyof ChmodPermissions
type PermissionBit = keyof PermissionSet

const ROLE_LABELS: Record<PermissionRole, string> = {
  owner: '所有者',
  group: '用户组',
  other: '公共权限'
}

const BIT_LABELS: Record<PermissionBit, string> = {
  read: '读取(R)',
  write: '写入(W)',
  execute: '执行(X)'
}

export function modeToPermissions(mode: number): ChmodPermissions {
  const owner = (mode >> 6) & 7
  const group = (mode >> 3) & 7
  const other = mode & 7

  const toSet = (bits: number): PermissionSet => ({
    read: (bits & 4) !== 0,
    write: (bits & 2) !== 0,
    execute: (bits & 1) !== 0
  })

  return {
    owner: toSet(owner),
    group: toSet(group),
    other: toSet(other)
  }
}

export function permissionsToMode(permissions: ChmodPermissions): number {
  const toBits = (set: PermissionSet): number =>
    (set.read ? 4 : 0) | (set.write ? 2 : 0) | (set.execute ? 1 : 0)

  return (toBits(permissions.owner) << 6) | (toBits(permissions.group) << 3) | toBits(permissions.other)
}

function shellQuote(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`
}

export function buildChmodCommand(options: {
  mode: number
  path: string
  sudo: boolean
  recursive: boolean
}): string {
  const octal = options.mode.toString(8).padStart(3, '0')
  const flags = options.recursive ? ' -R' : ''
  const chmod = `chmod${flags} ${octal} ${shellQuote(options.path)}`
  return options.sudo ? `sudo ${chmod}` : chmod
}

interface PermissionRowProps {
  label: string
  permissions: PermissionSet
  onToggle: (bit: PermissionBit) => void
}

function PermissionRow({ label, permissions, onToggle }: PermissionRowProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1.5">
      <span className="w-[4.5rem] shrink-0 text-sm text-terminal-fg">{label}</span>
      {(Object.keys(BIT_LABELS) as PermissionBit[]).map((bit) => (
        <label key={bit} className="flex cursor-pointer items-center gap-1.5 text-sm text-accent-muted">
          <input type="checkbox" checked={permissions[bit]} onChange={() => onToggle(bit)} />
          {BIT_LABELS[bit]}
        </label>
      ))}
    </div>
  )
}

interface ChmodDialogProps {
  path: string
  mode: number
  isDirectory: boolean
  onExecute: (command: string) => void
  onClose: () => void
}

export function ChmodDialog({
  path,
  mode,
  isDirectory,
  onExecute,
  onClose
}: ChmodDialogProps): React.JSX.Element {
  const [permissions, setPermissions] = useState<ChmodPermissions>(() => modeToPermissions(mode))
  const [sudo, setSudo] = useState(false)
  const [recursive, setRecursive] = useState(false)

  const currentMode = useMemo(() => permissionsToMode(permissions), [permissions])
  const command = useMemo(
    () =>
      buildChmodCommand({
        mode: currentMode,
        path,
        sudo,
        recursive: recursive && isDirectory
      }),
    [currentMode, path, sudo, recursive, isDirectory]
  )

  const toggle = (role: PermissionRole, bit: PermissionBit): void => {
    setPermissions((prev) => ({
      ...prev,
      [role]: { ...prev[role], [bit]: !prev[role][bit] }
    }))
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="panel w-full max-w-lg rounded-lg border shadow-2xl">
        <div className="flex items-start justify-between border-b border-surface-border px-4 py-3">
          <div className="min-w-0 pr-3">
            <p className="text-sm font-medium text-terminal-fg">修改文件权限:</p>
            <p className="mt-0.5 truncate text-xs text-accent-muted" title={path}>
              {path}
            </p>
          </div>
          <button className="btn-icon shrink-0" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1 px-4 py-3">
          {(Object.keys(ROLE_LABELS) as PermissionRole[]).map((role) => (
            <PermissionRow
              key={role}
              label={ROLE_LABELS[role]}
              permissions={permissions[role]}
              onToggle={(bit) => toggle(role, bit)}
            />
          ))}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-surface-border/60 pt-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-accent-muted">
              <input type="checkbox" checked={sudo} onChange={(e) => setSudo(e.target.checked)} />
              sudo
            </label>
            <label
              className={`flex items-center gap-1.5 text-sm ${
                isDirectory ? 'cursor-pointer text-accent-muted' : 'cursor-not-allowed text-accent-muted/40'
              }`}
            >
              <input
                type="checkbox"
                checked={recursive && isDirectory}
                disabled={!isDirectory}
                onChange={(e) => setRecursive(e.target.checked)}
              />
              递归处理
            </label>
          </div>

          <div className="pt-2">
            <p className="mb-1.5 text-xs text-accent-muted">预备执行命令:</p>
            <div className="rounded-md border border-surface-border bg-surface px-3 py-2 font-mono text-xs text-terminal-fg">
              {command}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-surface-border px-4 py-3">
          <button
            className="rounded-md border border-surface-border px-4 py-1.5 text-sm text-accent-muted"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button className="btn-primary px-4" onClick={() => onExecute(command)} type="button">
            在当前终端执行
          </button>
        </div>
      </div>
    </div>
  )
}
