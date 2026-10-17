#!/usr/bin/env node
// Unit test for the push text renderer (supabase/functions/send-push/render.ts), no dependencies.
//   node scripts/push-render-test.mjs        (Node 22.18+ strips the TypeScript types itself)
import assert from 'node:assert/strict'
import { bakuTime, bakuWhen, isPushable, needsLookup, normalizeLang, parsePayload, render } from '../supabase/functions/send-push/render.ts'

const ctxBase = { consumerOrigin: 'https://rufat-server.com', dashboardOrigin: 'https://resto.rufat-server.com/' }
const row = (type, payload, extra = {}) => ({ id: 'n1', user_id: 'u1', type, payload, audience: 'guest', ...extra })
const go = (lang, r, ctx = {}) => render(r, { ...ctxBase, lang, ...ctx })

// ---- helpers
assert.equal(normalizeLang(null, 'EN-gb'), 'en')
assert.equal(normalizeLang(undefined, '', 'az'), 'az')
assert.equal(normalizeLang('ru'), 'az')
assert.equal(normalizeLang(), 'az')
assert.deepEqual(parsePayload('{"a":1}'), { a: 1 })
assert.deepEqual(parsePayload({ a: 1 }), { a: 1 })
assert.equal(parsePayload('plain text'), null)
assert.equal(parsePayload('{broken'), null)
assert.equal(parsePayload('[1]'), null)
// 2026-10-02 15:30 UTC is 19:30 in Baku (UTC+4), a Friday
assert.equal(bakuTime('2026-10-02T15:30:00Z'), '19:30')
assert.equal(bakuWhen('2026-10-02T15:30:00Z', 'en'), 'Fri 2 Oct, 19:30')
assert.equal(bakuWhen('2026-10-02T15:30:00Z', 'az'), 'cümə, 2 okt, 19:30')
assert.equal(bakuWhen('2026-10-02T21:00:00Z', 'en'), 'Sat 3 Oct, 01:00') // crosses midnight in Baku
assert.equal(bakuWhen('nonsense', 'en'), '')

// ---- one sample row per type in the live data (guest unless noted)
const starts = '2026-10-02T15:30:00Z'
const samples = [
  row('bill_requested', { table_id: 't-1', restaurant_id: 'r-1', amount_due: 12 }, { audience: 'staff' }),
  row('waiter_called', { table_id: 't-1', table_number: 'T2', kind: 'water' }, { audience: 'staff' }),
  row('join_request', { name: 'Aysel', table_id: 't-1' }),
  row('join_approved', { table_id: 't-1' }),
  row('join_declined', { table_id: 't-1' }),
  row('booking_created', { booking_id: 'b-1', starts_at: starts, party_size: 4, host: 'Leyla' }, { audience: 'staff' }),
  row('booking_confirmed', { booking_id: 'b-1', restaurant_name: 'Bella Roma', starts_at: starts }),
  row('booking_cancelled', { booking_id: 'b-1', restaurant_name: 'Bella Roma', starts_at: starts }),
  row('booking_no_show', { booking_id: 'b-1', restaurant_name: 'Bella Roma', starts_at: starts }),
  row('booking_invite', { booking_id: 'b-1', code: 'AB12', restaurant_name: 'Bella Roma', starts_at: starts, host: 'Leyla' }),
  row('booking_member_joined', { booking_id: 'b-1', name: 'Nicat' }),
  row('booking_seated', { booking_id: 'b-1', table_number: '5' }),
  row('booking_reminder', { booking_id: 'b-1', restaurant_name: 'Bella Roma', starts_at: starts }),
  row('bill_settled', { bill_id: 'bl-1', total: 16.5, receipt: 'RF-0001', restaurant_name: 'Bella Roma' }),
  row('friend_request', { name: 'Aysel', user_id: 'u2' }),
  row('friend_accepted', { name: 'Aysel', user_id: 'u2' }),
  row('post_like', { name: 'Aysel', post_id: 'p-1' }, { group_key: 'post_like:p-1' }),
  row('post_comment', { name: 'Aysel', post_id: 'p-1', snippet: 'Looks great!' }, { group_key: 'post_comment:p-1' }),
  row('review_like', { name: 'Aysel', review_id: 'rv-1', dish_name: 'Margherita', dish_id: 'd-1', restaurant_slug: 'bella-roma' }),
  row('review_reply', { name: 'Aysel', review_id: 'rv-1', dish_name: 'Margherita', dish_id: 'd-1', restaurant_slug: 'bella-roma' }),
  row('order_ready', { order_id: 'o-1', dishes: ['Margherita', 'Tiramisu'] }),
  row('place_post', { post_id: 'p-9', restaurant_name: 'Bella Roma', restaurant_slug: 'bella-roma' }),
  row('bill_paid', { table_id: 't-1', table_number: 'T4', restaurant_id: 'r-1', bill_id: 'bl-1', intent_id: 'i-1', amount: 45.2, food: 40, tip: 5.2, method: 'card', payer: 'Aysel' }, { audience: 'staff' }),
  row('review_received', { dish_name: 'Margherita', rating: 4 }, { audience: 'staff' }),
  row('stock_alert', { ingredient_name: 'Mozzarella', alert_type: 'low_stock' }, { audience: 'staff' }),
]
assert.equal(samples.length, 25, 'every type in the brief has a sample')

