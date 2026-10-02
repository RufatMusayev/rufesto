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

const authHeaders = who => ({
  apikey: who.supabase.anonKey, Authorization: `Bearer ${who.session.access_token}`, 'Content-Type': 'application/json',
})

/** Call a Supabase RPC as a signed-in `who` ({ session, supabase } from signInGuest/openAs). Used only for cleanup. */
async function rpc(page, who, name, args = {}) {
  const res = await page.request.post(`${who.supabase.url}/rest/v1/rpc/${name}`, { headers: authHeaders(who), data: args })
  return { ok: res.ok(), status: res.status(), body: await res.text() }
}

/** PostgREST read/patch as `who`; resolves to the parsed rows ([] on any error, so cleanup never throws). */
async function rest(page, who, method, path, data) {
  const res = await page.request.fetch(`${who.supabase.url}/rest/v1/${path}`, { method, headers: authHeaders(who), data })
  const json = await res.json().catch(() => null)
  return Array.isArray(json) ? json : []
}

const held = state => !['free', 'cleared'].includes(state)

/**
 * Put the QA table back to a clean state over the API (session tokens only, no UI, no password typing).
 * As the guest: cancel the guest's draft orders at the table, then leave_table. If the table is still held
 * (a stale session of someone else, awaiting_payment), the manager releases it: release_table, then what the
 * dashboard's Tables page does, state = 'free', whose end_table_party trigger closes every open session.
 */
async function resetTable(page, guest, manager, tableCode) {
  const [code] = await rest(page, manager, 'GET', `table_access_codes?access_code=eq.${encodeURIComponent(tableCode)}&select=table_id`)
  if (!code) throw new Error(`QA_TABLE_CODE ${tableCode} is not a table of the manager's restaurant`)
  const tableId = code.table_id
  const state = async () => (await rest(page, manager, 'GET', `tables?id=eq.${tableId}&select=state`))[0]?.state
  const open = await rest(page, guest, 'GET', `orders?table_id=eq.${tableId}&user_id=eq.${guest.session.user.id}&status=in.(open,submitted)&select=id`)
  for (const o of open) await rpc(page, guest, 'cancel_order_draft', { p_order_id: o.id })   // refused once the kitchen started: fine
  await rpc(page, guest, 'leave_table', { p_table_id: tableId })
  if (held(await state())) {
    await rpc(page, manager, 'release_table', { p_table_id: tableId })
    if (held(await state())) await rest(page, manager, 'PATCH', `tables?id=eq.${tableId}`, { state: 'free' })
  }
  return { tableId, state: await state() }
}

Object.assign(module.exports, { tinyPng, rpc, resetTable })
