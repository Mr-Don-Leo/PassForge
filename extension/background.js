// PassForge service worker: relays credential requests from content scripts to
// the desktop app over Chrome native messaging. The desktop side only answers
// while the vault is unlocked, and only with entries whose URL matches the
// requesting page's host.

const HOST = 'com.mrdonleo.passforge'

let port = null
const pending = new Map()

function ensurePort() {
  if (port) return port
  port = chrome.runtime.connectNative(HOST)
  port.onMessage.addListener((msg) => {
    const respond = pending.get(msg.id)
    if (respond) {
      pending.delete(msg.id)
      respond(msg)
    }
  })
  port.onDisconnect.addListener(() => {
    const error =
      chrome.runtime.lastError?.message ||
      'PassForge is not reachable. Is the app running and browser integration set up?'
    for (const respond of pending.values()) respond({ error, locked: false, entries: [] })
    pending.clear()
    port = null
  })
  return port
}

function send(message, respond) {
  try {
    if (respond) pending.set(message.id, respond)
    ensurePort().postMessage(message)
  } catch {
    if (respond) {
      pending.delete(message.id)
      respond({ error: 'PassForge is not reachable.', locked: false, entries: [] })
    }
    port = null
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'pf-credentials') {
    // Trust the sender-reported frame URL (set by Chrome, not the page).
    const url = sender.url || sender.tab?.url || ''
    send({ id: crypto.randomUUID(), type: 'credentials', url }, sendResponse)
    return true // respond asynchronously
  }
  if (msg?.type === 'pf-open') {
    send({ id: crypto.randomUUID(), type: 'open' }, null)
  }
  return undefined
})
