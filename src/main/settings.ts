import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/types'

/**
 * Auto-lock and autofill preferences. These are not secret (they contain no
 * vault data), so they live in a plain JSON file and are readable by the main
 * process even while the vault is locked — the OS-event locks depend on them.
 */
let cache: AppSettings | null = null

function file(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  if (cache) return cache
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<AppSettings>
    cache = { ...DEFAULT_SETTINGS, ...raw }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  cache = next
  fs.writeFileSync(file(), JSON.stringify(next), { mode: 0o600 })
  return next
}
