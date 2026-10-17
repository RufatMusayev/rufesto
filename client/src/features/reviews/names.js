import { cleanDisplayName } from '../../lib/helpers'

/**
 * The name a review row shows. A real name is cleaned like everywhere else (raw id hashes are dropped); no name at all
 * (an author the viewer is not allowed to read, a deleted account) shows the localized "Rufesto guest", never the
 * hard-coded English "Anonymous" cleanDisplayName falls back to.
 */
export function guestName(name, fallback) {
  if (!name || !String(name).trim()) return fallback
  const cleaned = cleanDisplayName(name)
  return cleaned && cleaned !== 'Anonymous' ? cleaned : fallback
}
