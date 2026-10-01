import { useTranslation } from 'react-i18next'
import { formatPrice } from '@shared/helpers'
import DemoBadge from './DemoBadge'
import Money from './Money'
import StatusPill from './StatusPill'

const METHOD_KEY = { card: 'methodCard', reception: 'methodReception', cash: 'methodCash' }

// One person's share of a bill. Staff take reception / cash shares ("Mark paid");
// the DEMO badge appears only on card shares taken through the demo provider,
// never on cash or reception. A share nobody has chosen a method for yet has
// no method pill.
export default function ShareRow({ share, busy, onMarkPaid }) {
  const { t } = useTranslation('v2')
  const showDemo = share.isDemo && share.method === 'card'
  return (
    <li className="v2-share">
      <div className="v2-share-who">
        <span className="v2-share-name">{share.name || t('guestFallback')}</span>
        {(share.method || showDemo) && (
          <div className="v2-share-tags">
            {share.method && <StatusPill tone="gray">{t(METHOD_KEY[share.method])}</StatusPill>}
            {showDemo && <DemoBadge />}
          </div>
        )}
      </div>
      <div className="v2-share-amount">
        {share.paid ? (
          <>
            <Money value={share.amount} strong />
            <span className="v2-share-state v2-share-state--paid">✓ {t('sharePaid')}</span>
          </>
        ) : (
          <span className="v2-share-state v2-share-state--owes">{t('shareOwes', { amount: formatPrice(share.amount) })}</span>
        )}
      </div>
      {share.canMarkPaid && (
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onMarkPaid(share)}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {t('markPaid')}
        </button>
      )}
    </li>
  )
}
