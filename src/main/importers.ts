import type { ImportFormat, ImportResult, VaultEntry } from '../shared/types'

type Row = Record<string, string>

/** Minimal RFC-4180 CSV parser (handles quotes, escaped quotes, CRLF). */
function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // strip BOM

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      record.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      record.push(field)
      rows.push(record)
      field = ''
      record = []
    } else field += c
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field)
    rows.push(record)
  }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''))
  if (nonEmpty.length < 2) return []
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase())
  return nonEmpty.slice(1).map((r) => {
    const obj: Row = {}
    headers.forEach((h, idx) => (obj[h] = r[idx] ?? ''))
    return obj
  })
}

// Column-name aliases covering Chrome/Firefox/Safari/KeePass/1Password/Bitwarden/generic CSV.
const ALIASES: Record<keyof Pick<VaultEntry, 'title' | 'username' | 'password' | 'url' | 'notes'>, string[]> = {
  title: ['name', 'title', 'account', 'item'],
  username: ['username', 'user', 'login_username', 'login name', 'loginname', 'email', 'login', 'user name'],
  password: ['password', 'pass', 'login_password', 'login password'],
  url: ['url', 'uri', 'website', 'web site', 'login_uri', 'link', 'urls'],
  notes: ['notes', 'note', 'comments', 'comment', 'extra']
}

function pick(row: Row, keys: string[]): string {
  for (const k of keys) if (row[k]) return row[k]
  return ''
}

function detectCsvFormat(headers: string[]): { format: ImportFormat; label: string } {
  const h = new Set(headers)
  const has = (...ks: string[]): boolean => ks.every((k) => h.has(k))
  if (has('login_password') || has('login_username')) return { format: 'bitwarden-csv', label: 'Bitwarden (CSV)' }
  if (has('httprealm') || has('formactionorigin') || has('timepasswordchanged') || has('guid'))
    return { format: 'firefox', label: 'Firefox' }
  if (has('name', 'url', 'username', 'password') && h.size <= 5) return { format: 'chrome', label: 'Chrome' }
  if (has('otpauth') || (has('title', 'url', 'username', 'password') && h.has('otpauth')))
    return { format: 'safari', label: 'Safari' }
  if (has('title') && (h.has('group') || h.has('web site') || h.has('login name')))
    return { format: 'keepass', label: 'KeePass' }
  if (has('title') && (h.has('url') || h.has('urls')) && h.has('username'))
    return { format: '1password', label: '1Password' }
  return { format: 'csv', label: 'Generic CSV' }
}

function fromCsv(text: string): ImportResult {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('No rows found in CSV file.')
  const { format, label } = detectCsvFormat(Object.keys(rows[0]))

  const entries = rows
    .map((row) => {
      const title = pick(row, ALIASES.title) || pick(row, ALIASES.url) || pick(row, ALIASES.username)
      const password = pick(row, ALIASES.password)
      const username = pick(row, ALIASES.username)
      const secretLike = !password && !username && pick(row, ['secret', 'api_key', 'apikey', 'key', 'token'])
      return {
        type: secretLike ? ('secret' as const) : ('password' as const),
        title: title.trim(),
        username,
        password,
        secret: secretLike || '',
        url: pick(row, ALIASES.url),
        notes: pick(row, ALIASES.notes)
      }
    })
    .filter((e) => e.title || e.username || e.password || e.secret)

  return { format, formatLabel: label, entries }
}

interface BitwardenLogin {
  username?: string
  password?: string
  uris?: Array<{ uri?: string }>
}
interface BitwardenItem {
  type: number
  name?: string
  notes?: string
  login?: BitwardenLogin
}

function fromBitwardenJson(text: string): ImportResult {
  const data = JSON.parse(text) as { items?: BitwardenItem[] }
  if (!Array.isArray(data.items)) throw new Error('Not a Bitwarden JSON export.')
  const entries = data.items
    .filter((it) => it.type === 1 && it.login) // type 1 = login
    .map((it) => ({
      type: 'password' as const,
      title: (it.name ?? '').trim(),
      username: it.login?.username ?? '',
      password: it.login?.password ?? '',
      url: it.login?.uris?.[0]?.uri ?? '',
      notes: it.notes ?? ''
    }))
    .filter((e) => e.title || e.username || e.password)
  return { format: 'bitwarden-json', formatLabel: 'Bitwarden (JSON)', entries }
}

/** Parse an exported file into import candidates. Detection is by content. */
export function parseImportFile(fileName: string, content: string): ImportResult {
  const trimmed = content.trimStart()
  if (fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('{')) {
    return fromBitwardenJson(content)
  }
  return fromCsv(content)
}
