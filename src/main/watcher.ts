import { systemPreferences } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { getActiveWindow, type ActiveWindow } from './autotype'

/**
 * Streams focused-window changes so the app can *offer* autofill without a
 * hotkey. One long-lived helper per OS (spawning a process per poll would be
 * far too heavy on Windows/macOS):
 *  - macOS: an osascript repeat-loop that logs "<process>\t<title>" on change.
 *    Started only if Accessibility is already granted — the hotkey/button flow
 *    owns the permission prompt.
 *  - Windows: a persistent PowerShell loop printing "<hwnd>\t<title>" on change.
 *  - Linux (X11): a light JS poll of xdotool (per-call cost is a few ms).
 */

const MAC_WATCH_SCRIPT = `
set prev to ""
repeat
  try
    tell application "System Events"
      set p to first application process whose frontmost is true
      set n to name of p
      set t to n
      try
        set t to t & " — " & (name of front window of p)
      end try
    end tell
    if t is not prev then
      set prev to t
      log n & tab & t
    end if
  end try
  delay 1
end repeat`

const WIN_WATCH_SCRIPT = `
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class PFWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$prev = ''
while ($true) {
  $h = [PFWin]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][PFWin]::GetWindowText($h, $sb, 512)
  $t = $sb.ToString()
  if ($t -and $t -ne $prev) {
    $prev = $t
    [Console]::Out.WriteLine("$([int64]$h)\`t$t")
    [Console]::Out.Flush()
  }
  Start-Sleep -Milliseconds 900
}`

const LINUX_POLL_MS = 1200
const MAX_RESTARTS = 3

let child: ChildProcess | null = null
let pollTimer: NodeJS.Timeout | null = null
let restarts = 0
let running = false

function emitLines(buffer: { rest: string }, chunk: string, onChange: (win: ActiveWindow) => void): void {
  buffer.rest += chunk
  const lines = buffer.rest.split(/\r?\n/)
  buffer.rest = lines.pop() ?? ''
  for (const line of lines) {
    const tab = line.indexOf('\t')
    if (tab <= 0) continue
    const id = line.slice(0, tab).trim()
    const title = line.slice(tab + 1).trim()
    if (id && title) onChange({ id, title })
  }
}

function startChild(cmd: string, args: string[], stream: 'stdout' | 'stderr', onChange: (win: ActiveWindow) => void): void {
  const proc = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child = proc
  const buffer = { rest: '' }
  proc[stream].setEncoding('utf8')
  proc[stream].on('data', (chunk: string) => emitLines(buffer, chunk, onChange))
  proc.on('error', () => undefined)
  proc.on('close', () => {
    child = null
    // Crashed (or the tool is unusable): retry a few times, then stay quiet.
    if (running && restarts < MAX_RESTARTS) {
      restarts++
      setTimeout(() => running && startChild(cmd, args, stream, onChange), 5_000)
    }
  })
}

function startLinuxPoll(onChange: (win: ActiveWindow) => void): void {
  let prevTitle = ''
  let failures = 0
  let busy = false
  pollTimer = setInterval(async () => {
    if (busy) return
    busy = true
    try {
      const win = await getActiveWindow()
      failures = 0
      if (win.title && win.title !== prevTitle) {
        prevTitle = win.title
        onChange(win)
      }
    } catch {
      // No xdotool / Wayland: give up quietly after a few misses.
      if (++failures >= MAX_RESTARTS) stopWindowWatcher()
    } finally {
      busy = false
    }
  }, LINUX_POLL_MS)
}

/** Idempotent. Silently does nothing on macOS until Accessibility is granted. */
export function startWindowWatcher(onChange: (win: ActiveWindow) => void): void {
  if (running) return
  running = true
  restarts = 0
  switch (process.platform) {
    case 'darwin':
      if (!systemPreferences.isTrustedAccessibilityClient(false)) {
        running = false // no prompt from the background path; the hotkey flow asks
        return
      }
      startChild('osascript', ['-e', MAC_WATCH_SCRIPT], 'stderr', onChange) // AppleScript `log` writes to stderr
      return
    case 'win32':
      startChild('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_WATCH_SCRIPT], 'stdout', onChange)
      return
    default:
      startLinuxPoll(onChange)
  }
}

export function stopWindowWatcher(): void {
  running = false
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  child?.kill()
  child = null
}
