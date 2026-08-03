import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import { Vault, generatePassword } from './vault'
import { biometricAvailable } from './biometric'
import { getSettings, setSettings } from './settings'
import { parseImportFile } from './importers'
import type {
  AppState,
  AutoLockSettings,
  Category,
  ImportResult,
  PasswordOptions,
  Result,
  SetupOptions,
  VaultEntry
} from '../shared/types'

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

  // ---- categories -----------------------------------------------------------

  ipcMain.handle('categories:list', (): Result<Category[]> => {
    if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
    return { ok: true, value: vault.listCategories() }
  })

  ipcMain.handle('categories:save', (_e, cat: Partial<Category> & { label: string }): Result<Category> => {
    if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
    try {
      return { ok: true, value: vault.saveCategory(cat) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('categories:delete', (_e, id: string): Result => {
    if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
    try {
      vault.deleteCategory(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('categories:setHidden', (_e, id: string, hidden: boolean): Result => {
    if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
    try {
      vault.setCategoryHidden(id, Boolean(hidden))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- favorites ------------------------------------------------------------

  ipcMain.handle('vault:toggleFavorite', (_e, id: string): Result<VaultEntry> => {
    if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
    try {
      return { ok: true, value: vault.toggleFavorite(id) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // ---- import ---------------------------------------------------------------

  ipcMain.handle('import:open', async (): Promise<Result<ImportResult | null>> => {
    if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const res = await dialog.showOpenDialog(win, {
      title: 'Import passwords',
      properties: ['openFile'],
      filters: [{ name: 'Exports', extensions: ['csv', 'json'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return { ok: true, value: null }
    try {
      const content = fs.readFileSync(res.filePaths[0], 'utf8')
      return { ok: true, value: parseImportFile(res.filePaths[0], content) }
    } catch (err) {
      return { ok: false, error: `Could not read file: ${(err as Error).message}` }
    }
  })

  ipcMain.handle(
    'vault:importEntries',
    (_e, entries: Array<Partial<VaultEntry>>, category: string, skipDuplicates: boolean): Result<{ added: number; skipped: number }> => {
      if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
      try {
        return { ok: true, value: vault.importEntries(entries, category, skipDuplicates) }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  // ---- auto-lock settings ---------------------------------------------------

  ipcMain.handle('settings:get', (): Result<AutoLockSettings> => ({ ok: true, value: getSettings() }))
  ipcMain.handle('settings:set', (_e, patch: Partial<AutoLockSettings>): Result<AutoLockSettings> => {
    return { ok: true, value: setSettings(patch) }
  })
}

/** Lock the vault and tell every window to show the lock screen. */
export function lockAndNotify(): void {
  if (!vault.isUnlocked()) return
  vault.lock()
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('vault:locked')
}

/** Lock the vault when the app is about to quit. */
export function lockVault(): void {
  vault.lock()
}
