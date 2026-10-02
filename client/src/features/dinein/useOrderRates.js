import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { DEFAULT_SERVICE_RATE, DEFAULT_TAX_RATE, ratesFromOrders } from './pricing'

// restaurantId -> { taxRate, serviceRate } learned from the guest's own orders. A tiny external store so every
// screen sees a rate the moment place_order has answered (the next cart is exact without another read).
let known = {}
const listeners = new Set()
const asked = new Set()                       // `${userId}:${restaurantId}` reads already made (also when they found nothing)

const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn) }
const snapshot = () => known

/** Remember the rates of a restaurant (from place_order's answer or an earlier order). */
export function rememberRates(restaurantId, rates) {
  if (!restaurantId || !rates) return
  const prev = known[restaurantId]
  if (prev && prev.taxRate === rates.taxRate && prev.serviceRate === rates.serviceRate) return
  known = { ...known, [restaurantId]: { taxRate: rates.taxRate, serviceRate: rates.serviceRate } }
  listeners.forEach(fn => fn())
}

/**
 * { taxRate, serviceRate, exact } for the restaurant of the cart. `exact` is false while the rates are the server
 * defaults (the guest has no earlier order here to read them from); the cart then says the amount is an estimate.
 * Reads the guest's last orders at that restaurant once (RLS: own orders only).
 */
export function useOrderRates(restaurantId) {
  const { session } = useAuth()
  const userId = session?.user?.id || null
  const rates = useSyncExternalStore(subscribe, snapshot)[restaurantId]

  useEffect(() => {
    if (!restaurantId || !userId || known[restaurantId]) return
    const key = `${userId}:${restaurantId}`
    if (asked.has(key)) return
    asked.add(key)
    supabase
      .from('orders')
      .select('subtotal, tax_amount, service_charge')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userId)
      .gt('subtotal', 0)
      .order('placed_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) { asked.delete(key); return }       // try again the next time the cart opens
        rememberRates(restaurantId, ratesFromOrders(data))
      }, () => { asked.delete(key) })
  }, [restaurantId, userId])

  return rates
    ? { ...rates, exact: true }
    : { taxRate: DEFAULT_TAX_RATE, serviceRate: DEFAULT_SERVICE_RATE, exact: false }
}
