import { useCallback, useEffect, useRef, useState } from 'react'

import { useSettingsStore } from '@renderer/stores/settings-store'

export function useLockScreen(): {
  locked: boolean
  passwordConfigured: boolean
  lock: () => void
  unlock: (password: string) => Promise<{ success: boolean; message?: string }>
  refreshStatus: () => Promise<void>
} {
  const { lockIdleTimeoutMin, lockOnStartup } = useSettingsStore((s) => s.settings)
  const settingsLoaded = useSettingsStore((s) => s.settingsVersion > 0)

  const [locked, setLocked] = useState(false)
  const [passwordConfigured, setPasswordConfigured] = useState(false)
  const idleTimerRef = useRef<number | null>(null)
  const startupCheckedRef = useRef(false)

  const refreshStatus = useCallback(async (): Promise<void> => {
    if (!window.api?.lockScreen) return
    const status = await window.api.lockScreen.getStatus()
    setPasswordConfigured(status.passwordConfigured)
  }, [])

  const lock = useCallback((): void => {
    setLocked((current) => {
      if (!passwordConfigured) return current
      return true
    })
  }, [passwordConfigured])

  const unlock = useCallback(async (password: string): Promise<{ success: boolean; message?: string }> => {
    const result = await window.api.lockScreen.verify(password)
    if (result.success) {
      setLocked(false)
    }
    return result
  }, [])

  const resetIdleTimer = useCallback((): void => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }

    if (locked || !passwordConfigured || lockIdleTimeoutMin <= 0) return

    idleTimerRef.current = window.setTimeout(() => {
      setLocked(true)
    }, lockIdleTimeoutMin * 60 * 1000)
  }, [locked, passwordConfigured, lockIdleTimeoutMin])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!settingsLoaded || startupCheckedRef.current) return

    void (async () => {
      const status = await window.api.lockScreen.getStatus()
      setPasswordConfigured(status.passwordConfigured)
      startupCheckedRef.current = true
      if (lockOnStartup && status.passwordConfigured) {
        setLocked(true)
      }
    })()
  }, [settingsLoaded, lockOnStartup])

  useEffect(() => {
    if (locked) {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
      return
    }

    resetIdleTimer()

    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
    const handleActivity = (): void => {
      resetIdleTimer()
    }

    for (const eventName of events) {
      window.addEventListener(eventName, handleActivity, { passive: true })
    }

    return () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current)
      }
      for (const eventName of events) {
        window.removeEventListener(eventName, handleActivity)
      }
    }
  }, [locked, resetIdleTimer])

  return {
    locked,
    passwordConfigured,
    lock,
    unlock,
    refreshStatus
  }
}
