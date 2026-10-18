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
assert.equal(normalizeLang('ru'), 'ru')
assert.equal(normalizeLang(null, 'RU-ru', 'en'), 'ru')
assert.equal(normalizeLang('', 'en'), 'en')
assert.equal(normalizeLang('de'), 'az')
assert.equal(normalizeLang(undefined, 'tr', 'ru'), 'az') // the first non-empty value decides
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
assert.equal(bakuWhen('2026-10-02T15:30:00Z', 'ru'), 'пт, 2 окт, 19:30')
assert.equal(bakuWhen('nonsense', 'en'), '')
assert.equal(bakuWhen('nonsense', 'ru'), '')

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
  row('promotion', { title: '2 for 1 pizza', restaurant_name: 'Bella Roma', restaurant_slug: 'bella-roma' }),
  row('review_received', { dish_name: 'Margherita', rating: 4 }, { audience: 'staff' }),
  row('stock_alert', { ingredient_name: 'Mozzarella', alert_type: 'low_stock' }, { audience: 'staff' }),
]
assert.equal(samples.length, 26, 'every type in the brief has a sample')

const seen = new Set()
const CYRILLIC = /[\u0400-\u04ff]/
const ENGLISH_WORDS = /\b(liked|your|booking|table|bill|paid|review|replied|joined|invited|commented|request|offer)\b/i
for (const lang of ['en', 'az', 'ru']) {
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
    if (lang === 'ru') {
      assert.ok(CYRILLIC.test(out.title), `${where}: Russian title "${out.title}"`)
      assert.ok(!ENGLISH_WORDS.test(out.body) && !ENGLISH_WORDS.test(out.title), `${where}: no English template words left in "${out.title} | ${out.body}"`)
    }
  }
}
assert.equal(seen.size, 26)

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

// a missing start time leaves no empty brackets or stray commas behind
assert.equal(go('en', row('booking_confirmed', { booking_id: 'b-1', restaurant_name: 'Bella Roma' })).body, 'Your booking at Bella Roma is confirmed.')
assert.equal(go('az', row('booking_confirmed', { booking_id: 'b-1', restaurant_name: 'Bella Roma' })).body, 'Bella Roma üzrə rezervasiyanız təsdiqləndi.')
assert.equal(go('en', row('booking_invite', { code: 'AB', host: 'Leyla', restaurant_name: 'Bella Roma' })).body, 'Leyla invited you to Bella Roma.')

