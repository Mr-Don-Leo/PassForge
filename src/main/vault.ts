import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { deriveKey, KDF, open, randomBytes, seal, type Sealed } from './crypto'
import { biometricAvailable, promptBiometric, unwrapWithOS, wrapWithOS } from './biometric'
import { DEFAULT_CATEGORY, type PasswordOptions, type VaultEntry } from '../shared/types'

/** On-disk vault format. Secrets are only ever stored sealed. */
interface VaultFile {
  version: 1
  kdf: { salt: string; N: number; r: number; p: number }
  /** DEK wrapped by the passcode-derived key. */
  passcodeWrap: Sealed
  /** DEK wrapped by the OS keychain (biometric), or null if not enrolled. */
  biometricWrap: string | null
  /** The entries array, sealed with the DEK. */
  data: Sealed
  security: { failedAttempts: number; lockedUntil: number }
}

// Escalating lockout after repeated wrong passcodes (ms).
function backoffFor(failedAttempts: number): number {
  if (failedAttempts < 3) return 0
  if (failedAttempts < 5) return 30_000
  if (failedAttempts < 7) return 5 * 60_000
  if (failedAttempts < 10) return 30 * 60_000
  return 60 * 60_000
}

export class Vault {
  private file: string
  private dek: Buffer | null = null
  private entries: VaultEntry[] = []

  constructor() {
    this.file = path.join(app.getPath('userData'), 'vault.pfvault')
  }

  // ---- state ----------------------------------------------------------------

  exists(): boolean {
    return fs.existsSync(this.file)
  }

  isUnlocked(): boolean {
    return this.dek !== null
  }

  private read(): VaultFile {
    return JSON.parse(fs.readFileSync(this.file, 'utf8')) as VaultFile
  }

