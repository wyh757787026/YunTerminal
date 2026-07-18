import { ElectronAPI } from '@electron-toolkit/preload'
import type { Api } from '../../electron/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}

export {}
