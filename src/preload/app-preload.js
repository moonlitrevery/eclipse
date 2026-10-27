// Minimal bridge between the Eclipse web app and the desktop shell. Every call is re-checked in the main process
// (exact origin, main frame only), so this file only forwards.
const { contextBridge, ipcRenderer } = require('electron')

const on = (channel, map = x => x) => cb => ipcRenderer.on(channel, (_e, v) => cb(map(v)))

contextBridge.exposeInMainWorld('eclipseDesktop', {
  platform: process.platform,
  // presence and devices
  onActivity: on('activity'),
  activityNow: () => ipcRenderer.invoke('activity-now'),
  deviceName: () => ipcRenderer.invoke('device-name'),
  // screen sharing
  shareInfo: () => ipcRenderer.invoke('share-info'),
  screens: () => ipcRenderer.invoke('screens'),
  selfShare: s => ipcRenderer.invoke('self-share', s),
  setShareHint: opts => ipcRenderer.send('share-hint', opts),
  onShareOptions: on('share-opts'),
  // optional native helpers: data arrives on a MessagePort handed over with window.postMessage (see below)
  screenAudio: {
    start: () => ipcRenderer.invoke('screen-audio-start'),
    stop: () => ipcRenderer.send('screen-audio-stop'),
  },
  videoNative: {
    start: o => ipcRenderer.invoke('video-native-start', o),
    cmd: line => ipcRenderer.send('video-native-cmd', line),
    stop: () => ipcRenderer.send('video-native-stop'),
  },
  // account and window
  login: () => ipcRenderer.invoke('login-start'),
  show: () => ipcRenderer.send('show-window'),
  attention: () => ipcRenderer.send('attention'),
  setBadge: (count, dataUrl) => ipcRenderer.send('badge', count, dataUrl),
  setLang: l => ipcRenderer.send('set-lang', l),
  setTitleColors: (color, symbol) => ipcRenderer.send('title-colors', { color, symbol }),
  // keys outside the window
  setPttKey: code => ipcRenderer.send('ptt-key', code ?? null),
  onPtt: on('ptt', Boolean),
  setHotkeys: list => ipcRenderer.send('hotkeys', list ?? null),
  // remote play
  padAvailable: () => ipcRenderer.invoke('pad-available'),
  pcApprove: o => ipcRenderer.invoke('pc-approve', o),
  pcForget: uid => ipcRenderer.invoke('pc-forget', uid),
  controlRevoke: () => ipcRenderer.invoke('control-revoke'),
  hostOverlay: list => ipcRenderer.send('host-overlay', list),
  control: {
    ask: o => ipcRenderer.invoke('control-ask', o),
    start: opts => ipcRenderer.invoke('control-start', opts),
    stop: () => ipcRenderer.invoke('control-stop'),
    input: msg => ipcRenderer.send('control-input', msg),
    alive: () => ipcRenderer.send('control-alive'),
    addGuest: opts => ipcRenderer.invoke('control-guest-add', opts),
    removeGuest: id => ipcRenderer.invoke('control-guest-remove', id),
    onHotkeyStop: cb => ipcRenderer.on('control-hotkey-stop', () => cb()),
    onDropped: cb => ipcRenderer.on('control-dropped', () => cb()),
  },
})

// MessagePorts cannot cross the contextBridge: hand them to the page, same origin only
ipcRenderer.on('screen-audio-port', e => window.postMessage({ eclipseScreenAudio: 1 }, location.origin, e.ports))
ipcRenderer.on('video-native-port', e => window.postMessage({ eclipseVideoNative: 1 }, location.origin, e.ports))
