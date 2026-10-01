import { lazy, Suspense } from 'react'
import { Route } from 'react-router-dom'
import './i18n'
import './styles.css'
import PageFallback from './components/PageFallback'

const FriendsPage = lazy(() => import('./pages/FriendsPage'))
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage'))
const NewPostPage = lazy(() => import('./pages/NewPostPage'))
const PostPage = lazy(() => import('./pages/PostPage'))

const page = el => <Suspense fallback={<PageFallback />}>{el}</Suspense>

// Drop inside <Route element={<AppLayout />}>. All four are public routes; each screen handles
// the signed-out case itself (read-only or a sign-in card).
export default [
  <Route key="soc-friends" path="/friends" element={page(<FriendsPage />)} />,
  <Route key="soc-user" path="/u/:id" element={page(<PublicProfilePage />)} />,
  <Route key="soc-post-new" path="/post/new" element={page(<NewPostPage />)} />,
  <Route key="soc-post" path="/post/:id" element={page(<PostPage />)} />,
]
