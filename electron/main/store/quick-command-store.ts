import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { QuickCommandInput, StoredQuickCommand } from '../../../src/shared/types/quick-command'

interface QuickCommandDatabase {
  commands: StoredQuickCommand[]
}

export class QuickCommandStore {
  private readonly dbPath: string
  private data: QuickCommandDatabase

  constructor(userDataPath: string) {
    const dir = join(userDataPath, 'data')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.dbPath = join(dir, 'quick-commands.json')
    this.data = this.load()
  }

  private load(): QuickCommandDatabase {
    if (!existsSync(this.dbPath)) {
      return { commands: [] }
    }

    try {
      const raw = readFileSync(this.dbPath, 'utf-8')
      const parsed = JSON.parse(raw) as QuickCommandDatabase
      return { commands: parsed.commands ?? [] }
    } catch {
      return { commands: [] }
    }
  }

  private save(): void {
    writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  listCommands(connectionId?: string): StoredQuickCommand[] {
    const items = connectionId
      ? this.data.commands.filter((c) => c.connectionId === null || c.connectionId === connectionId)
      : this.data.commands
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
  }

  getCommand(id: string): StoredQuickCommand | null {
    return this.data.commands.find((c) => c.id === id) ?? null
  }

  createCommand(input: QuickCommandInput): StoredQuickCommand {
    const now = new Date().toISOString()
    const scoped = input.connectionId
      ? this.data.commands.filter((c) => c.connectionId === input.connectionId)
      : this.data.commands.filter((c) => c.connectionId === null)
    const sortOrder = input.sortOrder ?? (scoped.length > 0 ? Math.max(...scoped.map((c) => c.sortOrder)) + 1 : 0)

    const command: StoredQuickCommand = {
      id: randomUUID(),
      connectionId: input.connectionId,
      name: input.name.trim(),
      command: input.command,
      sortOrder,
      createdAt: now,
      updatedAt: now
    }
    this.data.commands.push(command)
    this.save()
    return command
  }

  updateCommand(id: string, input: QuickCommandInput): StoredQuickCommand | null {
    const index = this.data.commands.findIndex((c) => c.id === id)
    if (index === -1) return null

    const existing = this.data.commands[index]
    const updated: StoredQuickCommand = {
      ...existing,
      connectionId: input.connectionId,
      name: input.name.trim(),
      command: input.command,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      updatedAt: new Date().toISOString()
    }
    this.data.commands[index] = updated
    this.save()
    return updated
  }

  deleteCommand(id: string): boolean {
    const before = this.data.commands.length
    this.data.commands = this.data.commands.filter((c) => c.id !== id)
    this.save()
    return this.data.commands.length < before
  }

  deleteByConnectionId(connectionId: string): void {
    this.data.commands = this.data.commands.filter((c) => c.connectionId !== connectionId)
    this.save()
  }

  exportAll(): StoredQuickCommand[] {
    return [...this.data.commands]
  }

  importMerge(commands: StoredQuickCommand[]): number {
    let imported = 0
    for (const command of commands) {
      const index = this.data.commands.findIndex((c) => c.id === command.id)
      if (index === -1) {
        this.data.commands.push(command)
        imported += 1
      } else if (command.updatedAt > this.data.commands[index].updatedAt) {
        this.data.commands[index] = command
        imported += 1
      }
    }
    if (imported > 0) this.save()
    return imported
  }
}
