'use strict'
// The cast of the demo world: ten venues and sixteen diners with their habits. Pure data, no network.
// Accounts (names, e-mails, passwords) come from the DEMO_ACCOUNTS file; diners are matched by FIRST NAME.

const ID = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`

// kind: 'restaurant' (dinner, 2-5), 'coffee' (morning, 1-2), 'quick' (lunch, 1-3). lang = language of the venue's own posts.
const VENUES = {
  bella:   { key: 'bella',   id: ID(1),  name: 'Trattoria Bella Roma', kind: 'restaurant', cuisine: 'Italian',     lang: 'en' },
  seda:    { key: 'seda',    id: ID(2),  name: 'Səda Ocağı',           kind: 'restaurant', cuisine: 'Azerbaijani', lang: 'az' },
  sakura:  { key: 'sakura',  id: ID(3),  name: 'Sakura House',         kind: 'restaurant', cuisine: 'Japanese',    lang: 'en' },
  fincan:  { key: 'fincan',  id: ID(4),  name: 'Fincan Coffee',        kind: 'coffee',     cuisine: 'Coffee shop', lang: 'en' },
  brew:    { key: 'brew',    id: ID(5),  name: 'Brew & Books',         kind: 'coffee',     cuisine: 'Brunch cafe', lang: 'en' },
  doner:   { key: 'doner',   id: ID(6),  name: 'Dönər Bakı Express',   kind: 'quick',      cuisine: 'Doner',       lang: 'az' },
  burger:  { key: 'burger',  id: ID(7),  name: 'Burger Qala',          kind: 'quick',      cuisine: 'Burgers',     lang: 'az' },
  shirvan: { key: 'shirvan', id: ID(8),  name: 'Şirvan Mətbəxi',       kind: 'restaurant', cuisine: 'Azerbaijani', lang: 'az' },
  tiflis:  { key: 'tiflis',  id: ID(9),  name: 'Tiflis Dvor',          kind: 'restaurant', cuisine: 'Georgian',    lang: 'ru' },
  meze:    { key: 'meze',    id: ID(10), name: 'Meze Istanbul',        kind: 'restaurant', cuisine: 'Turkish',     lang: 'en' },
}
const VENUE_KEYS = Object.keys(VENUES)
const SLOT_VENUES = { morning: ['fincan', 'brew'], lunch: ['doner', 'burger'], dinner: ['bella', 'seda', 'sakura', 'shirvan', 'tiflis', 'meze'] }

// likes = how much the person likes each venue (weights); weight = how often they go out; lang = review/comment language mix;
// review = chance to review after a visit; tip = [min %, max %] on a card payment; pay = 'card' or 'mixed' (card or reception);
// poster = posts a photo after a visit; follow = venues followed on day one.
const D = (cluster, o) => ({ cluster, weight: 1, review: 0.6, tip: [5, 10], pay: 'mixed', poster: false, lang: { en: 0.4, az: 0.5, ru: 0.1 }, follow: [], ...o })
const DINERS = {
  'Aysel':    D('A', { weight: 1.3, review: 0.8, poster: true, lang: { en: 0.5, az: 0.4, ru: 0.1 }, likes: { bella: 5, sakura: 2, brew: 2, tiflis: 1, meze: 1 }, follow: ['bella', 'sakura', 'brew', 'tiflis'] }),
  'Nicat':    D('A', { weight: 1, review: 0.6, lang: { en: 0.4, az: 0.6, ru: 0 }, likes: { sakura: 5, bella: 2, burger: 2, doner: 1 }, follow: ['sakura', 'bella', 'burger'] }),
  'Könül':    D('A', { weight: 1.2, review: 0.95, poster: true, lang: { en: 0.4, az: 0.6, ru: 0 }, likes: { bella: 2, seda: 2, sakura: 2, tiflis: 2, brew: 2, meze: 2 }, follow: ['bella', 'seda', 'sakura', 'tiflis', 'meze'] }),
  'Səbinə':   D('A', { weight: 1, review: 0.7, poster: true, dessert: true, lang: { en: 0.3, az: 0.7, ru: 0 }, likes: { brew: 4, fincan: 3, bella: 3 }, follow: ['brew', 'fincan', 'bella'] }),
  'Zaur':     D('C', { weight: 0.9, review: 0.6, lang: { en: 0.1, az: 0.9, ru: 0 }, likes: { seda: 4, shirvan: 4, tiflis: 1 }, follow: ['seda', 'shirvan', 'tiflis', 'meze'] }),
  'Nərmin':   D('C', { weight: 0.9, review: 0.6, lang: { en: 0.5, az: 0.5, ru: 0 }, likes: { bella: 2, sakura: 2, seda: 2, meze: 3 }, follow: ['bella', 'sakura', 'meze'] }),
  'Elçin':    D('C', { weight: 1, review: 0.5, split: 'equal', lang: { en: 0.1, az: 0.6, ru: 0.3 }, likes: { doner: 3, burger: 3, shirvan: 2, seda: 2 }, follow: ['doner', 'burger', 'shirvan'] }),
  'Lamiyə':   D('B', { weight: 1.6, review: 0.6, lang: { en: 0.6, az: 0.4, ru: 0 }, likes: { fincan: 6, brew: 3, bella: 0.5 }, follow: ['fincan', 'brew', 'bella'] }),
  'Kamilla':  D('B', { weight: 1, review: 0.75, poster: true, lang: { en: 0.3, az: 0.1, ru: 0.6 }, likes: { brew: 5, fincan: 2, meze: 1, bella: 1 }, follow: ['brew', 'fincan', 'meze'] }),
  'Günay':    D('B', { weight: 1, review: 0.7, vegetarian: true, saves: true, lang: { en: 0.5, az: 0.5, ru: 0 }, likes: { brew: 3, tiflis: 2, meze: 3, bella: 2, fincan: 2 }, follow: ['brew', 'meze', 'tiflis'] }),
  'Tofiq':    D('D', { weight: 1.3, review: 0.4, tip: [5, 7], lang: { en: 0.1, az: 0.5, ru: 0.4 }, likes: { doner: 4, burger: 4, fincan: 1 }, follow: ['doner', 'burger'] }),
  'Ceyhun':   D('D', { weight: 1, review: 0.7, poster: true, lang: { en: 0.1, az: 0.4, ru: 0.5 }, likes: { tiflis: 5, meze: 5, doner: 1 }, follow: ['tiflis', 'meze', 'doner'] }),
  'Emin':     D('D', { weight: 0.9, review: 0.25, lang: { en: 0.1, az: 0.5, ru: 0.4 }, likes: { doner: 2, burger: 2, tiflis: 2, shirvan: 2, fincan: 1 }, follow: ['doner', 'burger', 'fincan', 'tiflis', 'shirvan'] }),
  'Rauf':     D('X', { weight: 0.8, review: 0.5, pay: 'card', tip: [10, 12], payAll: true, lang: { en: 0.5, az: 0.5, ru: 0 }, likes: { bella: 2, sakura: 3, seda: 2, meze: 2 }, follow: ['sakura', 'seda', 'meze'] }),
  'Fərid':    D(null, { weight: 0.8, review: 0.5, lang: { en: 0.1, az: 0.5, ru: 0.4 }, likes: { doner: 3, burger: 3, shirvan: 2, fincan: 1 }, follow: ['doner', 'burger', 'shirvan'] }),
  'Mehriban': D(null, { weight: 0.3, review: 0, lang: { en: 0.3, az: 0.7, ru: 0 }, likes: { fincan: 2, brew: 2, bella: 1 }, follow: ['fincan', 'brew'] }),
}
const DINER_NAMES = Object.keys(DINERS)

// Friendships: the four clusters plus three links across. Fərid and Mehriban have none.
const CLUSTERS = [['Aysel', 'Nicat', 'Könül', 'Səbinə'], ['Zaur', 'Nərmin', 'Elçin'], ['Lamiyə', 'Kamilla', 'Günay'], ['Tofiq', 'Ceyhun', 'Emin']]
const CROSS_LINKS = [['Aysel', 'Kamilla'], ['Ceyhun', 'Elçin'], ['Rauf', 'Zaur']]
const FRIEND_PAIRS = [
  ...CLUSTERS.flatMap(c => c.flatMap((a, i) => c.slice(i + 1).map(b => [a, b]))),
  ...CROSS_LINKS,
]
const FRIENDS = {}
for (const [a, b] of FRIEND_PAIRS) { (FRIENDS[a] = FRIENDS[a] || []).push(b); (FRIENDS[b] = FRIENDS[b] || []).push(a) }
const friendsOf = name => FRIENDS[name] || []

// Only used by --dry-run when no DEMO_ACCOUNTS file is given: the staff the PM's seed script creates (first name, role, venue).
const FALLBACK_STAFF = [
  ['Leyla', 'manager', 'bella'], ['Orxan', 'waiter', 'bella'], ['Günel', 'waiter', 'bella'], ['Tural', 'kitchen', 'bella'], ['Nigar', 'cashier', 'bella'],
  ['Elvin', 'manager', 'seda'], ['Aygün', 'waiter', 'seda'], ['Rəşad', 'waiter', 'seda'], ['Kamran', 'kitchen', 'seda'], ['Sevinc', 'host', 'seda'],
  ['Yuki', 'manager', 'sakura'], ['Fidan', 'waiter', 'sakura'], ['Murad', 'waiter', 'sakura'], ['Kenji', 'kitchen', 'sakura'], ['Lalə', 'cashier', 'sakura'],
  ['Səid', 'manager', 'fincan'], ['Ülviyyə', 'waiter', 'fincan'], ['Ramin', 'cashier', 'fincan'],
  ['Aynur', 'manager', 'brew'], ['Cavid', 'waiter', 'brew'], ['Pərvin', 'kitchen', 'brew'],
  ['Mehmet', 'manager', 'doner'], ['Anar', 'cashier', 'doner'], ['Vüsal', 'kitchen', 'doner'],
  ['Toğrul', 'manager', 'burger'], ['İlkin', 'cashier', 'burger'], ['Samir', 'kitchen', 'burger'],
  ['Şahin', 'manager', 'shirvan'], ['Gülnar', 'waiter', 'shirvan'], ['Elnur', 'waiter', 'shirvan'], ['Xanım', 'kitchen', 'shirvan'], ['Arzu', 'host', 'shirvan'],
  ['Nino', 'manager', 'tiflis'], ['Giorgi', 'waiter', 'tiflis'], ['Ruslan', 'waiter', 'tiflis'], ['Lela', 'kitchen', 'tiflis'],
  ['Emre', 'manager', 'meze'], ['Aydan', 'waiter', 'meze'], ['Kənan', 'waiter', 'meze'], ['Selin', 'kitchen', 'meze'],
]

module.exports = { VENUES, VENUE_KEYS, SLOT_VENUES, DINERS, DINER_NAMES, CLUSTERS, CROSS_LINKS, FRIEND_PAIRS, friendsOf, FALLBACK_STAFF }
