// Thin typed accessor for the preload bridge.
export const api = window.passforge
export type {
  AppState,
  VaultEntry,
  PasswordOptions,
  RecoveryCode,
  Result,
  Category,
  ItemType,
  AutoLockSettings,
  ImportResult,
  ImportFormat
} from '../../shared/types'
export {
  DEFAULT_CATEGORY,
  SECRET_CATEGORY,
  RECOVERY_CATEGORY,
  FALLBACK_CATEGORY,
  CATEGORY_ICON_IDS,
  DEFAULT_AUTOLOCK,
  categoryById
} from '../../shared/types'