  private write(v: VaultFile): void {
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(v), { mode: 0o600 })
    fs.renameSync(tmp, this.file)
  }

  biometricEnrolled(): boolean {
    if (!this.exists()) return false
    try {
      return this.read().biometricWrap !== null
    } catch {
      return false
    }
  }

  lockedUntil(): number {
    if (!this.exists()) return 0
    try {
      return this.read().security.lockedUntil
    } catch {
      return 0
    }
  }

  // ---- lifecycle ------------------------------------------------------------

  /** Create a brand-new vault protected by the passcode (+ optional biometric). */
  createVault(passcode: string, enrollBiometric: boolean): void {
    const dek = randomBytes(32)
    const salt = randomBytes(16)
    const kek = deriveKey(passcode, salt)

    const file: VaultFile = {
      version: 1,
      kdf: { salt: salt.toString('base64'), N: KDF.N, r: KDF.r, p: KDF.p },
      passcodeWrap: seal(kek, dek),
      biometricWrap: enrollBiometric && biometricAvailable() ? wrapWithOS(dek) : null,
      data: seal(dek, Buffer.from(JSON.stringify([]))),
      security: { failedAttempts: 0, lockedUntil: 0 }
    }
    this.write(file)

    this.dek = dek
    this.entries = []
  }

  unlockWithPasscode(passcode: string): { ok: true } | { ok: false; error: string; lockedUntil?: number } {
    const file = this.read()
    const now = Date.now()

    if (file.security.lockedUntil > now) {
      return { ok: false, error: 'Too many attempts. Try again later.', lockedUntil: file.security.lockedUntil }
    }

    try {
      const kek = deriveKey(passcode, Buffer.from(file.kdf.salt, 'base64'))
      const dek = open(kek, file.passcodeWrap) // throws on wrong passcode
      this.entries = JSON.parse(open(dek, file.data).toString()) as VaultEntry[]
      this.dek = dek

      if (file.security.failedAttempts !== 0 || file.security.lockedUntil !== 0) {
        file.security = { failedAttempts: 0, lockedUntil: 0 }
        this.write(file)
      }
      return { ok: true }
    } catch {
      const failedAttempts = file.security.failedAttempts + 1
      const wait = backoffFor(failedAttempts)
      file.security = { failedAttempts, lockedUntil: wait > 0 ? now + wait : 0 }
      this.write(file)
      return {
        ok: false,
        error: 'Incorrect passcode.',
        lockedUntil: file.security.lockedUntil
      }
    }
  }

  async unlockWithBiometric(): Promise<{ ok: true } | { ok: false; error: string }> {
    const file = this.read()
    if (!file.biometricWrap) return { ok: false, error: 'Biometric unlock is not set up.' }
    if (!biometricAvailable()) return { ok: false, error: 'Biometric unlock is unavailable on this device.' }

    const ok = await promptBiometric('Unlock your PassForge vault')
    if (!ok) return { ok: false, error: 'Biometric authentication was cancelled.' }

    try {
      const dek = unwrapWithOS(file.biometricWrap)
      this.entries = JSON.parse(open(dek, file.data).toString()) as VaultEntry[]
      this.dek = dek
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not decrypt the vault.' }
    }
  }

  lock(): void {
    if (this.dek) this.dek.fill(0)
    this.dek = null
    this.entries = []
  }

  // ---- biometric enrolment (while unlocked) ---------------------------------

  enrollBiometric(): { ok: true } | { ok: false; error: string } {
    if (!this.dek) return { ok: false, error: 'Vault is locked.' }
    if (!biometricAvailable()) return { ok: false, error: 'Biometric unlock is unavailable on this device.' }
    const file = this.read()
    file.biometricWrap = wrapWithOS(this.dek)
    this.write(file)
    return { ok: true }
  }

  disableBiometric(): { ok: true } | { ok: false; error: string } {
    const file = this.read()
    file.biometricWrap = null
    this.write(file)
    return { ok: true }
  }

  changePasscode(current: string, next: string): { ok: true } | { ok: false; error: string } {
    const file = this.read()
    try {
      const kek = deriveKey(current, Buffer.from(file.kdf.salt, 'base64'))
      const dek = open(kek, file.passcodeWrap)
      const salt = randomBytes(16)
      const newKek = deriveKey(next, salt)
      file.kdf = { salt: salt.toString('base64'), N: KDF.N, r: KDF.r, p: KDF.p }
      file.passcodeWrap = seal(newKek, dek)
      this.write(file)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Current passcode is incorrect.' }
    }
  }

  // ---- entries CRUD ---------------------------------------------------------

  list(): VaultEntry[] {
    // Default legacy entries that predate categories.
    return this.entries.map((e) => ({ ...e, category: e.category || DEFAULT_CATEGORY }))
  }

  private persist(): void {
    if (!this.dek) throw new Error('Vault is locked.')
    const file = this.read()
    file.data = seal(this.dek, Buffer.from(JSON.stringify(this.entries)))
    this.write(file)
  }

  save(entry: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): VaultEntry {
    if (!this.dek) throw new Error('Vault is locked.')
    const now = Date.now()
    if (entry.id) {
      const idx = this.entries.findIndex((e) => e.id === entry.id)
      if (idx === -1) throw new Error('Entry not found.')
      this.entries[idx] = { ...this.entries[idx], ...entry, id: entry.id, updatedAt: now }
      this.persist()
      return { ...this.entries[idx] }
    }
    const created: VaultEntry = {
      id: randomUUID(),
      title: entry.title,
      username: entry.username,
      password: entry.password,
      url: entry.url,
      notes: entry.notes,
      category: entry.category || DEFAULT_CATEGORY,
      createdAt: now,
      updatedAt: now
    }
    this.entries.push(created)
    this.persist()
    return { ...created }
  }

  remove(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id)
    this.persist()
  }
}

// ---- password generator -----------------------------------------------------

const SETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?'
}

/** Cryptographically-strong password generator with unbiased selection. */
export function generatePassword(opts: PasswordOptions): string {
  let pool = ''
  if (opts.lowercase) pool += SETS.lowercase
  if (opts.uppercase) pool += SETS.uppercase
  if (opts.numbers) pool += SETS.numbers
  if (opts.symbols) pool += SETS.symbols
  if (!pool) pool = SETS.lowercase

  const length = Math.max(4, Math.min(128, Math.floor(opts.length)))
  const max = Math.floor(256 / pool.length) * pool.length // rejection-sample to avoid modulo bias
  const out: string[] = []
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (out.length >= length) break
      if (byte < max) out.push(pool[byte % pool.length])
    }
  }
  return out.join('')
}
