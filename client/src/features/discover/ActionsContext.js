import { createContext, useContext } from 'react'

// Follow / like state and actions of restaurant cards, provided once by DiscoverTab so every rail and the
// list read the same optimistic state (a follow in "Open now" shows in "All restaurants" too).
export const ActionsContext = createContext({
  signedIn: false,
  isFollowed: r => r.isFollowed,
  followers: r => r.followerCount,
  toggleFollow: () => {},
  liked: () => false,
  likeCount: () => 0,
  toggleLike: () => {},
})

export const useActions = () => useContext(ActionsContext)
