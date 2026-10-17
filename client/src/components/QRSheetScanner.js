// Camera lifecycle helpers of QRSheet, kept apart so they can be tested without React.
//
// html5-qrcode 2.3.8: stop() THROWS A STRING synchronously ("Cannot stop, scanner is not running or paused.")
// when the scanner is not scanning, and a second stop() issued while the first is still closing the camera runs
// the teardown twice. A throw inside a React effect cleanup unmounts the whole tree (there is no error boundary),
// which is what blanked the app after a successful scan (QA persona-leyla #1). So every stop goes through here.

// Html5QrcodeScannerState (html5-qrcode/state-manager): UNKNOWN 0, NOT_STARTED 1, SCANNING 2, PAUSED 3
const SCANNING = 2
const PAUSED = 3

const stops = new WeakMap()   // scanner -> the promise of its one stop

/**
 * Stops `scanner` at most once and never throws. Safe to call from every exit path (a decoded code, the
 * sheet closing, unmounting, a mode switch): the first call stops, later calls get the same promise.
 * A scanner that is not running (still starting, failed to start, already stopped) is left alone.
 * Resolves when the camera is released.
 */
export function stopScanner(scanner) {
  if (!scanner) return Promise.resolve()
  const pending = stops.get(scanner)
  if (pending) return pending

  let closing
  try {
    const state = typeof scanner.getState === 'function' ? scanner.getState() : SCANNING
    if (state !== SCANNING && state !== PAUSED) return Promise.resolve()
    closing = Promise.resolve(scanner.stop())
  } catch {
    return Promise.resolve()                   // the library threw (a string): nothing running, nothing to stop
  }

  const done = closing
    .catch(() => {})                           // a camera that is already gone is as good as stopped
    .then(() => { try { scanner.clear() } catch { /* nothing left to clear */ } })
  stops.set(scanner, done)
  return done
}
