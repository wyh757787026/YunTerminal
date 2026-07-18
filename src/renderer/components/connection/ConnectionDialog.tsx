import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, X } from 'lucide-react'
import type {
  AuthType,
  ConnectionInput,
  ConnectionProtocol,
  FtpSecureMode,
  FtpSettings,
  RdpDisplayMode,
  RdpRenderQuality,
  StoredConnection
} from '@shared/types/connection'
import type { VncAuthType } from '@shared/types/vnc'
import type { StoredCredential } from '@shared/types/credential'
import { CredentialManageDialog } from '@renderer/components/connection/CredentialManageDialog'
import { useAppStore } from '@renderer/stores/app-store'

interface ConnectionDialogProps {
  connection?: StoredConnection | null
  onClose: () => void
}

type DialogTab = 'basic' | 'auth' | 'jump' | 'proxy' | 'init' | 'advanced' | 'display'

interface FormState {
  name: string
  protocol: ConnectionProtocol
  host: string
  port: string
  username: string
  authType: AuthType
  credentialId: string
  groupId: string
  tags: string
  note: string
  favorite: boolean
  proxyChain: string[]
  password: string
  privateKeyPath: string
  passphrase: string
  sshProxyUrl: string
  sshInitScript: string
  sshTerminalType: string
  sshEncoding: string
  sshKeepaliveInterval: string
  sshReadyTimeout: string
  sshKex: string
  sshCipher: string
  sshHmac: string
  sshServerHostKey: string
  sshHostFingerprint: string
  sshEnableX11: boolean
  rdpDomain: string
  rdpDisplayMode: RdpDisplayMode
  rdpDesktopWidth: string
  rdpDesktopHeight: string
  rdpRenderQuality: RdpRenderQuality
  rdpEnableClipboard: boolean
  vncAuthType: VncAuthType
  vncViewOnly: boolean
  vncScaleViewport: boolean
  vncClipViewport: boolean
  vncShared: boolean
  vncQualityLevel: string
  vncCompressionLevel: string
  ftpSecureMode: FtpSecureMode
  ftpPassive: boolean
}

const SSH_TABS: Array<{ id: DialogTab; label: string }> = [
  { id: 'basic', label: '基本' },
  { id: 'auth', label: '认证' },
  { id: 'jump', label: '跳板' },
  { id: 'proxy', label: '代理' },
  { id: 'init', label: '初始化' },
  { id: 'advanced', label: '高级' }
]

const RDP_TABS: Array<{ id: DialogTab; label: string }> = [
  { id: 'basic', label: '基本' },
  { id: 'display', label: '显示' }
]

const VNC_TABS: Array<{ id: DialogTab; label: string }> = [
  { id: 'basic', label: '基本' },
  { id: 'display', label: '显示' },
  { id: 'advanced', label: '高级' }
]

const FTP_TABS: Array<{ id: DialogTab; label: string }> = [{ id: 'basic', label: '基本' }]

function resolveDefaultProtocol(
  connection: StoredConnection | null | undefined,
  protocolTab: string
): ConnectionProtocol {
  if (connection?.protocol) return connection.protocol
  if (protocolTab === 'rdp') return 'rdp'
  if (protocolTab === 'telnet') return 'telnet'
  if (protocolTab === 'vnc') return 'vnc'
  if (protocolTab === 'ftp') return 'ftp'
  return 'ssh'
}

function defaultPortForProtocol(protocol: ConnectionProtocol): number {
  if (protocol === 'rdp') return 3389
  if (protocol === 'telnet') return 23
  if (protocol === 'vnc') return 5900
  if (protocol === 'ftp') return 21
  return 22
}

function resolveFtpSecureMode(ftp?: FtpSettings): FtpSecureMode {
  if (ftp?.secureMode) return ftp.secureMode
  if (ftp?.secure) return 'explicit'
  return 'plain'
}

function defaultPortForFtpSecureMode(mode: FtpSecureMode): number {
  return mode === 'implicit' ? 990 : 21
}

const FTP_DEFAULT_PORTS = new Set(['21', '990'])

