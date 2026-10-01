import nav from './nav'

// Role -> v2 routes (decision D-9): /bills admin, manager, cashier;
// /settings and /qr-sheet admin, manager. Derived from nav.js so the sidebar
// and the guard cannot disagree. The integrator merges this into
// lib/roles.js ROLE_ROUTES (see README.int.md).
export const V2_ROLE_ROUTES = {}
for (const item of nav) {
  for (const role of item.roles) {
    if (!V2_ROLE_ROUTES[role]) V2_ROLE_ROUTES[role] = []
    V2_ROLE_ROUTES[role].push(item.to)
  }
}

/** Whether `role` may open a v2 route (UX only; RLS still enforces every read and write). */
export function canOpenV2(role, path) {
  return !!V2_ROLE_ROUTES[role]?.includes(path)
}
