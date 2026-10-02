// Every Supabase call of the floor feature lives here. Functions return { data, error } and never throw.
//
// CONTRACT (sql/49, docs/V2-CONTRACT.md):
//   rpc floor_plan(p_restaurant_id) ->
//     { restaurant_id, sections: [{ id, name }],
//       tables: [{ id, table_number, capacity, state, section_id, section, x, y, w, h, shape, occupied_seats: [n...] }] }
//     Canvas 100 x 64 units, x/y = top-left corner (null when the dashboard has not placed the table: the layout
//     packs those in a grid), w/h default 12, occupied_seats is [] unless the table is occupied / ordering /
//     awaiting_payment. Anon may call it. Error: restaurant_not_found.
//   rpc my_table_session() -> { table_id, seat_no, ... } or null
//   seat QR codes are derived: `<table access code>-S<n>`, n = 1..capacity (claim_table errors `seat_taken`).
// Until sql/49 is applied the RPC does not exist: fetchFloorPlan then reads the legacy `tables` columns
// (pos_x ...) so the plan still draws, with `seatInfo: false` (no per-seat data, so the UI shows no counts).
import { supabase } from '../../lib/supabase'

const NOT_DEPLOYED = ['PGRST202', 'PGRST205', '42883', '42P01', '42703']
const SHAPES = ['square', 'round', 'rect']

const num = v => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** One table of the contract -> the view-model the layout and the UI use. */
export function mapTable(row, seatInfo = true) {
  const capacity = Math.max(1, Math.floor(Number(row.capacity) || 0) || 1)
  const taken = Array.isArray(row.occupied_seats) ? row.occupied_seats : []
  const occupiedSeats = [...new Set(taken.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= capacity))]
    .sort((a, b) => a - b)
  return {
    id: row.id,
    number: String(row.table_number ?? ''),
    capacity,
    state: row.state || 'free',
    sectionId: row.section_id || '',
    x: num(row.x), y: num(row.y), w: num(row.w), h: num(row.h),
    shape: SHAPES.includes(row.shape) ? row.shape : 'square',
    occupiedSeats,
    seatInfo, // false: the plan came from the legacy columns, chairs are unknown
  }
}

function mapPlan(raw, seatInfo) {
  const sections = (raw?.sections || []).map(s => ({ id: s.id, name: String(s.name || '') }))
  const tables = (raw?.tables || []).map(row => mapTable(row, seatInfo))
  return { sections, tables, seatInfo }
}

async function legacyPlan(restaurantId) {
  const { data, error } = await supabase
    .from('tables')
    .select('id, table_number, capacity, state, shape, pos_x, pos_y, pos_w, pos_h, section_id, sections(id, name)')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
  if (error) return { data: null, error }
  const sections = []
  for (const t of data || []) {
    if (t.sections && !sections.some(s => s.id === t.sections.id)) sections.push({ id: t.sections.id, name: t.sections.name })
  }
  const tables = (data || []).map(t => ({
    id: t.id, table_number: t.table_number, capacity: t.capacity, state: t.state, section_id: t.section_id,
    x: t.pos_x, y: t.pos_y, w: t.pos_w, h: t.pos_h, shape: t.shape, occupied_seats: [],
  }))
  return { data: mapPlan({ sections, tables }, false), error: null }
}

/** The floor of one restaurant: { sections, tables, seatInfo }. */
export async function fetchFloorPlan(restaurantId) {
  try {
    const { data, error } = await supabase.rpc('floor_plan', { p_restaurant_id: restaurantId })
    if (!error) return { data: mapPlan(data, true), error: null }
    if (NOT_DEPLOYED.includes(error.code) || error.status === 404) return await legacyPlan(restaurantId)
    return { data: null, error }
  } catch (err) {
    return { data: null, error: err }
  }
}

/** Where the signed-in guest sits: { tableId, seatNo|null }, or null (no session, signed out, or any error). */
export async function fetchMySeat() {
  try {
    const { data, error } = await supabase.rpc('my_table_session')
    if (error || !data) return null
    const seat = Number(data.seat_no)
    return { tableId: data.table_id, seatNo: Number.isInteger(seat) && seat > 0 ? seat : null }
  } catch {
    return null
  }
}

let channelSeq = 0

/** Live changes of the restaurant's tables (scoped by restaurant_id, never cross-tenant).
 *  Returns an unsubscribe function. `onStatus(true|false)` reports whether the channel is up. */
export function subscribeFloor(restaurantId, onChange, onStatus) {
  try {
    const channel = supabase
      .channel(`fl-floor-${restaurantId}-${++channelSeq}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${restaurantId}`,
      }, onChange)
      .subscribe(status => onStatus?.(status === 'SUBSCRIBED'))
    return () => { try { supabase.removeChannel(channel) } catch { /* already gone */ } }
  } catch {
    return () => {}
  }
}
