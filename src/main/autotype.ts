import { systemPreferences } from 'electron'
import { spawn } from 'node:child_process'
import type { VaultEntry } from '../shared/types'

/**
 * Auto-type ("autofill") support. Types credentials into whatever window the
 * OS has focused, using only tools that ship with each OS (osascript /
 * PowerShell) or are ubiquitous (xdotool on X11) — keeping the zero-runtime-
 * dependency rule. Credentials are passed via argv, env or stdin, never
 * interpolated into shell strings.
 */

/** Delay between keystrokes (ms) so slow fields don't drop characters. */
const KEY_DELAY = 12

function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; input?: string } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: opts.env ?? process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject) // e.g. ENOENT when the tool is missing
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(err.trim() || `${cmd} exited with code ${code}`))
    })
    if (opts.input !== undefined) child.stdin.write(opts.input)
    child.stdin.end()
  })
}

// ---- macOS ------------------------------------------------------------------

/** Throws with actionable guidance when Accessibility access is missing. */
function assertMacAccessibility(): void {
  // Passing true makes macOS show the grant prompt on first use.
  if (!systemPreferences.isTrustedAccessibilityClient(true)) {
    throw new Error(
      'PassForge needs Accessibility access to type: System Settings → Privacy & Security → Accessibility.'
    )
  }
}

const MAC_ACTIVE_SCRIPT = `
tell application "System Events"
  set p to first application process whose frontmost is true
  set n to name of p
  set t to n
  try
    set t to t & " — " & (name of front window of p)
  end try
  return n & linefeed & t
end tell`

const MAC_FOCUS_SCRIPT = `
on run argv
  tell application "System Events"
    set frontmost of process (item 1 of argv) to true
  end tell
end run`

const MAC_TYPE_SCRIPT = `
on run argv
  set u to item 1 of argv
  set p to item 2 of argv
  set submitFlag to item 3 of argv
  tell application "System Events"
    if u is not "" then keystroke u
    if u is not "" and p is not "" then key code 48 -- Tab
    if p is not "" then keystroke p
    if submitFlag is "1" then key code 36 -- Return
  end tell
end run`

// ---- Windows ----------------------------------------------------------------

const WIN_ACTIVE_SCRIPT = `
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class PFWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$h = [PFWin]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[void][PFWin]::GetWindowText($h, $sb, 512)
"$([int64]$h)"
$sb.ToString()`

// The HWND arrives via env; restore if minimized, then bring to the foreground.
const WIN_FOCUS_SCRIPT = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class PFFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$h = [IntPtr][int64]$env:PF_HWND
if ([PFFocus]::IsIconic($h)) { [void][PFFocus]::ShowWindow($h, 9) }
if (-not [PFFocus]::SetForegroundWindow($h)) { throw 'Could not focus the target window.' }`

// Credentials arrive via env vars; SendKeys metacharacters are escaped there.
const WIN_TYPE_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
function PFEsc([string]$s) { $s -replace '([+^%~(){}\\[\\]])', '{$1}' }
$u = $env:PF_USER; $p = $env:PF_PASS
if ($u) { [System.Windows.Forms.SendKeys]::SendWait((PFEsc $u)) }
if ($u -and $p) { [System.Windows.Forms.SendKeys]::SendWait('{TAB}') }
if ($p) { [System.Windows.Forms.SendKeys]::SendWait((PFEsc $p)) }
if ($env:PF_SUBMIT -eq '1') { [System.Windows.Forms.SendKeys]::SendWait('{ENTER}') }`

const POWERSHELL_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']

// ---- Linux (X11 via xdotool) -------------------------------------------------

function withXdotoolHint(err: unknown): Error {
  if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
    return new Error('Auto-type on Linux requires xdotool (X11). Install it with your package manager.')
  }
  return err as Error
}

async function typeLinux(username: string, password: string, submit: boolean): Promise<void> {
  try {
    const type = (text: string): Promise<string> =>
      run('xdotool', ['type', '--clearmodifiers', '--delay', String(KEY_DELAY), '--file', '-'], { input: text })
    if (username) await type(username)
    if (username && password) await run('xdotool', ['key', '--clearmodifiers', 'Tab'])
    if (password) await type(password)
    if (submit) await run('xdotool', ['key', '--clearmodifiers', 'Return'])
  } catch (err) {
    throw withXdotoolHint(err)
  }
}

// ---- public API --------------------------------------------------------------

