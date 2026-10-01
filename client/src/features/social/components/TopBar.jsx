import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BackIcon } from './Icons'

/** Sticky page header: back arrow, title, optional right-hand action node. */
export default function TopBar({ title, backTo = '/', right = null }) {
  const navigate = useNavigate()
  const { t } = useTranslation('common')
  // history.state.idx > 0 means there is somewhere to go back to inside the app
  const canGoBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0
  return (
    <div className="soc-topbar">
      <button
        type="button" className="icon-btn" aria-label={t('back')}
        onClick={() => (canGoBack ? navigate(-1) : navigate(backTo))}
      >
        <BackIcon />
      </button>
      <h1 className="soc-topbar-title">{title}</h1>
      <div className="soc-topbar-right">{right}</div>
    </div>
  )
}
