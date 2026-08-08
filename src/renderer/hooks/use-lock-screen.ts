import { useCallback, useEffect, useRef, useState } from 'react'

import { useSettingsStore } from '@renderer/stores/settings-store'

/** 空闲检测轮询间隔：用墙上时钟比较，避免 setTimeout 漂移/节流导致不准 */
const IDLE_CHECK_INTERVAL_MS = 1000

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
  const lastActivityAtRef = useRef(Date.now())
  const startupCheckedRef = useRef(false)
  const passwordConfiguredRef = useRef(false)
  const lockedRef = useRef(false)

  passwordConfiguredRef.current = passwordConfigured
  lockedRef.current = locked

  const refreshStatus = useCallback(async (): Promise<void> => {
    if (!window.api?.lockScreen) return
    const status = await window.api.lockScreen.getStatus()
    setPasswordConfigured(status.passwordConfigured)
  }, [])

  const lock = useCallback((): void => {
    if (!passwordConfiguredRef.current) return
    setLocked(true)
  }, [])

  const unlock = useCallback(async (password: string): Promise<{ success: boolean; message?: string }> => {
    const result = await window.api.lockScreen.verify(password)
    if (result.success) {
      setLocked(false)
      lastActivityAtRef.current = Date.now()
    }
    return result
  }, [])

  const markActivity = useCallback((): void => {
    lastActivityAtRef.current = Date.now()
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  // 仅在设置首次加载完成后判断「启动锁屏」，避免默认值/异步竞态误锁
  useEffect(() => {
    if (!settingsLoaded || startupCheckedRef.current) return
    startupCheckedRef.current = true

    void (async () => {
      const status = await window.api.lockScreen.getStatus()
      setPasswordConfigured(status.passwordConfigured)
      if (lockOnStartup === true && status.passwordConfigured) {
        setLocked(true)
      }
    })()
  }, [settingsLoaded, lockOnStartup])

  // 空闲锁屏：记录最后活动时间，按秒检查是否超时（不把 scroll 当作用户活动）
  useEffect(() => {
    if (locked || !passwordConfigured || lockIdleTimeoutMin <= 0) {
      return
    }

    lastActivityAtRef.current = Date.now()
    const timeoutMs = lockIdleTimeoutMin * 60 * 1000

    const checkIdle = (): void => {
      if (lockedRef.current || !passwordConfiguredRef.current) return
      if (Date.now() - lastActivityAtRef.current >= timeoutMs) {
        setLocked(true)
      }
    }

    const timerId = window.setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS)

    // 仅用户输入类事件；排除 scroll，避免终端输出自动滚动不断重置计时
    const events = ['mousedown', 'keydown', 'wheel', 'touchstart', 'pointerdown'] as const
    for (const eventName of events) {
      window.addEventListener(eventName, markActivity, { passive: true })
    }

    return () => {
      window.clearInterval(timerId)
      for (const eventName of events) {
        window.removeEventListener(eventName, markActivity)
      }
    }
  }, [locked, passwordConfigured, lockIdleTimeoutMin, markActivity])

  return {
    locked,
    passwordConfigured,
    lock,
    unlock,
    refreshStatus
  }
}
