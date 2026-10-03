import { latestInstant } from './dates'

// The printable cards of the QR sheet. A card is { id, code, table, seat }:
//   table card  seat === null   code = the table's access code           (QR /t/<code>)
//   seat card   seat = n        code = `<access code>-S<n>`, n = 1..capacity (QR /t/<code>-S<n>)
// Seat codes are derived, never stored: claim_table accepts them and ties the guest to that chair.
// Cards stay grouped by table (table card first, then its chairs) so a table's cards print together.
// `id` is the key for useQrImages / React; it is unique across table and seat cards.

export const seatCode = (code, n) => `${code}-S${n}`

/** Cards for the tables that have an access code. `perChair` adds one seat card per chair (capacity). */
export function buildQrCards(tables, perChair) {
  const cards = []
  for (const table of tables) {
    if (!table.code) continue
    cards.push({ id: table.id, code: table.code, table, seat: null })
    if (!perChair) continue
    for (let n = 1; n <= table.capacity; n += 1) {
      cards.push({ id: `${table.id}:S${n}`, code: seatCode(table.code, n), table, seat: n })
    }
  }
  return cards
}

/**
 * The QR data after `rotateTableCodes`: the rotated tables carry their new code at once, so the sheet never shows
 * (or prints) a dead QR while the refetch is still on its way. `rotated` is the api's RotatedCode[].
 */
export function applyRotatedCodes(data, rotated) {
  if (!data) return data
  const byTable = new Map(rotated.map(r => [r.tableId, r]))
  const tables = data.tables.map(tb => (byTable.has(tb.id) ? { ...tb, code: byTable.get(tb.id).code } : tb))
  return { ...data, tables, rotatedAt: latestInstant([data.rotatedAt, ...rotated.map(r => r.rotatedAt)]) }
}
