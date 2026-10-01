import { useTranslation } from 'react-i18next'
import StatusPill from './StatusPill'

const STATUS_TONE = { invited: 'gray', joined: 'green', arrived: 'blue', left: 'gray', declined: 'red' }

// Members of a group booking: name, tel: phone link, status pill, Host pill.
export default function MemberTable({ members }) {
  const { t } = useTranslation('v2')
  return (
    <ul className="v2-members" aria-label={t('groupMembers')}>
      {members.map(m => {
        const phoneHref = m.phone ? `tel:${m.phone.replace(/[^\d+]/g, '')}` : ''
        return (
          <li key={m.id} className="v2-member">
            <div className="v2-member-main">
              <span className="v2-member-name">{m.name || t('memberUnknown')}</span>
              {m.isHost && <StatusPill tone="gold">{t('hostPill')}</StatusPill>}
            </div>
            {m.phone && <a className="v2-member-phone" href={phoneHref}>{m.phone}</a>}
            <StatusPill tone={STATUS_TONE[m.status] || 'gray'}>{t(`member_${m.status}`, { defaultValue: m.status })}</StatusPill>
          </li>
        )
      })}
    </ul>
  )
}
