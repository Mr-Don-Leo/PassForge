// Types shared between the main process, preload bridge and renderer.

export type ItemType = 'password' | 'secret'

export interface VaultEntry {
  id: string
  type: ItemType
  title: string
  category: string
  // Password items
  username: string
  password: string
  url: string
  // Secret / API-key items
  clientId: string
  secret: string
  // Common
  notes: string
  createdAt: number
  updatedAt: number
}

export interface Category {
  id: string
  label: string
  color: string
  /** Icon id from CATEGORY_ICON_IDS (mapped to an icon in the renderer). */
  icon: string
  /** Hidden categories stay assigned but are not shown in the sidebar. */
  hidden?: boolean
  /** Locked categories cannot be deleted (used for the fallback + secrets). */
  locked?: boolean
}

/** Everything the renderer needs to decide which screen to show. */
export interface AppState {
  hasVault: boolean
  unlocked: boolean
  biometricAvailable: boolean
  biometricEnrolled: boolean
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

/** Preset icons a user can pick when creating a category. */
export const CATEGORY_ICON_IDS = [
  'login',
  'apikey',
  'email',
  'social',
  'finance',
  'work',
  'shopping',
  'personal',
  'other',
  'cloud',
  'database',
  'globe',
  'folder',
  'star',
  'shield',
  'code',
  'server',
  'game',
  'music',
  'heart',
  'home',
  'lock'
] as const

export type CategoryIconId = (typeof CATEGORY_ICON_IDS)[number]

/** Fallback (locked) category assigned when a category is deleted. */
export const FALLBACK_CATEGORY = 'other'
/** Default category for new password items. */
export const DEFAULT_CATEGORY = 'login'
/** Default category for new secret items. */
export const SECRET_CATEGORY = 'apikeys'

/** Seeded when a vault is first created. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'login', label: 'Logins', color: '#5b8def', icon: 'login' },
  { id: 'apikeys', label: 'API Keys', color: '#22b8cf', icon: 'apikey', locked: true },
  { id: 'email', label: 'Email', color: '#e0669a', icon: 'email' },
  { id: 'social', label: 'Social', color: '#8b5cf6', icon: 'social' },
  { id: 'finance', label: 'Finance', color: '#2fbf87', icon: 'finance' },
  { id: 'work', label: 'Work', color: '#f0a13a', icon: 'work' },
  { id: 'shopping', label: 'Shopping', color: '#ef6f6c', icon: 'shopping' },
  { id: 'personal', label: 'Personal', color: '#38bdf8', icon: 'personal' },
  { id: 'other', label: 'Other', color: '#94a3b8', icon: 'other', locked: true }
]

/** Resolve a category by id, returning a neutral placeholder if missing. */
export function categoryById(categories: Category[], id: string): Category {
  return (
    categories.find((c) => c.id === id) ?? {
      id: id || FALLBACK_CATEGORY,
      label: 'Uncategorized',
      color: '#94a3b8',
      icon: 'other'
    }
  )
}
