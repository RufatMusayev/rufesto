import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatBakuDate, formatBakuTime } from '../timeFormat'
import { CheckIcon, CopyIcon, ShareIcon } from './Icons'

const COPIED_MS = 2000

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

/** The shareable invite: link on this host (never a hard-coded domain), Copy, Share and "n of N joined". */
export default function InviteCard({ code, joined, total, restaurantName, startsAt }) {
  const { t, i18n } = useTranslation('bookings')
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const url = `${window.location.origin}/b/${code}`
  const shareText = t('invite.shareText', {
    restaurant: restaurantName,
    date: startsAt ? formatBakuDate(startsAt, i18n.language) : '',
    time: startsAt ? formatBakuTime(startsAt) : '',
    url,
  })
  const pct = total > 0 ? Math.min(100, Math.round((joined / total) * 100)) : 0

  async function onCopy() {
    const ok = await copyText(url)
    setFailed(!ok)
    setCopied(ok)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setCopied(false); setFailed(false) }, COPIED_MS)
  }

  async function onShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: restaurantName, text: shareText })
      } catch { /* cancelled by the guest: nothing to do */ }
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="card bk-invite" aria-label={t('invite.title')}>
      <h2 className="bk-section-title">{t('invite.title')}</h2>
      <p className="bk-invite-hint">{t('invite.hint')}</p>
      <div className="bk-invite-link font-mono" data-testid="invite-link">{url}</div>
      <div className="bk-invite-actions">
        <button type="button" className="btn btn-ghost" onClick={onCopy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span aria-live="polite">{failed ? t('invite.copyFailed') : copied ? t('invite.copied') : t('invite.copy')}</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={onShare}>
          <ShareIcon />
          {t('invite.share')}
        </button>
      </div>
      <div className="bk-progress-wrap">
        <div className="bk-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={joined}
          aria-label={t('invite.joinedOf', { joined, total })}>
          <div className="bk-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="bk-progress-text">{t('invite.joinedOf', { joined, total })}</span>
      </div>
    </section>
  )
}