const seen = new Set()
for (const lang of ['en', 'az']) {
  for (const r of samples) {
    const out = go(lang, r)
    const where = `${r.type}/${lang}`
    assert.ok(out.title && out.body, `${where}: title and body are set`)
    for (const text of [out.title, out.body]) {
      assert.ok(!/[{}]|undefined|null|NaN/.test(text), `${where}: no leftover placeholder in "${text}"`)
      assert.ok(!/\(\s*\)|\s{2,}|\s[,.]/.test(text), `${where}: tidy spacing in "${text}"`)
    }
    assert.ok(out.body.length <= 200, `${where}: body is short`)
    const origin = r.audience === 'staff' ? 'https://resto.rufat-server.com' : 'https://rufat-server.com'
    assert.ok(out.url.startsWith(`${origin}/`) && !out.url.includes('//', 9), `${where}: url on the right origin: ${out.url}`)
    assert.equal(out.icon, `${origin}/icons/icon-192.png`)
    assert.equal(out.badge, `${origin}/icons/badge-72.png`)
    assert.equal(out.tag, r.group_key || r.type)
    seen.add(r.type)
  }
}
assert.equal(seen.size, 25)

// ---- wording and targets
const at = (type, lang) => go(lang, samples.find(s => s.type === type))
assert.equal(at('post_like', 'en').body, 'Aysel liked your post.')
assert.equal(at('post_like', 'az').body, 'Aysel paylaşımınızı bəyəndi.')
assert.equal(at('post_like', 'en').url, 'https://rufat-server.com/post/p-1')
assert.equal(at('post_comment', 'en').body, 'Aysel commented: “Looks great!”')
assert.equal(at('booking_confirmed', 'en').body, 'Your booking at Bella Roma (Fri 2 Oct, 19:30) is confirmed.')
assert.equal(at('booking_confirmed', 'az').body, 'Bella Roma üzrə rezervasiyanız (cümə, 2 okt, 19:30) təsdiqləndi.')
assert.equal(at('booking_invite', 'en').url, 'https://rufat-server.com/b/AB12')
assert.equal(at('booking_reminder', 'en').body, 'Your booking at Bella Roma starts at 19:30.')
assert.equal(at('booking_reminder', 'en').url, 'https://rufat-server.com/bookings/b-1')
assert.equal(at('bill_settled', 'en').body, 'Your bill at Bella Roma is paid (₼16.50). Receipt RF-0001.')
assert.equal(at('bill_settled', 'en').url, 'https://rufat-server.com/receipt/bl-1')
assert.equal(at('order_ready', 'en').title, 'Your food is ready')
assert.equal(at('order_ready', 'en').body, 'Margherita, Tiramisu')
assert.equal(at('order_ready', 'en').urgent, true)
assert.equal(at('post_like', 'en').urgent, false)
assert.equal(at('review_reply', 'en').body, 'Aysel replied to your review of Margherita.')
assert.equal(at('review_reply', 'en').url, 'https://rufat-server.com/restaurant/bella-roma?dish=d-1')
assert.equal(at('place_post', 'en').url, 'https://rufat-server.com/post/p-9')
assert.equal(at('bill_requested', 'en').urgent, true)
assert.equal(at('bill_requested', 'en').url, 'https://resto.rufat-server.com/bills?table=t-1')
assert.equal(at('bill_requested', 'en').body, 'A table asked for the bill.') // no table number in the payload and no lookup done
assert.equal(go('en', samples[0], { tableNumber: 'T4' }).body, 'Table T4 asked for the bill.')
assert.equal(go('az', samples[0], { tableNumber: 'T4' }).body, 'T4 nömrəli masa hesab istədi.')
assert.equal(at('bill_paid', 'en').body, 'Table T4 paid ₼45.20 by card.')
assert.equal(at('bill_paid', 'az').body, 'T4 nömrəli masa ₼45.20 kartla ödədi.')
assert.equal(at('bill_paid', 'en').url, 'https://resto.rufat-server.com/bills?table=t-1')
assert.equal(at('bill_paid', 'en').urgent, false)
assert.equal(go('en', row('bill_paid', { table_id: 't-1', amount: 9 }, { audience: 'staff' })).body, 'A table paid ₼9.00.')
assert.equal(go('az', row('bill_paid', { method: 'cash' }, { audience: 'staff' })).body, 'Masa nağd ödədi.')
assert.equal(go('en', row('bill_paid', { amount: 10, method: 'card' }, { audience: 'staff' }), { tableNumber: 'T9' }).body, 'Table T9 paid ₼10.00 by card.')
assert.equal(at('waiter_called', 'en').body, 'Table T2 asked for water.')
assert.equal(at('waiter_called', 'az').body, 'T2 nömrəli masa su istəyir.')
assert.equal(at('waiter_called', 'en').url, 'https://resto.rufat-server.com/waiter')
assert.equal(at('booking_created', 'en').body, 'New booking request: Leyla, 4 guests, Fri 2 Oct, 19:30.')
assert.equal(at('review_received', 'en').body, 'Margherita got a 4-star review.')
assert.equal(at('stock_alert', 'en').body, 'Mozzarella is running low.')
assert.equal(go('en', row('stock_alert', { ingredient_name: 'Basil', alert_type: 'out_of_stock' }, { audience: 'staff' })).body, 'Basil is out of stock.')
assert.equal(at('join_request', 'en').url, 'https://rufat-server.com/table')
assert.equal(go('en', row('join_request', { name: 'Aysel', table_number: 'T3' }, { audience: 'staff' })).body, 'Aysel wants to join table T3.')

