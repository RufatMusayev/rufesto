'use strict'
// One-off backfill (sql/65): every post photo in the private `post-photos` bucket gets a 640 px copy next to it,
// `<path>_w640.<ext>`, which feeds and grids show instead of the full photo. For each post with a photo_url:
//   1. sign in as an account that may write that folder: the author for `<uid>/...`, a demo manager (or admin) of the
//      restaurant for `r/<restaurant id>/...` (storage policies are folder based);
//   2. skip it when the copy already exists (--force redoes it);
//   3. download the full photo through a signed URL, shrink it to <= 640 px in Playwright's Chromium (canvas -> JPEG q0.78,
//      stepping down to <= 120 KB), upload it as `_w640` with x-upsert true.
// Posts whose author is not a demo account (QA / review accounts, real users) are skipped and listed. Nothing here prints a
// password or a token. Preview project only (world.loadConfig refuses anything else).
//   DEMO_ACCOUNTS=<accounts json> node personas/backfill-thumbs.js [--dry-run] [--force] [--limit N]
const { chromium } = require('@playwright/test')
const { loadConfig, loadAccounts, buildWorld, manager, request, fail, log } = require('./world')

const dry = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')
const limitAt = process.argv.indexOf('--limit')
const limit = limitAt > 0 ? Number(process.argv[limitAt + 1]) || Infinity : Infinity

const SMALL_EDGE = 640
const QUALITIES = [0.78, 0.68, 0.58, 0.5]
const TARGET_BYTES = 120 * 1024
const PAGE = 1000

/** `<uid>/abc.jpg` -> `<uid>/abc_w640.jpg` (same rule as the apps' smallPhotoPath). */
const smallPath = p => (/_w640\.[A-Za-z0-9]+$/.test(p) ? p : p.replace(/(\.[A-Za-z0-9]+)$/, '_w640$1'))
const bucketUrl = (cfg, tail) => `${cfg.url}/storage/v1/${tail}`

/** A short-lived signed URL of an object, signed as `actor`: { url } or { error: <code> } ('not_found' when the object is missing). */
async function sign(cfg, actor, objectPath) {
  let token
  try { token = await actor.token() } catch (e) { return { error: 'sign_in_failed' } }
  const r = await request('POST', bucketUrl(cfg, `object/sign/post-photos/${objectPath}`), {
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 300 }),
  })
  if (!r.ok) return { error: r.status === 400 || r.status === 404 ? 'not_found' : r.code }
  const rel = r.data && (r.data.signedURL || r.data.signedUrl)
  if (!rel) return { error: 'no_url' }
  return { url: rel.startsWith('http') ? rel : bucketUrl(cfg, rel.replace(/^\/?(storage\/v1\/)?/, '')) }
}

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45_000) })
      if (res.status === 429) { await new Promise(r => setTimeout(r, 3000 * attempt)); continue }
      if (!res.ok) return null
      return Buffer.from(await res.arrayBuffer())
    } catch { /* retry */ }
  }
  return null
}

/** Runs in the page: bytes (base64) -> { b64, size, width, height } of the 640 px JPEG. */
async function shrinkInPage({ b64, edge, qualities, target }) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'from-image' })
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  let best = null
  for (const q of qualities) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', q))
    if (!blob) continue
    best = blob
    if (blob.size <= target) break
  }
  if (!best) throw new Error('toBlob_failed')
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(best)
  })
  return { b64: String(dataUrl).split(',')[1], size: best.size, width, height }
}