// ---- Russian
assert.equal(at('order_ready', 'ru').title, 'Ваш заказ готов')
assert.equal(at('order_ready', 'ru').body, 'Margherita, Tiramisu')
assert.equal(go('ru', row('order_ready', {})).body, 'Ваш заказ готов!')
assert.equal(go('ru', row('order_ready', { dishes: ['A', 'B', 'C', 'D', 'E'] })).body, 'A, B, C и ещё 2')
assert.equal(at('post_like', 'ru').body, 'Aysel: нравится ваш пост.')
assert.equal(at('post_comment', 'ru').body, 'Aysel: «Looks great!»')
assert.equal(at('friend_request', 'ru').body, 'Заявка в друзья: Aysel.')
assert.equal(at('friend_accepted', 'ru').body, 'Aysel теперь у вас в друзьях.')
assert.equal(at('booking_confirmed', 'ru').body, 'Ваша бронь в «Bella Roma» (пт, 2 окт, 19:30) подтверждена.')
assert.equal(at('booking_cancelled', 'ru').body, 'Ваша бронь в «Bella Roma» (пт, 2 окт, 19:30) отменена.')
assert.equal(at('booking_invite', 'ru').body, 'Leyla приглашает вас в «Bella Roma», пт, 2 окт, 19:30.')
assert.equal(at('booking_reminder', 'ru').body, 'Ваша бронь в «Bella Roma» начинается в 19:30.')
assert.equal(at('bill_settled', 'ru').body, 'Ваш счёт в «Bella Roma» оплачен (₼16.50). Чек RF-0001.')
assert.equal(at('review_reply', 'ru').body, 'Aysel: ответ на ваш отзыв о «Margherita».')
assert.equal(at('place_post', 'ru').body, 'Новая публикация в «Bella Roma».')
assert.equal(at('bill_paid', 'ru').body, 'Стол T4 оплатил ₼45.20 картой.')
assert.equal(go('ru', row('bill_paid', { method: 'cash' }, { audience: 'staff' })).body, 'Стол оплатил наличными.')
assert.equal(go('ru', samples[0], { tableNumber: 'T4' }).body, 'Стол T4 просит счёт.')
assert.equal(at('waiter_called', 'ru').body, 'Стол T2 просит воду.')
assert.equal(at('booking_created', 'ru').body, 'Новый запрос на бронь: Leyla, 4 гостя, пт, 2 окт, 19:30.')
assert.equal(at('review_received', 'ru').body, 'Отзыв о «Margherita»: 4 из 5.')
assert.equal(at('stock_alert', 'ru').body, 'Mozzarella: остаток на исходе.')
assert.equal(go('ru', row('stock_alert', { ingredient_name: 'Basil', alert_type: 'out_of_stock' }, { audience: 'staff' })).body, 'Basil: нет в наличии.')
assert.equal(at('join_request', 'ru').body, 'Aysel хочет присоединиться к вашему столу.')
assert.equal(go('ru', row('join_request', { name: 'Aysel', table_number: 'T3' }, { audience: 'staff' })).body, 'Aysel хочет присоединиться к столу T3.')
// the guest count declines: 1 гость, 2-4 гостя, 5-20 гостей, 21 гость, 22 гостя, 111 гостей
for (const [n, word] of [[1, 'гость'], [2, 'гостя'], [4, 'гостя'], [5, 'гостей'], [11, 'гостей'], [14, 'гостей'], [21, 'гость'], [22, 'гостя'], [25, 'гостей'], [111, 'гостей']]) {
  assert.equal(go('ru', row('booking_created', { party_size: n }, { audience: 'staff' })).body, `Новый запрос на бронь: ${n} ${word}.`)
}
// missing names read right in Russian too
assert.equal(go('ru', row('post_like', { post_id: 'p-1' })).body, 'Кто-то: нравится ваш пост.')
assert.equal(go('ru', row('booking_confirmed', { booking_id: 'b-1' })).body, 'Ваша бронь в ресторане подтверждена.')
assert.equal(go('ru', row('booking_invite', { code: 'AB' })).body, 'Кто-то приглашает вас в ресторан.')
assert.equal(go('ru', row('place_post', { post_id: 'p' })).body, 'Новая публикация в ресторане.')
assert.equal(go('ru', row('mystery', null)).body, 'Системное уведомление.')
assert.equal(go('ru', row('promotion', 'Free dessert today!')).body, 'Free dessert today!') // legacy text payload as before

// ---- dish names in the recipient's language (sql/69: dishes_i18n, dish_name_i18n)
const i18nOrder = {
  dish_ids: ['d1', 'd2'],
  dishes: ['Margherita', 'Tiramisu'],
  dishes_i18n: [
    { az: 'Marqarita', en: 'Margherita', ru: 'Маргарита' },
    { az: 'Tiramisu', en: 'Tiramisu', ru: 'Тирамису' },
  ],
}
assert.equal(go('az', row('order_ready', i18nOrder)).body, 'Marqarita, Tiramisu')
assert.equal(go('en', row('order_ready', i18nOrder)).body, 'Margherita, Tiramisu')
assert.equal(go('ru', row('order_ready', i18nOrder)).body, 'Маргарита, Тирамису')
// only the i18n list, no plain names
assert.equal(go('ru', row('order_ready', { dishes_i18n: i18nOrder.dishes_i18n })).body, 'Маргарита, Тирамису')
// a language missing from one dish falls back to that dish's plain name, then to any language
assert.equal(go('ru', row('order_ready', { dishes: ['Soup', 'Salad'], dishes_i18n: [{ az: 'Şorba', en: 'Soup' }, { ru: 'Салат' }] })).body, 'Soup, Салат')
assert.equal(go('ru', row('order_ready', { dishes_i18n: [{ az: 'Şorba', en: 'Soup' }] })).body, 'Şorba')
// empty or malformed i18n entries fall back to the plain names
assert.equal(go('ru', row('order_ready', { dishes: ['Soup'], dishes_i18n: [null] })).body, 'Soup')
assert.equal(go('ru', row('order_ready', { dishes: ['Soup'], dishes_i18n: 'oops' })).body, 'Soup')
assert.equal(go('ru', row('order_ready', { dishes: ['Soup'], dishes_i18n: [] })).body, 'Soup')
// more than 3 dishes still collapse, names in the recipient's language
const five = Array.from({ length: 5 }, (_, i) => ({ az: `A${i}`, en: `E${i}`, ru: `Р${i}` }))
assert.equal(go('ru', row('order_ready', { dishes_i18n: five })).body, 'Р0, Р1, Р2 и ещё 2')
assert.equal(go('en', row('order_ready', { dishes_i18n: five })).body, 'E0, E1, E2 and 2 more')
// rows from before sql/69 carry the Azerbaijani names in dishes_az / dish_name_az
assert.equal(go('az', row('order_ready', { dishes: ['Soup', 'Salad'], dishes_az: ['Şorba', 'Salat'] })).body, 'Şorba, Salat')
assert.equal(go('en', row('order_ready', { dishes: ['Soup', 'Salad'], dishes_az: ['Şorba', 'Salat'] })).body, 'Soup, Salad')
assert.equal(go('az', row('review_reply', { name: 'Aysel', dish_name: 'Soup', dish_name_az: 'Şorba' })).body.includes('Şorba'), true)
assert.equal(go('en', row('review_reply', { name: 'Aysel', dish_name: 'Soup', dish_name_az: 'Şorba' })).body.includes('Soup'), true)
// alternative plain lists are not added up
assert.equal(go('en', row('order_ready', { dishes: ['A', 'B'], dish_names: ['A', 'B'] })).body, 'A, B')

