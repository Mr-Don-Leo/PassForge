import { app, ipcMain, dialog, globalShortcut, BrowserWindow } from 'electron'
import fs from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { Vault, generatePassword } from './vault'
import { biometricAvailable } from './biometric'
import { getSettings, setSettings } from './settings'
import { parseImportFile } from './importers'
import { getActiveWindowTitle, matchEntriesToWindow, typeCredentials } from './autotype'
import type {
  AppState,
  AppSettings,
  AutotypeStatus,
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

  // ---- settings (auto-lock + autofill) ---------------------------------------

  ipcMain.handle('settings:get', (): Result<AppSettings> => ({ ok: true, value: getSettings() }))
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>): Result<AppSettings> => {
    const value = setSettings(patch)
    syncAutotypeShortcut()
    return { ok: true, value }
  })

  // ---- autofill (auto-type) ---------------------------------------------------

  // Per-entry autofill: hide our window so focus returns to the previous app,
  // give the OS a moment to settle, then type into whatever is now focused.
  ipcMain.handle('autotype:perform', async (_e, id: string): Promise<Result> => {
    if (!vault.isUnlocked()) return { ok: false, error: 'Vault is locked.' }
    const entry = vault.list().find((x) => x.id === id)
    if (!entry) return { ok: false, error: 'Entry not found.' }
    if (!entry.username && !entry.password) return { ok: false, error: 'This entry has nothing to type.' }
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    win?.hide()
    if (process.platform === 'darwin') app.hide() // hand focus back to the previous app
    await delay(650)
    try {
      await typeCredentials(entry, getSettings().autotypeSubmit)
      return { ok: true }
    } catch (err) {
      win?.show()
      win?.focus()
      return { ok: false, error: (err as Error).message }
    }
  })
}

// ---- global auto-type hotkey ---------------------------------------------------

export const AUTOTYPE_SHORTCUT = 'CommandOrControl+Shift+U'

/** Register/unregister the global hotkey to match the current settings. */
export function syncAutotypeShortcut(): void {
  const want = getSettings().autotypeEnabled
  const have = globalShortcut.isRegistered(AUTOTYPE_SHORTCUT)
  if (want && !have) globalShortcut.register(AUTOTYPE_SHORTCUT, () => void triggerAutotype())
  else if (!want && have) globalShortcut.unregister(AUTOTYPE_SHORTCUT)
}

function showMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function sendStatus(kind: AutotypeStatus['kind'], message: string): void {
  const status: AutotypeStatus = { kind, message }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('autotype:status', status)
}

/**
 * Hotkey flow: the user focuses a login form anywhere, presses the shortcut,
 * and we match the focused window's title against the vault. A single best
 * match is typed straight in; otherwise the PassForge window comes up.
 */
async function triggerAutotype(): Promise<void> {
  // The shortcut fired while PassForge itself is focused — typing here would
  // fill our own UI. The per-entry autofill button is the right tool instead.
  if (BrowserWindow.getFocusedWindow()) {
    sendStatus('info', 'Focus the app you want to fill first, then press the shortcut.')
    return
  }
  if (!vault.isUnlocked()) {
    showMainWindow() // the lock screen explains itself
    return
  }
  let title: string
  try {
    title = await getActiveWindowTitle()
  } catch (err) {
    showMainWindow()
    sendStatus('error', (err as Error).message)
    return
  }
  const matches = matchEntriesToWindow(vault.list(), title)
  if (matches.length === 1) {
    try {
      await typeCredentials(matches[0], getSettings().autotypeSubmit)
    } catch (err) {
      showMainWindow()
      sendStatus('error', (err as Error).message)
    }
    return
  }
  showMainWindow()
  const short = title.length > 48 ? `${title.slice(0, 48)}…` : title
  sendStatus(
    'info',
    matches.length === 0
      ? `No entry matches “${short}” — use the autofill button on an entry.`
      : `${matches.length} entries match “${short}” — use the autofill button on one.`
  )
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
