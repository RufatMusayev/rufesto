import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { ratesFromAnswer } from '../features/dinein/pricing'
import { rememberRates } from '../features/dinein/useOrderRates'

const CartContext = createContext(null)

function loadSession() {
  try {
    const raw = sessionStorage.getItem('rufesto_table_session')
    return raw ? JSON.parse(raw) : { tableId: null, restaurantId: null, activeBookingId: null, sessionStatus: null, isHost: false, seatNo: null }
  } catch { return { tableId: null, restaurantId: null, activeBookingId: null, sessionStatus: null, isHost: false, seatNo: null } }
}

function saveSession(tableId, restaurantId, activeBookingId, sessionStatus, isHost, seatNo) {
  sessionStorage.setItem('rufesto_table_session', JSON.stringify({ tableId, restaurantId, activeBookingId, sessionStatus, isHost, seatNo }))
}

// The chair (table_sessions.seat_no) as a positive integer, or null (no chair / unknown).
function normSeat(v) {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
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
      return {
        ...state,
        tableId: action.tableId,
        restaurantId: action.restaurantId,
        activeBookingId: action.activeBookingId,
        sessionStatus: action.sessionStatus ?? null,
        isHost: action.isHost ?? false,
        // Start of this visit (table_sessions.started_at). `undefined` = caller doesn't know:
        // keep the known value for the same table, otherwise unknown (null).
        startedAt: action.startedAt !== undefined
          ? action.startedAt
          : (action.tableId === state.tableId ? state.startedAt : null),
        // The chair of this session (claim_table / my_table_session seat_no). `undefined` = caller doesn't know.
        seatNo: action.seatNo !== undefined
          ? action.seatNo
          : (action.tableId === state.tableId ? state.seatNo : null),
      }
    case 'SET_STARTED_AT':
      return { ...state, startedAt: action.startedAt }
    case 'CLEAR_TABLE':
      return { ...state, tableId: null, restaurantId: null, activeBookingId: null, sessionStatus: null, isHost: false, startedAt: null, seatNo: null, items: [] }
    default:
      return state
  }
}

