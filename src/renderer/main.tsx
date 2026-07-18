import { createRoot } from 'react-dom/client'
import { DEFAULT_TERMINAL_SETTINGS } from '@shared/types/settings'
import { applyAppTheme } from './lib/apply-app-theme'
import { App } from './App'
import './styles/app-themes.css'
import './styles/index.css'

applyAppTheme(DEFAULT_TERMINAL_SETTINGS.appTheme)

// Electron 桌面应用不使用 React StrictMode：
// 双挂载会打断 SSH/SFTP 握手，导致 “Connection lost before handshake”。
createRoot(document.getElementById('root')!).render(<App />)
