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
- `src/preload/index.ts` — contextBridge `window.passforge` API (sandboxed, typed;
  fully generic passthrough — new entry fields flow through without changes).
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
new fields, and `loadPayload()` appends locked default categories missing from older
vaults, so old vaults migrate automatically on unlock.

## 3. Recent changes
Latest: **v0.5.1** (`c5f41d1`). Tree is clean — no uncommitted work (besides this PREP.md).
Recent line (newest first):
- `f12d402` **fix: add (+) button anchored while list scrolls** (v0.5.1) — the FAB was
  absolutely positioned *inside* the scroll container and scrolled away with long lists;
  the Vault main pane now scrolls in an inner box with the FAB against the outer pane.
- `a23f8ee` **feat: 2FA recovery-code entries** (v0.5.0) — third `ItemType` `'recovery'`
  alongside `password`/`secret`. `VaultEntry.codes: RecoveryCode[]` (`{value, used}`).
  UI: paste-to-add parsing (splits on whitespace/commas), click-a-chip to toggle used,
  copy-next-unused-code button, "N/M left" chip (warning ≤2, error at 0), new locked
  "Recovery Codes" category (orange, `pin` icon) auto-added to existing vaults.
- `3c8b037` truncate long usernames/client IDs in list (v0.4.2)
- `3bd5224` password health, importers, auto-lock, favorites (v0.4.0)
- `76a29c7` item types (password/secret) + user-managed categories (v0.3.0)

## 4. Release process
Bump with `npm version <patch|minor>` (keeps package.json **and** package-lock in sync —
a mismatch previously broke CI), then `git push --follow-tags`. Pushing a `v*` tag triggers
`.github/workflows/release.yml`: builds on all 3 OSes, then a dedicated job publishes the
installers to a GitHub Release via `gh`. Build step uses `--publish never` (electron-builder
must not auto-publish). **Push over SSH** — the HTTPS PAT 403s (see repo memory).
v0.5.0 and v0.5.1 both released cleanly this way (a Windows Actions cache-save 404
warning is harmless noise).

## 5. Known issues & next steps
- **Biometric is Touch ID (macOS) only.** `biometric.ts` is abstracted for Windows Hello /
  Linux fprintd — next step is a native module for those. UI falls back to passcode.
- **Unsigned builds.** macOS/Windows show Gatekeeper/SmartScreen warnings; needs an Apple
  Developer ID (sign + notarize) and optional Windows code-signing wired into the workflow.
- **Verification gap:** dev box is headless. Recovery-code main-process logic was verified
  with an esbuild harness (create → save → lock/unlock round-trip, category migration,
  delete protection), and the FAB fix by code inspection + build — but neither was
  clicked through on real hardware. OS-event auto-locks and the native import file picker
  remain unverified on hardware too.
- **Recovery-code ideas discussed but not built:** search doesn't match code values
  (intentional — codes are secrets); health.ts could flag entries with 0 codes left;
  copy-next-unused could optionally auto-mark the code used.
- **Open enhancements from earlier:** a `seal()` invariant guard (+ optional DEK rotation
  on passcode change); a health "auto-fix"/bulk-regenerate flow; `.deb` target re-add.
- **No automated test suite** yet — validation is manual + ad-hoc esbuild harnesses
  (pattern: bundle `src/main/vault.ts` with an electron stub via `--alias:electron=...`).
  Adding vitest for `health.ts`/`importers.ts`/`crypto.ts`/`vault.ts` would be high-value.
