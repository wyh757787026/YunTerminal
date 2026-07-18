export interface StoredQuickCommand {
  id: string
  connectionId: string | null
  name: string
  command: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface QuickCommandInput {
  connectionId: string | null
  name: string
  command: string
  sortOrder?: number
}
