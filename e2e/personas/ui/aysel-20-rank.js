// Ranking analysis of Home (home_feed) and Friends (friends_feed) for Aysel, 3 pages each, via the same RPCs the app calls.
const L = require('./aysel-lib')
;(async () => {
  const a = await L.api('Aysel Məmmədova')
  const friends = new Set((await a.rpc('my_friends')).map(f => f.user_id))
  const now = Date.now()
  const age = it => Math.round((now - Date.parse(it.created_at)) / 3600000)
  const label = it => it.kind === 'promo' ? 'PROMO' : it.is_mine ? 'OWN' : (it.author && friends.has(it.author.id || it.user)) ? 'FRIEND' : (it.author && it.author.is_restaurant) || (it.author && it.restaurant && it.author.name === it.restaurant.name) ? 'VENUE' : 'OTHER'
  for (const [name, fn] of [['home_feed', 'home_feed'], ['friends_feed', 'friends_feed']]) {
    let excl = []; const all = []
    for (let p = 0; p < 3; p++) {
      const r = await a.rpc(fn, { p_exclude: excl, p_limit: 20 })
      if (!r.items) { L.log(name, 'error', JSON.stringify(r).slice(0, 200)); break }
      all.push(...r.items); excl = r.exclude || all.map(i => i.id)
      if (r.caught_up) break
    }
    L.log(`\n## ${name}: ${all.length} items`)
    const lines = all.map((it, i) => `${String(i + 1).padStart(2)} ${(it.kind || '').padEnd(6)} ${label(it).padEnd(6)} ${String(age(it) + 'h').padStart(4)} ${(it.author?.name || '').padEnd(20)} @ ${(it.restaurant?.name || '').padEnd(20)} likes=${it.like_count ?? '-'} comments=${it.comment_count ?? '-'} liked=${it.liked_by_me ?? '-'} ${it.why || ''}`)
    L.log(lines.join('\n'))
    const posts = all.filter(i => i.kind !== 'promo')
    const own = posts.filter(i => i.is_mine)
    L.log('own items in first 20:', all.slice(0, 20).filter(i => i.is_mine).length, 'of 20; in first 60:', own.length)
    const friendsFresh = posts.filter(i => !i.is_mine && label(i) === 'FRIEND' && age(i) <= 24)
    L.log('friend items <=24h old:', friendsFresh.length, 'positions', friendsFresh.map(i => all.indexOf(i) + 1).join(','))
    const old = all.filter((i, k) => k < 20 && age(i) > 72)
    L.log('items older than 72h within the first 20:', old.length, old.map(i => `#${all.indexOf(i) + 1} (${age(i)}h ${i.author?.name})`).join(', '))
  }
})().catch(e => { console.error(e); process.exit(1) })
