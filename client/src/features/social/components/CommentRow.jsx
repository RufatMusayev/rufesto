import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar } from '../../../components/ui'
import { cleanDisplayName, timeAgo } from '../../../lib/helpers'
import { CloseIcon } from './Icons'

export default function CommentRow({ comment, canDelete = false, onDelete }) {
  const { t, i18n } = useTranslation('social')
  const name = cleanDisplayName(comment.user.name)
  return (
    <div className={`soc-comment${comment.pending ? ' soc-comment-pending' : ''}`}>
      <Link to={`/u/${comment.user.id}`} className="soc-comment-author" aria-label={name}>
        <Avatar name={comment.user.name} src={comment.user.photo} size={28} />
      </Link>
      <div className="soc-comment-main">
        <p className="soc-comment-text">
          <Link to={`/u/${comment.user.id}`} className="soc-post-name">{name}</Link> {comment.body}
        </p>
        <span className="soc-comment-time">{timeAgo(comment.createdAt, i18n.language)}</span>
      </div>
      {canDelete && !comment.pending && (
        <button type="button" className="icon-btn soc-comment-del" aria-label={t('comment.delete')} onClick={() => onDelete(comment)}>
          <CloseIcon size={13} />
        </button>
      )}
    </div>
  )
}

export function CommentSkeletons({ count = 3 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="soc-comment">
          <div className="skeleton" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 11, width: `${70 - i * 12}%`, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 9, width: '25%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