async function listPosts(reader, query) {
  const rows = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await reader.rows(`posts?${query}&photo_url=not.is.null&select=id,user_id,author_type,restaurant_id,photo_url,created_at&order=created_at.asc,id.asc&limit=${PAGE}&offset=${offset}`)
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

async function main() {
  if (!process.env.DEMO_ACCOUNTS) throw new Error('set DEMO_ACCOUNTS to the accounts JSON file')
  const cfg = loadConfig()
  const w = buildWorld({ cfg, accounts: loadAccounts(process.env.DEMO_ACCOUNTS), dry })

  // everybody we hold a login for, by user id; the managers by restaurant id
  const byUid = new Map()
  const diners = Object.values(w.diners)
  for (const a of diners) byUid.set(a.uid, a)
  const managers = new Map()
  for (const v of Object.values(w.venues)) {
    const m = manager(v)
    if (m) managers.set(v.id, m)
    for (const list of Object.values(v.staff)) for (const a of [].concat(list || [])) if (a && !byUid.has(a.uid)) byUid.set(a.uid, a)
  }
  if (!diners.length) throw new Error('no diner accounts in DEMO_ACCOUNTS')

  // every post with a photo the demo reader can see, plus each demo author's own (a friends-only post is only visible to its author)
  const reader = diners[0]
  const posts = new Map()
  for (const p of await listPosts(reader, 'id=not.is.null')) posts.set(p.id, p)
  for (const a of diners) for (const p of await listPosts(a, `user_id=eq.${a.uid}`)) posts.set(p.id, p)
  const all = [...posts.values()]

  // one job per distinct object path
  const jobs = new Map()
  const out = { posts: all.length, legacyUrl: 0, demoOwn: 0, demoVenue: 0, done: 0, existed: 0, failed: [], skipped: new Map(), noPhotoFile: [] }
  for (const p of all) {
    const path = String(p.photo_url)
    if (path.includes('://')) { out.legacyUrl++; continue }
    if (jobs.has(path)) continue
    const venue = path.match(/^r\/([0-9a-f-]{36})\//i)
    const own = path.match(/^([0-9a-f-]{36})\//i)
    let actor = null
    let who = null
    if (venue) { actor = managers.get(venue[1]) || null; who = `restaurant ${venue[1].slice(0, 8)}` }
    else if (own) { actor = byUid.get(own[1]) || null; who = `user ${own[1].slice(0, 8)}` }
    else who = 'unknown path'
    if (!actor) {
      const key = `${who} (${p.author_type || 'person'})`
      out.skipped.set(key, (out.skipped.get(key) || 0) + 1)
      continue
    }
    jobs.set(path, { path, actor, venue: !!venue, id: p.id })
  }
  const todo = [...jobs.values()].slice(0, limit)
  log(`${out.posts} posts with a photo; ${todo.length} belong to demo accounts, ${[...out.skipped.values()].reduce((a, b) => a + b, 0)} do not`)

  let browser = null
  let page = null
  if (!dry) {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()
  }
  const sizes = []
  try {
    let n = 0
    for (const job of todo) {
      n++
      const label = `${job.venue ? 'venue' : 'user'} post ${job.id.slice(0, 8)}`
      const tag = job.venue ? 'demoVenue' : 'demoOwn'
      const to = smallPath(job.path)
      if (to === job.path) { out.failed.push(`${label}: path has no extension`); continue }

      if (!force) {
        const have = await sign(cfg, job.actor, to)
        if (have.url) { out.existed++; out[tag]++; continue }
        if (have.error !== 'not_found') { out.failed.push(`${label}: check ${have.error}`); fail('check small copy', { code: have.error }); continue }
      }
      if (dry) { out.done++; out[tag]++; continue }

      const full = await sign(cfg, job.actor, job.path)
      if (!full.url) { out.noPhotoFile.push(`${label}: ${full.error}`); continue }
      const bytes = await download(full.url)
      if (!bytes) { out.failed.push(`${label}: download`); continue }

      let small
      try {
        small = await page.evaluate(shrinkInPage, { b64: bytes.toString('base64'), edge: SMALL_EDGE, qualities: QUALITIES, target: TARGET_BYTES })
      } catch (e) { out.failed.push(`${label}: resize ${String(e.message).split('\n')[0].slice(0, 80)}`); continue }
      const buf = Buffer.from(small.b64, 'base64')
      const up = await job.actor.upload('post-photos', to, buf, 'image/jpeg', { upsert: true })
      if (!up.ok) { out.failed.push(`${label}: upload ${up.code}`); fail('thumb upload', up); continue }
      out.done++
      out[tag]++
      sizes.push(buf.length)
      if (n % 10 === 0) log(`  ... ${n}/${todo.length}`)
    }
  } finally {
    if (browser) await browser.close()
  }

  const kb = b => `${Math.round(b / 1024)} KB`
  const avg = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0
  const max = sizes.length ? Math.max(...sizes) : 0
  console.log(`${dry ? 'DRY RUN - nothing uploaded. ' : ''}posts with a photo ${out.posts} | demo-authored photos ${todo.length} (own ${out.demoOwn}, venue ${out.demoVenue}) | ${dry ? 'would create' : 'created'} ${out.done} | already had a copy ${out.existed} | failed ${out.failed.length} | photo file missing ${out.noPhotoFile.length} | legacy URL ${out.legacyUrl}`)
  if (sizes.length) console.log(`new copies: avg ${kb(avg)}, max ${kb(max)}, over 120 KB: ${sizes.filter(s => s > TARGET_BYTES).length}`)
  for (const [k, c] of out.skipped) console.log(`  skipped (not a demo account): ${k} - ${c} post(s)`)
  out.noPhotoFile.forEach(l => console.log(`  no file: ${l}`))
  out.failed.forEach(l => console.log(`  failed: ${l}`))
}

main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1) })
