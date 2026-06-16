import { createContext, useContext, useReducer, useState } from 'react'
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
  const { session }           = useAuth()

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
      setCartError('This table is at a different restaurant. You can only order from the restaurant your table belongs to.')
      return
    }
    setCartError('')
    dispatch({ type: 'ADD', dish })
    setOpen(true)
  }

  function clearCartError() {
    setCartError('')
  }

  function setTable(tableId, restaurantId, activeBookingId = null) {
    dispatch({ type: 'SET_TABLE', tableId, restaurantId, activeBookingId })
    saveSession(tableId, restaurantId, activeBookingId)
    // Reflect the live session on the restaurant dashboard: free/reserved -> occupied.
    supabase.from('tables').update({ state: 'occupied' })
      .eq('id', tableId).in('state', ['free', 'reserved'])
      .then(() => {})
  }

  function clearTable(release = false) {
    const tid = state.tableId
    // On an explicit end (not when staff already freed the table), mark it cleared
    // so the dashboard stops showing the guest as seated.
    if (release && tid) {
      supabase.from('tables').update({ state: 'cleared' })
        .eq('id', tid).neq('state', 'free')
        .then(() => {})
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
      clearTable,
      placeOrder,
      clear: () => dispatch({ type: 'CLEAR' }),
    }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