function toFormState(
  connection?: StoredConnection | null,
  defaultGroupId?: string,
  defaultProtocol?: ConnectionProtocol
): FormState {
  const protocol = connection?.protocol ?? defaultProtocol ?? 'ssh'
  return {
    name: connection?.name ?? '',
    protocol,
    host: connection?.host ?? '',
    port: String(connection?.port ?? defaultPortForProtocol(protocol)),
    username: connection?.username ?? '',
    authType: connection?.authType ?? 'password',
    credentialId: connection?.credentialId ?? '',
    groupId: connection?.groupId ?? defaultGroupId ?? 'default',
    tags: connection?.tags?.join(', ') ?? '',
    note: connection?.note ?? '',
    favorite: connection?.favorite ?? false,
    proxyChain: connection?.proxyChain ?? [],
    password: '',
    privateKeyPath: '',
    passphrase: '',
    sshProxyUrl: connection?.ssh?.proxyUrl ?? '',
    sshInitScript: connection?.ssh?.initScript ?? '',
    sshTerminalType: connection?.ssh?.terminalType ?? 'xterm-256color',
    sshEncoding: connection?.ssh?.encoding ?? 'utf-8',
    sshKeepaliveInterval: String(connection?.ssh?.keepaliveInterval ?? 10000),
    sshReadyTimeout: String(connection?.ssh?.readyTimeout ?? 20000),
    sshKex: connection?.ssh?.kex ?? '',
    sshCipher: connection?.ssh?.cipher ?? '',
    sshHmac: connection?.ssh?.hmac ?? '',
    sshServerHostKey: connection?.ssh?.serverHostKey ?? '',
    sshHostFingerprint: connection?.ssh?.hostFingerprint ?? '',
    sshEnableX11: connection?.ssh?.enableX11 ?? false,
    rdpDomain: connection?.rdp?.domain ?? '',
    rdpDisplayMode: connection?.rdp?.displayMode ?? 'followWindow',
    rdpDesktopWidth: String(connection?.rdp?.desktopWidth ?? 1920),
    rdpDesktopHeight: String(connection?.rdp?.desktopHeight ?? 1080),
    rdpRenderQuality: connection?.rdp?.renderQuality ?? 'balanced',
    rdpEnableClipboard: connection?.rdp?.enableClipboard !== false,
    vncAuthType: connection?.vnc?.authType ?? 'password',
    vncViewOnly: connection?.vnc?.viewOnly ?? false,
    vncScaleViewport: connection?.vnc?.scaleViewport ?? true,
    vncClipViewport: connection?.vnc?.clipViewport ?? false,
    vncShared: connection?.vnc?.shared ?? true,
    vncQualityLevel: String(connection?.vnc?.qualityLevel ?? 6),
    vncCompressionLevel: String(connection?.vnc?.compressionLevel ?? 2),
    ftpSecureMode: resolveFtpSecureMode(connection?.ftp),
    ftpPassive: connection?.ftp?.passive !== false
  }
}