// Maps place_order's RAISE EXCEPTION texts to translated messages (cart namespace).
function placeOrderErrorMessage(error, t) {
  const msg = error?.message || ''
  if (msg.includes('no_session'))       return t('errNoSession')
  if (msg.includes('empty_order'))      return t('errEmptyOrder')
  if (msg.includes('dish_unavailable')) return t('errDishUnavailable')
  console.error('place_order failed:', msg)
  return t('errPlaceFailed')
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    tableId: savedSession.tableId,
    restaurantId: savedSession.restaurantId,
    activeBookingId: savedSession.activeBookingId,
    sessionStatus: savedSession.sessionStatus ?? null,
    isHost: savedSession.isHost ?? false,
    seatNo: normSeat(savedSession.seatNo),
    // Not persisted: my_table_session() is the source of truth and re-supplies it on load.
    startedAt: null,
  })
  const stateRef = useRef(state)
  stateRef.current = state
  const [open, setOpen]       = useState(false)
  const [placing, setPlacing] = useState(false)
  const [cartError, setCartError] = useState('')
  const { session, loading: authLoading } = useAuth()
  const { t } = useTranslation('cart')
  // false until the first my_table_session() read of this sign-in has answered (pages that need to know
  // "is this guest seated?" wait for it instead of trusting an empty sessionStorage in a fresh tab).
  const [synced, setSynced] = useState(false)
  // epochRef counts local table changes (claim / leave); syncSeqRef counts server reads. A read applies only if
  // nothing newer happened meanwhile, so a slow answer never undoes a fresh claim or a newer read.
  const epochRef = useRef(0)
  const syncSeqRef = useRef(0)
  const lastReadRef = useRef(0)       // when the last server read answered (ms), see ensureTableSession
  const userId = session?.user?.id || null

  const total    = state.items.reduce((s, i) => s + (Number(i.dish.price) || 0) * i.qty, 0)
  const itemCount = state.items.reduce((s, i) => s + i.qty, 0)

  function addDish(dish) {
    // A guest still waiting on host approval has no write access to orders (RLS
    // rejects the insert) — block it client-side too so the UI stays honest.
    if (state.sessionStatus === 'pending') {
      setCartError(t('pendingBlocked'))
      return
    }
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
  // `seatNo` (optional, last): the guest's chair; left out = keep the one known for the same table.
  function setTable(tableId, restaurantId, activeBookingId = null, sessionStatus = null, isHost = false, startedAt, seatNo) {
    epochRef.current += 1
    const seat = seatNo !== undefined
      ? normSeat(seatNo)
      : (tableId === stateRef.current.tableId ? stateRef.current.seatNo : null)
    dispatch({ type: 'SET_TABLE', tableId, restaurantId, activeBookingId, sessionStatus, isHost, startedAt, seatNo: seat })
    saveSession(tableId, restaurantId, activeBookingId, sessionStatus, isHost, seat)
  }

  // Claims a table by scanned QR token or typed access code via the claim_table RPC,
  // which also seats the caller's own booking for that table server-side. The first
  // guest at a table becomes host (active); later guests land 'pending' until approved.
  async function claimTable(code) {
    const { data, error } = await supabase.rpc('claim_table', { p_code: code })
    if (error) return { error }
    setTable(data.table_id, data.restaurant_id, data.booking_id, data.session_status, data.is_host, data.started_at, data.seat_no ?? null)
    return { data }
  }

  // Re-reads the caller's own table session from the server (source of truth for pending/active/host and for
  // the table itself) and syncs local state: it hydrates a tab that carries nothing (new tab, other device,
  // browser restarted) and clears the table locally if the session no longer exists (e.g. the host declined,
  // or it was ended). sessionStorage is only a cache of this answer. A failed read changes nothing.
  async function refreshTableSession() {
    const mine = ++syncSeqRef.current
    const epoch = epochRef.current
    let res
    try { res = await supabase.rpc('my_table_session') } catch (error) { return { error } }
    const { data, error } = res
    if (error) return { error }
    lastReadRef.current = Date.now()
    // A newer read, or a table claimed / left in this tab meanwhile, wins over this answer.
    if (mine !== syncSeqRef.current || epoch !== epochRef.current) return { data: data ?? null }
    if (!data) {
      // Only when a table is held: CLEAR_TABLE also empties the cart, which a table-less guest may be filling.
      if (stateRef.current.tableId) {
        dispatch({ type: 'CLEAR_TABLE' })
        clearSession()
      }
      return { data: null }
    }
    setTable(data.table_id, data.restaurant_id, data.booking_id, data.session_status, data.is_host, data.started_at ?? null, data.seat_no ?? null)
    return { data }
  }

  // For the screens that only make sense when seated (/bill, /table): when no table is held, read the server once
  // more (the guest may have been seated in another tab or on another device since this tab booted), unless a
  // server read answered a moment ago. Always resolves.
  function ensureTableSession() {
    if (!userId || stateRef.current.tableId || Date.now() - lastReadRef.current < 3000) return Promise.resolve()
    return refreshTableSession().then(() => {}, () => {})
  }

  // Reads only the visit start (my_table_session().started_at) for the CURRENT table, without
  // touching or clearing the local session (the dev demo table has no server session). Used by
  // TablePage to scope the order list to this visit when a path (e.g. a booking) seated the guest
  // without supplying it. Resolves to the ISO timestamp, or null when unknown.
  async function syncStartedAt() {
    const { data, error } = await supabase.rpc('my_table_session')
    if (error || !data || data.table_id !== stateRef.current.tableId) return null
    const startedAt = data.started_at ?? null
    if (startedAt) dispatch({ type: 'SET_STARTED_AT', startedAt })
    return startedAt
  }

  async function clearTable(release = false) {
    const tid = state.tableId
    epochRef.current += 1
    // On an explicit end (not when staff already freed the table), ask the server to
    // free the table — never UPDATE `tables` directly from the client.
    if (release && tid) {
      // Builder has no .catch(); errors come back as { error } and are ignored here.
      await supabase.rpc('leave_table', { p_table_id: tid })
    }
    dispatch({ type: 'CLEAR_TABLE' })
    clearSession()
  }

  // Places the whole cart as ONE atomic server-side call (place_order RPC): the order and its
  // items are created together or not at all, so a navigation/crash mid-request can no longer
  // leave an empty open order blocking the table. Prices are resolved server-side from the
  // dishes table — only dish ids and quantities are sent. The cart stays open (CartSheet shows
  // the confirmation); the cart items are cleared on success and kept on any error so the
  // guest can simply retry.
  async function placeOrder(tableId = state.tableId) {
    if (!session || state.items.length === 0) return { error: t('notReady') }
    if (state.sessionStatus === 'pending') return { error: t('pendingBlocked') }
    setPlacing(true)

    const { data, error } = await supabase.rpc('place_order', {
      p_table_id: tableId,
      p_items: state.items.map(i => ({ dish_id: i.dish.id, qty: i.qty })),
      p_notes: null,
    })
    setPlacing(false)

    if (error) return { error: placeOrderErrorMessage(error, t) }
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.order_id) return { error: t('errPlaceFailed') }

    dispatch({ type: 'CLEAR' })
    // The server's own amounts (recalculate_order_total): the confirmation shows exactly these, and the rates behind
    // them make the next cart an exact preview instead of an estimate.
    const money = v => (v == null ? null : Number(v))
    const order = {
      id: row.order_id,
      total: Number(row.total) || 0,
      subtotal: money(row.subtotal),
      taxAmount: money(row.tax_amount),
      serviceCharge: money(row.service_charge),
    }
    rememberRates(stateRef.current.restaurantId, ratesFromAnswer({
      subtotal: order.subtotal, tax_amount: order.taxAmount, service_charge: order.serviceCharge,
    }))
    return { order }
  }

  // On app load and whenever the signed-in user changes: ask the server whether this guest is seated and make
  // the context match it (hydrate a table this tab does not know yet, drop a cached one that is gone).
  // Signed out: no table. sessionStorage only makes the first paint instant.
  useEffect(() => {
    if (authLoading) return
    if (!userId) {
      if (stateRef.current.tableId) {
        dispatch({ type: 'CLEAR_TABLE' })
        clearSession()
      }
      setSynced(true)
      return
    }
    let cancelled = false
    setSynced(false)
    refreshTableSession().finally(() => { if (!cancelled) setSynced(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userId])

  return (
    <CartContext.Provider value={{
      items: state.items, total, itemCount,
      tableId: state.tableId, restaurantId: state.restaurantId, activeBookingId: state.activeBookingId,
      sessionStatus: state.sessionStatus, isHost: state.isHost, startedAt: state.startedAt, seatNo: state.seatNo,
      // A table in hand (cache or server) is enough to render; otherwise wait for the first server read.
      tableReady: synced || !!state.tableId,
      open, setOpen,
      placing,
      cartError, clearCartError,
      addDish,
      remove:    (dishId) => dispatch({ type: 'REMOVE', dishId }),
      decrement: (dishId) => dispatch({ type: 'DEC',    dishId }),
      setTable,
      claimTable,
      refreshTableSession,
      ensureTableSession,
      syncStartedAt,
      clearTable,
      placeOrder,
      clear: () => dispatch({ type: 'CLEAR' }),
    }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)

/**
 * true while it is still unknown whether this guest is seated: auth is still loading, the first server read of the
 * app boot has not answered, or the extra read ensureTableSession makes on a visit without a table is running. /bill and
 * /table show their skeleton meanwhile instead of "Nothing to pay yet" / "No active table".
 */
export function useTableLookup() {
  const { session, loading: authLoading } = useAuth()
  const { tableId, tableReady, ensureTableSession } = useContext(CartContext)
  const userId = session?.user?.id || null
  const [asking, setAsking] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!userId || tableId) { setAsking(false); return }
    if (!tableReady) return           // the boot read is still running; its answer arrives as tableReady
    let alive = true
    ensureTableSession().then(() => { if (alive) setAsking(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userId, tableId, tableReady])

  // while auth is still loading nobody knows yet whether there is a user (hence a table) at all
  return !tableId && (authLoading || (!!userId && (asking || !tableReady)))
}