// ---- fallbacks and safety
// order_ready: more than 3 dishes, dish objects, none at all
assert.equal(go('en', row('order_ready', { dishes: ['A', 'B', 'C', 'D', 'E'] })).body, 'A, B, C and 2 more')
assert.equal(go('en', row('order_ready', { items: [{ name: 'Soup' }, { dish_name: 'Salad' }] })).body, 'Soup, Salad')
assert.equal(go('az', row('order_ready', {})).body, 'Sifarişiniz hazırdır!')
// missing name falls back to the looked-up actor, then to "Someone"
assert.equal(go('en', row('post_like', { post_id: 'p-1' }), { actorName: 'Nicat' }).body, 'Nicat liked your post.')
assert.equal(go('en', row('post_like', { post_id: 'p-1' })).body, 'Someone liked your post.')
assert.equal(go('az', row('post_like', {})).body, 'Kimsə paylaşımınızı bəyəndi.')
assert.equal(go('en', row('post_like', {})).url, 'https://rufat-server.com/notifications')
// legacy plain-text payload is shown as text, unknown JSON never printed, unknown plain type gets the generic line
assert.equal(go('en', row('promotion', 'Free dessert today!')).body, 'Free dessert today!')
assert.equal(go('en', row('mystery', '{"secret":"x"}')).body, 'System notification.')
assert.equal(go('az', row('mystery', null)).body, 'Sistem bildirişi.')
// a payload can never point the push at another site
const evil = go('en', row('friend_accepted', { name: 'X', user_id: 'https://evil.example/' }))
assert.ok(evil.url.startsWith('https://rufat-server.com/u/https%3A%2F%2Fevil.example%2F'), evil.url)
assert.equal(go('en', row('review_like', { name: 'A', restaurant_slug: 'https://evil.example', dish_name: 'D' })).url, 'https://rufat-server.com/notifications')
// control characters and long names are cleaned and capped
const messy = go('en', row('friend_request', { name: `Ay\n\u0007sel ${'x'.repeat(200)}` }))
assert.ok(!/[\u0000-\u001f]/.test(messy.body) && messy.body.length < 100, messy.body)
// payload as an object (jsonb) works like JSON text
assert.equal(go('en', row('post_like', { name: 'Aysel', post_id: 'p-1' })).body, 'Aysel liked your post.')
assert.equal(go('en', row('post_like', JSON.stringify({ name: 'Aysel', post_id: 'p-1' }))).body, 'Aysel liked your post.')

// ---- rows that must never be pushed
assert.equal(isPushable(row('friend_request', { name: 'A', status: 'accepted' }), parsePayload({ name: 'A', status: 'accepted' })), false)
assert.equal(isPushable(row('friend_request', {}), { status: 'declined' }), false)
assert.equal(isPushable(row('friend_request', {}), { status: 'cancelled' }), false)
assert.equal(isPushable(row('friend_request', {}), { name: 'A', friendship_id: 'f' }), true)
assert.equal(isPushable(row('friend_request', {}), { status: '' }), true)
assert.equal(isPushable(row('friend_request', 'plain text'), null), true)
assert.equal(isPushable(row('friend_accepted', {}), { status: 'accepted' }), true) // only friend_request is history
assert.equal(isPushable(row('post_like', {}), { name: 'A' }), true)

// ---- lookups the Edge Function does
assert.equal(needsLookup(row('bill_paid', { table_id: 't' }, { audience: 'staff' }), { table_id: 't' }).table, true)
assert.deepEqual(needsLookup(samples[0], parsePayload(samples[0].payload)), { table: true, restaurant: false, actor: false })
assert.deepEqual(needsLookup(samples[1], parsePayload(samples[1].payload)), { table: false, restaurant: false, actor: false })
assert.equal(needsLookup(row('place_post', { post_id: 'p' }, { restaurant_id: 'r-1' }), { post_id: 'p' }).restaurant, true)
assert.equal(needsLookup(row('post_like', { post_id: 'p' }, { actor_id: 'a-1' }), { post_id: 'p' }).actor, true)
assert.equal(needsLookup(row('post_like', { name: 'A' }, { actor_id: 'a-1' }), { name: 'A' }).actor, false)

console.log(`ok: ${samples.length} types x 2 languages rendered, wording and fallbacks verified`)
