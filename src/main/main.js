// Eclipse desktop: opens the Eclipse web app in its own window and adds what a browser tab cannot do:
// a screen picker with system audio, sign-in through the system browser, tray presence, global hotkeys,
// "playing now", and remote play (keyboard, mouse and virtual pads) with consent asked natively on the PC.
const { app, BrowserWindow, session, ipcMain, globalShortcut, Menu, Tray, nativeImage, Notification } = require('electron')
const config = require('./config')
const { APP_URL, APP_NAME, ICON, TEST, SESSION_COOKIE, preloadPath } = config
const { readPrefs, writePrefs, logLine } = require('./prefs')
const i18n = require('./i18n')
const { t } = i18n
const { isApp, makeFromApp, openOutside } = require('./security')
const { createAsk } = require('./ask')
const picker = require('./picker')
const { initOverlay } = require('./overlay')
const control = require('./control')
const autostart = require('./autostart')

// Capture and encoding must not slow down when the window sits behind a game
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
// Friends' voices play right away, without a click first (trusted app, not an arbitrary site)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// Hardware AV1/H.265 encoding for WebRTC (off by default in Chromium); PipeWire capture works on Wayland and X11
app.commandLine.appendSwitch('enable-features', ['WebRtcAV1HWEncode', 'WebRtcAllowH265Send', 'PlatformHEVCEncoderSupport',
  ...(process.platform === 'linux' ? ['WebRTCPipeWireCapturer'] : [])].join(','))
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
app.setAppUserModelId(config.APP_ID)

// Running against another server uses a separate profile, so it never mixes with the installed app
if (config.env.ECLIPSE_URL) app.setPath('userData', `${app.getPath('userData')}-dev`)

if (!app.requestSingleInstanceLock()) app.quit()

let win = null, tray = null, trayMenu = null, quitting = false
const getWin = () => win
const fromApp = makeFromApp(getWin)
const ask = createAsk(getWin)

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 940, minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#0e0f1a',
    icon: ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0e0f1a', symbolColor: '#b9bdd6', height: 36 },
    show: false,
    webPreferences: { preload: preloadPath('app-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  })
  win.once('ready-to-show', () => { if (!process.argv.includes(autostart.AT_LOGIN)) win.show() })
  win.loadURL(APP_URL)

  // The window that can drive the PC never leaves the Eclipse origin: no links, popups, redirects or webviews
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!isApp(url)) { e.preventDefault(); openOutside(url) } })
  win.webContents.on('will-redirect', (e, url) => { if (e.isMainFrame && !isApp(url)) { e.preventDefault(); openOutside(url) } })
  win.webContents.on('will-attach-webview', e => e.preventDefault())

  // The site crashed, hung or reloaded: remote control stops and releases everything, without depending on the site
  win.webContents.on('render-process-gone', () => control.stopControl())
  win.webContents.on('unresponsive', () => control.stopControl())
  win.webContents.on('did-start-navigation', e => { if (e.isMainFrame && !e.isSameDocument) control.stopControl() })

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    if (config.DEV && input.key === 'F12') return win.webContents.toggleDevTools()
    // Ctrl + / Ctrl − / Ctrl 0 zoom, remembered across reloads
    if (!(input.control || input.meta) || input.alt) return
    const step = ['=', '+'].includes(input.key) || input.code === 'NumpadAdd' ? 1
      : input.key === '-' || input.code === 'NumpadSubtract' ? -1
      : input.key === '0' || input.code === 'Numpad0' ? 0 : null
    if (step === null) return
    e.preventDefault()
    const level = step === 0 ? 0 : Math.max(-3, Math.min(3, Math.round((win.webContents.getZoomLevel() + step * 0.5) * 2) / 2))
    win.webContents.setZoomLevel(level)
    writePrefs({ zoom: level })
  })
  win.webContents.on('did-finish-load', () => { const z = readPrefs().zoom; if (typeof z === 'number' && z) win.webContents.setZoomLevel(z) })

  // Closing keeps Eclipse in the tray so friends can still call; quitting is in the tray menu
  win.on('close', e => {
    if (quitting) return
    e.preventDefault()
    win.hide()
    if (!readPrefs().trayTipShown) {
      writePrefs({ trayTipShown: true })
      new Notification({ title: t('Eclipse is still running'), body: t('It stays in the tray so friends can reach you. To quit for good: right-click the icon → Quit.'), icon: ICON }).show()
    }
  })
  win.on('closed', () => { control.stopControl(); win = null })
}

