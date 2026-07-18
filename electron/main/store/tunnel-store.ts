import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { StoredTunnel, TunnelInput } from '../../../src/shared/types/tunnel'

interface TunnelDatabase {
  tunnels: StoredTunnel[]
}

export class TunnelStore {
  private readonly dbPath: string
  private data: TunnelDatabase

  constructor(userDataPath: string) {
    const dir = join(userDataPath, 'data')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.dbPath = join(dir, 'tunnels.json')
    this.data = this.load()
  }

  private load(): TunnelDatabase {
    if (!existsSync(this.dbPath)) {
      return { tunnels: [] }
    }

    try {
      const raw = readFileSync(this.dbPath, 'utf-8')
      const parsed = JSON.parse(raw) as TunnelDatabase
      return {
        tunnels: (parsed.tunnels ?? []).map((tunnel) => ({
          ...tunnel,
          autoReconnect: tunnel.autoReconnect ?? false
        }))
      }
    } catch {
      return { tunnels: [] }
    }
  }

  private save(): void {
    writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  listTunnels(connectionId?: string): StoredTunnel[] {
    const items = connectionId
      ? this.data.tunnels.filter((t) => t.connectionId === connectionId)
      : this.data.tunnels
    return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  getTunnel(id: string): StoredTunnel | null {
    return this.data.tunnels.find((t) => t.id === id) ?? null
  }

  createTunnel(input: TunnelInput): StoredTunnel {
    const now = new Date().toISOString()
    const tunnel: StoredTunnel = {
      id: randomUUID(),
      connectionId: input.connectionId,
      name: input.name.trim(),
      type: input.type,
      bindHost: input.bindHost.trim() || '127.0.0.1',
      bindPort: input.bindPort,
      targetHost: input.targetHost.trim(),
      targetPort: input.targetPort,
      autoStart: input.autoStart ?? false,
      autoReconnect: input.autoReconnect ?? false,
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now
    }
    this.data.tunnels.push(tunnel)
    this.save()
    return tunnel
  }

  updateTunnel(id: string, input: TunnelInput): StoredTunnel | null {
    const index = this.data.tunnels.findIndex((t) => t.id === id)
    if (index === -1) return null

    const existing = this.data.tunnels[index]
    const updated: StoredTunnel = {
      ...existing,
      connectionId: input.connectionId,
      name: input.name.trim(),
      type: input.type,
      bindHost: input.bindHost.trim() || '127.0.0.1',
      bindPort: input.bindPort,
      targetHost: input.targetHost.trim(),
      targetPort: input.targetPort,
      autoStart: input.autoStart ?? false,
      autoReconnect: input.autoReconnect ?? false,
      note: input.note?.trim() || undefined,
      updatedAt: new Date().toISOString()
    }
    this.data.tunnels[index] = updated
    this.save()
    return updated
  }

  deleteTunnel(id: string): boolean {
    const before = this.data.tunnels.length
    this.data.tunnels = this.data.tunnels.filter((t) => t.id !== id)
    this.save()
    return this.data.tunnels.length < before
  }

  deleteByConnectionId(connectionId: string): void {
    this.data.tunnels = this.data.tunnels.filter((t) => t.connectionId !== connectionId)
    this.save()
  }

  exportAll(): StoredTunnel[] {
    return [...this.data.tunnels]
  }

  importMerge(tunnels: StoredTunnel[]): number {
    let imported = 0
    for (const tunnel of tunnels) {
      const index = this.data.tunnels.findIndex((t) => t.id === tunnel.id)
      if (index === -1) {
        this.data.tunnels.push(tunnel)
        imported += 1
      } else if (tunnel.updatedAt > this.data.tunnels[index].updatedAt) {
        this.data.tunnels[index] = tunnel
        imported += 1
      }
    }
    if (imported > 0) this.save()
    return imported
  }
}
