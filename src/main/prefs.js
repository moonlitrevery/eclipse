// Small JSON preferences file and an append-only log, both in the userData folder.
const path = require('node:path')
const fs = require('node:fs')
const { app } = require('electron')

const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json')

function readPrefs() {
  try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) } catch { return {} }
}

// Shallow merge: callers pass only the keys they change
function writePrefs(patch) {
  try { fs.writeFileSync(prefsFile(), JSON.stringify({ ...readPrefs(), ...patch })) } catch {}
}

function logLine(msg) {
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'eclipse.log'), `${new Date().toISOString()} ${msg}\n`) } catch {}
}

module.exports = { readPrefs, writePrefs, logLine }
