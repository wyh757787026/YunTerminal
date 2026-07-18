const MAX_HISTORY = 200

export class CommandHistory {
  private items: string[] = []
  private index = -1
  private draft = ''

  constructor(private readonly storageKey: string) {
    this.items = this.load()
  }

  add(command: string): void {
    const trimmed = command.trim()
    if (!trimmed) return
    if (this.items[0] === trimmed) return

    this.items.unshift(trimmed)
    if (this.items.length > MAX_HISTORY) {
      this.items.length = MAX_HISTORY
    }
    this.index = -1
    this.draft = ''
    this.persist()
  }

  previous(currentLine: string): string | null {
    if (this.index === -1) {
      this.draft = currentLine
    }
    if (this.index >= this.items.length - 1) return null
    this.index += 1
    return this.items[this.index] ?? null
  }

  next(): string | null {
    if (this.index <= 0) {
      const draft = this.index === 0 ? this.draft : null
      this.index = -1
      return draft
    }
    this.index -= 1
    return this.items[this.index] ?? null
  }

  search(query: string): string[] {
    if (!query.trim()) return this.items.slice(0, 20)
    const q = query.toLowerCase()
    return this.items.filter((item) => item.toLowerCase().includes(q)).slice(0, 20)
  }

  getAll(): string[] {
    return [...this.items]
  }

  private load(): string[] {
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw) as string[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private persist(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.items))
  }
}

export const globalCommandHistory = new CommandHistory('yun-terminal-command-history')
