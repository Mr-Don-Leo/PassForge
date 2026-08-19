// PassForge content script: Chrome-password-manager-style fill. Focusing a
// login field shows a dropdown of matching vault entries; picking one sets the
// username and password inputs directly (with native value setters + events so
// React/Vue forms notice). Credentials are fetched per focus and never stored.

;(() => {
  'use strict'

  const MAX_ITEMS = 6

  let host = null // <div> that owns the shadow root
  let menu = null // dropdown container inside the shadow root
  let anchorField = null // the input the dropdown is attached to

  function isVisible(el) {
    return !!el && el.offsetParent !== null && !el.disabled && !el.readOnly
  }

  /** The username input that belongs to a password input (nearest previous). */
  function usernameFieldFor(pw) {
    const scope = pw.form || document
    const inputs = [...scope.querySelectorAll('input')]
    const idx = inputs.indexOf(pw)
    for (let i = idx - 1; i >= 0; i--) {
      const type = (inputs[i].getAttribute('type') || 'text').toLowerCase()
      if (['text', 'email', 'tel'].includes(type) && isVisible(inputs[i])) return inputs[i]
    }
    return null
  }

  /** The password input a focused field relates to, or null if not a login field. */
  function passwordFieldFor(el) {
    if (!(el instanceof HTMLInputElement)) return null
    if (el.type === 'password') return el
    const type = (el.getAttribute('type') || 'text').toLowerCase()
    if (!['text', 'email', 'tel'].includes(type)) return null
    const scope = el.form || document
    for (const pw of scope.querySelectorAll('input[type="password"]')) {
      if (usernameFieldFor(pw) === el) return pw
    }
    return null
  }

  /** Set a value the way the page's framework expects (input + change events). */
  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function fill(pw, cred) {
    const user = usernameFieldFor(pw)
    if (user && cred.username) setNativeValue(user, cred.username)
    if (cred.password) setNativeValue(pw, cred.password)
    hide()
  }

  function hide() {
    if (host) host.remove()
    host = null
    menu = null
    anchorField = null
  }

  function ensureMenu() {
    if (menu) return menu
    host = document.createElement('div')
    host.style.all = 'initial'
    const shadow = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = `
      .pf-menu {
        position: fixed; z-index: 2147483647; min-width: 240px; max-width: 340px;
        background: #ffffff; color: #1c2333; border: 1px solid #d5dbe5;
        border-radius: 10px; box-shadow: 0 8px 28px rgba(16, 20, 24, 0.22);
        font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        overflow: hidden; padding: 4px;
      }
      .pf-head {
        display: flex; align-items: center; gap: 6px; padding: 6px 10px 4px;
        color: #5b8def; font-weight: 700; font-size: 11px; letter-spacing: 0.4px;
        text-transform: uppercase;
      }
      .pf-item { display: block; width: 100%; text-align: left; border: 0; background: none;
        padding: 8px 10px; border-radius: 7px; cursor: pointer; font: inherit; color: inherit; }
      .pf-item:hover, .pf-item:focus { background: #eef3ff; outline: none; }
      .pf-title { font-weight: 600; }
      .pf-user { color: #5c6675; font-size: 12px; }
      .pf-note { padding: 8px 10px; color: #5c6675; }
      @media (prefers-color-scheme: dark) {
        .pf-menu { background: #1d2430; color: #e7ecf5; border-color: #333e50; }
        .pf-item:hover, .pf-item:focus { background: #2a3648; }
        .pf-user, .pf-note { color: #9aa7ba; }
      }`
    menu = document.createElement('div')
    menu.className = 'pf-menu'
    shadow.append(style, menu)
    document.documentElement.append(host)
    return menu
  }

  function position(field) {
    const r = field.getBoundingClientRect()
    menu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - 250))}px`
    menu.style.top = `${r.bottom + 4}px`
  }

  function render(field, pw, resp) {
    const entries = (resp.entries || []).slice(0, MAX_ITEMS)
    if (!resp.locked && !resp.error && entries.length === 0) {
      hide()
      return
    }
    const m = ensureMenu()
    anchorField = field
    m.textContent = ''

    const head = document.createElement('div')
    head.className = 'pf-head'
    head.textContent = 'PassForge'
    m.append(head)

    if (resp.error || resp.locked) {
      const note = document.createElement('button')
      note.className = 'pf-item'
      note.textContent = resp.locked ? 'Vault is locked — click to open PassForge' : resp.error
      if (resp.locked) {
        note.addEventListener('mousedown', (e) => {
          e.preventDefault()
          chrome.runtime.sendMessage({ type: 'pf-open' })
          hide()
        })
      }
      m.append(note)
    }

    for (const cred of entries) {
      const item = document.createElement('button')
      item.className = 'pf-item'
      const title = document.createElement('div')
      title.className = 'pf-title'
      title.textContent = cred.title || cred.username || 'Entry'
      const user = document.createElement('div')
      user.className = 'pf-user'
      user.textContent = cred.username || '(no username)'
      item.append(title, user)
      // mousedown (not click) so the field never loses focus first.
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        fill(pw, cred)
      })
      m.append(item)
    }
    position(field)
  }

  let requestSeq = 0
  function offer(field) {
    const pw = passwordFieldFor(field)
    if (!pw) return
    const seq = ++requestSeq
    chrome.runtime.sendMessage({ type: 'pf-credentials' }, (resp) => {
      if (chrome.runtime.lastError || !resp) return
      if (seq !== requestSeq || document.activeElement !== field) return
      render(field, pw, resp)
    })
  }

  document.addEventListener('focusin', (e) => {
    if (host && e.target === anchorField) return
    hide()
    offer(e.target)
  })
  document.addEventListener(
    'mousedown',
    (e) => {
      if (host && e.target !== anchorField && e.target !== host) hide()
    },
    true
  )
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide()
  })
  window.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)
})()
