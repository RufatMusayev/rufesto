import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyText, inviteLink } from '../links'

// Invite code in a mono chip plus a Copy button. Copies the join link
// (<consumer host>/b/<code>), or the bare code when this dashboard host can't
// be mapped to a consumer host.
export default function InviteCodeChip({ code }) {
  const { t } = useTranslation('v2')
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  const link = inviteLink(code)
  const isLink = link !== code

  useEffect(() => () => clearTimeout(timer.current), [])

  async function handleCopy() {
    const ok = await copyText(link)
    if (!ok) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="v2-invite">
      <span className="v2-invite-label">{t('inviteCodeLabel')}</span>
      <span className="v2-code-chip">{code}</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={handleCopy}>
        {copied ? t('copied') : t(isLink ? 'copyLink' : 'copyCode')}
      </button>
      <span className="v2-sr-only" role="status">{copied ? t('copied') : ''}</span>
    </div>
  )
}
