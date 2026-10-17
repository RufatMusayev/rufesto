'use strict'
// One-off repair: the dish photos of Bella Roma, Səda Ocağı and Sakura House were replaced after the simulator had posted
// them. For every post of those three venues that has a dish and a photo, download the dish's CURRENT photo and upload it to
// the SAME post-photos path (upsert), signed in as the post's author: the demo diner for a person's post, the venue's manager
// for a restaurant post. Posts of other people, other venues, or restaurant posts the simulator did not write are left alone.
//   DEMO_ACCOUNTS=... node personas/repair-post-photos.js [--dry-run]
const crypto = require('crypto')
const { loadConfig, loadAccounts, buildWorld, manager, fail } = require('./world')
const { fetchPhoto } = require('./social')
const { VENUE_POSTS } = require('./content')

const KEYS = ['bella', 'seda', 'sakura']
const dry = process.argv.includes('--dry-run')

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A restaurant post the simulator wrote: its caption is one of the venue's dish captions with some dish name in it. */
const simCaption = (key, caption) => (VENUE_POSTS[key].dish || []).some(t => new RegExp(`^${escapeRe(t).replace(escapeRe('{dish}'), '.+')}$`).test(caption || ''))

async function main() {
  if (!process.env.DEMO_ACCOUNTS) throw new Error('set DEMO_ACCOUNTS to the accounts JSON file')
  const cfg = loadConfig()
  const w = buildWorld({ cfg, accounts: loadAccounts(process.env.DEMO_ACCOUNTS), dry })
  const venueById = Object.fromEntries(KEYS.map(k => [w.venues[k].id, w.venues[k]]))
  const byUid = new Map(Object.values(w.diners).map(d => [d.uid, d]))
  const reader = manager(w.venues.bella)

  // every post of the three venues that has a dish and a photo (public posts; a manager can read them)
  const posts = await reader.rows(`posts?restaurant_id=in.(${Object.keys(venueById).join(',')})&dish_id=not.is.null&photo_url=not.is.null&select=id,user_id,author_type,restaurant_id,dish_id,photo_url,caption&order=created_at.asc&limit=1000`)
  const dishIds = [...new Set(posts.map(p => p.dish_id))]
  const dishes = new Map()
  for (let i = 0; i < dishIds.length; i += 50) {
    for (const d of await reader.rows(`dishes?id=in.(${dishIds.slice(i, i + 50).join(',')})&select=id,name,photo,restaurant_id`)) dishes.set(d.id, d)
  }

  const out = { checked: posts.length, reuploaded: 0, noPhoto: [], failed: [], ignored: [], mismatch: 0 }
  for (const p of posts) {
    const v = venueById[p.restaurant_id]
    const dish = dishes.get(p.dish_id)
    const restaurantPost = p.author_type === 'restaurant' || !p.user_id
    const author = restaurantPost ? manager(v) : byUid.get(p.user_id)
    const prefix = restaurantPost ? `r/${v.id}/` : `${p.user_id}/`
    const label = `${v.key} ${restaurantPost ? 'venue' : (author && author.first) || 'other'} post ${p.id.slice(0, 8)}`
    if (!author || !dish || dish.restaurant_id !== p.restaurant_id || !String(p.photo_url).startsWith(prefix)
        || (restaurantPost && !simCaption(v.key, p.caption))) { out.ignored.push(label); continue }   // not ours: untouched
    if (!dish.photo) { out.noPhoto.push(`${label} (${dish.name})`); continue }
    const photo = await fetchPhoto(dish.photo)
    if (!photo) { out.failed.push(`${label}: current photo of "${dish.name}" cannot be downloaded`); continue }
    if (!p.photo_url.endsWith(`.${photo.ext}`)) out.mismatch++
    if (dry) { out.reuploaded++; continue }
    const up = await author.upload('post-photos', p.photo_url, photo.bytes, photo.type, { upsert: true })
    if (!up.ok) { out.failed.push(`${label}: upload ${up.code}`); fail('repair upload', up); continue }
    // read it back as the author (cache-buster: the storage CDN keeps the old bytes of a replaced object for a while)
    let same = false
    try {
      const res = await fetch(`${cfg.url}/storage/v1/object/authenticated/post-photos/${p.photo_url}?cb=${Date.now()}`, { headers: { apikey: cfg.anonKey, Authorization: `Bearer ${await author.token()}` }, signal: AbortSignal.timeout(30_000) })
      same = res.ok && crypto.createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex') === crypto.createHash('sha256').update(photo.bytes).digest('hex')
    } catch { /* counted as not verified below */ }
    if (same) out.reuploaded++; else out.failed.push(`${label}: uploaded but the read-back differs`)
  }

  console.log(`${dry ? 'DRY RUN - nothing uploaded. ' : ''}posts checked ${out.checked} | ${dry ? 'would re-upload' : 're-uploaded and verified'} ${out.reuploaded} | skipped, dish has no photo ${out.noPhoto.length} | failed ${out.failed.length} | ignored (not simulator posts) ${out.ignored.length}`)
  if (out.mismatch) console.log(`note: ${out.mismatch} new photos are not the same image type as the path extension`)
  out.noPhoto.forEach(l => console.log(`  no photo: ${l}`))
  out.failed.forEach(l => console.log(`  failed: ${l}`))
  out.ignored.forEach(l => console.log(`  ignored: ${l}`))
}

main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1) })
