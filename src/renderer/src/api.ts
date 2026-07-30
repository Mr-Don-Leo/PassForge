// Thin typed accessor for the preload bridge.
export const api = window.passforge
export type { AppState, VaultEntry, PasswordOptions, Result, Category, ItemType } from '../../shared/types'
export {
  DEFAULT_CATEGORY,
  SECRET_CATEGORY,
  FALLBACK_CATEGORY,
  CATEGORY_ICON_IDS,
  categoryById
} from '../../shared/types'
