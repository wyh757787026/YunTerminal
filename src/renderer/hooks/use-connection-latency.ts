import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StoredConnection } from '@shared/types/connection'

export interface LatencyEntry {
  status: 'idle' | 'pending' | 'ok' | 'fail' | 'skip'
  ms?: number
  message?: string
}

const CACHE_TTL_MS = 60_000
const CONCURRENCY = 3

export function useConnectionLatency(
  connections: StoredConnection[],
  enabled: boolean
): {
  latencyMap: Record<string, LatencyEntry>
  refreshLatency: () => void
} {
  const [latencyMap, setLatencyMap] = useState<Record<string, LatencyEntry>>({})
  const cacheRef = useRef<Map<string, number>>(new Map())
  const runIdRef = useRef(0)

  const probeTargets = useMemo(
    () =>
      connections.map((c) => ({
        id: c.id,
        skip: c.protocol === 'rdp'
      })),
    [connections]
  )

  const connectionKey = useMemo(
    () => probeTargets.map((t) => `${t.id}:${t.skip}`).join(','),
    [probeTargets]
  )

  const probeOne = useCallback(async (id: string, skip: boolean): Promise<void> => {
    if (skip) {
      setLatencyMap((prev) => ({
        ...prev,
        [id]: { status: 'skip', message: 'RDP 暂不支持延迟检测' }
      }))
      cacheRef.current.set(id, Date.now())
      return
    }

    setLatencyMap((prev) => ({ ...prev, [id]: { status: 'pending' } }))
    try {
      const result = await window.api.connection.probeLatency(id)
      if (result.success && result.latencyMs != null) {
        setLatencyMap((prev) => ({
          ...prev,
          [id]: { status: 'ok', ms: result.latencyMs }
        }))
      } else {
        setLatencyMap((prev) => ({
          ...prev,
          [id]: { status: 'fail', message: result.message ?? '连接失败' }
        }))
      }
    } catch (err) {
      setLatencyMap((prev) => ({
        ...prev,
        [id]: {
          status: 'fail',
          message: err instanceof Error ? err.message : '检测失败'
        }
      }))
    }
    cacheRef.current.set(id, Date.now())
  }, [])

  const probeAll = useCallback(
    async (force = false): Promise<void> => {
      const runId = ++runIdRef.current
      const toProbe = probeTargets.filter(({ id }) => {
        if (force) return true
        const last = cacheRef.current.get(id)
        return !last || Date.now() - last > CACHE_TTL_MS
      })

      for (let i = 0; i < toProbe.length; i += CONCURRENCY) {
        if (runId !== runIdRef.current) return
        const batch = toProbe.slice(i, i + CONCURRENCY)
        await Promise.all(batch.map(({ id, skip }) => probeOne(id, skip)))
      }
    },
    [probeOne, probeTargets]
  )

  useEffect(() => {
    if (!enabled || probeTargets.length === 0) return
    void probeAll(false)
    return () => {
      runIdRef.current += 1
    }
  }, [connectionKey, enabled, probeAll, probeTargets.length])

  const refreshLatency = useCallback((): void => {
    void probeAll(true)
  }, [probeAll])

  return { latencyMap, refreshLatency }
}