export function ConnectionDialog({ connection, onClose }: ConnectionDialogProps): React.JSX.Element {
  const connections = useAppStore((s) => s.connections)
  const groups = useAppStore((s) => s.groups)
  const protocolTab = useAppStore((s) => s.protocolTab)
  const createConnection = useAppStore((s) => s.createConnection)
  const updateConnection = useAppStore((s) => s.updateConnection)
  const deleteConnection = useAppStore((s) => s.deleteConnection)

  const defaultProtocol = resolveDefaultProtocol(connection, protocolTab)
  const [form, setForm] = useState<FormState>(() =>
    toFormState(connection, groups[0]?.id, defaultProtocol)
  )
  const [dialogTab, setDialogTab] = useState<DialogTab>('basic')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<StoredCredential[]>([])
  const [credentialManageOpen, setCredentialManageOpen] = useState(false)
  const [showTelnetPassword, setShowTelnetPassword] = useState(false)
  const [showVncPassword, setShowVncPassword] = useState(false)
  const [showFtpPassword, setShowFtpPassword] = useState(false)

  const isEditing = Boolean(connection)
  const isRdp = form.protocol === 'rdp'
  const isTelnet = form.protocol === 'telnet'
  const isVnc = form.protocol === 'vnc'
  const isFtp = form.protocol === 'ftp'
  const isSsh = form.protocol === 'ssh'
  const protocolLocked = !isEditing
  const tabs = isRdp ? RDP_TABS : isVnc ? VNC_TABS : isFtp ? FTP_TABS : SSH_TABS

  const proxyOptions = useMemo(
    () => connections.filter((c) => c.id !== connection?.id && c.protocol === 'ssh'),
    [connections, connection?.id]
  )

  useEffect(() => {
    setForm(toFormState(connection, groups[0]?.id, defaultProtocol))
    setDialogTab('basic')
  }, [connection, groups, defaultProtocol])

  useEffect(() => {
    if (isRdp || isTelnet || isVnc || isFtp) return
    void window.api.credential.list().then(setCredentials)
  }, [isRdp, isTelnet, isVnc, isFtp, credentialManageOpen])

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setTestResult(null)
    setError(null)
  }

  const toggleProxy = (id: string): void => {
    setForm((prev) => ({
      ...prev,
      proxyChain: prev.proxyChain.includes(id)
        ? prev.proxyChain.filter((pid) => pid !== id)
        : [...prev.proxyChain, id]
    }))
  }

  const buildInput = (): ConnectionInput => {
    const port = Number(form.port)
    if (isTelnet || isVnc) {
      if (!form.name.trim() || !form.host.trim()) {
        throw new Error('请填写连接名称和地址')
      }
    } else if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      throw new Error('请填写连接名称、主机地址和用户名')
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error('端口号无效')
    }

    const input: ConnectionInput = {
      name: form.name.trim(),
      protocol: form.protocol,
      host: form.host.trim(),
      port,
      username: form.username.trim(),
      authType: isRdp || isTelnet || isVnc || isFtp ? 'password' : form.authType,
      credentialId:
        isSsh && form.authType === 'credential' ? form.credentialId || undefined : undefined,
      groupId: form.groupId,
      tags: isTelnet || isVnc || isFtp
        ? undefined
        : form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
      note: form.note.trim() || undefined,
      favorite: isTelnet || isVnc || isFtp ? false : form.favorite,
      proxyChain: isSsh && form.proxyChain.length > 0 ? form.proxyChain : undefined
    }

    if (isRdp) {
      const desktopWidth = Number(form.rdpDesktopWidth)
      const desktopHeight = Number(form.rdpDesktopHeight)
      if (form.rdpDisplayMode === 'fixed') {
        if (
          !Number.isFinite(desktopWidth) ||
          !Number.isFinite(desktopHeight) ||
          desktopWidth < 640 ||
          desktopHeight < 480
        ) {
          throw new Error('分辨率无效，宽度至少 640，高度至少 480')
        }
      }

      input.rdp = {
        domain: form.rdpDomain.trim() || undefined,
        displayMode: form.rdpDisplayMode,
        desktopWidth: form.rdpDisplayMode === 'fixed' ? desktopWidth : undefined,
        desktopHeight: form.rdpDisplayMode === 'fixed' ? desktopHeight : undefined,
        renderQuality: form.rdpRenderQuality,
        enableClipboard: form.rdpEnableClipboard
      }
    } else if (isVnc) {
      const qualityLevel = Number(form.vncQualityLevel)
      const compressionLevel = Number(form.vncCompressionLevel)
      if (!Number.isFinite(qualityLevel) || qualityLevel < 0 || qualityLevel > 9) {
        throw new Error('画质等级需在 0-9 之间')
      }
      if (!Number.isFinite(compressionLevel) || compressionLevel < 0 || compressionLevel > 9) {
        throw new Error('压缩等级需在 0-9 之间')
      }
      input.vnc = {
        authType: form.vncAuthType,
        viewOnly: form.vncViewOnly,
        scaleViewport: form.vncScaleViewport,
        clipViewport: form.vncClipViewport,
        shared: form.vncShared,
        qualityLevel,
        compressionLevel
      }
    } else if (isFtp) {
      input.ftp = {
        secureMode: form.ftpSecureMode,
        secure: form.ftpSecureMode === 'explicit',
        passive: form.ftpPassive
      }
    } else if (!isTelnet) {
      const keepaliveInterval = Number(form.sshKeepaliveInterval)
      const readyTimeout = Number(form.sshReadyTimeout)
      if (!Number.isFinite(keepaliveInterval) || keepaliveInterval < 0) {
        throw new Error('心跳间隔无效')
      }
      if (!Number.isFinite(readyTimeout) || readyTimeout < 1000) {
        throw new Error('连接超时至少 1000 毫秒')
      }

      if (form.sshProxyUrl.trim()) {
        try {
          new URL(form.sshProxyUrl.trim())
        } catch {
          throw new Error('代理 URL 格式无效')
        }
      }

      input.ssh = {
        proxyUrl: form.sshProxyUrl.trim() || undefined,
        initScript: form.sshInitScript.trim() || undefined,
        terminalType: form.sshTerminalType.trim() || undefined,
        encoding: form.sshEncoding.trim() || undefined,
        keepaliveInterval,
        readyTimeout,
        kex: form.sshKex.trim() || undefined,
        cipher: form.sshCipher.trim() || undefined,
        hmac: form.sshHmac.trim() || undefined,
        serverHostKey: form.sshServerHostKey.trim() || undefined,
        hostFingerprint: form.sshHostFingerprint.trim() || undefined,
        enableX11: form.sshEnableX11
      }
    }

    if (isTelnet || isVnc || isFtp) {
      if (form.password) {
        input.secrets = { password: form.password }
      }
    } else if (!isRdp && form.authType !== 'prompt' && form.authType !== 'credential') {
      const secrets: ConnectionInput['secrets'] = {}
      if (
        (form.authType === 'password' || form.authType === 'keyboard-interactive') &&
        form.password
      ) {
        secrets.password = form.password
      }
      if (form.authType === 'key') {
        if (form.privateKeyPath.trim()) {
          secrets.privateKeyPath = form.privateKeyPath.trim()
        }
        if (form.passphrase) {
          secrets.passphrase = form.passphrase
        }
      }
      if (Object.keys(secrets).length > 0) {
        input.secrets = secrets
      }
    } else if (isRdp && form.password) {
      input.secrets = { password: form.password }
    }

    return input
  }

  const handleSave = async (): Promise<void> => {
    try {
      setSaving(true)
      setError(null)
      const input = buildInput()

      if (isEditing && connection) {
        await updateConnection(connection.id, input)
      } else {
        if (!isRdp && !isTelnet && !isVnc && !isFtp) {
          if (form.authType === 'password' && !form.password) {
            throw new Error('请填写密码')
          }
          if (form.authType === 'key' && !form.privateKeyPath.trim()) {
            throw new Error('请填写私钥路径')
          }
          if (form.authType === 'credential' && !form.credentialId) {
            throw new Error('请选择登录凭证')
          }
        } else if (isFtp && !form.password && !(isEditing && connection?.hasPassword)) {
          throw new Error('请填写 FTP 密码')
        } else if (!form.password) {
          // RDP / Telnet password optional
        }
        await createConnection(input)
      }

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    if (!connection) {
      setError('请先保存连接后再测试')
      return
    }

    try {
      setTesting(true)
      setError(null)
      setTestResult(null)
      const result = await window.api.connection.test(connection.id)
      if (result.success) {
        setTestResult(`连接成功，延迟 ${result.latencyMs}ms`)
      } else {
        setError(result.message ?? '连接失败')
      }
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!connection) return
    if (!confirm(`确定删除连接「${connection.name}」？`)) return
    await deleteConnection(connection.id)
    onClose()
  }

  const showBasic = dialogTab === 'basic'
  const showAuth = isSsh && dialogTab === 'auth'
  const showJump = isSsh && dialogTab === 'jump'
  const showProxy = isSsh && dialogTab === 'proxy'
  const showInit = isSsh && dialogTab === 'init'
  const showAdvanced = isSsh && dialogTab === 'advanced'
  const showDisplay = (isRdp || isVnc) && dialogTab === 'display'
  const showVncAdvanced = isVnc && dialogTab === 'advanced'

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="panel flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-terminal-fg">
              {isEditing ? '编辑连接' : '新建连接'}
            </h2>
            <span className="rounded bg-surface-overlay px-1.5 py-0.5 text-[10px] text-accent-muted">
              {isRdp ? 'RDP' : isTelnet ? 'Telnet' : isVnc ? 'VNC' : isFtp ? 'FTP' : 'SSH'}
            </span>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {!isTelnet && !isFtp && (
          <div className="flex shrink-0 overflow-x-auto border-b border-surface-border px-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`shrink-0 border-b-2 px-3 py-2 text-xs ${
                  dialogTab === tab.id
                    ? 'border-accent text-terminal-fg'
                    : 'border-transparent text-accent-muted hover:text-terminal-fg'
                }`}
                onClick={() => setDialogTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {showBasic && isTelnet && (
            <>
              <Field label="名称">
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="H3"
                />
              </Field>

              <Field label="分组">
                <select
                  className="input"
                  value={form.groupId}
                  onChange={(e) => updateField('groupId', e.target.value)}
                >
                  <option value="" disabled>
                    请选择分组
                  </option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="地址"
                hint="填写 Telnet 服务地址和端口。"
              >
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <input
                    className="input"
                    value={form.host}
                    onChange={(e) => updateField('host', e.target.value)}
                    placeholder="112.221.141.33"
                  />
                  <input
                    className="input"
                    value={form.port}
                    onChange={(e) => updateField('port', e.target.value)}
                    placeholder="23"
                  />
                </div>
              </Field>

              <Field
                label="用户"
                hint="设备需要登录时再填写用户名和密码。"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input"
                    value={form.username}
                    onChange={(e) => updateField('username', e.target.value)}
                    placeholder="用户名"
                  />
                  <div className="relative">
                    <input
                      className="input w-full pr-9"
                      type={showTelnetPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      placeholder={
                        isEditing && connection?.hasPassword ? '留空保持不变' : '密码'
                      }
                    />
                    <button
                      type="button"
                      className="btn-icon-sm absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowTelnetPassword((v) => !v)}
                      tabIndex={-1}
                    >
                      {showTelnetPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </Field>

              <Field label="备注">
                <textarea
                  className="input min-h-[72px] resize-y"
                  value={form.note}
                  onChange={(e) => updateField('note', e.target.value)}
                  placeholder=""
                />
              </Field>
            </>
          )}

          {showBasic && isFtp && (
            <>
              <Field label="名称">
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="FTP 站点"
                />
              </Field>

              <Field label="分组">
                <select
                  className="input"
                  value={form.groupId}
                  onChange={(e) => updateField('groupId', e.target.value)}
                >
                  <option value="" disabled>
                    请选择分组
                  </option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="地址" hint="明文/显式 FTPS 默认 21，隐式 FTPS 默认 990。">
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <input
                    className="input"
                    value={form.host}
                    onChange={(e) => updateField('host', e.target.value)}
                    placeholder="ftp.example.com"
                  />
                  <input
                    className="input"
                    value={form.port}
                    onChange={(e) => updateField('port', e.target.value)}
                    placeholder="21"
                  />
                </div>
              </Field>

              <Field label="用户">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input"
                    value={form.username}
                    onChange={(e) => updateField('username', e.target.value)}
                    placeholder="用户名"
                  />
                  <div className="relative">
                    <input
                      className="input w-full pr-9"
                      type={showFtpPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      placeholder={
                        isEditing && connection?.hasPassword ? '留空保持不变' : '密码'
                      }
                    />
                    <button
                      type="button"
                      className="btn-icon-sm absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowFtpPassword((v) => !v)}
                      tabIndex={-1}
                    >
                      {showFtpPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </Field>

              <Field label="加密" hint="明文 / 显式 FTPS（21）/ 隐式 FTPS（990）">
                <select
                  className="input"
                  value={form.ftpSecureMode}
                  onChange={(e) => {
                    const mode = e.target.value as FtpSecureMode
                    setForm((prev) => {
                      const nextPort = FTP_DEFAULT_PORTS.has(prev.port)
                        ? String(defaultPortForFtpSecureMode(mode))
                        : prev.port
                      return { ...prev, ftpSecureMode: mode, port: nextPort }
                    })
                  }}
                >
                  <option value="plain">仅使用普通 FTP（不安全）</option>
                  <option value="explicit">需要显式 FTP over TLS</option>
                  <option value="implicit">需要隐式 FTP over TLS</option>
                </select>
              </Field>

              <Field
                label="传输模式"
                hint="被动（推荐）：本机连服务器数据端口。主动：服务器回连本机，局域网或部分旧服务需要。"
              >
                <select
                  className="input"
                  value={form.ftpPassive ? 'passive' : 'active'}
                  onChange={(e) => updateField('ftpPassive', e.target.value === 'passive')}
                >
                  <option value="passive">被动（PASV）</option>
                  <option value="active">主动（PORT）</option>
                </select>
              </Field>

              <Field label="备注">
                <textarea
                  className="input min-h-[72px] resize-y"
                  value={form.note}
                  onChange={(e) => updateField('note', e.target.value)}
                  placeholder=""
                />
              </Field>
            </>
          )}

          {showBasic && isVnc && (
            <>
              <Field label="名称">
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="VNC 桌面"
                />
              </Field>

              <Field label="分组">
                <select
                  className="input"
                  value={form.groupId}
                  onChange={(e) => updateField('groupId', e.target.value)}
                >
                  <option value="" disabled>
                    请选择分组
                  </option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="地址" hint="填写 VNC 服务地址和端口，默认 5900。">
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <input
                    className="input"
                    value={form.host}
                    onChange={(e) => updateField('host', e.target.value)}
                    placeholder="192.168.1.88"
                  />
                  <input
                    className="input"
                    value={form.port}
                    onChange={(e) => updateField('port', e.target.value)}
                    placeholder="5900"
                  />
                </div>
              </Field>

              <Field label="认证方式">
                <select
                  className="input"
                  value={form.vncAuthType}
                  onChange={(e) => updateField('vncAuthType', e.target.value as VncAuthType)}
                >
                  <option value="none">无认证</option>
                  <option value="password">VNC 密码</option>
                  <option value="usernamePassword">用户名 + 密码</option>
                </select>
              </Field>

              {form.vncAuthType !== 'none' && (
                <Field
                  label={form.vncAuthType === 'usernamePassword' ? '用户' : '密码'}
                  hint={
                    form.vncAuthType === 'usernamePassword'
                      ? '部分 VNC 服务端需要用户名和密码。'
                      : '填写 VNC 访问密码。'
                  }
                >
                  {form.vncAuthType === 'usernamePassword' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="input"
                        value={form.username}
                        onChange={(e) => updateField('username', e.target.value)}
                        placeholder="用户名"
                      />
                      <div className="relative">
                        <input
                          className="input w-full pr-9"
                          type={showVncPassword ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) => updateField('password', e.target.value)}
                          placeholder={
                            isEditing && connection?.hasPassword ? '留空保持不变' : '密码'
                          }
                        />
                        <button
                          type="button"
                          className="btn-icon-sm absolute right-1 top-1/2 -translate-y-1/2"
                          onClick={() => setShowVncPassword((v) => !v)}
                          tabIndex={-1}
                        >
                          {showVncPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        className="input w-full pr-9"
                        type={showVncPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={(e) => updateField('password', e.target.value)}
                        placeholder={
                          isEditing && connection?.hasPassword ? '留空保持不变' : 'VNC 密码'
                        }
                      />
                      <button
                        type="button"
                        className="btn-icon-sm absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowVncPassword((v) => !v)}
                        tabIndex={-1}
                      >
                        {showVncPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  )}
                </Field>
              )}

              <Field label="备注">
                <textarea
                  className="input min-h-[72px] resize-y"
                  value={form.note}
                  onChange={(e) => updateField('note', e.target.value)}
                  placeholder=""
                />
              </Field>
            </>
          )}

          {showBasic && !isTelnet && !isVnc && !isFtp && (
            <>
              <Field label="名称">
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="My Server"
                />
              </Field>

              {protocolLocked ? (
                <Field label="协议">
                  <input
                    className="input cursor-not-allowed opacity-70"
                    value={isRdp ? 'RDP 远程桌面' : isTelnet ? 'Telnet' : isVnc ? 'VNC' : 'SSH'}
                    readOnly
                  />
                </Field>
              ) : (
                <Field label="协议">
                  <select
                    className="input"
                    value={form.protocol}
                    onChange={(e) => {
                      const protocol = e.target.value as ConnectionProtocol
                      updateField('protocol', protocol)
                      const currentPort = Number(form.port)
                      if (Number.isFinite(currentPort)) {
                        const defaults = [22, 23, 3389, 5900]
                        if (defaults.includes(currentPort)) {
                          updateField('port', String(defaultPortForProtocol(protocol)))
                        }
                      }
                      if (protocol === 'telnet' && (form.authType === 'key' || form.authType === 'keyboard-interactive')) {
                        updateField('authType', 'password')
                      }
                    }}
                  >
                    <option value="ssh">SSH</option>
                    <option value="telnet">Telnet</option>
                    <option value="rdp">RDP 远程桌面</option>
                    <option value="vnc">VNC</option>
                  </select>
                </Field>
              )}

              <div className="grid grid-cols-3 gap-3">
                <Field label="主机" className="col-span-2">
                  <input
                    className="input"
                    value={form.host}
                    onChange={(e) => updateField('host', e.target.value)}
                    placeholder="192.168.1.1"
                  />
                </Field>
                <Field label="端口">
                  <input
                    className="input"
                    value={form.port}
                    onChange={(e) => updateField('port', e.target.value)}
                    placeholder={isRdp ? '3389' : isTelnet ? '23' : '22'}
                  />
                </Field>
              </div>

              <Field label="用户名">
                <input
                  className="input"
                  value={form.username}
                  onChange={(e) => updateField('username', e.target.value)}
                  placeholder={isRdp ? 'Administrator' : 'root'}
                />
              </Field>

              {isRdp && (
                <Field label="域（可选）">
                  <input
                    className="input"
                    value={form.rdpDomain}
                    onChange={(e) => updateField('rdpDomain', e.target.value)}
                    placeholder="WORKGROUP"
                  />
                </Field>
              )}

              <Field label="分组">
                <select
                  className="input"
                  value={form.groupId}
                  onChange={(e) => updateField('groupId', e.target.value)}
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="备注">
                <textarea
                  className="input min-h-[60px] resize-y"
                  value={form.note}
                  onChange={(e) => updateField('note', e.target.value)}
                  placeholder="连接说明、用途等"
                />
              </Field>

              <Field label="标签（逗号分隔）">
                <input
                  className="input"
                  value={form.tags}
                  onChange={(e) => updateField('tags', e.target.value)}
                  placeholder="nginx, web"
                />
              </Field>

              {isRdp && (
                <>
                  <p className="text-xs text-accent-muted">
                    RDP 将调用系统远程桌面客户端（Windows: mstsc，macOS: Microsoft Remote Desktop，Linux: xfreerdp）
                  </p>
                  <Field
                    label={
                      isEditing && connection?.hasPassword
                        ? 'RDP 密码（留空保持不变，Windows 可留空由 mstsc 提示）'
                        : 'RDP 密码（可选，Windows 将写入凭据管理器）'
                    }
                  >
                    <input
                      className="input"
                      type="password"
                      value={form.password}
                      onChange={(e) => updateField('password', e.target.value)}
                      placeholder="••••••••"
                    />
                  </Field>
                </>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.favorite}
                  onChange={(e) => updateField('favorite', e.target.checked)}
                />
                收藏此连接
              </label>
            </>
          )}

          {showAuth && (
            <>
              <Field label="认证方式">
                <select
                  className="input"
                  value={form.authType}
                  onChange={(e) => updateField('authType', e.target.value as AuthType)}
                >
                  <option value="password">密码</option>
                  <option value="key">私钥</option>
                  <option value="keyboard-interactive">交互认证</option>
                  <option value="prompt">每次询问</option>
                  <option value="credential">登录凭证</option>
                </select>
              </Field>

              {form.authType === 'credential' && (
                <>
                  <Field label="选择凭证">
                    <select
                      className="input"
                      value={form.credentialId}
                      onChange={(e) => updateField('credentialId', e.target.value)}
                    >
                      <option value="">请选择...</option>
                      {credentials.map((credential) => (
                        <option key={credential.id} value={credential.id}>
                          {credential.name} ({credential.type === 'password' ? '密码' : '私钥'})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline"
                    onClick={() => setCredentialManageOpen(true)}
                  >
                    管理登录凭证库
                  </button>
                </>
              )}

              {form.authType === 'prompt' && (
                <p className="text-xs text-accent-muted">
                  连接时将弹出对话框要求输入密码或私钥，凭据不会保存到本地。
                </p>
              )}

              {form.authType === 'keyboard-interactive' && (
                <p className="text-xs text-accent-muted">
                  支持服务器 keyboard-interactive 认证。可配置默认密码作为非交互提示的自动响应。
                </p>
              )}

              {(form.authType === 'password' || form.authType === 'keyboard-interactive') && (
                <Field
                  label={
                    form.authType === 'keyboard-interactive'
                      ? isEditing && connection?.hasPassword
                        ? '默认响应密码（留空保持不变）'
                        : '默认响应密码（可选）'
                      : isEditing && connection?.hasPassword
                        ? '密码（留空保持不变）'
                        : '密码'
                  }
                >
                  <input
                    className="input"
                    type="password"
                    value={form.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    placeholder="••••••••"
                  />
                </Field>
              )}

              {form.authType === 'key' && (
                <>
                  <Field
                    label={
                      isEditing && connection?.hasPrivateKey ? '私钥路径（留空保持不变）' : '私钥路径'
                    }
                  >
                    <input
                      className="input"
                      value={form.privateKeyPath}
                      onChange={(e) => updateField('privateKeyPath', e.target.value)}
                      placeholder="C:\Users\you\.ssh\id_rsa"
                    />
                  </Field>
                  <Field label="私钥密码（可选）">
                    <input
                      className="input"
                      type="password"
                      value={form.passphrase}
                      onChange={(e) => updateField('passphrase', e.target.value)}
                      placeholder="••••••••"
                    />
                  </Field>
                </>
              )}
            </>
          )}

          {showJump && (
            <Field label="跳板机链（按顺序选择）">
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-surface-border p-2">
                {proxyOptions.length === 0 ? (
                  <p className="text-xs text-accent-muted">暂无可用跳板机连接</p>
                ) : (
                  proxyOptions.map((proxy) => (
                    <label key={proxy.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.proxyChain.includes(proxy.id)}
                        onChange={() => toggleProxy(proxy.id)}
                      />
                      <span className="truncate">
                        {proxy.name} ({proxy.host})
                      </span>
                    </label>
                  ))
                )}
              </div>
              {form.proxyChain.length > 0 && (
                <p className="mt-1 text-xs text-accent-muted">
                  路径：{form.proxyChain.map((id) => connections.find((c) => c.id === id)?.name ?? id).join(' → ')} → 目标
                </p>
              )}
              <p className="mt-2 text-xs text-accent-muted">
                跳板机与代理 URL 二选一；若同时配置，优先使用跳板机链。
              </p>
            </Field>
          )}

          {showProxy && (
            <>
              <Field label="代理 URL">
                <input
                  className="input"
                  value={form.sshProxyUrl}
                  onChange={(e) => updateField('sshProxyUrl', e.target.value)}
                  placeholder="socks5://127.0.0.1:1080"
                />
              </Field>
              <p className="text-xs text-accent-muted">
                支持 socks5、socks4、http、https 代理。示例：
                <br />
                socks5://user:pass@proxy.example.com:1080
                <br />
                http://127.0.0.1:7890
              </p>
            </>
          )}

          {showInit && (
            <>
              <Field label="连接后执行的命令">
                <textarea
                  className="input min-h-[120px] resize-y font-mono text-xs"
                  value={form.sshInitScript}
                  onChange={(e) => updateField('sshInitScript', e.target.value)}
                  placeholder={'cd /var/log\nls -la'}
                />
              </Field>
              <p className="text-xs text-accent-muted">
                连接成功并打开 Shell 后自动执行，多行命令会依次发送。
              </p>
            </>
          )}

          {showAdvanced && (
            <>
              <Field label="终端类型">
                <input
                  className="input"
                  value={form.sshTerminalType}
                  onChange={(e) => updateField('sshTerminalType', e.target.value)}
                  placeholder="xterm-256color"
                />
              </Field>
              <Field label="字符编码">
                <input
                  className="input"
                  value={form.sshEncoding}
                  onChange={(e) => updateField('sshEncoding', e.target.value)}
                  placeholder="utf-8"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="心跳间隔（毫秒）">
                  <input
                    className="input"
                    value={form.sshKeepaliveInterval}
                    onChange={(e) => updateField('sshKeepaliveInterval', e.target.value)}
                    placeholder="10000"
                  />
                </Field>
                <Field label="连接超时（毫秒）">
                  <input
                    className="input"
                    value={form.sshReadyTimeout}
                    onChange={(e) => updateField('sshReadyTimeout', e.target.value)}
                    placeholder="20000"
                  />
                </Field>
              </div>

              <Field label="KEX 算法（逗号分隔）">
                <input
                  className="input font-mono text-xs"
                  value={form.sshKex}
                  onChange={(e) => updateField('sshKex', e.target.value)}
                  placeholder="curve25519-sha256,diffie-hellman-group14-sha256"
                />
              </Field>
              <Field label="Cipher 算法（逗号分隔）">
                <input
                  className="input font-mono text-xs"
                  value={form.sshCipher}
                  onChange={(e) => updateField('sshCipher', e.target.value)}
                  placeholder="aes128-ctr,aes256-ctr"
                />
              </Field>
              <Field label="HMAC 算法（逗号分隔）">
                <input
                  className="input font-mono text-xs"
                  value={form.sshHmac}
                  onChange={(e) => updateField('sshHmac', e.target.value)}
                  placeholder="hmac-sha2-256,hmac-sha2-512"
                />
              </Field>
              <Field label="主机密钥算法（逗号分隔）">
                <input
                  className="input font-mono text-xs"
                  value={form.sshServerHostKey}
                  onChange={(e) => updateField('sshServerHostKey', e.target.value)}
                  placeholder="ssh-ed25519,rsa-sha2-512"
                />
              </Field>
              <Field label="主机指纹 SHA256（可选）">
                <input
                  className="input font-mono text-xs"
                  value={form.sshHostFingerprint}
                  onChange={(e) => updateField('sshHostFingerprint', e.target.value)}
                  placeholder="SHA256:AbCd... 或 AbCd..."
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.sshEnableX11}
                  onChange={(e) => updateField('sshEnableX11', e.target.checked)}
                />
                启用 X11 转发
              </label>
            </>
          )}

          {showDisplay && isRdp && (
            <>
              <Field label="显示模式">
                <select
                  className="input"
                  value={form.rdpDisplayMode}
                  onChange={(e) => updateField('rdpDisplayMode', e.target.value as RdpDisplayMode)}
                >
                  <option value="followWindow">跟随窗口大小</option>
                  <option value="fixed">固定分辨率</option>
                </select>
              </Field>

              {form.rdpDisplayMode === 'fixed' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="宽度">
                    <input
                      className="input"
                      value={form.rdpDesktopWidth}
                      onChange={(e) => updateField('rdpDesktopWidth', e.target.value)}
                      placeholder="1920"
                    />
                  </Field>
                  <Field label="高度">
                    <input
                      className="input"
                      value={form.rdpDesktopHeight}
                      onChange={(e) => updateField('rdpDesktopHeight', e.target.value)}
                      placeholder="1080"
                    />
                  </Field>
                </div>
              )}

              <Field label="画质">
                <select
                  className="input"
                  value={form.rdpRenderQuality}
                  onChange={(e) => updateField('rdpRenderQuality', e.target.value as RdpRenderQuality)}
                >
                  <option value="balanced">均衡</option>
                  <option value="performance">性能优先</option>
                  <option value="quality">画质优先</option>
                </select>
              </Field>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.rdpEnableClipboard}
                  onChange={(e) => updateField('rdpEnableClipboard', e.target.checked)}
                />
                启用剪贴板共享
              </label>
            </>
          )}

          {showDisplay && isVnc && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.vncViewOnly}
                  onChange={(e) => updateField('vncViewOnly', e.target.checked)}
                />
                只读模式（禁止键鼠操作）
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.vncScaleViewport}
                  onChange={(e) => updateField('vncScaleViewport', e.target.checked)}
                />
                缩放视口适应窗口
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.vncClipViewport}
                  onChange={(e) => updateField('vncClipViewport', e.target.checked)}
                />
                裁剪视口（超出区域不显示）
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.vncShared}
                  onChange={(e) => updateField('vncShared', e.target.checked)}
                />
                共享会话（允许多客户端同时连接）
              </label>
            </>
          )}

          {showVncAdvanced && (
            <>
              <Field label="画质等级" hint="推荐 6，数值越高画质越好。">
                <input
                  className="input"
                  value={form.vncQualityLevel}
                  onChange={(e) => updateField('vncQualityLevel', e.target.value)}
                  placeholder="6"
                />
              </Field>
              <Field label="压缩等级" hint="推荐 2，数值越高压缩越强。">
                <input
                  className="input"
                  value={form.vncCompressionLevel}
                  onChange={(e) => updateField('vncCompressionLevel', e.target.value)}
                  placeholder="2"
                />
              </Field>
            </>
          )}

        </div>

        {(error || testResult) && (
          <div className="shrink-0 border-t border-surface-border bg-surface-raised px-4 py-2">
            {error && <p className="text-sm text-red-400">{error}</p>}
            {testResult && <p className="text-sm text-green-400">{testResult}</p>}
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between border-t border-surface-border bg-surface-raised px-4 py-3">
          <div>
            {isEditing && (
              <button
                className="text-sm text-red-400 hover:text-red-300"
                onClick={() => void handleDelete()}
              >
                删除
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditing && !isRdp && (
              <button
                className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-accent-muted hover:text-terminal-fg"
                onClick={() => void handleTest()}
                disabled={testing}
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
            )}
            <button
              className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-accent-muted hover:text-terminal-fg"
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

      {credentialManageOpen && (
        <CredentialManageDialog
          onClose={() => setCredentialManageOpen(false)}
          onChanged={() => {
            void window.api.credential.list().then(setCredentials)
          }}
        />
      )}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  className = ''
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs text-accent-muted">{label}</span>
      {hint ? <p className="mb-2 text-[11px] leading-relaxed text-accent-muted/75">{hint}</p> : null}
      {children}
    </label>
  )
}
