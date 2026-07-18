import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { safeStorage } from 'electron'
import type {
  Connection,
  ConnectionExportBundle,
  ConnectionImportResult,
  ConnectionInput,
  ConnectionSecrets,
  StoredConnection
} from '../../../src/shared/types/connection'
import type { Group, GroupInput, GroupReorderItem } from '../../../src/shared/types/group'

interface SecretRecord {
  password?: string
  privateKeyPath?: string
  passphrase?: string
}

interface DatabaseSchema {
  connections: Connection[]
  groups: Group[]
  secrets: Record<string, SecretRecord>
  recentConnectionIds: string[]
}

const DEFAULT_GROUPS: Group[] = [
  {
    id: 'default',
    name: '默认分组',
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

const MAX_RECENT = 10

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }
  return Buffer.from(value, 'utf-8').toString('base64')
}

function decrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  return Buffer.from(value, 'base64').toString('utf-8')
}

export class ConnectionStore {
  private readonly dbPath: string
  private data: DatabaseSchema

  constructor(userDataPath: string) {
    const dir = join(userDataPath, 'data')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.dbPath = join(dir, 'connections.json')
    this.data = this.load()
  }

  private load(): DatabaseSchema {
    if (!existsSync(this.dbPath)) {
      return { connections: [], groups: DEFAULT_GROUPS, secrets: {}, recentConnectionIds: [] }
    }

    try {
      const raw = readFileSync(this.dbPath, 'utf-8')
      const parsed = JSON.parse(raw) as DatabaseSchema
      return {
        connections: (parsed.connections ?? []).map((c) => ({
          ...c,
          protocol: c.protocol ?? 'ssh',
          sortOrder: c.sortOrder ?? 0,
          favorite: c.favorite ?? false
        })),
        groups: parsed.groups?.length ? parsed.groups : DEFAULT_GROUPS,
        secrets: parsed.secrets ?? {},
        recentConnectionIds: parsed.recentConnectionIds ?? []
      }
    } catch {
      return { connections: [], groups: DEFAULT_GROUPS, secrets: {}, recentConnectionIds: [] }
    }
  }

