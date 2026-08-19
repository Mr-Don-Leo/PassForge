import { app } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { urlHostBase } from './autotype'
import type { VaultEntry } from '../shared/types'

/**
 * Chrome-style in-page autofill. The browser extension talks to Chrome's
 * native-messaging host — which is this same binary, relaunched by the browser
 * with a chrome-extension:// origin argument. That relay instance forwards
 * requests over a local socket to the running app, which answers with entries
 * matching the page's host (only while unlocked).
 *
 * Trust model: the extension side is pinned by allowed_origins; the local
 * socket is user-private (0600 / per-user named pipe). Any process running as
 * the same OS user could query it while the vault is unlocked — the same class
 * of access an equally-privileged keylogger would already have.
 */

export const NATIVE_HOST_NAME = 'com.mrdonleo.passforge'
export const EXTENSION_ID = 'nhijkfecbioegiplfklgppedakljfgea'

interface BridgeRequest {
  id?: string
  type?: string
  url?: string
}

interface BridgeDeps {
  isUnlocked(): boolean
  listEntries(): VaultEntry[]
  showWindow(): void
}

function socketPath(): string {
  if (process.platform === 'win32') return `\\\\.\\pipe\\passforge-bridge-${os.userInfo().username}`
  return path.join(app.getPath('userData'), 'bridge.sock')
}

// ---- host-side matching (pure; unit-testable) ---------------------------------

/** Entries whose URL host matches the page host (never title-based — the page
 *  is untrusted, so only an explicit site assignment may release credentials). */
export function matchEntriesToPageUrl(entries: VaultEntry[], pageUrl: string): VaultEntry[] {
  let pageHost: string
  try {
    pageHost = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return []
  }
  if (!pageHost) return []
  const out: VaultEntry[] = []
  for (const e of entries) {
    if (e.type !== 'password' || (!e.username && !e.password)) continue
    const site = urlHostBase(e.url)
    if (!site) continue
    if (pageHost === site.host || pageHost.endsWith(`.${site.host}`) || site.host.endsWith(`.${pageHost}`)) {
      out.push(e)
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title))
}

function handleRequest(msg: BridgeRequest, deps: BridgeDeps): object | null {
  if (msg.type === 'open') {
    deps.showWindow()
    return msg.id ? { id: msg.id, ok: true } : null
  }
  if (msg.type !== 'credentials' || !msg.id) return null
  if (!deps.isUnlocked()) return { id: msg.id, locked: true, entries: [] }
  const entries = matchEntriesToPageUrl(deps.listEntries(), String(msg.url ?? ''))
  return {
    id: msg.id,
    locked: false,
    entries: entries.map((e) => ({ id: e.id, title: e.title, username: e.username, password: e.password }))
  }
}

// ---- bridge server (runs inside the normal app instance) ----------------------

let server: net.Server | null = null

export function startBridgeServer(deps: BridgeDeps): void {
  if (server) return
  const sock = socketPath()
  if (process.platform !== 'win32') fs.rmSync(sock, { force: true })
  server = net.createServer((conn) => {
    let buf = ''
    conn.on('data', (chunk) => {
      buf += chunk
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (!line.trim()) continue
        try {
          const reply = handleRequest(JSON.parse(line) as BridgeRequest, deps)
          if (reply) conn.write(`${JSON.stringify(reply)}\n`)
        } catch {
          // Malformed line: drop it.
        }
      }
    })
    conn.on('error', () => undefined)
  })
  server.on('error', () => undefined)
  server.listen(sock, () => {
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(sock, 0o600)
      } catch {
        // best effort; the containing userData dir is already user-private
      }
    }
  })
}

export function stopBridgeServer(): void {
  server?.close()
  server = null
}

// ---- native-messaging relay (the instance the browser spawns) ------------------

/** True when the browser launched this binary as its native-messaging host. */
export function isNativeHostInvocation(argv: string[]): boolean {
  return argv.some((a) => a.startsWith('chrome-extension://'))
}

