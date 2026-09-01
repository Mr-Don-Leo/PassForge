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
  - `index.ts` window + hardening + OS auto-lock wiring (powerMonitor, minimize);
    registers the global autofill hotkey via `syncAutotypeShortcut()`.
  - `ipc.ts` all IPC handlers; owns the single `Vault` instance; `lockAndNotify()`;
    the auto-type hotkey flow (`triggerAutotype`) + per-entry `autotype:perform`.
  - `autotype.ts` autofill: active-window title + keystroke injection via OS
    built-ins (osascript / PowerShell SendKeys / xdotool), pure `matchEntriesToWindow()`.
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
Latest: **v0.8.0**. Tree is clean — no uncommitted work (besides this PREP.md).
Recent line (newest first):
- `0bb8b29` **feat: GitHub Pages landing page** — `docs/index.html` (self-contained,
  styled on the app's MUI theme from `theme.ts`: Roboto, radius 14, light+dark via
  the same `passforge-theme` localStorage key) + `docs/icon.png`. Pages serves
  main:/docs at https://mr-don-leo.github.io/PassForge/. Download buttons resolve
  direct asset URLs from the latest-release API at page load (fallback: releases page).
- **History rewritten (2026-09-01):** all `Co-Authored-By: Claude` trailers stripped
  from every commit; branch + all 15 tags force-pushed (release workflow was disabled
  during the push so re-pushed tags didn't re-trigger builds; releases untouched).
  ⚠️ **Do NOT add Claude co-author trailers to commits in this repo** — owner wants
  no Claude attribution. Pre-rewrite backup: `~/passforge-pre-rewrite-backup.bundle`.
- `ee84354` **feat: Chrome-style in-page autofill** (v0.8.0) — `extension/` (MV3,
  Chrome/Edge/Brave; stable ID `nhijkfecbioegiplfklgppedakljfgea` pinned via manifest
  `key`; the RSA private key was throwaway — only needed again for a Web Store upload,
  which would assign its own ID anyway). content.js: focusin-delegated dropdown (closed
  shadow DOM), fills via native value setter + input/change events; username field =
  nearest prior visible text/email/tel input. `src/main/browser.ts`: bridge socket
  (JSON-lines; `userData/bridge.sock` 0600, or per-user named pipe on Windows) served by
  the running app; the native host is THIS binary relaunched by the browser — detected
  in index.ts via a `chrome-extension://` argv (host mode: no window/IPC, relays 4-byte-LE
  framed stdio ↔ socket, exits on stdin end). Creds released ONLY when unlocked and ONLY
  by URL-host match (`matchEntriesToPageUrl`; page host vs entry host, suffix-safe).
  Settings → Browser integration writes host manifests (dirs on mac/linux if browser
  present, HKCU `reg add` on Windows) pointing at `process.execPath` (⇒ packaged builds
  only; dev exePath is bare electron). Extension ships via extraResources + a
  `passforge-extension.zip` release asset (release.yml now checks out + zips).
  **Verified end-to-end via node harness** (framed stdio → relay → socket → match →
  reply; locked/unknown-site/open/exit paths green). Not tested in a real browser.
  Known gap: any same-user process can query the socket while unlocked (KeePassXC-style
  pairing would fix; documented in browser.ts header).
- `0a00149` **feat: hotkey-free autofill offers** (v0.7.0) — new `src/main/watcher.ts`
  streams focused-window changes (persistent osascript `repeat`/`log` loop on mac —
  reads **stderr**; persistent PowerShell loop on Windows — stdout, `\t`-separated
  `hwnd\ttitle`; 1.2 s xdotool poll on X11, self-stops after 3 failures e.g. Wayland).
  `ipc.ts onWindowChange`: unlocked + not-our-window + `matchEntriesToWindow` hit →
  Electron `Notification` ("Autofill GitHub?"); click → `focusWindow` + type, or the
  picker flow when ambiguous. 10-min per-entry cooldown (`offerShownAt`). New setting
  `autotypeOffer` (default true) gated by `autotypeEnabled`; watcher synced on settings
  change. mac watcher starts only if Accessibility already granted (no background
  prompt). Windows notifications need the AUMID set in index.ts. Watcher failure path
  verified via esbuild harness; notification click-through NOT tested on hardware.
- `d738477` **fix: explicit focus hand-back for autofill** (v0.6.1) — user report: after
  the hotkey fell back to the PassForge window, typing landed back in PassForge instead
  of the website. `getActiveWindow()` now captures an id (mac process name / Windows
  HWND / X11 window id) + title; the fallback paths (ambiguous, no match, locked)
  remember it (90 s TTL) and `autotype:perform` calls `focusWindow()` on it *before*
  hiding our window (ordering matters: being foreground grants SetForegroundWindow
  rights on Windows), then types after 300 ms. Manual ✦ clicks (no captured target)
  keep the old hide + 650 ms behavior. Still unverified on real hardware.
- `fea0c22` **feat: autofill / auto-type** (v0.6.0) — global hotkey **⌘/Ctrl+Shift+U**
  matches the focused window's title against password entries (URL host 3 > site
  name 2 > entry title 1; only the top tier returned, unique ⇒ type immediately,
  else the vault window pops up with a toast). Per-entry ✦ button hides the window
  (`app.hide()` on mac), waits 650 ms, then types username‑Tab‑password (+Enter if
  `autotypeSubmit`). Zero-dep keystrokes: osascript System Events (needs
  Accessibility; `systemPreferences.isTrustedAccessibilityClient(true)` prompts),
  PowerShell SendKeys (creds via env, metachars escaped), `xdotool` on X11 (creds
  via stdin; friendly error when missing). `AutoLockSettings` renamed to
  `AppSettings` (+`autotypeEnabled`/`autotypeSubmit`, defaults true/false; old
  settings.json merges fine). New IPC: `autotype:perform`, `autotype:status` event.
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
  remain unverified on hardware too. **Autofill (v0.6.0): `matchEntriesToWindow` has a
  15-case esbuild harness (all green) and the xdotool-missing error path was exercised,
  but actual keystroke injection was NOT tested on any OS** — no display here. First
  hardware pass should check: mac Accessibility prompt, SendKeys escaping of `+^%~(){}`
  passwords, focus-return timing after hide (650 ms), and the hotkey-while-locked flow.
- **Recovery-code ideas discussed but not built:** search doesn't match code values
  (intentional — codes are secrets); health.ts could flag entries with 0 codes left;
  copy-next-unused could optionally auto-mark the code used.
- **Open enhancements from earlier:** a `seal()` invariant guard (+ optional DEK rotation
  on passcode change); a health "auto-fix"/bulk-regenerate flow; `.deb` target re-add.
- **No automated test suite** yet — validation is manual + ad-hoc esbuild harnesses
  (pattern: bundle `src/main/vault.ts` with an electron stub via `--alias:electron=...`).
  Adding vitest for `health.ts`/`importers.ts`/`crypto.ts`/`vault.ts` would be high-value.
