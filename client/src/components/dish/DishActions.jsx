import { useTranslation } from 'react-i18next'
import { LikeIcon, ShareIcon } from '../../features/social/components/Icons'

const SaveIcon = ({ on }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="15" rx="8" ry="4" fill={on ? 'var(--accent)' : 'none'} stroke={on ? 'var(--accent)' : 'currentColor'} />
    <path d="M12 4v7" /><path d="M12 4h5l-1.4 1.8L17 7.6h-5" fill={on ? 'var(--accent)' : 'none'} />
  </svg>
)

/** Like (with its count), Save and Share: three 36 px pills (the visual height; the tap area is 44 px). */
export default function DishActions({ eng, onSave, onShare }) {
  const { t } = useTranslation(['restaurant', 'menu'])
  return (
    <div className="dds-actions">
      <button
        type="button" className={`dds-pill pressable${eng.liked ? ' is-on' : ''}`} aria-pressed={eng.liked}
        aria-label={eng.liked ? t('restaurant:dish.unlikeAria') : t('restaurant:dish.likeAria')}
        onClick={eng.toggleLike}
      >
        <LikeIcon active={eng.liked} size={20} />
        <span>{eng.liked ? t('restaurant:dish.liked') : t('restaurant:dish.like')}</span>
        {eng.count > 0 && <span className="dds-pill-n">{eng.count}</span>}
      </button>
      <button
        type="button" className={`dds-pill pressable${eng.saved ? ' is-on' : ''}`} aria-pressed={eng.saved}
        aria-label={eng.saved ? t('restaurant:dish.unsaveAria') : t('restaurant:dish.saveAria')}
        onClick={onSave}
      >
        <SaveIcon on={eng.saved} />
        <span>{eng.saved ? t('restaurant:dish.saved') : t('restaurant:dish.save')}</span>
      </button>
      <button type="button" className="dds-pill pressable" aria-label={t('menu:dish.shareAria')} onClick={onShare}>
        <ShareIcon size={20} />
        <span>{t('menu:dish.share')}</span>
      </button>
    </div>
  )
}
