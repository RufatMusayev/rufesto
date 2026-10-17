// Posts deleted during this session. A delete removes the post from the ranked lists (feeds.js forgetPost) AND from the
// chronological "caught up" tails, which keep their own copy; this set also stops a later page, refetch or tail load from
// bringing it back. In memory only: the server no longer returns a deleted post after a reload.
const gone = new Set()
const subs = new Set()

/** True for a post that was deleted in this session. Other kinds (reviews, promos) are never deleted from the feeds. */
export const isDeleted = item => item?.kind === 'post' && gone.has(item.id)

export function markDeleted(id) {
  gone.add(id)
  subs.forEach(fn => fn(id))
}

/** Calls fn(id) whenever a post is deleted; returns the unsubscribe. */
export function onPostDeleted(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}
