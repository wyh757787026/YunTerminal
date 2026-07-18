import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ServerInfoSummary } from '@shared/types/monitor'
import type { StoredConnection } from '@shared/types/connection'

export interface ServerInfoEntry {
  status: 'idle' | 'pending' | 'ok' | 'fail' | 'skip'
  info?: ServerInfoSummary
  message?: string
}

const CACHE_TTL_MS = 5 * 60_000
const CONCURRENCY = 2

export function useConnectionServerInfo(
  connections: StoredConnection[],
  enabled: boolean
): {
  serverInfoMap: Record<string, ServerInfoEntry>
  refreshServerInfo: () => void
} {
  const [serverInfoMap, setServerInfoMap] = useState<Record<string, ServerInfoEntry>>({})
  const cacheRef = useRef<Map<string, number>>(new Map())
  const runIdRef = useRef(0)

  const probeTargets = useMemo(
    () =>
      connections.map((c) => ({
        id: c.id,
        skip: c.protocol === 'rdp' || c.protocol === 'vnc'
      })),
    [connections]
  )

  const connectionKey = useMemo(
    () => probeTargets.map((t) => `${t.id}:${t.skip}`).join(','),
    [probeTargets]
  )

  const fetchOne = useCallback(async (id: string, skip: boolean): Promise<void> => {
    if (skip) {
      setServerInfoMap((prev) => ({
        ...prev,
        [id]: { status: 'skip', message: 'RDP 暂不支持服务器信息' }
      }))
      cacheRef.current.set(id, Date.now())
      return
    }

    setServerInfoMap((prev) => ({ ...prev, [id]: { status: 'pending' } }))
    try {
      const info = await window.api.monitor.getServerInfo(id)
      if (info.unsupported) {
        setServerInfoMap((prev) => ({
          ...prev,
          [id]: { status: 'fail', info, message: info.message ?? '暂不支持' }
        }))
      } else {
        setServerInfoMap((prev) => ({ ...prev, [id]: { status: 'ok', info } }))
      }
    } catch (err) {
      setServerInfoMap((prev) => ({
        ...prev,
        [id]: {
          status: 'fail',
          message: err instanceof Error ? err.message : '获取失败'
        }
      }))
    }
    cacheRef.current.set(id, Date.now())
  }, [])

  const fetchAll = useCallback(
    async (force = false): Promise<void> => {
      const runId = ++runIdRef.current
      const toFetch = probeTargets.filter(({ id }) => {
        if (force) return true
        const last = cacheRef.current.get(id)
        return !last || Date.now() - last > CACHE_TTL_MS
      })

      for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
        if (runId !== runIdRef.current) return
        const batch = toFetch.slice(i, i + CONCURRENCY)
        await Promise.all(batch.map(({ id, skip }) => fetchOne(id, skip)))
      }
    },
    [fetchOne, probeTargets]
  )

  useEffect(() => {
    if (!enabled || probeTargets.length === 0) return
    void fetchAll(false)
    return () => {
      runIdRef.current += 1
    }
  }, [connectionKey, enabled, fetchAll, probeTargets.length])

  const refreshServerInfo = useCallback((): void => {
    void fetchAll(true)
  }, [fetchAll])

  return { serverInfoMap, refreshServerInfo }
}
