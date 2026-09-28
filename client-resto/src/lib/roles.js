// Single source of truth for staff-role -> dashboard route access.
// UX only: the DB still enforces every write (menu/promos require
// is_manager_of, the waiter RPCs require _floor_staff_id, etc). This just
// keeps staff from opening pages their role has no business seeing.

export const ALL_PAGES = ['/', '/orders', '/kds', '/tables', '/menu', '/promos', '/bookings', '/waiter']

export const ROLE_ROUTES = {
  admin:   ALL_PAGES,
  manager: ALL_PAGES,
  waiter:  ['/waiter', '/tables', '/orders'],
  host:    ['/waiter', '/tables', '/bookings'],
  cashier: ['/waiter', '/orders', '/tables'],
  kitchen: ['/kds', '/orders'],
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

/** Whether `role` may open `path`. Unknown roles can access nothing. */
export function canAccess(role, path) {
  const routes = ROLE_ROUTES[role]
  return Array.isArray(routes) && routes.includes(path)
}
