// Shell strings are written in English and used as dictionary keys. Other languages map them to translations,
// with {0}, {1}… placeholders for values. The web app tells the shell which language it uses (set-lang).
const path = require('node:path')
const fs = require('node:fs')
const { app } = require('electron')

const LANGS = ['en', 'pt', 'es']
let dict = null
let lang = 'en'

function format(s, args) {
  return args.length ? s.replace(/\{(\d+)\}/g, (m, n) => (args[n] ?? m)) : s
}

// t('Hello {0}', name)
function t(s, ...args) {
  if (s == null) return s
  return format(dict?.[s] ?? s, args)
}

function setLang(l, { persist = true } = {}) {
  if (!LANGS.includes(l)) return
  lang = l
  if (persist) { try { fs.writeFileSync(path.join(app.getPath('userData'), 'language.txt'), l) } catch {} }
  try {
    dict = l === 'en' ? null : JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', `${l}.json`), 'utf8'))
  } catch { dict = null }
}

function startLang() {
  let l = null
  try { l = fs.readFileSync(path.join(app.getPath('userData'), 'language.txt'), 'utf8').trim() } catch {}
  if (!LANGS.includes(l)) {
    const sys = String(app.getLocale() || '').slice(0, 2)
    l = LANGS.includes(sys) ? sys : 'en'
  }
  setLang(l, { persist: false })
}

module.exports = { t, setLang, startLang, getLang: () => lang, getDict: () => dict ?? {} }
