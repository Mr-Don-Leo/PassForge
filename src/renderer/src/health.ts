import type { VaultEntry } from './api'

const DAY = 24 * 60 * 60 * 1000
export const OLD_PASSWORD_DAYS = 365
export const SECRET_ROTATE_DAYS = 90
export const EXPIRY_SOON_DAYS = 14

export interface ReusedGroup {
  maskedValue: string
  entryIds: string[]
}
export interface WeakItem {
  entryId: string
  reason: string
}
export interface SimilarPair {
  a: string
  b: string
}
export interface MissingItem {
  entryId: string
  missing: string[]
}
export interface DuplicateGroup {
  entryIds: string[]
}

export interface HealthReport {
  total: number
  score: number
  reused: ReusedGroup[]
  weak: WeakItem[]
  similar: SimilarPair[]
  old: string[]
  missing: MissingItem[]
  duplicates: DuplicateGroup[]
  secretsExpired: string[]
  secretsDueSoon: string[]
  secretsStale: string[]
  issueCount: number
}

/** Rough strength check: flags short or low-variety passwords. */
export function passwordWeakness(pw: string): string | null {
  if (!pw) return null
  if (pw.length < 8) return 'Too short (under 8 characters)'
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/[0-9]/.test(pw)) pool += 10
  if (/[^A-Za-z0-9]/.test(pw)) pool += 32
  const entropy = pw.length * Math.log2(pool || 1)
  if (entropy < 40) return 'Low complexity — add length or character variety'
  return null
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  return 1 - levenshtein(a, b) / max
}

const mask = (pw: string): string =>
  pw.length <= 2 ? '••' : `${pw[0]}${'•'.repeat(Math.min(pw.length - 2, 8))}${pw[pw.length - 1]}`

/**
 * Analyse the vault entirely in memory. This never touches the network — the
 * entries are already decrypted locally and no data leaves the device.
 */
export function analyze(entries: VaultEntry[], now: number): HealthReport {
  const passwords = entries.filter((e) => e.type === 'password')
  const secrets = entries.filter((e) => e.type === 'secret')

  // Reused passwords
  const byValue = new Map<string, string[]>()
  for (const e of passwords) {
    if (!e.password) continue
    const arr = byValue.get(e.password) ?? []
    arr.push(e.id)
    byValue.set(e.password, arr)
  }
  const reused: ReusedGroup[] = [...byValue.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([value, ids]) => ({ maskedValue: mask(value), entryIds: ids }))

  // Weak
  const weak: WeakItem[] = []
  for (const e of passwords) {
    const reason = passwordWeakness(e.password)
    if (reason) weak.push({ entryId: e.id, reason })
  }

  // Similar (skip identical — those are "reused"). Capped to keep it fast.
  const similar: SimilarPair[] = []
  const withPw = passwords.filter((e) => e.password && e.password.length >= 4)
  if (withPw.length <= 400) {
    for (let i = 0; i < withPw.length; i++) {
      for (let j = i + 1; j < withPw.length; j++) {
        const pa = withPw[i].password
        const pb = withPw[j].password
        if (pa === pb) continue
        if (similarity(pa, pb) >= 0.7) similar.push({ a: withPw[i].id, b: withPw[j].id })
      }
    }
  }

  // Old passwords
  const old = passwords.filter((e) => now - e.updatedAt > OLD_PASSWORD_DAYS * DAY).map((e) => e.id)

  // Missing username / url
  const missing: MissingItem[] = []
  for (const e of passwords) {
    const m: string[] = []
    if (!e.username.trim()) m.push('username')
    if (!e.url.trim()) m.push('URL')
    if (m.length) missing.push({ entryId: e.id, missing: m })
  }

  // Duplicate entries (same title + username, case-insensitive)
  const byKey = new Map<string, string[]>()
  for (const e of entries) {
    const k = `${e.type}|${e.title.trim().toLowerCase()}|${e.username.trim().toLowerCase()}`
    const arr = byKey.get(k) ?? []
    arr.push(e.id)
    byKey.set(k, arr)
  }
  const duplicates: DuplicateGroup[] = [...byKey.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ({ entryIds: ids }))

  // Secret rotation / expiry
  const secretsExpired: string[] = []
  const secretsDueSoon: string[] = []
  const secretsStale: string[] = []
  for (const e of secrets) {
    if (e.expiresAt > 0) {
      if (e.expiresAt < now) secretsExpired.push(e.id)
      else if (e.expiresAt - now < EXPIRY_SOON_DAYS * DAY) secretsDueSoon.push(e.id)
    } else if (now - e.updatedAt > SECRET_ROTATE_DAYS * DAY) {
      secretsStale.push(e.id)
    }
  }

  const issueCount =
    reused.length +
    weak.length +
    similar.length +
    old.length +
    missing.length +
    duplicates.length +
    secretsExpired.length +
    secretsDueSoon.length +
    secretsStale.length

  // Weighted score out of 100.
  const penalty =
    reused.reduce((s, g) => s + g.entryIds.length * 8, 0) +
    weak.length * 6 +
    similar.length * 3 +
    old.length * 2 +
    missing.length * 1 +
    duplicates.length * 2 +
    secretsExpired.length * 8 +
    secretsDueSoon.length * 3 +
    secretsStale.length * 2
  const denom = Math.max(entries.length, 1) * 8
  const score = Math.max(0, Math.round(100 - (penalty / denom) * 100))

  return {
    total: entries.length,
    score,
    reused,
    weak,
    similar,
    old,
    missing,
    duplicates,
    secretsExpired,
    secretsDueSoon,
    secretsStale,
    issueCount
  }
}
