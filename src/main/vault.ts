import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { deriveKey, KDF, open, randomBytes, seal, type Sealed } from './crypto'
import { biometricAvailable, promptBiometric, unwrapWithOS, wrapWithOS } from './biometric'
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY,
  FALLBACK_CATEGORY,
  type Category,
  type ItemType,
  type PasswordOptions,
  type VaultEntry
} from '../shared/types'

/** On-disk vault format. Secrets are only ever stored sealed. */
interface VaultFile {
  version: 1
  kdf: { salt: string; N: number; r: number; p: number }
  /** DEK wrapped by the passcode-derived key. */
  passcodeWrap: Sealed
  /** DEK wrapped by the OS keychain (biometric), or null if not enrolled. */
  biometricWrap: string | null
  /** The vault payload ({ entries, categories }), sealed with the DEK. */
  data: Sealed
  security: { failedAttempts: number; lockedUntil: number }
}

/** Decrypted vault payload. */
interface Payload {
  entries: VaultEntry[]
  categories: Category[]
}

function seedCategories(): Category[] {
  return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)) as Category[]
}

/** Fill in fields added in later versions so older vaults keep working. */
function normalizeEntry(e: Partial<VaultEntry>): VaultEntry {
  return {
    id: e.id ?? '',
    type: (e.type as ItemType) || 'password',
    title: e.title ?? '',
    category: e.category || DEFAULT_CATEGORY,
    favorite: Boolean(e.favorite),
    username: e.username ?? '',
    password: e.password ?? '',
    url: e.url ?? '',
    clientId: e.clientId ?? '',
    secret: e.secret ?? '',
    expiresAt: e.expiresAt ?? 0,
    notes: e.notes ?? '',
    createdAt: e.createdAt ?? Date.now(),
    updatedAt: e.updatedAt ?? Date.now()
  }
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
  private categories: Category[] = []

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

  /** Decrypt the payload into memory, migrating older formats. */
  private loadPayload(dek: Buffer, file: VaultFile): void {
    const raw = JSON.parse(open(dek, file.data).toString()) as VaultEntry[] | Partial<Payload>
    if (Array.isArray(raw)) {
      // v0.2.0 stored a bare entries array.
      this.entries = raw.map(normalizeEntry)
      this.categories = seedCategories()
    } else {
      this.entries = (raw.entries ?? []).map(normalizeEntry)
      this.categories = raw.categories?.length ? raw.categories : seedCategories()
    }
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
      data: seal(dek, Buffer.from(JSON.stringify({ entries: [], categories: seedCategories() }))),
      security: { failedAttempts: 0, lockedUntil: 0 }
    }
    this.write(file)

    this.dek = dek
    this.entries = []
    this.categories = seedCategories()
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
      this.loadPayload(dek, file)
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
      this.loadPayload(dek, file)
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
    this.categories = []
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
    return this.entries.map((e) => ({ ...e }))
  }

  private persist(): void {
    if (!this.dek) throw new Error('Vault is locked.')
    const file = this.read()
    const payload: Payload = { entries: this.entries, categories: this.categories }
    file.data = seal(this.dek, Buffer.from(JSON.stringify(payload)))
    this.write(file)
  }

  save(entry: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): VaultEntry {
    if (!this.dek) throw new Error('Vault is locked.')
    const now = Date.now()
    if (entry.id) {
      const idx = this.entries.findIndex((e) => e.id === entry.id)
      if (idx === -1) throw new Error('Entry not found.')
      this.entries[idx] = normalizeEntry({
        ...this.entries[idx],
        ...entry,
        id: entry.id,
        createdAt: this.entries[idx].createdAt,
        updatedAt: now
      })
      this.persist()
      return { ...this.entries[idx] }
    }
    const created = normalizeEntry({ ...entry, id: randomUUID(), createdAt: now, updatedAt: now })
    this.entries.push(created)
    this.persist()
    return { ...created }
  }

  remove(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id)
    this.persist()
  }

  toggleFavorite(id: string): VaultEntry {
    if (!this.dek) throw new Error('Vault is locked.')
    const e = this.entries.find((x) => x.id === id)
    if (!e) throw new Error('Entry not found.')
    e.favorite = !e.favorite
    e.updatedAt = Date.now()
    this.persist()
    return { ...e }
  }

  /** Bulk-add imported entries. Optionally skip exact duplicates. */
  importEntries(
    incoming: Array<Partial<VaultEntry>>,
    category: string,
    skipDuplicates: boolean
  ): { added: number; skipped: number } {
    if (!this.dek) throw new Error('Vault is locked.')
    const now = Date.now()
    const key = (e: { title?: string; username?: string; password?: string }): string =>
      `${(e.title ?? '').toLowerCase()} ${(e.username ?? '').toLowerCase()} ${e.password ?? ''}`
    const existing = new Set(this.entries.map((e) => key(e)))

    let added = 0
    let skipped = 0
    for (const raw of incoming) {
      const k = key(raw)
      if (skipDuplicates && existing.has(k)) {
        skipped++
        continue
      }
      const created = normalizeEntry({
        ...raw,
        id: randomUUID(),
        category: raw.category || category,
        createdAt: now,
        updatedAt: now
      })
      this.entries.push(created)
      existing.add(k)
      added++
    }
    if (added > 0) this.persist()
    return { added, skipped }
  }

  // ---- categories -----------------------------------------------------------

  listCategories(): Category[] {
    return this.categories.map((c) => ({ ...c }))
  }

  /** Create (no id) or update (existing id) a category. */
  saveCategory(cat: Partial<Category> & { label: string }): Category {
    if (!this.dek) throw new Error('Vault is locked.')
    const label = cat.label.trim()
    if (!label) throw new Error('Category name is required.')

    if (cat.id) {
      const idx = this.categories.findIndex((c) => c.id === cat.id)
      if (idx === -1) throw new Error('Category not found.')
      this.categories[idx] = {
        ...this.categories[idx],
        label,
        color: cat.color ?? this.categories[idx].color,
        icon: cat.icon ?? this.categories[idx].icon
      }
      this.persist()
      return { ...this.categories[idx] }
    }
    const created: Category = {
      id: randomUUID(),
      label,
      color: cat.color || '#94a3b8',
      icon: cat.icon || 'other'
    }
    this.categories.push(created)
    this.persist()
    return { ...created }
  }

  deleteCategory(id: string): void {
    if (!this.dek) throw new Error('Vault is locked.')
    const cat = this.categories.find((c) => c.id === id)
    if (!cat) return
    if (cat.locked) throw new Error('This category cannot be deleted.')
    this.categories = this.categories.filter((c) => c.id !== id)
    // Reassign affected entries to the fallback category.
    for (const e of this.entries) if (e.category === id) e.category = FALLBACK_CATEGORY
    this.persist()
  }

  setCategoryHidden(id: string, hidden: boolean): void {
    if (!this.dek) throw new Error('Vault is locked.')
    const cat = this.categories.find((c) => c.id === id)
    if (!cat) throw new Error('Category not found.')
    cat.hidden = hidden
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
