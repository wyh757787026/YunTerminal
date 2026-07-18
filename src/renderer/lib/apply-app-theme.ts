import type { AppThemeId } from '@shared/types/settings'

export function applyAppTheme(themeId: AppThemeId): void {
  document.documentElement.setAttribute('data-app-theme', themeId)
  document.documentElement.style.colorScheme = themeId === 'daylight' ? 'light' : 'dark'
}
