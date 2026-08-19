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
- **Passwords and secrets** — store logins (username/password) or secrets/API keys (client ID + client secret) from one **+** button.
- **Custom categories** — create your own with a preset icon and colour, rename, hide, or delete the built-in ones; browse by category in the sidebar.
- **Built-in generator** with adjustable length and character sets, for passwords and secrets.
- **Password health dashboard** — on-device scan for reused, weak, similar, old, or incomplete passwords, duplicates, and API keys due for rotation. Never leaves your device.
- **Autofill (auto-type)** — focus a login form in any browser or app and press **⌘/Ctrl+Shift+U**: PassForge matches the window against your entries (by website URL and title) and types `username → Tab → password` (optional Enter). Ambiguous? The vault pops up so you can pick an entry and hit its ✦ autofill button. Uses only OS built-ins — System Events on macOS (needs Accessibility access), SendKeys on Windows, `xdotool` on Linux (X11).
- **Autofill offers (no hotkey)** — while unlocked, switching to a window that matches one of your entries shows a quiet OS notification ("Autofill GitHub?"); click it and PassForge refocuses that window and types. Once per entry per 10 minutes; toggle in Settings.
- **In-page browser autofill (Chrome-style)** — a bundled extension for Chrome/Edge/Brave: focus a login field and a PassForge dropdown lists your entries for that site; pick one and username + password fill directly in the form. Talks to the app over native messaging; credentials are matched strictly by site URL and only released while the vault is unlocked. Set up via **Settings → Browser integration**, then load the extension folder at `chrome://extensions` (Developer mode → Load unpacked), or grab `passforge-extension.zip` from the release.
- **Import** from Bitwarden (JSON/CSV), 1Password, KeePass, Chrome, Firefox, Safari, or generic CSV — parsed locally.
- **Auto-lock** on inactivity, sleep, screen-lock/user-switch, minimize, or quit, plus ⌘/Ctrl+L to lock instantly.
- **Favorites & light/dark themes** with a system-follow option, toggled from the toolbar or Settings.
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

## License

MIT © Mr-Don-Leo
