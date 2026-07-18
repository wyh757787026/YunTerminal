import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '../../src/shared/ipc'
import { registerIpcHandlers } from './ipc/register-handlers'
import { LocalFs } from './fs/local-fs'
import { PtyManager } from './pty/pty-manager'
import { SftpManager } from './sftp/sftp-manager'
import { FtpManager } from './ftp/ftp-manager'
import { ConnectionStore } from './store/connection-store'
import { SettingsStore } from './store/settings-store'
import { SshManager } from './ssh/ssh-manager'
import { TelnetManager } from './telnet/telnet-manager'
import { VncProxyService } from './vnc/vnc-proxy-service'
import { VncManager } from './vnc/vnc-manager'
import { TunnelManager } from './tunnel/tunnel-manager'
import { TunnelStore } from './store/tunnel-store'
import { QuickCommandStore } from './store/quick-command-store'
import { NoteStore } from './store/note-store'
import { MonitorService } from './monitor/monitor-service'
import { AiSettingsStore } from './store/ai-settings-store'
import { AiService } from './ai/ai-service'
import { RecordingManager } from './recording/recording-manager'
import { SshAuthBridge } from './ssh/ssh-auth-bridge'
import { CredentialStore } from './store/credential-store'
import { LockScreenStore } from './store/lock-screen-store'

let mainWindow: BrowserWindow | null = null
let connectionStore: ConnectionStore | null = null
let credentialStore: CredentialStore | null = null
let sshManager: SshManager | null = null
let telnetManager: TelnetManager | null = null
let vncManager: VncManager | null = null
let vncProxyService: VncProxyService | null = null
let sshAuthBridge: SshAuthBridge | null = null
let sftpManager: SftpManager | null = null
let ftpManager: FtpManager | null = null
let tunnelManager: TunnelManager | null = null
let ptyManager: PtyManager | null = null
let recordingManager: RecordingManager | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 1040,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    thickFrame: false,
    title: 'YunTerminal',
    backgroundColor: '#1a1b26',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.yunterminal.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  connectionStore = new ConnectionStore(app.getPath('userData'))
  credentialStore = new CredentialStore(app.getPath('userData'))
  recordingManager = new RecordingManager(app.getPath('userData'))
  const settingsStore = new SettingsStore(app.getPath('userData'))
  const lockScreenStore = new LockScreenStore(app.getPath('userData'))
  sshAuthBridge = new SshAuthBridge(() => mainWindow)
  sshAuthBridge.register()
  const tunnelStore = new TunnelStore(app.getPath('userData'))
  sshManager = new SshManager(
    connectionStore,
    () => mainWindow,
    recordingManager,
    sshAuthBridge,
    credentialStore,
    (connectionId) => {
      tunnelManager?.onSshClientClosed(connectionId)
    }
  )
  tunnelManager = new TunnelManager(
    connectionStore,
    tunnelStore,
    () => mainWindow,
    sshManager,
    sshAuthBridge,
    credentialStore
  )
  telnetManager = new TelnetManager(
    connectionStore,
    () => mainWindow,
    recordingManager,
    sshAuthBridge,
    credentialStore
  )
  vncProxyService = new VncProxyService()
  vncManager = new VncManager(connectionStore, vncProxyService, () => mainWindow)
  ptyManager = new PtyManager(() => mainWindow, recordingManager)
  sftpManager = new SftpManager(connectionStore, () => mainWindow)
  ftpManager = new FtpManager(connectionStore, () => mainWindow)
  const quickCommandStore = new QuickCommandStore(app.getPath('userData'))
  const noteStore = new NoteStore(app.getPath('userData'))
  const monitorService = new MonitorService(sshManager)
  const aiSettingsStore = new AiSettingsStore(app.getPath('userData'))
  const aiService = new AiService(aiSettingsStore)
  const localFs = new LocalFs()

  registerIpcHandlers(
    () => mainWindow,
    connectionStore,
    sshManager,
    telnetManager,
    vncManager,
    ptyManager,
    settingsStore,
    sftpManager,
    ftpManager,
    localFs,
    tunnelStore,
    tunnelManager,
    quickCommandStore,
    noteStore,
    monitorService,
    aiSettingsStore,
    aiService,
    recordingManager,
    sshAuthBridge,
    credentialStore,
    lockScreenStore
  )

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  sshAuthBridge?.cancelAll()
  sshManager?.disconnectAll()
  telnetManager?.disconnectAll()
  void vncManager?.disconnectAll()
  void vncProxyService?.stopAll()
  sftpManager?.disconnectAll()
  ftpManager?.disconnectAll()
  tunnelManager?.stopAll()
  ptyManager?.destroyAll()
  recordingManager?.stopAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
