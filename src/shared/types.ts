// Types shared between the main process, preload bridge and renderer.

export interface VaultEntry {
  id: string
  title: string
  username: string
  password: string
  url: string
  notes: string
  category: string
  createdAt: number
  updatedAt: number
}

export interface Category {
  id: string
  label: string
  color: string
}

/** Built-in categories. Icons are mapped in the renderer (see categories.tsx). */
export const CATEGORIES: Category[] = [
  { id: 'login', label: 'Logins', color: '#5b8def' },
  { id: 'email', label: 'Email', color: '#e0669a' },
  { id: 'social', label: 'Social', color: '#8b5cf6' },
  { id: 'finance', label: 'Finance', color: '#2fbf87' },
  { id: 'work', label: 'Work', color: '#f0a13a' },
  { id: 'shopping', label: 'Shopping', color: '#ef6f6c' },
  { id: 'personal', label: 'Personal', color: '#38bdf8' },
  { id: 'other', label: 'Other', color: '#94a3b8' }
]

export const DEFAULT_CATEGORY = 'login'

export function categoryById(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}

/** Everything the renderer needs to decide which screen to show. */
export interface AppState {
  hasVault: boolean
  unlocked: boolean
  biometricAvailable: boolean
  biometricEnrolled: boolean
  /** Epoch ms until which passcode attempts are locked out (0 = not locked). */
  lockedUntil: number
  platform: NodeJS.Platform
}

export interface PasswordOptions {
  length: number
  lowercase: boolean
  uppercase: boolean
  numbers: boolean
  symbols: boolean
}

export type Result<T = void> =
  | ({ ok: true } & (T extends void ? Record<never, never> : { value: T }))
  | { ok: false; error: string; lockedUntil?: number }

export interface SetupOptions {
  passcode: string
  enrollBiometric: boolean
}
