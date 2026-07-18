import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_TERMINAL_SETTINGS } from '@shared/types/settings'
import { applyAppTheme } from './lib/apply-app-theme'
import { App } from './App'
import './styles/app-themes.css'
import './styles/index.css'

applyAppTheme(DEFAULT_TERMINAL_SETTINGS.appTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
