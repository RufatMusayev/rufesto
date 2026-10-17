// Optional chime for waiter_called / bill_requested while the dashboard is open (V2-CONTRACT 21.5). Default off,
// remembered per device in localStorage; every storage and audio call is wrapped, so a blocked storage or a browser
// without Web Audio just means "no sound". The tone is synthesised (two short notes), no audio file.

const KEY = 'rufesto_resto_notif_chime'

export function readChimePref() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function writeChimePref(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* private mode: not remembered */ }
}

let ctx = null
function audio() {
  if (ctx) return ctx
  const AudioCtx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null
  if (!AudioCtx) return null
  try { ctx = new AudioCtx() } catch { ctx = null }
  return ctx
}

/** Browsers start audio suspended until the page has had a tap; call this from a tap / key handler. */
export function unlockAudio() {
  try {
    const c = audio()
    if (c && c.state === 'suspended') c.resume().catch(() => {})
  } catch { /* no audio */ }
}

let lastPlay = 0

/** Two soft notes (about 0.5 s). A burst of events plays one chime, not a pile. */
export function playChime() {
  const now = Date.now()
  if (now - lastPlay < 2000) return
  lastPlay = now
  try {
    const c = audio()
    if (!c) return
    if (c.state === 'suspended') c.resume().catch(() => {})
    const start = c.currentTime + 0.02
    ;[[880, 0], [1318.5, 0.2]].forEach(([freq, offset]) => {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.32)
      osc.connect(gain)
      gain.connect(c.destination)
      osc.start(start + offset)
      osc.stop(start + offset + 0.34)
    })
  } catch { /* no audio */ }
}
