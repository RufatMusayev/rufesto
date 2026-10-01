import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BackIcon } from './Icons'

/** Sticky page header: back arrow, title, optional right-hand node (the status pill). */
export default function TopBar({ title, backTo = '/table', right = null }) {
  const navigate = useNavigate()
  const { t } = useTranslation('common')
  // history.state.idx > 0 means there is somewhere to go back to inside the app
  const canGoBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0
  return (
    <div className="bl-topbar bl-noprint">
      <button
        type="button" className="icon-btn" aria-label={t('back')}
        onClick={() => (canGoBack ? navigate(-1) : navigate(backTo))}
      >
        <BackIcon />
      </button>
      <h1 className="bl-topbar-title">{title}</h1>
      <div className="bl-topbar-right">{right}</div>
    </div>
  )
}
