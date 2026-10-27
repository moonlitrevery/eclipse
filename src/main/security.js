// Origin checks shared by every IPC handler: only the top frame of the main window, on the exact Eclipse origin,
// may call into the shell.
const { shell } = require('electron')
const { ORIGIN } = require('./config')

// Exact origin match: a prefix check would let https://eclipse.example.com.evil.site through
const isApp = url => { try { return new URL(url).origin === ORIGIN } catch { return false } }

const makeFromApp = getWin => e => {
  const win = getWin()
  return !!win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame && isApp(e.senderFrame?.url || '')
}

// Outside links open in the real browser, and only http(s)/mailto (no file:, custom protocols or programs)
function openOutside(url) {
  try { if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) shell.openExternal(url) } catch {}
}

module.exports = { isApp, makeFromApp, openOutside }
