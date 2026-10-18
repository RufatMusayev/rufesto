// "Order this" ends in the restaurant page, which carries the dish sheet (host, sheet, reviews block). Those are lazy
// chunks: fetched on the first tap they cost a round trip before anything can paint. Call this once from a page that
// leads there (Home, Search): the chunks are fetched in idle time, after the page's own work, and the tap finds them cached.
let started = false

const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 2000))

export function prefetchDishSheet() {
  if (started || typeof window === 'undefined') return
  started = true
  idle(() => {
    import('../../pages/RestaurantPage').catch(() => {})
    import('./DishSheetHost').catch(() => {})
  })
}
