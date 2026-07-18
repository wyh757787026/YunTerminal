export interface Group {
  id: string
  name: string
  parentId?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface GroupInput {
  name: string
  parentId?: string
}

export interface GroupReorderItem {
  id: string
  sortOrder: number
  parentId?: string
}
