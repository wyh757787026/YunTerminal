import type { StoredConnection } from '@shared/types/connection'

export function interpolateCommand(command: string, connection?: StoredConnection | null): string {
  if (!connection) return command

  return command
    .replace(/\{\{host\}\}/g, connection.host)
    .replace(/\{\{user\}\}/g, connection.username)
    .replace(/\{\{name\}\}/g, connection.name)
    .replace(/\{\{port\}\}/g, String(connection.port))
}
