import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, EmptyState } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { useAuth } from '../../../contexts/AuthContext'
import { cleanDisplayName } from '../../../lib/helpers'
import { getPublicProfile } from '../api'
import { useRequireAuth, useToast } from '../hooks'
import TopBar from '../components/TopBar'
import SignInCard from '../components/SignInCard'
import FriendButton from '../components/FriendButton'
import ReviewCard from '../components/ReviewCard'
import { CameraIcon } from '../components/Icons'

// get_public_profile takes a uuid: anything else cannot exist, so it is "not found" without a request that would 400.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const byVerifiedThenNewest = (a, b) =>
  Number(b.verified) - Number(a.verified) || new Date(b.createdAt) - new Date(a.createdAt)

/** Grid tile of one post. A photo that cannot be shown (not signed, expired, gone) falls back to the placeholder. */
function PostTile({ post }) {
  const { t } = useTranslation('social')
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [post.photoUrl])
  return (
    <Link to={`/post/${post.id}`} className="ig-grid-tile soc-tile" aria-label={post.caption || t('profile.openPost')}>
      {post.photoUrl && !failed
        ? <img src={post.photoUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
        : post.hasPhoto
          ? <span className="soc-tile-missing" aria-hidden="true"><CameraIcon size={24} /></span>
          : <span className="soc-tile-text">{post.caption}</span>}
    </Link>
  )
}

export default function PublicProfilePage() {
  const { id } = useParams()
  const { t } = useTranslation('social')
  const { session, loading: authLoading } = useAuth()
  const { requireAuth, authModal } = useRequireAuth()
  const { toast, showToast } = useToast()
  const [state, setState] = useState({ loading: true, error: null, profile: null })
  const [status, setStatus] = useState('none')
  const [attempt, setAttempt] = useState(0)
  const userId = session?.user?.id || null

  useEffect(() => {
    if (authLoading) return undefined
    if (!UUID_RE.test(id || '')) { setState({ loading: false, error: null, profile: null }); return undefined }
    let alive = true
    setState({ loading: true, error: null, profile: null })
    getPublicProfile(id).then(({ data, error }) => {
      if (!alive) return
      if (error) { setState({ loading: false, error, profile: null }); return }
      setState({ loading: false, error: null, profile: data })
      setStatus(data ? data.status : 'none')
    })
    return () => { alive = false }
  }, [id, authLoading, attempt, userId])

  const reviews = useMemo(
    () => (state.profile ? state.profile.reviews.slice().sort(byVerifiedThenNewest) : []),
    [state.profile],
  )

  const frame = children => (
    <div className="soc-page">
      <TopBar title={t('profile.title')} />
      {children}
      {toast}
      {authModal}
    </div>
  )

  if (authLoading || state.loading) return frame(<ProfileSkeleton />)
  if (state.error) {
    return frame(state.error.code === 'not_authenticated'
      ? <div className="soc-body"><SignInCard title={t('profile.signInTitle')} body={t('profile.signInBody')} /></div>
      : <LoadError onRetry={() => setAttempt(a => a + 1)} />)
  }
  const p = state.profile
  if (!p) {
    return frame(
      <EmptyState
        icon="🕵️" title={t('profile.notFoundTitle')} body={t('profile.notFoundBody')}
        action={<Link to="/friends?tab=find" className="btn btn-ghost">{t('profile.findPeople')}</Link>}
      />,
    )
  }

  const name = cleanDisplayName(p.name)
  const relation = userId && p.id === userId ? 'self' : status

  return frame(
    <div className="soc-body soc-profile">
      <div className="soc-profile-head">
        <Avatar name={p.name} src={p.photo} size={72} />
        <h2 className="soc-profile-name">{name}</h2>
        <div className="soc-stats">
          <Stat value={p.counts.posts} label={t('profile.posts')} />
          <Stat value={p.counts.friends} label={t('profile.friends')} />
          <Stat value={p.counts.reviews} label={t('profile.reviews')} />
        </div>
        <div className="soc-profile-action">
          <FriendButton
            variant="full" userId={p.id} name={name} status={relation}
            onChange={(_, s) => setStatus(s)} onError={k => showToast(k)} guard={requireAuth}
          />
        </div>
      </div>

      {p.posts.length === 0 ? (
        <EmptyState icon="📷" title={t('profile.noPostsTitle')} body={t('profile.noPostsBody')} />
      ) : (
        <div className="explore-grid soc-grid" aria-label={t('profile.posts')}>
          {p.posts.map(post => <PostTile key={post.id} post={post} />)}
        </div>
      )}

      {reviews.length > 0 && (
        <section className="soc-profile-reviews">
          <h2 className="soc-section-title">{t('profile.reviewsTitle')}</h2>
          {reviews.map((r, i) => <ReviewCard key={r.id} item={r} index={i} showActions={false} />)}
        </section>
      )}
    </div>,
  )
}

function Stat({ value, label }) {
  return (
    <div className="ig-stat">
      <div className="ig-stat-num font-mono">{value}</div>
      <div className="ig-stat-label">{label}</div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="soc-body" aria-busy="true">
      <div className="soc-profile-head" aria-hidden="true">
        <div className="skeleton" style={{ width: 72, height: 72, borderRadius: '50%' }} />
        <div className="skeleton" style={{ width: 140, height: 18 }} />
        <div className="skeleton" style={{ width: 220, height: 34 }} />
        <div className="skeleton" style={{ width: '100%', height: 40, borderRadius: 8 }} />
      </div>
      <div className="explore-grid soc-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton soc-tile" style={{ borderRadius: 0 }} />)}
      </div>
    </div>
  )
}
