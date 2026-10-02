import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import AuthModal from '../components/AuthModal'
// FriendsEntry (features/social) is hosted inside ProfileHeader's action row.
import { MyBookingsTab } from '../features/bookings/mounts'
import '../features/profile/styles.css'
import { useProfileData } from '../features/profile/hooks'
import ProfileHeader from '../features/profile/components/ProfileHeader'
import HeaderSkeleton from '../features/profile/components/HeaderSkeleton'
import SignedOutCard from '../features/profile/components/SignedOutCard'
import ProfileTabs, { TAB_IDS, tabDomId, panelDomId } from '../features/profile/components/ProfileTabs'
import PostsPanel from '../features/profile/components/PostsPanel'
import ReviewsPanel from '../features/profile/components/ReviewsPanel'
import SavedPanel from '../features/profile/components/SavedPanel'
import VisitsPanel from '../features/profile/components/VisitsPanel'
import EditProfileSheet from '../features/profile/components/EditProfileSheet'
import SettingsSheet from '../features/profile/components/SettingsSheet'
import CreditsSheet from '../features/profile/components/CreditsSheet'
import FeedbackSheet from '../features/profile/components/FeedbackSheet'

/** Profile: header card (avatar, credits, counters, actions), sticky tabs, one panel per tab, and the sheets. */
export default function ProfilePage() {
  const navigate = useNavigate()
  const { session, profile, loading } = useAuth()
  const [params, setParams] = useSearchParams()
  const [sheet, setSheet] = useState(null) // null | 'edit' | 'settings' | 'credits' | 'feedback'
  const [showAuth, setShowAuth] = useState(false)

  const userId = session?.user?.id || null
  const requested = params.get('tab')
  const tab = TAB_IDS.includes(requested) ? requested : 'posts'
  const data = useProfileData(userId, tab)

  useEffect(() => { if (!session) setSheet(null) }, [session])

  const closeSheet = () => setSheet(null)
  function selectTab(id) {
    setParams(id === 'posts' ? {} : { tab: id }, { replace: true })
  }
  function jumpToTab(id) {
    selectTab(id)
    const bar = document.getElementById('pf-tabs')
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    bar?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }

  if (loading) return <div className="pf-page"><HeaderSkeleton /></div>

  if (!session) {
    return (
      <div className="pf-page">
        <SignedOutCard onSignIn={() => setShowAuth(true)} onFeedback={() => setSheet('feedback')} />
        <FeedbackSheet open={sheet === 'feedback'} onClose={closeSheet} />
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </div>
    )
  }

  const countsLoading = data.counts.status === 'idle' || data.counts.status === 'loading'
  const email = profile?.email || session.user?.email || ''

  return (
    <div className="pf-page">
      <ProfileHeader
        name={profile?.name}
        email={email}
        photo={profile?.profile_photo}
        counts={data.counts.data}
        countsLoading={countsLoading}
        credits={data.credits.data}
        onEdit={() => setSheet('edit')}
        onSettings={() => setSheet('settings')}
        onCredits={() => setSheet('credits')}
        onStat={jumpToTab}
        onFriends={() => navigate('/friends')}
      />

      <ProfileTabs value={tab} onChange={selectTab} />

      <div className="pf-panel" role="tabpanel" id={panelDomId(tab)} aria-labelledby={tabDomId(tab)}>
        {tab === 'posts' && <PostsPanel resource={data.posts} />}
        {tab === 'bookings' && <MyBookingsTab userId={userId} />}
        {tab === 'reviews' && <ReviewsPanel resource={data.reviews} />}
        {tab === 'saved' && <SavedPanel resource={data.saved} />}
        {tab === 'visits' && <VisitsPanel resource={data.visits} />}
      </div>

      <EditProfileSheet open={sheet === 'edit'} onClose={closeSheet} profile={profile} email={email} />
      <SettingsSheet open={sheet === 'settings'} onClose={closeSheet} onFeedback={() => setSheet('feedback')} />
      <CreditsSheet open={sheet === 'credits'} onClose={closeSheet} userId={userId} credits={data.credits.data} />
      <FeedbackSheet
        open={sheet === 'feedback'} onClose={closeSheet}
        userId={userId} defaultName={profile?.name} defaultEmail={email}
      />
    </div>
  )
}