const dishI18n = { az: 'Marqarita', en: 'Margherita', ru: 'Маргарита' }
for (const type of ['review_like', 'review_reply']) {
  const p = { name: 'Aysel', dish_name: 'Margherita', dish_name_i18n: dishI18n }
  assert.ok(go('az', row(type, p)).body.includes('Marqarita'), `${type}/az`)
  assert.ok(go('en', row(type, p)).body.includes('Margherita'), `${type}/en`)
  assert.ok(go('ru', row(type, p)).body.includes('«Маргарита»'), `${type}/ru`)
  assert.ok(go('ru', row(type, { name: 'Aysel', dish_name_i18n: { az: 'Marqarita' } })).body.includes('«Marqarita»'), `${type} any language`)
  assert.ok(go('ru', row(type, { name: 'Aysel', dish_name: 'Pizza', dish_name_i18n: { az: 'Pitsa', en: 'Pizza' } })).body.includes('«Pizza»'), `${type} plain beats other language`)
}
assert.equal(go('ru', row('review_received', { dish_name: 'Margherita', dish_name_i18n: dishI18n, rating: 4 }, { audience: 'staff' })).body, 'Отзыв о «Маргарита»: 4 из 5.')
assert.equal(go('az', row('review_received', { dish_name: 'Margherita', dish_name_i18n: dishI18n, rating: 4 }, { audience: 'staff' })).body, 'Marqarita üçün 4 ulduzlu rəy gəldi.')
assert.equal(go('en', row('review_received', { dish_name_i18n: dishI18n }, { audience: 'staff' })).body, 'Margherita got a new review.')
// no dish at all still uses the plain wording
assert.equal(go('en', row('review_reply', { name: 'Aysel', dish_name_i18n: {} })).body, 'Aysel replied to your review.')

// ---- promotion (venue offer)
assert.equal(at('promotion', 'en').title, 'New offer')
assert.equal(at('promotion', 'en').body, 'Bella Roma: 2 for 1 pizza')
assert.equal(at('promotion', 'az').body, 'Bella Roma: 2 for 1 pizza')
assert.equal(at('promotion', 'ru').body, 'Bella Roma: 2 for 1 pizza')
assert.equal(at('promotion', 'ru').title, 'Новая акция')
assert.equal(at('promotion', 'en').url, 'https://rufat-server.com/restaurant/bella-roma')
assert.equal(go('en', row('promotion', { title: 'Happy hour' })).body, 'Happy hour')
assert.equal(go('en', row('promotion', {})).body, 'New promotion available!')
assert.equal(go('az', row('promotion', {})).body, 'Yeni kampaniya mövcuddur!')
assert.equal(go('ru', row('promotion', {})).body, 'Доступна новая акция!')
assert.equal(go('en', row('promotion', {})).url, 'https://rufat-server.com/notifications')
assert.equal(needsLookup(row('promotion', { title: 'x' }, { restaurant_id: 'r-1' }), { title: 'x' }).restaurant, true)
assert.equal(go('ru', row('promotion', { title: '-20%' }), { restaurantName: 'Bella Roma', restaurantSlug: 'bella-roma' }).body, 'Bella Roma: -20%')

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

console.log(`ok: ${samples.length} types x 3 languages (en, az, ru) rendered, wording and fallbacks verified`)
