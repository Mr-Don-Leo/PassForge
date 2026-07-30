// Types shared between the main process, preload bridge and renderer.

export interface VaultEntry {
  id: string
  title: string
  username: string
  password: string
  url: string
  notes: string
  createdAt: number
  updatedAt: number
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
