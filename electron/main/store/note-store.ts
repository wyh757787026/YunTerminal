import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { NoteInput, StoredNote } from '../../../src/shared/types/note'

interface NoteDatabase {
  notes: StoredNote[]
}

export class NoteStore {
  private readonly dbPath: string
  private data: NoteDatabase

  constructor(userDataPath: string) {
    const dir = join(userDataPath, 'data')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.dbPath = join(dir, 'notes.json')
    this.data = this.load()
  }

  private load(): NoteDatabase {
    if (!existsSync(this.dbPath)) {
      return { notes: [] }
    }

    try {
      const raw = readFileSync(this.dbPath, 'utf-8')
      const parsed = JSON.parse(raw) as NoteDatabase
      return { notes: parsed.notes ?? [] }
    } catch {
      return { notes: [] }
    }
  }

  private save(): void {
    writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  listNotes(connectionId: string): StoredNote[] {
    return this.data.notes
      .filter((n) => n.connectionId === connectionId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getNote(id: string): StoredNote | null {
    return this.data.notes.find((n) => n.id === id) ?? null
  }

  createNote(input: NoteInput): StoredNote {
    const now = new Date().toISOString()
    const note: StoredNote = {
      id: randomUUID(),
      connectionId: input.connectionId,
      title: input.title.trim() || '未命名笔记',
      content: input.content,
      createdAt: now,
      updatedAt: now
    }
    this.data.notes.push(note)
    this.save()
    return note
  }

  updateNote(id: string, input: NoteInput): StoredNote | null {
    const index = this.data.notes.findIndex((n) => n.id === id)
    if (index === -1) return null

    const updated: StoredNote = {
      ...this.data.notes[index],
      connectionId: input.connectionId,
      title: input.title.trim() || '未命名笔记',
      content: input.content,
      updatedAt: new Date().toISOString()
    }
    this.data.notes[index] = updated
    this.save()
    return updated
  }

  deleteNote(id: string): boolean {
    const before = this.data.notes.length
    this.data.notes = this.data.notes.filter((n) => n.id !== id)
    this.save()
    return this.data.notes.length < before
  }

  deleteByConnectionId(connectionId: string): void {
    this.data.notes = this.data.notes.filter((n) => n.connectionId !== connectionId)
    this.save()
  }

  exportAll(): StoredNote[] {
    return [...this.data.notes]
  }

  importMerge(notes: StoredNote[]): number {
    let imported = 0
    for (const note of notes) {
      const index = this.data.notes.findIndex((n) => n.id === note.id)
      if (index === -1) {
        this.data.notes.push(note)
        imported += 1
      } else if (note.updatedAt > this.data.notes[index].updatedAt) {
        this.data.notes[index] = note
        imported += 1
      }
    }
    if (imported > 0) this.save()
    return imported
  }
}
