// Round 2 helpers: same as aysel-lib, screenshots go to tour-out/personas/aysel/round2/.
const base = require('./aysel-lib')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, '..', '..', 'tour-out', 'personas', 'aysel', 'round2')
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name, opts = {}) => { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f, ...opts }); return f }
const step = async (n, fn) => { try { base.log('\n=== ' + n); await fn() } catch (e) { base.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
module.exports = { ...base, OUT, shot, step }