function showWindow() {
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  win.flashFrame(false)
}

function setupSession() {
  const ses = session.defaultSession
  const allowed = ['media', 'display-capture', 'clipboard-sanitized-write', 'clipboard-read', 'notifications', 'fullscreen', 'pointerLock', 'keyboardLock']
  ses.setPermissionRequestHandler((_wc, perm, cb, details) => cb(isApp(details.requestingUrl || '') && allowed.includes(perm)))
  ses.setPermissionCheckHandler((_wc, _perm, origin) => isApp(origin || ''))
  picker.installDisplayMediaHandler(ses, getWin)
  if (TEST.sid) ses.cookies.set({ url: APP_URL, name: SESSION_COOKIE, value: TEST.sid, httpOnly: true, secure: APP_URL.startsWith('https'), sameSite: 'lax' })
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }))
  tray.setToolTip(APP_NAME)
  trayMenu = () => Menu.buildFromTemplate([
    { label: t('Open Eclipse'), click: showWindow },
    { label: t('Start with the computer'), type: 'checkbox', checked: autostart.isOn(), click: item => autostart.set(item.checked) },
    { type: 'separator' },
    { label: t('Quit'), click: () => { quitting = true; app.quit() } },
  ])
  tray.setContextMenu(trayMenu())
  tray.on('click', showWindow)
  tray.on('right-click', () => tray.setContextMenu(trayMenu()))
}

// ---------- Small bridge handlers (the feature modules register their own) ----------
ipcMain.on('show-window', e => { if (fromApp(e)) showWindow() })
ipcMain.on('attention', e => { if (fromApp(e) && win && !win.isFocused()) win.flashFrame(true) })
// Unread counter on the taskbar icon; the badge image itself is drawn by the site
ipcMain.on('badge', (e, count, dataUrl) => {
  if (!fromApp(e) || !win) return
  const n = Math.max(0, Math.min(999, Number(count) || 0))
  try {
    const img = n && typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png') ? nativeImage.createFromDataURL(dataUrl) : null
    win.setOverlayIcon?.(img, n ? t('{0} unread', n) : '')
    app.setBadgeCount?.(n)
    tray?.setToolTip(n ? t('Eclipse · {0} unread', n) : APP_NAME)
  } catch {}
})
// Window buttons follow the site's theme colors
const HEX = /^#[0-9a-f]{6}$/i
ipcMain.on('title-colors', (e, c) => {
  if (!fromApp(e) || !HEX.test(c?.color ?? '') || !HEX.test(c?.symbol ?? '')) return
  try { win.setTitleBarOverlay({ color: c.color, symbolColor: c.symbol, height: 36 }) } catch {}
})
// The site reports its language; tray, dialogs and local pages follow it
ipcMain.on('set-lang', (e, l) => { if (fromApp(e)) { i18n.setLang(l); if (tray && trayMenu) tray.setContextMenu(trayMenu()) } })
ipcMain.on('share-hint', (e, o) => { if (fromApp(e)) picker.setShareHint(o) })
// Local pages (picker, ask, overlay) translate their own text with this dictionary
ipcMain.handle('ui-dict', () => i18n.getDict())

app.on('child-process-gone', (_e, d) => { if (d?.reason !== 'clean-exit') logLine(`process ${d?.type} gone: ${d?.reason} (${d?.exitCode})`) })
app.on('second-instance', (_e, argv) => { if (!argv.includes(autostart.AT_LOGIN)) showWindow() })

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  i18n.startLang()
  // First run of an installed build: start with the computer (can be turned off in the tray)
  if (app.isPackaged && !readPrefs().autostartSet) { autostart.set(true); writePrefs({ autostartSet: true }) }
  // (feature modules use the screen API, which only exists once the app is ready)
  const ctx = { getWin, fromApp, ask }
  for (const m of [control, require('./helpers'), require('./hotkeys'), require('./activity'), require('./login')]) m.register(ctx)
  initOverlay(picker.getShare)
  setupSession()
  createWindow()
  createTray()
})

app.on('before-quit', () => { quitting = true })
app.on('will-quit', () => { control.stopControl(); globalShortcut.unregisterAll() })
app.on('window-all-closed', () => { if (quitting) app.quit() })