  private save(): void {
    writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  private nextConnectionSortOrder(groupId?: string): number {
    const items = this.data.connections.filter((c) => c.groupId === groupId)
    return items.length > 0 ? Math.max(...items.map((c) => c.sortOrder)) + 1 : 0
  }

  listGroups(): Group[] {
    return [...this.data.groups].sort((a, b) => a.sortOrder - b.sortOrder)
  }

  listConnections(): StoredConnection[] {
    return this.data.connections
      .map((connection) => this.toStored(connection))
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  listFavorites(): StoredConnection[] {
    return this.listConnections().filter((c) => c.favorite)
  }

  listRecent(): StoredConnection[] {
    return this.data.recentConnectionIds
      .map((id) => this.getConnection(id))
      .filter((c): c is StoredConnection => c !== null)
  }

  getConnection(id: string): StoredConnection | null {
    const connection = this.data.connections.find((item) => item.id === id)
    return connection ? this.toStored(connection) : null
  }

  getConnectionSecrets(id: string): ConnectionSecrets {
    const record = this.data.secrets[id]
    if (!record) return {}

    return {
      password: record.password ? decrypt(record.password) : undefined,
      privateKeyPath: record.privateKeyPath,
      passphrase: record.passphrase ? decrypt(record.passphrase) : undefined
    }
  }

  recordRecent(connectionId: string): void {
    const filtered = this.data.recentConnectionIds.filter((id) => id !== connectionId)
    this.data.recentConnectionIds = [connectionId, ...filtered].slice(0, MAX_RECENT)
    this.save()
  }

  createConnection(input: ConnectionInput): StoredConnection {
    const now = new Date().toISOString()
    const groupId = input.groupId ?? 'default'
    const connection: Connection = {
      id: randomUUID(),
      name: input.name,
      protocol: input.protocol ?? 'ssh',
      host: input.host,
      port: input.port,
      username: input.username,
      authType: input.authType,
      credentialId: input.credentialId,
      groupId,
      proxyChain: input.proxyChain?.filter(Boolean),
      tags: input.tags ?? [],
      note: input.note,
      ssh: input.ssh,
      rdp: input.rdp,
      telnet: input.telnet,
      vnc: input.vnc,
      ftp: input.ftp,
      favorite: input.favorite ?? false,
      sortOrder: this.nextConnectionSortOrder(groupId),
      createdAt: now,
      updatedAt: now
    }

    this.data.connections.push(connection)
    if (input.authType === 'prompt' || input.authType === 'credential') {
      delete this.data.secrets[connection.id]
    } else {
      this.saveSecrets(connection.id, input.secrets)
    }
    this.save()
    return this.toStored(connection)
  }

  updateConnection(id: string, input: ConnectionInput): StoredConnection | null {
    const index = this.data.connections.findIndex((item) => item.id === id)
    if (index === -1) return null

    const existing = this.data.connections[index]
    const updated: Connection = {
      ...existing,
      name: input.name,
      protocol: input.protocol ?? existing.protocol ?? 'ssh',
      host: input.host,
      port: input.port,
      username: input.username,
      authType: input.authType,
      credentialId: input.credentialId,
      groupId: input.groupId ?? existing.groupId,
      proxyChain: input.proxyChain !== undefined ? input.proxyChain?.filter(Boolean) : existing.proxyChain,
      tags: input.tags ?? [],
      note: input.note,
      ssh: input.ssh,
      rdp: input.rdp,
      telnet: input.telnet,
      vnc: input.vnc,
      ftp: input.ftp,
      favorite: input.favorite ?? existing.favorite ?? false,
      updatedAt: new Date().toISOString()
    }

    this.data.connections[index] = updated
    if (input.authType === 'prompt' || input.authType === 'credential') {
      delete this.data.secrets[id]
    } else {
      this.saveSecrets(id, input.secrets)
    }
    this.save()
    return this.toStored(updated)
  }

  deleteConnection(id: string): boolean {
    const before = this.data.connections.length
    this.data.connections = this.data.connections.filter((item) => item.id !== id)
    delete this.data.secrets[id]
    this.data.recentConnectionIds = this.data.recentConnectionIds.filter((rid) => rid !== id)
    this.data.connections = this.data.connections.map((c) => ({
      ...c,
      proxyChain: c.proxyChain?.filter((pid) => pid !== id)
    }))
    this.save()
    return this.data.connections.length < before
  }

  toggleFavorite(id: string): StoredConnection | null {
    const index = this.data.connections.findIndex((item) => item.id === id)
    if (index === -1) return null
    this.data.connections[index] = {
      ...this.data.connections[index],
      favorite: !this.data.connections[index].favorite,
      updatedAt: new Date().toISOString()
    }
    this.save()
    return this.toStored(this.data.connections[index])
  }

  moveConnection(id: string, groupId: string, sortOrder?: number): StoredConnection | null {
    const index = this.data.connections.findIndex((item) => item.id === id)
    if (index === -1) return null

    this.data.connections[index] = {
      ...this.data.connections[index],
      groupId,
      sortOrder: sortOrder ?? this.nextConnectionSortOrder(groupId),
      updatedAt: new Date().toISOString()
    }
    this.save()
    return this.toStored(this.data.connections[index])
  }

  reorderConnections(items: { id: string; sortOrder: number; groupId?: string }[]): void {
    for (const item of items) {
      const index = this.data.connections.findIndex((c) => c.id === item.id)
      if (index === -1) continue
      this.data.connections[index] = {
        ...this.data.connections[index],
        sortOrder: item.sortOrder,
        groupId: item.groupId ?? this.data.connections[index].groupId,
        updatedAt: new Date().toISOString()
      }
    }
    this.save()
  }

  createGroup(input: GroupInput): Group {
    const now = new Date().toISOString()
    const siblings = this.data.groups.filter((g) => g.parentId === input.parentId)
    const group: Group = {
      id: randomUUID(),
      name: input.name.trim(),
      parentId: input.parentId,
      sortOrder: siblings.length > 0 ? Math.max(...siblings.map((g) => g.sortOrder)) + 1 : 0,
      createdAt: now,
      updatedAt: now
    }
    this.data.groups.push(group)
    this.save()
    return group
  }

  updateGroup(id: string, input: GroupInput): Group | null {
    if (id === 'default') return null
    const index = this.data.groups.findIndex((g) => g.id === id)
    if (index === -1) return null

    this.data.groups[index] = {
      ...this.data.groups[index],
      name: input.name.trim(),
      parentId: input.parentId,
      updatedAt: new Date().toISOString()
    }
    this.save()
    return this.data.groups[index]
  }

  deleteGroup(id: string): boolean {
    if (id === 'default') return false
    const hasChildren = this.data.groups.some((g) => g.parentId === id)
    if (hasChildren) return false

    this.data.groups = this.data.groups.filter((g) => g.id !== id)
    this.data.connections = this.data.connections.map((c) =>
      c.groupId === id ? { ...c, groupId: 'default', updatedAt: new Date().toISOString() } : c
    )
    this.save()
    return true
  }

  reorderGroups(items: GroupReorderItem[]): void {
    for (const item of items) {
      const index = this.data.groups.findIndex((g) => g.id === item.id)
      if (index === -1) continue
      this.data.groups[index] = {
        ...this.data.groups[index],
        sortOrder: item.sortOrder,
        parentId: item.parentId,
        updatedAt: new Date().toISOString()
      }
    }
    this.save()
  }

  exportBundle(includeSecrets = false): ConnectionExportBundle {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      groups: this.listGroups(),
      connections: this.data.connections.map(({ ...c }) => c),
      includeSecrets
    }
  }

  exportToJson(includeSecrets = false): string {
    const bundle = this.exportBundle(includeSecrets)
    if (includeSecrets) {
      return JSON.stringify({ ...bundle, secrets: this.data.secrets }, null, 2)
    }
    return JSON.stringify(bundle, null, 2)
  }

  importFromJson(raw: string, mode: 'merge' | 'replace' = 'merge'): ConnectionImportResult {
    const parsed = JSON.parse(raw) as ConnectionExportBundle & { secrets?: Record<string, SecretRecord> }
    let importedGroups = 0
    let importedConnections = 0
    let skippedConnections = 0

    if (mode === 'replace') {
      this.data.connections = []
      this.data.groups = [...DEFAULT_GROUPS]
      this.data.secrets = {}
      this.data.recentConnectionIds = []
    }

    const groupIdMap = new Map<string, string>()

    for (const group of parsed.groups ?? []) {
      if (group.id === 'default') {
        groupIdMap.set(group.id, 'default')
        continue
      }

      const existing = this.data.groups.find((g) => g.id === group.id)
      if (existing) {
        groupIdMap.set(group.id, existing.id)
        continue
      }

      const mappedParent = group.parentId ? groupIdMap.get(group.parentId) ?? group.parentId : undefined
      const created = this.createGroup({ name: group.name, parentId: mappedParent })
      groupIdMap.set(group.id, created.id)
      importedGroups += 1
    }

    const connIdMap = new Map<string, string>()
    const pending: Connection[] = []

    for (const conn of parsed.connections ?? []) {
      const duplicate = this.data.connections.find(
        (c) => c.host === conn.host && c.port === conn.port && c.username === conn.username
      )
      if (duplicate && mode === 'merge') {
        skippedConnections += 1
        connIdMap.set(conn.id, duplicate.id)
        continue
      }

      const newId = randomUUID()
      connIdMap.set(conn.id, newId)
      const mappedGroupId = conn.groupId ? groupIdMap.get(conn.groupId) ?? conn.groupId : 'default'

      pending.push({
        ...conn,
        id: newId,
        groupId: mappedGroupId,
        proxyChain: conn.proxyChain,
        sortOrder: this.nextConnectionSortOrder(mappedGroupId),
        createdAt: conn.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      if (parsed.secrets?.[conn.id]) {
        this.data.secrets[newId] = parsed.secrets[conn.id]
      }

      importedConnections += 1
    }

    for (const connection of pending) {
      connection.proxyChain = connection.proxyChain
        ?.map((pid) => connIdMap.get(pid) ?? pid)
        .filter((pid) => pid !== connection.id)
      this.data.connections.push(connection)
    }

    this.save()
    return { importedGroups, importedConnections, skippedConnections }
  }

  private saveSecrets(id: string, secrets?: ConnectionSecrets): void {
    if (!secrets) return

    const record: SecretRecord = this.data.secrets[id] ?? {}
    if (secrets.password !== undefined) {
      record.password = secrets.password ? encrypt(secrets.password) : undefined
    }
    if (secrets.privateKeyPath !== undefined) {
      record.privateKeyPath = secrets.privateKeyPath || undefined
    }
    if (secrets.passphrase !== undefined) {
      record.passphrase = secrets.passphrase ? encrypt(secrets.passphrase) : undefined
    }

    if (Object.keys(record).length === 0) {
      delete this.data.secrets[id]
    } else {
      this.data.secrets[id] = record
    }
  }

  private toStored(connection: Connection): StoredConnection {
    const secret = this.data.secrets[connection.id]
    return {
      ...connection,
      hasPassword: Boolean(secret?.password),
      hasPrivateKey: Boolean(secret?.privateKeyPath)
    }
  }
}
