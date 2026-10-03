import { useCallback, useRef, useState } from 'react'
import { canAccess } from '../../lib/roles'
import { rotateTableCodes } from './api'

// Rotating table codes (sql/55) is for managers and admins, the same roles that may open the QR sheet.
// UX only: the RPC refuses everyone else with `not_allowed`.
export const canRotateCodes = role => canAccess(role, '/qr-sheet')

/**
 * `rotate(tableId)` calls the rotate RPC (tableId null = every table) and resolves { data, error }, or
 * { skipped: true } when a rotation is already running, so a double click or tap can never send it twice.
 * `busy` is true while it runs; use it to disable the buttons.
 */
export function useRotateCodes(restaurantId) {
  const [busy, setBusy] = useState(false)
  const running = useRef(false)

  const rotate = useCallback(async (tableId = null) => {
    if (running.current) return { skipped: true, data: null, error: null }
    running.current = true
    setBusy(true)
    try {
      return await rotateTableCodes(restaurantId, tableId)
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [restaurantId])

  return { rotate, busy }
}
