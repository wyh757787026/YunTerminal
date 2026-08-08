import { desktopCapturer, dialog, ipcMain, type BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { isAbsolute } from 'path'
import type { Duplex } from 'stream'
import {
  IPC_CHANNELS,
  type ConnectionImportParams,
  type ConnectionMoveParams,
  type ConnectionReorderItem,
  type PtyCreateParams,
  type PtyResizeParams,
  type PtyWriteParams,
  type SshConnectParams,
  type SshResizeParams,
  type SshWriteParams,
  type TelnetConnectParams,
  type TelnetResizeParams,
  type TelnetWriteParams,
  type VncConnectParams
} from '../../../src/shared/ipc'
import type { ConnectionInput } from '../../../src/shared/types/connection'
import type { GroupInput, GroupReorderItem } from '../../../src/shared/types/group'
import type { TerminalSettings } from '../../../src/shared/types/settings'
import { PtyManager } from '../pty/pty-manager'
import { LocalFs } from '../fs/local-fs'
import { SftpManager } from '../sftp/sftp-manager'
import { FtpManager, testFtpConnection } from '../ftp/ftp-manager'
import { ConnectionStore } from '../store/connection-store'
import { SettingsStore } from '../store/settings-store'
import { NoteStore } from '../store/note-store'
import { QuickCommandStore } from '../store/quick-command-store'
import { MonitorService } from '../monitor/monitor-service'
import { TunnelManager } from '../tunnel/tunnel-manager'
import { TunnelStore } from '../store/tunnel-store'
import { SshManager, testConnection } from '../ssh/ssh-manager'
import { probeTcpLatency } from '../ssh/ssh-connect'
import { TelnetManager, testTelnetConnection } from '../telnet/telnet-manager'
import { VncManager, testVncConnection } from '../vnc/vnc-manager'
import type {
  LocalListParams,
  LocalPathParams,
  LocalWriteParams,
  SftpChmodParams,
  SftpListParams,
  SftpPathParams,
  SftpRenameParams,
  SftpTransferParams,
  SftpWriteParams
} from '../../../src/shared/types/sftp'
import type { TunnelInput } from '../../../src/shared/types/tunnel'
import type { QuickCommandInput } from '../../../src/shared/types/quick-command'
import type { NoteInput } from '../../../src/shared/types/note'
import type { AiChatParams, AiSettingsInput } from '../../../src/shared/types/ai'
import type { RecordingSaveParams } from '../../../src/shared/types/recording'
import { launchRdp } from '../rdp/rdp-launcher'
import type { RecordingManager } from '../recording/recording-manager'
import { AiService } from '../ai/ai-service'
import type { AiSettingsStore } from '../store/ai-settings-store'
import type { SshAuthBridge } from '../ssh/ssh-auth-bridge'
import { CredentialStore } from '../store/credential-store'
import { LockScreenStore } from '../store/lock-screen-store'
import type { CredentialInput } from '../../../src/shared/types/credential'

export function registerIpcHandlers(
  getWindow: () => BrowserWindow | null,
  store: ConnectionStore,
  sshManager: SshManager,
  telnetManager: TelnetManager,
  vncManager: VncManager,
  ptyManager: PtyManager,
  settingsStore: SettingsStore,
  sftpManager: SftpManager,
  ftpManager: FtpManager,
  localFs: LocalFs,
  tunnelStore: TunnelStore,
  tunnelManager: TunnelManager,
  quickCommandStore: QuickCommandStore,
  noteStore: NoteStore,
  monitorService: MonitorService,
  aiSettingsStore: AiSettingsStore,
  aiService: AiService,
  recordingManager: RecordingManager,
  sshAuthBridge: SshAuthBridge,
  credentialStore: CredentialStore,
  lockScreenStore: LockScreenStore
): void {
  ipcMain.handle(IPC_CHANNELS.CONNECTION_LIST, () => store.listConnections())
  ipcMain.handle(IPC_CHANNELS.CONNECTION_FAVORITES, () => store.listFavorites())
  ipcMain.handle(IPC_CHANNELS.CONNECTION_RECENT, () => store.listRecent())
  ipcMain.handle(IPC_CHANNELS.GROUP_LIST, () => store.listGroups())
  ipcMain.handle(IPC_CHANNELS.CONNECTION_GET, (_, id: string) => store.getConnection(id))

  ipcMain.handle(IPC_CHANNELS.CONNECTION_CREATE, (_, input: ConnectionInput) =>
    store.createConnection(input)
  )

  ipcMain.handle(IPC_CHANNELS.CONNECTION_UPDATE, (_, id: string, input: ConnectionInput) =>
    store.updateConnection(id, input)
  )

  ipcMain.handle(IPC_CHANNELS.CONNECTION_DELETE, async (_, id: string) => {
    await tunnelManager.stopByConnectionId(id)
    tunnelStore.deleteByConnectionId(id)
    quickCommandStore.deleteByConnectionId(id)
    noteStore.deleteByConnectionId(id)
    return store.deleteConnection(id)
  })

  ipcMain.handle(IPC_CHANNELS.CONNECTION_TEST, (_, connectionId: string) => {
    const connection = store.getConnection(connectionId)
    if (connection?.protocol === 'telnet') {
      return testTelnetConnection(store, connectionId, sshAuthBridge, credentialStore)
    }
    if (connection?.protocol === 'vnc') {
      return testVncConnection(store, connectionId)
    }
    if (connection?.protocol === 'ftp') {
      return testFtpConnection(store, connectionId)
    }
    return testConnection(store, connectionId, sshAuthBridge, credentialStore)
  })

  ipcMain.handle(IPC_CHANNELS.CONNECTION_PROBE_LATENCY, (_, connectionId: string) =>
    probeTcpLatency(store, connectionId)
  )

  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_LIST, () => credentialStore.listCredentials())
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_GET, (_, id: string) =>
    credentialStore.getCredential(id)
  )
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_CREATE, (_, input: CredentialInput) =>
    credentialStore.createCredential(input)
  )
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_UPDATE, (_, id: string, input: CredentialInput) =>
    credentialStore.updateCredential(id, input)
  )
  ipcMain.handle(IPC_CHANNELS.CREDENTIAL_DELETE, (_, id: string) =>
    credentialStore.deleteCredential(id)
  )

  ipcMain.handle(IPC_CHANNELS.CONNECTION_TOGGLE_FAVORITE, (_, id: string) =>
    store.toggleFavorite(id)
  )

  ipcMain.handle(IPC_CHANNELS.CONNECTION_MOVE, (_, params: ConnectionMoveParams) =>
    store.moveConnection(params.id, params.groupId, params.sortOrder)
  )

  ipcMain.handle(IPC_CHANNELS.CONNECTION_REORDER, (_, items: ConnectionReorderItem[]) => {
    store.reorderConnections(items)
  })

  ipcMain.handle(IPC_CHANNELS.GROUP_CREATE, (_, input: GroupInput) => store.createGroup(input))

  ipcMain.handle(IPC_CHANNELS.GROUP_UPDATE, (_, id: string, input: GroupInput) =>
    store.updateGroup(id, input)
  )

  ipcMain.handle(IPC_CHANNELS.GROUP_DELETE, (_, id: string) => store.deleteGroup(id))

  ipcMain.handle(IPC_CHANNELS.GROUP_REORDER, (_, items: GroupReorderItem[]) => {
    store.reorderGroups(items)
  })

  ipcMain.handle(
    IPC_CHANNELS.CONNECTION_EXPORT,
    async (_, includeSecrets = false) => {
      const win = getWindow()
      const result = win
        ? await dialog.showSaveDialog(win, {
            title: '导出连接',
            defaultPath: `yun-terminal-connections-${Date.now()}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
          })
        : await dialog.showSaveDialog({
            title: '导出连接',
            defaultPath: `yun-terminal-connections-${Date.now()}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
          })

      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }

      writeFileSync(result.filePath, store.exportToJson(includeSecrets), 'utf-8')
      return { canceled: false, filePath: result.filePath }
    }
  )

  ipcMain.handle(IPC_CHANNELS.CONNECTION_IMPORT, async (_, params: ConnectionImportParams) => {
    if (params.content) {
      return store.importFromJson(params.content, params.mode)
    }

    const win = getWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: '导入连接',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile']
        })
      : await dialog.showOpenDialog({
          title: '导入连接',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile']
        })

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true }
    }

    const content = readFileSync(result.filePaths[0], 'utf-8')
    const importResult = store.importFromJson(content, params.mode)
    return { canceled: false, result: importResult }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => settingsStore.get())
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_, partial: Partial<TerminalSettings>) => {
    if (partial.recordingSaveDir !== undefined) {
      const trimmed = partial.recordingSaveDir.trim()
      partial = { ...partial, recordingSaveDir: trimmed }
      if (trimmed) {
        if (!isAbsolute(trimmed)) {
          throw new Error('录屏保存目录必须是绝对路径')
        }
        try {
          mkdirSync(trimmed, { recursive: true })
        } catch (err) {
          throw new Error(
            err instanceof Error ? `无法创建录屏目录: ${err.message}` : '无法创建录屏目录'
          )
        }
      }
    }
    return settingsStore.update(partial)
  })

  ipcMain.handle(IPC_CHANNELS.LOCK_SCREEN_STATUS, () => ({
    passwordConfigured: lockScreenStore.isConfigured()
  }))
  ipcMain.handle(
    IPC_CHANNELS.LOCK_SCREEN_SET_PASSWORD,
    (_, password: string, currentPassword?: string) =>
      lockScreenStore.setPassword(password, currentPassword)
  )
  ipcMain.handle(IPC_CHANNELS.LOCK_SCREEN_VERIFY, (_, password: string) => {
    const success = lockScreenStore.verify(password)
    return { success, message: success ? undefined : '密码不正确' }
  })
  ipcMain.handle(IPC_CHANNELS.LOCK_SCREEN_CLEAR_PASSWORD, (_, currentPassword: string) =>
    lockScreenStore.clearPassword(currentPassword)
  )

  ipcMain.handle(IPC_CHANNELS.SSH_CONNECT, (_, params: SshConnectParams) =>
    sshManager.connect(params.sessionId, params.connectionId, params.cols, params.rows)
  )

  ipcMain.handle(IPC_CHANNELS.SSH_DISCONNECT, (_, sessionId: string) => {
    sshManager.disconnect(sessionId)
  })

  ipcMain.on(IPC_CHANNELS.SSH_WRITE, (_, params: SshWriteParams) => {
    sshManager.write(params.sessionId, params.data)
  })

  ipcMain.on(IPC_CHANNELS.SSH_RESIZE, (_, params: SshResizeParams) => {
    sshManager.resize(params.sessionId, params.cols, params.rows)
  })

  ipcMain.handle(IPC_CHANNELS.TELNET_CONNECT, (_, params: TelnetConnectParams) =>
    telnetManager.connect(params.sessionId, params.connectionId, params.cols, params.rows)
  )

  ipcMain.handle(IPC_CHANNELS.TELNET_DISCONNECT, (_, sessionId: string) => {
    telnetManager.disconnect(sessionId)
  })

  ipcMain.on(IPC_CHANNELS.TELNET_WRITE, (_, params: TelnetWriteParams) => {
    telnetManager.write(params.sessionId, params.data)
  })

  ipcMain.on(IPC_CHANNELS.TELNET_RESIZE, (_, params: TelnetResizeParams) => {
    telnetManager.resize(params.sessionId, params.cols, params.rows)
  })

  ipcMain.handle(IPC_CHANNELS.VNC_CONNECT, (_, params: VncConnectParams) =>
    vncManager.connect(params.sessionId, params.connectionId)
  )

  ipcMain.handle(IPC_CHANNELS.VNC_DISCONNECT, (_, sessionId: string) => {
    void vncManager.disconnect(sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.PTY_CREATE, (_, params: PtyCreateParams) => {
    ptyManager.create(params.sessionId, params.cols, params.rows)
  })

  ipcMain.handle(IPC_CHANNELS.PTY_DESTROY, (_, sessionId: string) => {
    ptyManager.destroy(sessionId)
  })

  ipcMain.on(IPC_CHANNELS.PTY_WRITE, (_, params: PtyWriteParams) => {
    ptyManager.write(params.sessionId, params.data)
  })

  ipcMain.on(IPC_CHANNELS.PTY_RESIZE, (_, params: PtyResizeParams) => {
    ptyManager.resize(params.sessionId, params.cols, params.rows)
  })

  ipcMain.handle(IPC_CHANNELS.SFTP_CONNECT, async (_, connectionId: string) => {
    const existing = sshManager.getClientForConnection(connectionId)
    await sftpManager.connect(connectionId, existing)
  })

  ipcMain.handle(IPC_CHANNELS.SFTP_DISCONNECT, (_, connectionId: string) => {
    sftpManager.disconnect(connectionId)
  })

  ipcMain.handle(IPC_CHANNELS.SFTP_LIST, (_, params: SftpListParams) =>
    sftpManager.listDir(params.connectionId, params.path)
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_REALPATH, (_, params: SftpPathParams) =>
    sftpManager.realpath(params.connectionId, params.path)
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_READ, (_, params: SftpPathParams) =>
    sftpManager.readFile(params.connectionId, params.path)
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_WRITE, (_, params: SftpWriteParams) =>
    sftpManager.writeFile(params.connectionId, params.path, params.content)
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_UPLOAD, (_, params: SftpTransferParams) =>
    sftpManager.upload(params.connectionId, params.localPath, params.remotePath, params.transferId)
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_DOWNLOAD, (_, params: SftpTransferParams) =>
    sftpManager.download(params.connectionId, params.remotePath, params.localPath, params.transferId)
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_MKDIR, (_, params: SftpPathParams) =>
    sftpManager.mkdir(params.connectionId, params.path)
  )

  ipcMain.handle(
    IPC_CHANNELS.SFTP_REMOVE,
    (_, params: SftpPathParams & { isDirectory: boolean }) =>
      sftpManager.remove(params.connectionId, params.path, params.isDirectory)
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_RENAME, (_, params: SftpRenameParams) =>
    sftpManager.rename(params.connectionId, params.oldPath, params.newPath)
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_COPY, (_, params: SftpRenameParams) =>
    sftpManager.copy(params.connectionId, params.oldPath, params.newPath)
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_OPEN_LOCAL, (_, params: SftpPathParams) =>
    sftpManager.openLocal(params.connectionId, params.path)
  )

  ipcMain.handle(IPC_CHANNELS.SFTP_CHMOD, (_, params: SftpChmodParams) =>
    sftpManager.chmod(params.connectionId, params.path, params.mode)
  )

  ipcMain.handle(IPC_CHANNELS.FTP_CONNECT, (_, connectionId: string) =>
    ftpManager.connect(connectionId)
  )
  ipcMain.handle(IPC_CHANNELS.FTP_DISCONNECT, (_, connectionId: string) => {
    ftpManager.disconnect(connectionId)
  })
  ipcMain.handle(IPC_CHANNELS.FTP_ABORT_TRANSFER, (_, connectionId: string) => {
    ftpManager.abortTransfer(connectionId)
  })
  ipcMain.handle(IPC_CHANNELS.FTP_LIST, (_, params: SftpListParams) =>
    ftpManager.listDir(params.connectionId, params.path)
  )
  ipcMain.handle(IPC_CHANNELS.FTP_REALPATH, (_, params: SftpPathParams) =>
    ftpManager.realpath(params.connectionId, params.path)
  )
  ipcMain.handle(IPC_CHANNELS.FTP_UPLOAD, (_, params: SftpTransferParams) =>
    ftpManager.upload(params.connectionId, params.localPath, params.remotePath, params.transferId)
  )
  ipcMain.handle(IPC_CHANNELS.FTP_DOWNLOAD, (_, params: SftpTransferParams) =>
    ftpManager.download(params.connectionId, params.remotePath, params.localPath, params.transferId)
  )
  ipcMain.handle(IPC_CHANNELS.FTP_MKDIR, (_, params: SftpPathParams) =>
    ftpManager.mkdir(params.connectionId, params.path)
  )
  ipcMain.handle(
    IPC_CHANNELS.FTP_REMOVE,
    (_, params: SftpPathParams & { isDirectory: boolean }) =>
      ftpManager.remove(params.connectionId, params.path, params.isDirectory)
  )
  ipcMain.handle(IPC_CHANNELS.FTP_RENAME, (_, params: SftpRenameParams) =>
    ftpManager.rename(params.connectionId, params.oldPath, params.newPath)
  )
  ipcMain.handle(IPC_CHANNELS.FTP_COPY, (_, params: SftpRenameParams) =>
    ftpManager.copy(params.connectionId, params.oldPath, params.newPath)
  )

  ipcMain.handle(IPC_CHANNELS.LOCAL_HOME, () => localFs.getHomeDir())
  ipcMain.handle(IPC_CHANNELS.LOCAL_LIST, (_, params: LocalListParams) =>
    localFs.listDir(params.path)
  )
  ipcMain.handle(IPC_CHANNELS.LOCAL_READ, (_, params: LocalPathParams) =>
    localFs.readFile(params.path)
  )
  ipcMain.handle(IPC_CHANNELS.LOCAL_WRITE, (_, params: LocalWriteParams) => {
    localFs.writeFile(params.path, params.content)
  })
  ipcMain.handle(IPC_CHANNELS.LOCAL_MKDIR, (_, params: LocalPathParams) => {
    localFs.mkdir(params.path)
  })
  ipcMain.handle(IPC_CHANNELS.LOCAL_DELETE, (_, params: LocalPathParams) => {
    localFs.deletePath(params.path)
  })
  ipcMain.handle(IPC_CHANNELS.LOCAL_RENAME, (_, params: { oldPath: string; newPath: string }) => {
    localFs.rename(params.oldPath, params.newPath)
  })

  ipcMain.handle(IPC_CHANNELS.TUNNEL_LIST, (_, connectionId?: string) =>
    tunnelStore.listTunnels(connectionId)
  )

  ipcMain.handle(IPC_CHANNELS.TUNNEL_CREATE, (_, input: TunnelInput) =>
    tunnelStore.createTunnel(input)
  )

  ipcMain.handle(IPC_CHANNELS.TUNNEL_UPDATE, async (_, id: string, input: TunnelInput) => {
    const wasRunning = tunnelManager.isRunning(id)
    if (wasRunning) {
      await tunnelManager.stop(id)
    }
    const updated = tunnelStore.updateTunnel(id, input)
    if (wasRunning && updated) {
      await tunnelManager.start(id)
    }
    return updated
  })

  ipcMain.handle(IPC_CHANNELS.TUNNEL_DELETE, async (_, id: string) => {
    await tunnelManager.stop(id)
    return tunnelStore.deleteTunnel(id)
  })

  ipcMain.handle(IPC_CHANNELS.TUNNEL_START, (_, id: string) => tunnelManager.start(id))

  ipcMain.handle(IPC_CHANNELS.TUNNEL_STOP, (_, id: string) => tunnelManager.stop(id))

  ipcMain.handle(IPC_CHANNELS.TUNNEL_START_AUTOSTART, (_, connectionId: string) =>
    tunnelManager.startAutoStartForConnection(connectionId)
  )

  ipcMain.handle(IPC_CHANNELS.TUNNEL_STOP_BY_CONNECTION, (_, connectionId: string) =>
    tunnelManager.stopByConnectionId(connectionId, true)
  )

  ipcMain.handle(IPC_CHANNELS.TUNNEL_STATUSES, (_, connectionId?: string) =>
    tunnelManager.listStatuses(connectionId)
  )

  ipcMain.handle(IPC_CHANNELS.QUICK_COMMAND_LIST, (_, connectionId?: string) =>
    quickCommandStore.listCommands(connectionId)
  )

  ipcMain.handle(IPC_CHANNELS.QUICK_COMMAND_CREATE, (_, input: QuickCommandInput) =>
    quickCommandStore.createCommand(input)
  )

  ipcMain.handle(IPC_CHANNELS.QUICK_COMMAND_UPDATE, (_, id: string, input: QuickCommandInput) =>
    quickCommandStore.updateCommand(id, input)
  )

  ipcMain.handle(IPC_CHANNELS.QUICK_COMMAND_DELETE, (_, id: string) =>
    quickCommandStore.deleteCommand(id)
  )

  ipcMain.handle(IPC_CHANNELS.NOTE_LIST, (_, connectionId: string) =>
    noteStore.listNotes(connectionId)
  )

  ipcMain.handle(IPC_CHANNELS.NOTE_CREATE, (_, input: NoteInput) => noteStore.createNote(input))

  ipcMain.handle(IPC_CHANNELS.NOTE_UPDATE, (_, id: string, input: NoteInput) =>
    noteStore.updateNote(id, input)
  )

  ipcMain.handle(IPC_CHANNELS.NOTE_DELETE, (_, id: string) => noteStore.deleteNote(id))

  ipcMain.handle(IPC_CHANNELS.MONITOR_COLLECT, async (_, connectionId: string) => {
    try {
      return await monitorService.collect(connectionId)
    } catch (err) {
      return {
        platform: 'unknown',
        hostname: 'unknown',
        cpuPercent: 0,
        cpuCores: [],
        memoryTotalBytes: 0,
        memoryUsedBytes: 0,
        memoryFreeBytes: 0,
        memoryCachedBytes: 0,
        memoryPercent: 0,
        loadAverage: [0, 0, 0] as [number, number, number],
        uptimeSeconds: 0,
        disks: [],
        network: {
          uploadSpeedBps: 0,
          downloadSpeedBps: 0,
          uploadTotalBytes: 0,
          downloadTotalBytes: 0
        },
        diskIo: { readSpeedBps: 0, writeSpeedBps: 0 },
        processes: [],
        osName: '',
        osVersion: '',
        timezone: '',
        fsType: '',
        collectedAt: new Date().toISOString(),
        unsupported: true,
        message: err instanceof Error ? err.message : '采集失败'
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.MONITOR_SERVER_INFO, async (_, connectionId: string) => {
    try {
      return await monitorService.collectServerInfo(connectionId)
    } catch (err) {
      return {
        hostname: 'unknown',
        platform: 'unknown',
        osName: '',
        osVersion: '',
        cpuCount: 0,
        memoryTotalBytes: 0,
        diskTotalBytes: 0,
        unsupported: true,
        message: err instanceof Error ? err.message : '获取失败'
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_SETTINGS_GET, () => aiSettingsStore.getPublicSettings())

  ipcMain.handle(IPC_CHANNELS.AI_SETTINGS_UPDATE, (_, input: AiSettingsInput) =>
    aiSettingsStore.update(input)
  )

  ipcMain.handle(IPC_CHANNELS.AI_CHAT, (_, params: AiChatParams) => aiService.chat(params))

  ipcMain.handle(IPC_CHANNELS.RECORD_GET_SOURCE, async () => {
    const win = getWindow()
    if (!win) return null

    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false
    })

    const mediaSourceId = win.getMediaSourceId()
    const byId = sources.find((source) => source.id === mediaSourceId)
    if (byId) return { id: byId.id, name: byId.name }

    const title = win.getTitle()
    const byTitle =
      sources.find((source) => source.name === title) ??
      sources.find((source) => source.name.includes('YunTerminal'))
    if (byTitle) return { id: byTitle.id, name: byTitle.name }

    const first = sources[0]
    return first ? { id: first.id, name: first.name } : null
  })

  ipcMain.handle(IPC_CHANNELS.RECORD_SAVE, (_, params: RecordingSaveParams) =>
    recordingManager.save(params)
  )

  ipcMain.handle(IPC_CHANNELS.RECORD_LIST, () => recordingManager.list())

  ipcMain.handle(IPC_CHANNELS.RECORD_GET_URL, (_, id: string) => recordingManager.getFileUrl(id))

  ipcMain.handle(IPC_CHANNELS.RECORD_DELETE, (_, id: string) => recordingManager.delete(id))

  ipcMain.handle(IPC_CHANNELS.RECORD_OPEN_DIR, () => recordingManager.openDir())

  ipcMain.handle(IPC_CHANNELS.RECORD_GET_DIR, () => recordingManager.getDirInfo())

  ipcMain.handle(IPC_CHANNELS.RECORD_PICK_DIR, async () => {
    const win = getWindow()
    const current = recordingManager.getDirInfo().currentDir
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: '选择录屏保存目录',
          defaultPath: current,
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          title: '选择录屏保存目录',
          defaultPath: current,
          properties: ['openDirectory', 'createDirectory']
        })

    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.RDP_LAUNCH, (_, connectionId: string) =>
    launchRdp(store, connectionId)
  )
}
