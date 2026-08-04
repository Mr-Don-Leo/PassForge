# PassForge — Handoff

## 1. What it is
A minimalist, **local-first** password & secret manager for macOS, Windows, and Linux.
No servers: the vault is encrypted and stored only on-device; GitHub is used purely to
distribute installers. Unlock via a 6-digit passcode or OS biometric (Touch ID today).

**Stack:** Electron + React + TypeScript + MUI (Material Design), bundled with
electron-vite, packaged by electron-builder. Crypto uses Node built-ins only
(scrypt KDF + AES-256-GCM) — **zero runtime dependencies** (UI libs are devDependencies,
compiled into the renderer bundle).

## 2. Code structure
- `src/main/` — Electron main process (Node, has the DEK/plaintext):
  - `index.ts` window + hardening + OS auto-lock wiring (powerMonitor, minimize).
  - `ipc.ts` all IPC handlers; owns the single `Vault` instance; `lockAndNotify()`.
  - `vault.ts` `Vault` class: encrypted file I/O, unlock/lockout, entries+categories
    CRUD, import, favorites; plus the password generator.
  - `crypto.ts` `seal`/`open` (AES-256-GCM, fresh random IV per call) + `deriveKey` (scrypt).
  - `biometric.ts` Touch ID + `safeStorage` DEK wrap. `settings.ts` plain auto-lock prefs.
  - `importers.ts` zero-dep CSV parser + alias mapping + Bitwarden JSON.
- `src/preload/index.ts` — contextBridge `window.passforge` API (sandboxed, typed).
- `src/renderer/src/` — React UI:
  - `App.tsx` routes Onboarding/Lock/Vault; subscribes to main-process lock events.
  - `screens/` Onboarding, Lock, Vault (sidebar + list + health/favorites views).
  - `components/` EntryDialog, SettingsDialog, CategoryManager, ImportDialog,
    HealthDashboard, PasscodeInput.
  - `health.ts` pure on-device analysis; `ColorMode.tsx` theming; `categories.tsx` icons.
- `src/shared/types.ts` — types shared across all three layers (VaultEntry, Category, etc.).
- Config: `electron.vite.config.ts`, `electron-builder.yml`, `.github/workflows/release.yml`.

**Vault format:** one encrypted file in `app.getPath('userData')`. Payload
`{ entries, categories }` sealed with a random 256-bit DEK; the DEK is wrapped by
(a) scrypt(passcode) and (b) the OS keychain for biometric. `normalizeEntry()` backfills
new fields, so old vaults migrate automatically.

## 3. Recent changes
Latest: **v0.4.1** (`34bd71c`). Tree is clean — no uncommitted work (before this PREP.md).
Recent line (newest first):
- `34bd71c` release v0.4.1 · `5f22b7c` spacing below Auto-lock heading
- `3bd5224` **feat: password health, importers, auto-lock, favorites** (v0.4.0)
- `76a29c7` item types (password/secret) + user-managed categories (v0.3.0)
- `4b20832` light/dark themes + category sidebar + redesign (v0.2.0)
- earlier: CI hardening + initial app (v0.1.x)

## 4. Release process
Bump with `npm version <patch|minor>` (keeps package.json **and** package-lock in sync —
a mismatch previously broke CI), then `git push --follow-tags`. Pushing a `v*` tag triggers
`.github/workflows/release.yml`: builds on all 3 OSes, then a dedicated job publishes the
installers to a GitHub Release via `gh`. Build step uses `--publish never` (electron-builder
must not auto-publish). **Push over SSH** — the HTTPS PAT 403s (see repo memory).

## 5. Known issues & next steps
- **Biometric is Touch ID (macOS) only.** `biometric.ts` is abstracted for Windows Hello /
  Linux fprintd — next step is a native module for those. UI falls back to passcode.
- **Unsigned builds.** macOS/Windows show Gatekeeper/SmartScreen warnings; needs an Apple
  Developer ID (sign + notarize) and optional Windows code-signing wired into the workflow.
- **Verification gap:** OS-event auto-locks (sleep, screen-lock) and the native import file
  picker were not exercised on real hardware (dev box is headless). Parsing + health logic
  are covered by a 20-case harness against the compiled modules.
- **Open enhancements discussed:** a `seal()` invariant guard/comment (+ optional DEK
  rotation on passcode change) for extra crypto margin; a health "auto-fix"/bulk-regenerate
  flow; `.deb` Linux target was dropped for reliability (AppImage only) — could be re-added.
- **No automated test suite** yet — validation is manual + ad-hoc esbuild harnesses. Adding
  vitest for `health.ts`/`importers.ts`/`crypto.ts` would be a high-value first test target.
