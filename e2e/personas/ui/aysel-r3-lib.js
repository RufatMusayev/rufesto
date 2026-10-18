// Round 3 helpers: same as aysel-lib, screenshots go to tour-out/personas/aysel/round3/, phone defaults to OS dark.
const base = require('./aysel-lib')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, '..', '..', 'tour-out', 'personas', 'aysel', 'round3')
fs.mkdirSync(OUT, { recursive: true })
const shot = async (page, name, opts = {}) => { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f, ...opts }); return f }
const step = async (n, fn) => { try { base.log('\n=== ' + n); await fn() } catch (e) { base.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
const phone = (b, name, opts = {}) => base.phone(b, name, { colorScheme: 'dark', ...opts })
module.exports = { ...base, OUT, shot, step, phone }
