// Single source of truth for staff-role -> dashboard route access.
// UX only: the DB still enforces every write (menu/promos require
// is_manager_of, the waiter RPCs require _floor_staff_id, etc). This just
// keeps staff from opening pages their role has no business seeing.
import { V2_ROLE_ROUTES } from '../features/v2/roles'

// v2 pages (features/v2: /bills, /tips, /my-tips, /settings, /qr-sheet) are added per role from
// the feature's own map (decision D-9): bills and tips for admin, manager and cashier, my-tips for
// every floor role (waiter, host, cashier, manager, admin);
// settings and the QR sheet for admin and manager. Kitchen gets none.
const v2 = role => V2_ROLE_ROUTES[role] || []

export const ALL_PAGES = ['/', '/orders', '/kds', '/tables', '/menu', '/promos', '/bookings', '/waiter', ...v2('admin')]

export const ROLE_ROUTES = {
  admin:   ALL_PAGES,
  manager: ['/', '/orders', '/kds', '/tables', '/menu', '/promos', '/bookings', '/waiter', ...v2('manager')],
  waiter:  ['/waiter', '/tables', '/orders', ...v2('waiter')],
  host:    ['/waiter', '/tables', '/bookings', ...v2('host')],
  cashier: ['/waiter', '/orders', '/tables', ...v2('cashier')],
  // Kitchen works the ticket queue only (TARGET-ARCHITECTURE 17.2: "kitchen:
  // tickets only").
  kitchen: ['/kds', ...v2('kitchen')],
}

export const ROLE_HOME = {
  admin:   '/',
  manager: '/',
  waiter:  '/waiter',
  host:    '/waiter',
  cashier: '/waiter',
  kitchen: '/kds',
}

/** The role's landing page, or null for a role with no route map (unknown role). */
export function homeFor(role) {
  return ROLE_HOME[role] || null
}

// React Router matches routes case-insensitively and ignores a trailing slash,
// so '/Orders/' renders the orders page; compare the same way, otherwise a
// permitted page is refused for how its URL was typed.
function normalisePath(path) {
  const p = String(path || '').toLowerCase().replace(/\/+$/, '')
  return p === '' ? '/' : p
}

/** Whether `role` may open `path`. Unknown roles can access nothing. */
export function canAccess(role, path) {
  const routes = ROLE_ROUTES[role]
  return Array.isArray(routes) && routes.includes(normalisePath(path))
}

// What each staff role may WRITE, mirrored from the database role matrix (sql/52b, V2-CONTRACT 12.2). UX only:
// the DB refuses everything else (forbidden_status_change, RLS), so the dashboard just hides the buttons.
//   orderFlow    orders.status other than paid / refunded (served, cancelled)
//   orderPaid    orders.status -> paid (the cashier can do nothing else to an order)
//   tableState   tables.state (a cashier or kitchen write is refused by policy)
const ROLE_CAN = {
  orderFlow:  ['admin', 'manager', 'waiter', 'host'],
  orderPaid:  ['admin', 'manager', 'cashier'],
  tableState: ['admin', 'manager', 'waiter', 'host'],
}

/** Whether `role` may perform `action` (see ROLE_CAN). Unknown roles and actions can do nothing. */
export function roleCan(role, action) {
  return (ROLE_CAN[action] || []).includes(role)
}