/** Relay Chrome's length-prefixed stdio frames to the app's JSON-lines socket. */
export function runNativeHost(): void {
  let conn: net.Socket | null = null
  let connBuf = ''
  const outstanding = new Set<string>()

  function writeFrame(obj: object): void {
    const json = Buffer.from(JSON.stringify(obj))
    const len = Buffer.alloc(4)
    len.writeUInt32LE(json.length, 0)
    process.stdout.write(Buffer.concat([len, json]))
  }

  function failOutstanding(): void {
    for (const id of outstanding) {
      writeFrame({ id, error: 'PassForge is not running.', locked: false, entries: [] })
    }
    outstanding.clear()
  }

  function ensureConn(): net.Socket {
    if (conn) return conn
    const c = net.connect(socketPath())
    conn = c
    c.on('data', (chunk) => {
      connBuf += chunk
      let nl: number
      while ((nl = connBuf.indexOf('\n')) >= 0) {
        const line = connBuf.slice(0, nl)
        connBuf = connBuf.slice(nl + 1)
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as { id?: string }
          if (msg.id) outstanding.delete(msg.id)
          writeFrame(msg)
        } catch {
          // Malformed line: drop it.
        }
      }
    })
    const drop = (): void => {
      conn = null
      connBuf = ''
      failOutstanding()
    }
    c.on('error', drop)
    c.on('close', () => {
      if (conn === c) drop()
    })
    return c
  }

  let stdinBuf = Buffer.alloc(0)
  process.stdin.on('data', (chunk: Buffer) => {
    stdinBuf = Buffer.concat([stdinBuf, chunk])
    while (stdinBuf.length >= 4) {
      const len = stdinBuf.readUInt32LE(0)
      if (stdinBuf.length < 4 + len) break
      const json = stdinBuf.subarray(4, 4 + len).toString()
      stdinBuf = stdinBuf.subarray(4 + len)
      try {
        const msg = JSON.parse(json) as BridgeRequest
        if (msg.id) outstanding.add(msg.id)
        ensureConn().write(`${json}\n`)
      } catch {
        // Malformed frame: drop it.
      }
    }
  })
  // The browser closes stdin when the extension port disconnects.
  process.stdin.on('end', () => app.quit())
  process.stdin.on('error', () => app.quit())
}

// ---- native-messaging manifest registration ------------------------------------

const HOST_MANIFEST_DIRS_MAC: Array<[string, string]> = [
  ['Chrome', 'Library/Application Support/Google/Chrome/NativeMessagingHosts'],
  ['Chromium', 'Library/Application Support/Chromium/NativeMessagingHosts'],
  ['Edge', 'Library/Application Support/Microsoft Edge/NativeMessagingHosts'],
  ['Brave', 'Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts']
]

const HOST_MANIFEST_DIRS_LINUX: Array<[string, string]> = [
  ['Chrome', '.config/google-chrome/NativeMessagingHosts'],
  ['Chromium', '.config/chromium/NativeMessagingHosts'],
  ['Edge', '.config/microsoft-edge/NativeMessagingHosts'],
  ['Brave', '.config/BraveSoftware/Brave-Browser/NativeMessagingHosts']
]

const HOST_REGISTRY_KEYS_WIN: Array<[string, string]> = [
  ['Chrome', `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`],
  ['Edge', `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`]
]

function regAdd(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', value, '/f'], (err) =>
      err ? reject(err) : resolve()
    )
  })
}

/** Folder the unpacked extension ships in (for "Load unpacked" in the browser). */
export function extensionDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.join(app.getAppPath(), 'extension')
}

export interface BrowserSetupResult {
  configured: string[]
  extensionDir: string
}

/** Write the native-messaging host manifest for every installed browser. */
export async function installBrowserIntegration(): Promise<BrowserSetupResult> {
  const manifest = JSON.stringify(
    {
      name: NATIVE_HOST_NAME,
      description: 'PassForge browser integration',
      path: process.execPath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`]
    },
    null,
    2
  )
  const configured: string[] = []

  if (process.platform === 'win32') {
    const manifestPath = path.join(app.getPath('userData'), `${NATIVE_HOST_NAME}.json`)
    fs.writeFileSync(manifestPath, manifest)
    for (const [label, key] of HOST_REGISTRY_KEYS_WIN) {
      try {
        await regAdd(key, manifestPath)
        configured.push(label)
      } catch {
        // registry hive unavailable — skip this browser
      }
    }
  } else {
    const home = app.getPath('home')
    const dirs = process.platform === 'darwin' ? HOST_MANIFEST_DIRS_MAC : HOST_MANIFEST_DIRS_LINUX
    for (const [label, rel] of dirs) {
      const target = path.join(home, rel)
      // Only configure browsers that are actually present.
      if (!fs.existsSync(path.dirname(target))) continue
      fs.mkdirSync(target, { recursive: true })
      fs.writeFileSync(path.join(target, `${NATIVE_HOST_NAME}.json`), manifest)
      configured.push(label)
    }
  }
  return { configured, extensionDir: extensionDir() }
}
