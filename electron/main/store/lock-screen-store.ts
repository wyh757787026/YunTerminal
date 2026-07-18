import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface LockScreenRecord {
  passwordHash?: string
}

function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false

  try {
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(password, salt, 64)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export class LockScreenStore {
  private readonly recordPath: string
  private record: LockScreenRecord

  constructor(userDataPath: string) {
    const dir = join(userDataPath, 'data')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.recordPath = join(dir, 'lock-screen.json')
    this.record = this.load()
  }

  private load(): LockScreenRecord {
    if (!existsSync(this.recordPath)) {
      return {}
    }

    try {
      return JSON.parse(readFileSync(this.recordPath, 'utf-8')) as LockScreenRecord
    } catch {
      return {}
    }
  }

  private save(): void {
    writeFileSync(this.recordPath, JSON.stringify(this.record, null, 2), 'utf-8')
  }

  isConfigured(): boolean {
    return Boolean(this.record.passwordHash)
  }

  setPassword(password: string, currentPassword?: string): { success: boolean; message?: string } {
    const trimmed = password.trim()
    if (trimmed.length < 4) {
      return { success: false, message: '密码至少 4 位' }
    }

    if (this.record.passwordHash) {
      if (!currentPassword) {
        return { success: false, message: '请输入当前密码' }
      }
      if (!verifyPassword(currentPassword, this.record.passwordHash)) {
        return { success: false, message: '当前密码不正确' }
      }
    }

    this.record.passwordHash = hashPassword(trimmed)
    this.save()
    return { success: true }
  }

  verify(password: string): boolean {
    if (!this.record.passwordHash) return true
    return verifyPassword(password, this.record.passwordHash)
  }

  clearPassword(currentPassword: string): { success: boolean; message?: string } {
    if (!this.record.passwordHash) {
      return { success: true }
    }
    if (!verifyPassword(currentPassword, this.record.passwordHash)) {
      return { success: false, message: '当前密码不正确' }
    }
    delete this.record.passwordHash
    this.save()
    return { success: true }
  }
}
