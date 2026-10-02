// Helpers shared by the v2 specs (social, bookings, bills, resto).
const { signInGuest } = require('./guest')

/**
 * A second, independent browser context signed in as `who` through the Supabase auth API
 * (never through a password field). Returns { page, session, supabase, close }.
 */
async function openAs(browser, testInfo, who) {
  const use = testInfo.project.use
  const context = await browser.newContext({
    storageState: use.storageState, viewport: use.viewport, locale: use.locale, userAgent: use.userAgent,
  })
  const page = await context.newPage()
  const { session, supabase } = await signInGuest(page, who)
  return { context, page, session, supabase, close: () => context.close() }
}

/** A signed-out context (fresh storage, English only). */
async function openAnon(browser, testInfo) {
  const use = testInfo.project.use
  const context = await browser.newContext({
    storageState: use.storageState, viewport: use.viewport, locale: use.locale, userAgent: use.userAgent,
  })
  return { context, page: await context.newPage(), close: () => context.close() }
}

module.exports = { openAs, openAnon }

const zlib = require('zlib')
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A valid 16x20 orange PNG, built in memory (no fixture file); enough for the photo picker's canvas pipeline. */
function tinyPng(w = 16, h = 20) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, () => Buffer.from([230, 126, 34])))])
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** Call a Supabase RPC as a signed-in `who` ({ session, supabase } from signInGuest/openAs). Used only for cleanup. */
async function rpc(page, who, name, args = {}) {
  const res = await page.request.post(`${who.supabase.url}/rest/v1/rpc/${name}`, {
    headers: { apikey: who.supabase.anonKey, Authorization: `Bearer ${who.session.access_token}`, 'Content-Type': 'application/json' },
    data: args,
  })
  return { ok: res.ok(), status: res.status(), body: await res.text() }
}

Object.assign(module.exports, { tinyPng, rpc })
