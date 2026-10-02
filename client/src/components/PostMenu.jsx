import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useEscapeClose from './ui/useEscapeClose'
import './PostMenu.css'

const FEEDBACK_MS = 1500

/**
 * The three-dots button of a feed post: a small menu with Share (where the browser has a share sheet) and Copy link.
 * `path` is an in-app path such as "/restaurant/bella-roma"; the full link is built from the current origin.
 */
export default function PostMenu({ path, title }) {
  const { t } = useTranslation('feed')
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState(null)     // 'copied' | 'failed'
  const wrap = useRef(null)
  const timer = useRef(null)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEscapeClose(() => setOpen(false), open)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) return undefined
    const away = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const link = () => `${window.location.origin}${path}`

  async function share() {
    setOpen(false)
    try { await navigator.share({ url: link(), title }) } catch { /* dismissed or unsupported: nothing to do */ }
  }

  async function copy() {
    let result = 'copied'
    try { await navigator.clipboard.writeText(link()) } catch { result = 'failed' }
    setFeedback(result)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setFeedback(null); setOpen(false) }, FEEDBACK_MS)
  }

  return (
    <div className="pm-wrap" ref={wrap}>
      <button
        type="button" className="icon-btn pm-btn" aria-label={t('postOptions')}
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => { setFeedback(null); setOpen(o => !o) }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="pm-menu" role="menu">
          {canShare && (
            <button type="button" role="menuitem" className="pm-item" onClick={share}>{t('share')}</button>
          )}
          <button type="button" role="menuitem" className="pm-item" onClick={copy}>
            {feedback === 'copied' ? t('linkCopied') : feedback === 'failed' ? t('copyFailed') : t('copyLink')}
          </button>
        </div>
      )}
    </div>
  )
}
