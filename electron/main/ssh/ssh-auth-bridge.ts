import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type SshAuthRequestEvent,
  type SshAuthResponseParams
} from '../../../src/shared/ipc'

interface PendingAuth {
  resolve: (value: SshAuthResponseParams) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class SshAuthBridge {
  private readonly pending = new Map<string, PendingAuth>()

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  register(): void {
    ipcMain.handle(IPC_CHANNELS.SSH_AUTH_RESPONSE, (_, params: SshAuthResponseParams) => {
      const pending = this.pending.get(params.requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(params.requestId)
      pending.resolve(params)
    })
  }

  async requestAuth(
    event: Omit<SshAuthRequestEvent, 'requestId'>
  ): Promise<SshAuthResponseParams> {
    const requestId = randomUUID()
    const win = this.getWindow()
    if (!win) {
      throw new Error('窗口不可用，无法完成认证')
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('认证超时'))
      }, 120_000)

      this.pending.set(requestId, { resolve, reject, timer })
      win.webContents.send(IPC_CHANNELS.SSH_AUTH_REQUEST, {
        ...event,
        requestId
      } satisfies SshAuthRequestEvent)
    })
  }

  cancelAll(reason = '认证已取消'): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(reason))
      this.pending.delete(requestId)
    }
  }
}
