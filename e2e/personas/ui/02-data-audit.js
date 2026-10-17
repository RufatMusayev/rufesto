'use strict'
// Read-only audit of what the week holds for Bella Roma, as Leyla would see it through RLS (so the UI numbers can be compared).
const C = require('./common')

;(async () => {
  const L = await C.login('Leyla')
  const api = C.makeApi(L)
  const now = new Date()
  console.log('now UTC', now.toISOString(), 'Baku', new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baku', dateStyle: 'short', timeStyle: 'medium' }).format(now))
  const bakuDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(new Date(d))
  const orders = await api.rows(`orders?restaurant_id=eq.${C.BELLA}&select=id,status,total_amount,placed_at,table_id,user_id&order=placed_at.desc&limit=500`)
  console.log('orders total', orders.length)
  const byDay = {}
  for (const o of orders) {
    const d = bakuDay(o.placed_at)
    byDay[d] = byDay[d] || { n: 0, sum: 0, st: {} }
    byDay[d].n++; byDay[d].st[o.status] = (byDay[d].st[o.status] || 0) + 1
    if (!['cancelled', 'refunded'].includes(o.status)) byDay[d].sum += Number(o.total_amount)
  }
  console.log('orders per Baku day', JSON.stringify(byDay, null, 1))
  const bills = await api.rows(`bills?restaurant_id=eq.${C.BELLA}&select=id,status,total_amount,created_at,paid_at,tip_amount&order=created_at.desc&limit=300`).catch(() => [])
  console.log('bills', bills.length, bills[0] ? Object.keys(bills[0]).join(',') : '')
  const bd = {}
  for (const b of bills) { const d = bakuDay(b.paid_at || b.created_at); bd[d] = bd[d] || { n: 0, st: {}, sum: 0 }; bd[d].n++; bd[d].st[b.status] = (bd[d].st[b.status] || 0) + 1; bd[d].sum += Number(b.total_amount || 0) }
  console.log('bills per day', JSON.stringify(bd))
  const bookings = await api.rows(`bookings?restaurant_id=eq.${C.BELLA}&select=id,status,starts_at,party_size,created_at&order=starts_at.desc&limit=100`).catch(() => [])
  console.log('bookings', bookings.length, JSON.stringify(bookings.slice(0, 3)))
  const bk = {}
  for (const b of bookings) { const d = bakuDay(b.starts_at || b.created_at); bk[d] = bk[d] || {}; bk[d][b.status] = (bk[d][b.status] || 0) + 1 }
  console.log('bookings per day', JSON.stringify(bk))
  const tips = await api.get(`rpc/dummy`).catch(() => null)
  const tbl = await api.rows(`tables?restaurant_id=eq.${C.BELLA}&select=id,table_number,state,capacity,is_active&order=table_number`)
  console.log('tables', JSON.stringify(tbl.map(t => `${t.table_number}:${t.state}:${t.capacity}:${t.is_active}`)))
  const dishes = await api.rows(`dishes?restaurant_id=eq.${C.BELLA}&select=id,name,category,price,available&order=category,name`)
  console.log('dishes', dishes.length, JSON.stringify(dishes.map(d => `${d.name}|${d.category}|${d.price}|${d.available}`)))
  const tk = await api.rows(`kds_tickets?restaurant_id=eq.${C.BELLA}&status=in.(new,preparing,ready)&select=id,status`)
  console.log('active tickets', tk.length)
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
