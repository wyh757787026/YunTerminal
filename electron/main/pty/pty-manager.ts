import { spawn, type ChildProcess } from 'child_process'
import { homedir } from 'os'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../../src/shared/ipc'
interface PtySession {
  process: ChildProcess
  backend: 'node-pty' | 'child-process'
  ptyProcess?: import('node-pty').IPty
}

function getDefaultShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoLogo'] }
  }
  const shell = process.env.SHELL || '/bin/bash'
  return { file: shell, args: [] }
}

function tryLoadNodePty(): typeof import('node-pty') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node-pty') as typeof import('node-pty')
  } catch {
    return null
  }
}

export class PtyManager {
  private readonly sessions = new Map<string, PtySession>()
  private readonly streamEpoch = new Map<string, number>()
  private readonly nodePty = tryLoadNodePty()

  constructor(private getWindow: () => BrowserWindow | null) {}

  create(sessionId: string, cols: number, rows: number): void {
    this.destroy(sessionId)
    const epoch = this.bumpStreamEpoch(sessionId)

    if (this.nodePty) {
      this.createWithNodePty(sessionId, cols, rows, epoch)
    } else {
      this.createWithChildProcess(sessionId, epoch)
    }
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.backend === 'node-pty' && session.ptyProcess) {
      session.ptyProcess.write(data)
      return
    }

    session.process.stdin?.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (session?.backend === 'node-pty' && session.ptyProcess) {
      session.ptyProcess.resize(cols, rows)
    }
  }

  destroy(sessionId: string): void {
    this.bumpStreamEpoch(sessionId)

    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.backend === 'node-pty' && session.ptyProcess) {
      session.ptyProcess.kill()
    } else {
      session.process.kill()
    }

    this.sessions.delete(sessionId)
  }

  destroyAll(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      this.destroy(sessionId)
    }
  }

  private bumpStreamEpoch(sessionId: string): number {
    const next = (this.streamEpoch.get(sessionId) ?? 0) + 1
    this.streamEpoch.set(sessionId, next)
    return next
  }

  private isCurrentStreamEpoch(sessionId: string, epoch: number): boolean {
    return this.streamEpoch.get(sessionId) === epoch
  }

  private emitData(sessionId: string, data: string): void {
    this.getWindow()?.webContents.send(IPC_CHANNELS.PTY_DATA, { sessionId, data })
  }

  private emitStatus(sessionId: string, status: 'connected' | 'disconnected'): void {
    this.getWindow()?.webContents.send(IPC_CHANNELS.PTY_STATUS, { sessionId, status })
  }

  private createWithNodePty(sessionId: string, cols: number, rows: number, epoch: number): void {
    const shell = getDefaultShell()
    const ptyProcess = this.nodePty!.spawn(shell.file, shell.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: homedir(),
      env: process.env as Record<string, string>
    })

    ptyProcess.onData((data) => {
      if (!this.isCurrentStreamEpoch(sessionId, epoch)) return
      this.emitData(sessionId, data)
    })
    ptyProcess.onExit(() => {
      if (!this.isCurrentStreamEpoch(sessionId, epoch)) return
      this.emitStatus(sessionId, 'disconnected')
      this.sessions.delete(sessionId)
    })

    this.sessions.set(sessionId, {
      process: ptyProcess as unknown as ChildProcess,
      backend: 'node-pty',
      ptyProcess
    })
    this.emitStatus(sessionId, 'connected')
  }

  private createWithChildProcess(sessionId: string, epoch: number): void {
    const shell = getDefaultShell()
    const child = spawn(shell.file, shell.args, {
      cwd: homedir(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    child.stdout?.on('data', (data: Buffer) => {
      if (!this.isCurrentStreamEpoch(sessionId, epoch)) return
      this.emitData(sessionId, data.toString('utf-8'))
    })

    child.stderr?.on('data', (data: Buffer) => {
      if (!this.isCurrentStreamEpoch(sessionId, epoch)) return
      this.emitData(sessionId, data.toString('utf-8'))
    })

    child.on('exit', () => {
      if (!this.isCurrentStreamEpoch(sessionId, epoch)) return
      this.emitStatus(sessionId, 'disconnected')
      this.sessions.delete(sessionId)
    })

    child.on('error', (err) => {
      if (!this.isCurrentStreamEpoch(sessionId, epoch)) return
      this.emitData(sessionId, `\r\n\x1b[31m[错误] ${err.message}\x1b[0m\r\n`)
      this.emitStatus(sessionId, 'disconnected')
      this.sessions.delete(sessionId)
    })

    this.sessions.set(sessionId, { process: child, backend: 'child-process' })
    this.emitStatus(sessionId, 'connected')
  }
}
