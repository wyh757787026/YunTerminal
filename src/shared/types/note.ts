export interface StoredNote {
  id: string
  connectionId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface NoteInput {
  connectionId: string
  title: string
  content: string
}
