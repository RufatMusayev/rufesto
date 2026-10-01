import { useTranslation } from 'react-i18next'
import { DemoBadge, DemoNotice } from './DemoBadge'

/** Two ways to pay: the DEMO card (no card inputs anywhere, no money moves) and "Pay at reception". */
export default function PayMethodList({ method, demoOff, onChange }) {
  const { t } = useTranslation('bills')
  return (
    <section className="bl-section" aria-labelledby="bl-method-title">
      <h2 id="bl-method-title" className="bl-section-title">{t('payTitle')}</h2>
      <div className="bl-options" role="radiogroup" aria-labelledby="bl-method-title">
        <button
          type="button" role="radio" aria-checked={method === 'demo'}
          className={`bl-option bl-option-col${method === 'demo' ? ' bl-option-on' : ''}`}
          disabled={demoOff}
          onClick={() => onChange('demo')}
        >
          <span className="bl-option-who">
            <span aria-hidden="true">💳</span>
            <span className="bl-option-label">{t('methodDemo')}</span>
            <DemoBadge />
          </span>
          {demoOff ? <span className="bl-option-hint">{t('demoOffHint')}</span> : <DemoNotice />}
        </button>
        <button
          type="button" role="radio" aria-checked={method === 'reception'}
          className={`bl-option bl-option-col${method === 'reception' ? ' bl-option-on' : ''}`}
          onClick={() => onChange('reception')}
        >
          <span className="bl-option-who">
            <span aria-hidden="true">🧾</span>
            <span className="bl-option-label">{t('methodReception')}</span>
          </span>
          <span className="bl-option-hint">{t('methodReceptionHint')}</span>
        </button>
      </div>
    </section>
  )
}
