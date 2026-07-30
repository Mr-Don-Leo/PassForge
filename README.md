<div align="center">

# 🔐 PassForge

**A minimalist, local-first password manager for macOS, Windows and Linux.**

Material-design UI · biometric + 6-digit passcode unlock · AES-256-GCM encrypted vault · zero servers.

</div>

---

## Features

- **Local-first & offline.** Your vault is encrypted and stored only on your device — nothing is ever sent to a server.
- **Two ways to unlock:**
  - **Biometric ("passkey")** — Touch ID on macOS (Windows Hello / Linux fingerprint planned).
  - **6-digit passcode** — hardened with a memory-hard KDF and escalating lockout after repeated failures.
- **Strong crypto.** A random 256-bit Data Encryption Key encrypts the vault with AES-256-GCM. The key is wrapped independently by (1) a scrypt-derived key from your passcode and (2) the OS keychain, released only after a successful biometric prompt.
- **Built-in password generator** with adjustable length and character sets.
- **Categories** — organise items (Logins, Email, Social, Finance, Work, Shopping, Personal, Other) and browse them from the sidebar.
- **Light & dark themes** with a system-follow option, toggled from the toolbar or Settings.
- **Minimal Material UI** — search, add/edit/delete items, one-click copy.
- **Hardened Electron shell** — sandboxed renderer, context isolation, no Node in the UI, strict CSP, no remote content.

## Security model

```
             ┌──────────────────────────── vault.pfvault (on disk) ────────────────────────────┐
             │  kdf salt · passcodeWrap(DEK) · biometricWrap(DEK) · AES-256-GCM(entries) · meta  │
             └──────────────────────────────────────────────────────────────────────────────────┘
                         ▲                                   ▲
   scrypt(passcode,salt) │                                   │ OS keychain (safeStorage)
        unwraps DEK ──────┘                                   └────── unwraps DEK after
                                                                     biometric prompt (Touch ID)
                                          │
                                          ▼
                         DEK lives only in the main process' memory,
                         decrypts entries on demand. The renderer never sees it.
```

The 6-digit passcode is low-entropy by design, so brute-force resistance comes from the memory-hard KDF **and** an escalating lockout (30 s → 5 min → 30 min → 1 h) after repeated wrong attempts.

## Install

Download the latest installer for your OS from the [**Releases**](https://github.com/Mr-Don-Leo/PassForge/releases) page:

| OS | File |
| --- | --- |
| macOS | `PassForge-<version>-arm64.dmg` / `-x64.dmg` |
| Windows | `PassForge-Setup-<version>.exe` |
| Linux | `PassForge-<version>.AppImage` or `.deb` |

> macOS/Windows builds are unsigned for now, so you may need to allow the app in Gatekeeper / SmartScreen on first launch.

## Develop

```bash
npm install      # install dependencies
npm run dev      # launch the app with hot reload
npm run typecheck
```

## Build installers locally

```bash
npm run dist:mac     # or dist:win / dist:linux (build on the target OS)
```

Output lands in `release/`.

## Releasing

Push a version tag and GitHub Actions builds and publishes installers for all three platforms to a GitHub Release:

```bash
npm version patch    # bumps package.json + creates the tag
git push --follow-tags
```

See [`.github/workflows/release.yml`](.github/workflows/release.yml).

## Tech stack

Electron · electron-vite · React · TypeScript · MUI (Material Design) · Node `crypto` (scrypt + AES-256-GCM) · electron-builder.

## License

MIT © Mr-Don-Leo
