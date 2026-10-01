import { useTranslation } from 'react-i18next'
import { MoneyText, Sheet } from '../../../components/ui'
import { formatPrice } from '../../../lib/helpers'
import { DemoBadge, DemoNotice } from './DemoBadge'

/**
 * Bottom sheet for the DEMO card payment. A mock card graphic and an amount: no input of any kind, never a
 * card-number field, so no card data can reach Rufesto. The parent runs the payment in `onConfirm`; while it
 * runs the button is disabled and the sheet cannot be dismissed.
 */
export default function DemoPaySheet({ open, onClose, share, tip, total, busy, error, notice, onConfirm }) {
  const { t } = useTranslation('bills')
  const amount = formatPrice(total)

  const footer = (
    <button type="button" className="btn btn-primary bl-sheet-btn" disabled={busy} onClick={onConfirm}>
      {busy
        ? <><span className="spinner" aria-hidden="true" />{t('demoProcessing')}</>
        : t('demoPayBtn', { amount })}
    </button>
  )

  return (
    <Sheet open={open} onClose={() => { if (!busy) onClose() }} title={t('demoSheetTitle')} footer={footer}>
      <div className="bl-demo-card" role="img" aria-label={t('demoCardAria')}>
        <div className="bl-demo-card-top">
          <DemoBadge />
          <span className="bl-demo-card-brand" aria-hidden="true">Rufesto</span>
        </div>
        <div className="bl-demo-card-chip" aria-hidden="true" />
        <div className="bl-demo-card-number" aria-hidden="true">{t('demoCard')}</div>
      </div>
      <DemoNotice className="bl-demo-notice-sheet" />

      <div className="bl-sheet-rows">
        <div className="bl-total-row"><span>{t('sheetShare')}</span><MoneyText value={share} /></div>
        {tip > 0 ? <div className="bl-total-row"><span>{t('tip')}</span><MoneyText value={tip} /></div> : null}
        <div className="bl-total-row bl-total-grand">
          <span>{t('sheetTotal')}</span><MoneyText value={total} tone="accent" size="1.05rem" strong />
        </div>
      </div>

      {notice ? <p className="bl-sheet-note" role="status">{notice}</p> : null}
      {error ? <p className="bl-sheet-error" role="alert">{error}</p> : null}
    </Sheet>
  )
}
