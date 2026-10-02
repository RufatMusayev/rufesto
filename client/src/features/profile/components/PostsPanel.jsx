import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/ui'
import Panel, { GridSkeleton } from './Panel'
import { CameraIcon, PlusIcon } from './Icons'

/** One post tile. A photo that cannot be shown (not signed, expired, gone) falls back to a placeholder. */
function PostTile({ post }) {
  const { t } = useTranslation('profile')
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [post.photoUrl])
  return (
    <Link to={`/post/${post.id}`} className="ig-grid-tile pf-tile" aria-label={post.caption || t('openPost')}>
      {post.photoUrl && !failed
        ? <img src={post.photoUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
        : post.hasPhoto
          ? <span className="pf-tile-missing" aria-hidden="true"><CameraIcon size={24} /></span>
          : <span className="pf-tile-text">{post.caption}</span>}
    </Link>
  )
}

/** Profile -> Posts: the guest's own posts, three to a row, with a "new post" tile first. */
export default function PostsPanel({ resource }) {
  const { t } = useTranslation('profile')
  return (
    <Panel
      resource={resource}
      skeleton={<GridSkeleton />}
      empty={(
        <EmptyState
          icon="📷" title={t('noPostsTitle')} body={t('noPostsBody')}
          action={<Link to="/post/new" className="btn btn-primary">{t('newPost')}</Link>}
        />
      )}
    >
      {posts => (
        <div className="explore-grid pf-grid">
          <Link to="/post/new" className="pf-tile pf-tile-new">
            <PlusIcon size={22} />
            <span>{t('newPost')}</span>
          </Link>
          {posts.map(post => <PostTile key={post.id} post={post} />)}
        </div>
      )}
    </Panel>
  )
}
