// The two paged feeds of the Home tabs. Discover has its own store (features/discover).
import { createPagedFeed } from './pagedFeed'
import { getHomeFeed, getFriendsFeed } from './api'
import { resetImpressions } from './useFeedEvents'
import { invalidateDiscover, patchDiscoverReview } from '../discover/discoverStore'
import { SOCIAL_WRITE_EVENT } from '../../lib/supabase'
import { markDeleted } from './deleted'

/** Home tab: home_feed (17.3). Works signed out. */
export const homeFeed = createPagedFeed({ fetchPage: getHomeFeed, onFresh: () => resetImpressions('home') })

/** Friends tab: friends_feed (18.1). Signed in only. */
export const friendsFeed = createPagedFeed({ fetchPage: getFriendsFeed, onFresh: () => resetImpressions('friends') })

/** A post was created: both lists refresh on their next visit (they live in memory, so they would not otherwise). */
export function invalidateFeeds() {
  homeFeed.invalidate()
  friendsFeed.invalidate()
}

/**
 * A post was deleted: it leaves every list that may hold it (Home, Friends, the tails under "You're all caught up") and its
 * id is remembered for the session, so a later page, refetch or tail load cannot bring it back.
 */
export function forgetPost(id) {
  markDeleted(id)
  homeFeed.remove(id)
  friendsFeed.remove(id)
}

/**
 * A like or a comment was made on an item (on its card, or on its own page): the lists keep the new numbers, so the
 * card shows them when it mounts again instead of the old ones until a reload. kind: 'post' | 'review'.
 */
export function patchFeedItem(kind, id, partial) {
  homeFeed.patch(kind, id, partial)
  friendsFeed.patch(kind, id, partial)
  if (kind === 'review') patchDiscoverReview(id, partial)
}

/**
 * The viewer's follows or friends changed: every tab's ranking is out of date. Home, Friends and Discover refresh on
 * their next visit (a quiet refetch of page 1 while the old list stays on screen).
 */
export function invalidateAllTabs() {
  invalidateFeeds()
  invalidateDiscover()
}

// lib/supabase.js announces every follow / unfollow / friend-request write, wherever it is made (Discover, the
// restaurant page, a profile, the Friends page): the stores need no call from those screens.
if (typeof window !== 'undefined') window.addEventListener(SOCIAL_WRITE_EVENT, invalidateAllTabs)
