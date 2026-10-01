import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BackIcon } from './Icons'

/** Sticky page header: back arrow, title, optional right-hand node. `onBack` overrides the default (history back). */
export default function TopBar({ title, backTo = '/', onBack = null, right = null }) {
  const navigate = useNavigate()
  const { t } = useTranslation('common')
  // history.state.idx > 0 means there is somewhere to go back to inside the app
  const canGoBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0
  const back = () => {
    if (onBack) onBack()
    else if (canGoBack) navigate(-1)
    else navigate(backTo)
  }
  return (
    <div className="bk-topbar">
      <button type="button" className="icon-btn" aria-label={t('back')} onClick={back}>
        <BackIcon />
      </button>
      <h1 className="bk-topbar-title">{title}</h1>
      <div className="bk-topbar-right">{right}</div>
    </div>
  )
}
