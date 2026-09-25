import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const CartContext = createContext(null)

function loadSession() {
  try {
    const raw = sessionStorage.getItem('rufesto_table_session')
    return raw ? JSON.parse(raw) : { tableId: null, restaurantId: null, activeBookingId: null }
  } catch { return { tableId: null, restaurantId: null, activeBookingId: null } }
}

function saveSession(tableId, restaurantId, activeBookingId) {
  sessionStorage.setItem('rufesto_table_session', JSON.stringify({ tableId, restaurantId, activeBookingId }))
}

function clearSession() {
  sessionStorage.removeItem('rufesto_table_session')
}

const savedSession = loadSession()

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD': {
      const existing = state.items.find(i => i.dish.id === action.dish.id)
      if (existing) {
        return { ...state, items: state.items.map(i =>
          i.dish.id === action.dish.id ? { ...i, qty: i.qty + 1 } : i
        )}
      }
      return { ...state, items: [...state.items, { dish: action.dish, qty: 1 }] }
    }
    case 'REMOVE':
      return { ...state, items: state.items.filter(i => i.dish.id !== action.dishId) }
    case 'DEC': {
      const item = state.items.find(i => i.dish.id === action.dishId)
      if (!item || item.qty <= 1) {
        return { ...state, items: state.items.filter(i => i.dish.id !== action.dishId) }
      }
      return { ...state, items: state.items.map(i =>
        i.dish.id === action.dishId ? { ...i, qty: i.qty - 1 } : i
      )}
    }
    case 'CLEAR':
      return { ...state, items: [] }
    case 'SET_TABLE':
      return { ...state, tableId: action.tableId, restaurantId: action.restaurantId, activeBookingId: action.activeBookingId }
    case 'CLEAR_TABLE':
      return { ...state, tableId: null, restaurantId: null, activeBookingId: null, items: [] }
    default:
      return state
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    tableId: savedSession.tableId,
    restaurantId: savedSession.restaurantId,
    activeBookingId: savedSession.activeBookingId,
  })
  const [open, setOpen]       = useState(false)
  const [placing, setPlacing] = useState(false)
  const [cartError, setCartError] = useState('')
  const { session, loading: authLoading } = useAuth()
  const { t } = useTranslation('cart')
  const validatedRef = useRef(false)

  const total    = state.items.reduce((s, i) => s + (Number(i.dish.price) || 0) * i.qty, 0)
  const itemCount = state.items.reduce((s, i) => s + i.qty, 0)

  function addDish(dish) {
    // Block cross-restaurant adds when a table session is active
    if (
      state.tableId &&
      dish.restaurant_id &&
      state.restaurantId &&
      dish.restaurant_id !== state.restaurantId
    ) {
      setCartError(t('crossRestaurantError'))
      return
    }
    setCartError('')
    dispatch({ type: 'ADD', dish })
    setOpen(true)
  }

  function clearCartError() {
    setCartError('')
  }

  // Sets the local session only. Table state itself is now owned server-side by the
  // claim_table() RPC (see claimTable below) — consumers no longer UPDATE `tables` directly.
  function setTable(tableId, restaurantId, activeBookingId = null) {
    dispatch({ type: 'SET_TABLE', tableId, restaurantId, activeBookingId })
    saveSession(tableId, restaurantId, activeBookingId)
  }

  // Claims a table by scanned QR token or typed access code via the claim_table RPC,
  // which also seats the caller's own booking for that table server-side.
  async function claimTable(code) {
    const { data, error } = await supabase.rpc('claim_table', { p_code: code })
    if (error) return { error }
    setTable(data.table_id, data.restaurant_id, data.booking_id)
    return { data }
  }

  async function clearTable(release = false) {
    const tid = state.tableId
    // On an explicit end (not when staff already freed the table), ask the server to
    // free the table — never UPDATE `tables` directly from the client.
    if (release && tid) {
      // Builder has no .catch(); errors come back as { error } and are ignored here.
      await supabase.rpc('leave_table', { p_table_id: tid })
    }
    dispatch({ type: 'CLEAR_TABLE' })
    clearSession()
  }

  async function placeOrder(restaurantId, tableId, bookingId = null) {
    if (!session || state.items.length === 0) return { error: 'Not ready' }
    setPlacing(true)

    const subtotal = total

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        restaurant_id: restaurantId,
        table_id:      tableId,
        user_id:       session.user.id,
        booking_id:    bookingId,
        status:        'open',
        subtotal,
        tax_amount:     0,
        service_charge: 0,
        total_amount:   subtotal,
        placed_at:     new Date().toISOString(),
      })
      .select()
      .single()

    if (orderErr) { setPlacing(false); return { error: orderErr.message } }

    const orderItems = state.items.map(i => ({
      order_id:   order.id,
      dish_id:    i.dish.id,
      quantity:   i.qty,
      unit_price: i.dish.price,
    }))

    const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)

    if (itemsErr) {
      await supabase.from('orders').delete().eq('id', order.id)
      setPlacing(false)
      return { error: itemsErr.message }
    }

    setPlacing(false)
    dispatch({ type: 'CLEAR' })
    setOpen(false)
    return { order }
  }

  // On app load, if sessionStorage carried a table session over, confirm it's still
  // valid server-side (RLS may have expired/released it) and clear it locally if not.
  useEffect(() => {
    if (authLoading || validatedRef.current) return
    validatedRef.current = true
    if (!state.tableId) return
    if (!session) {
      dispatch({ type: 'CLEAR_TABLE' })
      clearSession()
      return
    }
    let cancelled = false
    supabase.rpc('my_table_session').then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        dispatch({ type: 'CLEAR_TABLE' })
        clearSession()
      } else {
        dispatch({ type: 'SET_TABLE', tableId: data.table_id, restaurantId: data.restaurant_id, activeBookingId: data.booking_id })
        saveSession(data.table_id, data.restaurant_id, data.booking_id)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session])

  return (
    <CartContext.Provider value={{
      items: state.items, total, itemCount,
      tableId: state.tableId, restaurantId: state.restaurantId, activeBookingId: state.activeBookingId,
      open, setOpen,
      placing,
      cartError, clearCartError,
      addDish,
      remove:    (dishId) => dispatch({ type: 'REMOVE', dishId }),
      decrement: (dishId) => dispatch({ type: 'DEC',    dishId }),
      setTable,
      claimTable,
      clearTable,
      placeOrder,
      clear: () => dispatch({ type: 'CLEAR' }),
    }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
