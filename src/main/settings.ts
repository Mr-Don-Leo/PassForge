import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_AUTOLOCK, type AutoLockSettings } from '../shared/types'

/**
 * Auto-lock preferences. These are not secret (they contain no vault data), so
 * they live in a plain JSON file and are readable by the main process even
 * while the vault is locked — the OS-event locks depend on them.
 */
let cache: AutoLockSettings | null = null

function file(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AutoLockSettings {
  if (cache) return cache
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<AutoLockSettings>
    cache = { ...DEFAULT_AUTOLOCK, ...raw }
  } catch {
    cache = { ...DEFAULT_AUTOLOCK }
  }
  return cache
}

export function setSettings(patch: Partial<AutoLockSettings>): AutoLockSettings {
  const next = { ...getSettings(), ...patch }
  cache = next
  fs.writeFileSync(file(), JSON.stringify(next), { mode: 0o600 })
  return next
}
