// Sign-in through the system browser (Google and other providers refuse embedded webviews).
//
//  1. The shell creates a random `verifier` and keeps it in memory; only `challenge = sha256(verifier)` leaves.
//  2. It opens  <APP_URL>/#desktop=<challenge>  in the browser, where the user signs in normally. The web app then
//     tells the server "challenge X belongs to my session".
//  3. Meanwhile the shell polls POST /api/desktop/claim { verifier } every 2 s (up to 5 min). The server hashes the
//     verifier, finds the approved challenge and answers once with { token, maxAge }.
//  4. The shell stores the token as the session cookie and reloads the window.
// Whoever sees the URL only has the challenge, which cannot be turned into a session.
const crypto = require('node:crypto')
const { ipcMain, shell, session } = require('electron')
const { APP_URL, SESSION_COOKIE } = require('./config')

const sleep = ms => new Promise(r => setTimeout(r, ms))

function register({ getWin, fromApp }) {
  let running = null
  ipcMain.handle('login-start', e => {
    if (!fromApp(e)) return { ok: false }
    running ??= signIn(getWin).finally(() => { running = null })
    return running
  })
}

async function signIn(getWin) {
  const verifier = crypto.randomBytes(32).toString('hex')
  const challenge = crypto.createHash('sha256').update(verifier).digest('hex')
  await shell.openExternal(`${APP_URL}/#desktop=${challenge}`)
  for (let i = 0; i < 150; i++) {
    await sleep(2000)
    // the secret travels in the body, never in a URL
    const res = await fetch(`${APP_URL}/api/desktop/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verifier }),
    }).catch(() => null)
    if (!res?.ok) continue
    const { token, maxAge } = await res.json()
    if (typeof token !== 'string' || !token) continue
    await session.defaultSession.cookies.set({
      url: APP_URL, name: SESSION_COOKIE, value: token, httpOnly: true, secure: APP_URL.startsWith('https'), sameSite: 'lax',
      expirationDate: Math.floor(Date.now() / 1000) + (Number(maxAge) || 60 * 86400),
    })
    const win = getWin()
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); win.webContents.reload() }
    return { ok: true }
  }
  return { ok: false }
}

module.exports = { register }
