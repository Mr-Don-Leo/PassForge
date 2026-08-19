import { app, BrowserWindow, shell, powerMonitor, globalShortcut } from 'electron'
import { join } from 'node:path'
import { registerIpc, lockVault, lockAndNotify, syncAutotypeShortcut, syncAutofillWatcher, stopAutofillWatcher } from './ipc'
import { getSettings } from './settings'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#101418',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      // Security hardening: the renderer runs sandboxed with no Node access.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Auto-lock when the app is minimized (if enabled).
  win.on('minimize', () => {
    if (getSettings().onMinimize) lockAndNotify()
  })

  // Open external links in the user's browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block in-app navigation to remote origins.
  win.webContents.on('will-navigate', (event, url) => {
    const dev = process.env.ELECTRON_RENDERER_URL
    if (dev && url.startsWith(dev)) return
    event.preventDefault()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Windows ties toast notifications (autofill offers) to this id.
  if (process.platform === 'win32') app.setAppUserModelId('com.mrdonleo.passforge')
  registerIpc()
  createWindow()
  // Global autofill hotkey (Cmd/Ctrl+Shift+U) + notification offers,
  // honoring the user's settings.
  syncAutotypeShortcut()
  syncAutofillWatcher()

  // OS-level auto-lock triggers. Sleep and screen-lock (also fired on fast
  // user-switching) lock the vault and notify the renderer.
  powerMonitor.on('suspend', () => {
    if (getSettings().onSleep) lockAndNotify()
  })
  powerMonitor.on('lock-screen', () => {
    if (getSettings().onScreenLock) lockAndNotify()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => lockVault())

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopAutofillWatcher()
})

// Deny attempts to open new windows / webviews for defence in depth.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})
