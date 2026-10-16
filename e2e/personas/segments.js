'use strict'
// Time segments of a run. Every party (and every block of extras) is bracketed in SERVER time and tagged with the moment it
// is MEANT to have happened on the simulated Baku date; shift-sql.js turns the file into the SQL that moves the rows there.
// The file is rewritten after every segment, so a run that dies half way can still be shifted.
const fs = require('fs')
const path = require('path')
const { clock, sleep } = require('./world')

// Pause before every segment but the first: the server clock is known to a fraction of a second and each bracket is padded
// by one second, so neighbouring blocks must be further apart than that to never share a row.
const GAP_MS = Number(process.env.SIM_SEGMENT_GAP_MS || 2500)

const SEGMENTS_FILE = path.join(__dirname, '.sim-segments.json')
const pad = n => String(n).padStart(2, '0')
/** minutes since midnight -> 'HH:MM' */
const hhmm = min => `${pad(Math.floor(min / 60))}:${pad(Math.round(min % 60))}`
/** 'YYYY-MM-DD' + minutes since midnight -> '2026-10-10T08:42:00+04:00' (Baku) */
const bakuInstant = (date, min) => `${date}T${hhmm(min)}:00+04:00`

function createRecorder({ daysBack, date }) {
  const done = []

  function write() {
    const skew = clock.skewMs === null ? 0 : clock.skewMs
    let prevEnd = 0
    const segments = done.map(s => {
      const t0 = Math.max(s.start + skew - 1000, prevEnd + 1)     // brackets never overlap
      const t1 = Math.max(s.end + skew + 1000, t0)
      prevEnd = t1
      return { n: s.n, label: s.label, t0: new Date(t0).toISOString(), t1: new Date(t1).toISOString(), target: s.target }
    })
    try { fs.writeFileSync(SEGMENTS_FILE, JSON.stringify({ day: date, daysBack, serverSkewMs: Math.round(skew), segments }, null, 1)) } catch { /* read-only checkout */ }
  }

  /** Runs fn as one segment meant to start at `target` (minutes since midnight on the simulated date). */
  async function run(label, targetMin, fn) {
    if (done.length) await sleep(GAP_MS)
    const start = Date.now()
    try { return await fn() } finally {
      done.push({ n: done.length + 1, label, start, end: Date.now(), target: bakuInstant(date, targetMin) })
      write()
    }
  }

  return { run, write, count: () => done.length }
}

module.exports = { createRecorder, hhmm, bakuInstant, SEGMENTS_FILE }
