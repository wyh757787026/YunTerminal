export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: string
  permissions: string
  mode: number
}

export interface SftpListParams {
  connectionId: string
  path: string
}

export interface SftpPathParams {
  connectionId: string
  path: string
}

export interface SftpRenameParams {
  connectionId: string
  oldPath: string
  newPath: string
}

export interface SftpTransferParams {
  connectionId: string
  localPath: string
  remotePath: string
  transferId: string
}

export interface SftpChmodParams {
  connectionId: string
  path: string
  mode: number
}

export interface SftpWriteParams {
  connectionId: string
  path: string
  content: string
}

export interface SftpTransferProgress {
  transferId: string
  transferred: number
  total: number
  status: 'progress' | 'done' | 'error'
  message?: string
}

export interface LocalListParams {
  path: string
}

export interface LocalPathParams {
  path: string
}

export interface LocalWriteParams {
  path: string
  content: string
}
