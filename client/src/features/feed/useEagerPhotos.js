// The first two photos of a feed load eagerly with high fetch priority (they are what the viewer sees first; every
// other image stays lazy). Returns the Set of "kind-id" keys of those cards. A hidden tab (`active` false) gets none:
// it must not compete with the tab on screen.
import { useMemo } from 'react'

export const EAGER_PHOTOS = 2

export function useEagerPhotos(items, active = true) {
  return useMemo(() => {
    const keys = new Set()
    if (!active) return keys
    for (const it of items) {
      if (it.kind === 'post' && (it.photoUrl || it.photoPending)) keys.add(`${it.kind}-${it.id}`)
      if (keys.size >= EAGER_PHOTOS) break
    }
    return keys
  }, [items, active])
}
