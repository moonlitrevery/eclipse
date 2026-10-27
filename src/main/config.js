// Static configuration for the desktop shell.
// The installed app only ever opens the configured Eclipse URL. Environment overrides (another server, a ready-made
// session) only apply when running from source (`npm start`), so nobody can point an installed copy elsewhere.
const path = require('node:path')
const { app } = require('electron')
const pkg = require('../../package.json')

const DEV = !app.isPackaged
const env = DEV ? process.env : {}
const ROOT = path.join(__dirname, '..', '..')

const APP_URL = (env.ECLIPSE_URL || pkg.eclipse?.appUrl || 'https://eclipse.example.com').replace(/\/$/, '')
const ORIGIN = new URL(APP_URL).origin

module.exports = {
  DEV,
  env,
  APP_URL,
  ORIGIN,
  APP_NAME: pkg.productName || 'Eclipse',
  APP_ID: env.ECLIPSE_URL ? 'app.eclipse.desktop.dev' : 'app.eclipse.desktop',
  SESSION_COOKIE: 'eclipse_sid',
  ICON: path.join(ROOT, 'assets', 'icon.png'),
  // Test helpers (environment only, never active in a packaged build)
  TEST: {
    sid: env.ECLIPSE_DEV_SID, // preset session cookie
    autopick: env.ECLIPSE_AUTOPICK, // "screen" shares the first screen without asking
  },
  preloadPath: name => path.join(ROOT, 'src', 'preload', name),
}
