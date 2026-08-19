import { contextBridge, ipcRenderer } from 'electron'
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

/**
 * The single, minimal surface exposed to the renderer. The renderer has no
 * Node access — every privileged operation goes through these typed IPC calls,
 * and secrets (the DEK) never leave the main process.
 */
const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke('app:getState'),
  setup: (opts: SetupOptions): Promise<Result> => ipcRenderer.invoke('vault:setup', opts),
  unlockPasscode: (passcode: string): Promise<Result> => ipcRenderer.invoke('vault:unlockPasscode', passcode),
  unlockBiometric: (): Promise<Result> => ipcRenderer.invoke('vault:unlockBiometric'),
  lock: (): Promise<Result> => ipcRenderer.invoke('vault:lock'),
  enrollBiometric: (): Promise<Result> => ipcRenderer.invoke('vault:enrollBiometric'),
  disableBiometric: (): Promise<Result> => ipcRenderer.invoke('vault:disableBiometric'),
  changePasscode: (current: string, next: string): Promise<Result> =>
    ipcRenderer.invoke('vault:changePasscode', current, next),
  listEntries: (): Promise<Result<VaultEntry[]>> => ipcRenderer.invoke('vault:list'),
  saveEntry: (
    entry: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<Result<VaultEntry>> => ipcRenderer.invoke('vault:save', entry),
  deleteEntry: (id: string): Promise<Result> => ipcRenderer.invoke('vault:delete', id),
  generatePassword: (opts: PasswordOptions): Promise<Result<string>> =>
    ipcRenderer.invoke('util:generatePassword', opts),
  listCategories: (): Promise<Result<Category[]>> => ipcRenderer.invoke('categories:list'),
  saveCategory: (cat: Partial<Category> & { label: string }): Promise<Result<Category>> =>
    ipcRenderer.invoke('categories:save', cat),
  deleteCategory: (id: string): Promise<Result> => ipcRenderer.invoke('categories:delete', id),
  setCategoryHidden: (id: string, hidden: boolean): Promise<Result> =>
    ipcRenderer.invoke('categories:setHidden', id, hidden),
  toggleFavorite: (id: string): Promise<Result<VaultEntry>> => ipcRenderer.invoke('vault:toggleFavorite', id),
  importOpen: (): Promise<Result<ImportResult | null>> => ipcRenderer.invoke('import:open'),
  importEntries: (
    entries: Array<Partial<VaultEntry>>,
    category: string,
    skipDuplicates: boolean
  ): Promise<Result<{ added: number; skipped: number }>> =>
    ipcRenderer.invoke('vault:importEntries', entries, category, skipDuplicates),
  getSettings: (): Promise<Result<AppSettings>> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<Result<AppSettings>> =>
    ipcRenderer.invoke('settings:set', patch),
  /** Hide the window and type this entry's credentials into the previous app. */
  autotype: (id: string): Promise<Result> => ipcRenderer.invoke('autotype:perform', id),
  /** Subscribe to main-process auto-locks. Returns an unsubscribe function. */
  onLocked: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('vault:locked', listener)
    return () => ipcRenderer.removeListener('vault:locked', listener)
  },
  /** Subscribe to auto-type feedback (toasts). Returns an unsubscribe function. */
  onAutotypeStatus: (cb: (status: AutotypeStatus) => void): (() => void) => {
    const listener = (_e: unknown, status: AutotypeStatus): void => cb(status)
    ipcRenderer.on('autotype:status', listener)
    return () => ipcRenderer.removeListener('autotype:status', listener)
  }
}

export type PassforgeApi = typeof api

contextBridge.exposeInMainWorld('passforge', api)
