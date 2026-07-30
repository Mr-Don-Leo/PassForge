import { ipcMain } from 'electron'
import { Vault, generatePassword } from './vault'
import { biometricAvailable } from './biometric'
import type { AppState, PasswordOptions, Result, SetupOptions, VaultEntry } from '../shared/types'

const vault = new Vault()

function buildState(): AppState {
  return {
    hasVault: vault.exists(),
    unlocked: vault.isUnlocked(),
    biometricAvailable: biometricAvailable(),
    biometricEnrolled: vault.biometricEnrolled(),
    lockedUntil: vault.lockedUntil(),
    platform: process.platform
  }
}

/** Passcodes must be exactly six digits. */
function isValidPasscode(passcode: unknown): passcode is string {
  return typeof passcode === 'string' && /^\d{6}$/.test(passcode)
}

export function registerIpc(): void {
  ipcMain.handle('app:getState', (): AppState => buildState())

  ipcMain.handle('vault:setup', (_e, opts: SetupOptions): Result => {
    if (vault.exists()) return { ok: false, error: 'A vault already exists.' }
    if (!isValidPasscode(opts.passcode)) return { ok: false, error: 'Passcode must be six digits.' }
    vault.createVault(opts.passcode, Boolean(opts.enrollBiometric))
    return { ok: true }
  })

  ipcMain.handle('vault:unlockPasscode', (_e, passcode: string): Result => {
    if (!isValidPasscode(passcode)) return { ok: false, error: 'Passcode must be six digits.' }
    return vault.unlockWithPasscode(passcode)
  })

  ipcMain.handle('vault:unlockBiometric', async (): Promise<Result> => {
    return vault.unlockWithBiometric()
  })

  ipcMain.handle('vault:lock', (): Result => {
    vault.lock()
    return { ok: true }
  })

  ipcMain.handle('vault:enrollBiometric', (): Result => vault.enrollBiometric())
  ipcMain.handle('vault:disableBiometric', (): Result => vault.disableBiometric())

  ipcMain.handle('vault:changePasscode', (_e, current: string, next: string): Result => {
    if (!isValidPasscode(next)) return { ok: false, error: 'New passcode must be six digits.' }
    return vault.changePasscode(current, next)
  })

  ipcMain.handle('vault:list', (): Result<VaultEntry[]> => {
    if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
    return { ok: true, value: vault.list() }
  })

  ipcMain.handle('vault:save', (_e, entry: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Result<VaultEntry> => {
    if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
    try {
      return { ok: true, value: vault.save(entry) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('vault:delete', (_e, id: string): Result => {
    if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
    try {
      vault.remove(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('util:generatePassword', (_e, opts: PasswordOptions): Result<string> => {
    return { ok: true, value: generatePassword(opts) }
  })
}

/** Lock the vault when the app is about to quit. */
export function lockVault(): void {
  vault.lock()
}