/** A window we can match against and later refocus to type into. */
export interface ActiveWindow {
  /** Process name (macOS), HWND (Windows) or X11 window id (Linux). */
  id: string
  title: string
}

/** The window the OS currently has focused. */
export async function getActiveWindow(): Promise<ActiveWindow> {
  switch (process.platform) {
    case 'darwin': {
      assertMacAccessibility()
      const out = await run('osascript', ['-e', MAC_ACTIVE_SCRIPT])
      const [id, ...rest] = out.split('\n')
      return { id: id.trim(), title: rest.join(' ').trim() }
    }
    case 'win32': {
      const out = await run('powershell.exe', [...POWERSHELL_ARGS, WIN_ACTIVE_SCRIPT])
      const [id, ...rest] = out.split(/\r?\n/)
      return { id: id.trim(), title: rest.join(' ').trim() }
    }
    default:
      try {
        const id = (await run('xdotool', ['getactivewindow'])).trim()
        const title = (await run('xdotool', ['getwindowname', id])).trim()
        return { id, title }
      } catch (err) {
        throw withXdotoolHint(err)
      }
  }
}

/** Bring a previously captured window back to the foreground. */
export async function focusWindow(target: ActiveWindow): Promise<void> {
  switch (process.platform) {
    case 'darwin':
      assertMacAccessibility()
      await run('osascript', ['-e', MAC_FOCUS_SCRIPT, target.id])
      return
    case 'win32':
      await run('powershell.exe', [...POWERSHELL_ARGS, WIN_FOCUS_SCRIPT], {
        env: { ...process.env, PF_HWND: target.id }
      })
      return
    default:
      try {
        await run('xdotool', ['windowactivate', '--sync', target.id])
      } catch (err) {
        throw withXdotoolHint(err)
      }
  }
}

/** Type `username, Tab, password` (each part skipped when empty) into the focused window. */
export async function typeCredentials(entry: VaultEntry, submit: boolean): Promise<void> {
  const { username, password } = entry
  if (!username && !password) throw new Error('This entry has no username or password to type.')
  switch (process.platform) {
    case 'darwin':
      assertMacAccessibility()
      await run('osascript', ['-e', MAC_TYPE_SCRIPT, username, password, submit ? '1' : '0'])
      return
    case 'win32':
      await run('powershell.exe', [...POWERSHELL_ARGS, WIN_TYPE_SCRIPT], {
        env: { ...process.env, PF_USER: username, PF_PASS: password, PF_SUBMIT: submit ? '1' : '0' }
      })
      return
    default:
      await typeLinux(username, password, submit)
  }
}

// ---- window-title matching (pure; unit-testable) ------------------------------

/** Suffixes like `co.uk` where the registrable name sits one label deeper. */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'ac', 'gov', 'edu'])

/** Extract `{ host: 'accounts.google.com', base: 'google' }` from an entry URL. */
export function urlHostBase(url: string): { host: string; base: string } | null {
  const raw = url.trim()
  if (!raw) return null
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (!host) return null
    const parts = host.split('.')
    let base = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
    if (parts.length >= 3 && SECOND_LEVEL.has(base)) base = parts[parts.length - 3]
    return { host, base }
  } catch {
    return null
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesToken(title: string, token: string): boolean {
  if (!token) return false
  if (token.length >= 3) return title.includes(token)
  // Short names ("x", "hp") only match as whole words to avoid noise.
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(token)}([^a-z0-9]|$)`).test(title)
}

/**
 * Password entries that plausibly belong to the focused window, best first.
 * Scoring: full URL host in the title (3) > site name in the title (2) >
 * entry title in the window title (1). Only the top-scoring tier is returned,
 * so a single strongest match is treated as unambiguous.
 */
export function matchEntriesToWindow(entries: VaultEntry[], windowTitle: string): VaultEntry[] {
  const title = windowTitle.trim().toLowerCase()
  if (!title) return []
  const scored: Array<{ entry: VaultEntry; score: number }> = []
  for (const entry of entries) {
    if (entry.type !== 'password' || (!entry.password && !entry.username)) continue
    let score = 0
    const site = urlHostBase(entry.url)
    if (site) {
      if (title.includes(site.host)) score = 3
      else if (matchesToken(title, site.base)) score = 2
    }
    const entryTitle = entry.title.trim().toLowerCase()
    if (score === 0 && entryTitle.length >= 3 && title.includes(entryTitle)) score = 1
    if (score > 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
  const top = scored[0]?.score ?? 0
  return scored.filter((s) => s.score === top).map((s) => s.entry)
}
