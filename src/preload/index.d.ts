import type { PassforgeApi } from './index'

declare global {
  interface Window {
    passforge: PassforgeApi
  }
}

export {}
