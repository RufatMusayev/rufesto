// The two paged feeds of the Home tabs. Discover has its own store (features/discover).
import { createPagedFeed } from './pagedFeed'
import { getHomeFeed, getFriendsFeed } from './api'
import { resetImpressions } from './useFeedEvents'

/** Home tab: home_feed (17.3). Works signed out. */
export const homeFeed = createPagedFeed({ fetchPage: getHomeFeed, onFresh: () => resetImpressions('home') })

/** Friends tab: friends_feed (18.1). Signed in only. */
export const friendsFeed = createPagedFeed({ fetchPage: getFriendsFeed, onFresh: () => resetImpressions('friends') })

/** A post was created: both lists refresh on their next visit (they live in memory, so they would not otherwise). */
export function invalidateFeeds() {
  homeFeed.invalidate()
  friendsFeed.invalidate()
}
