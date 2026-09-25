// Helpers for the `dish-photos` bucket. Upload paths are always built from
// restaurantId + dishId (trusted, staff-row-derived values). For deletes we
// only need the extension out of the stored URL — never trust a full path
// parsed from a client-writable `dishes.photo` column.
export function dishPhotoExt(url) {
  if (!url) return null
  const clean = url.split('?')[0].split('#')[0]
  const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/)
  return match ? match[1].toLowerCase() : null
}

export function dishPhotoPath(restaurantId, dishId, url) {
  const ext = dishPhotoExt(url)
  return ext && restaurantId && dishId ? `${restaurantId}/${dishId}.${ext}` : null
}
