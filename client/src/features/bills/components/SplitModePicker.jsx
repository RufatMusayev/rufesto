import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'

const OPTIONS = ['own', 'equal', 'all']

/** Pay my own / Split equally / Pay for everyone. Amounts are the server's (`modes`), so switching is
 *  instant and sends nothing; the choice goes to the server with the payment. Hidden for a solo guest. */
export default function SplitModePicker({ modes, memberCount, mode, onChange, locked }) {
  const { t } = useTranslation('bills')
  if (memberCount <= 1) return null
  const label = id => (id === 'equal'
    ? t('splitEqual', { count: memberCount })
    : t(id === 'own' ? 'splitOwn' : 'splitAll'))

  return (
    <section className="bl-section" aria-labelledby="bl-split-title">
      <h2 id="bl-split-title" className="bl-section-title">{t('splitTitle')}</h2>
      <div className="bl-options" role="radiogroup" aria-labelledby="bl-split-title">
        {OPTIONS.map(id => (
          <button
            key={id} type="button" role="radio" aria-checked={mode === id}
            className={`bl-option${mode === id ? ' bl-option-on' : ''}`}
            disabled={locked && mode !== id}
            onClick={() => onChange(id)}
          >
            <span className="bl-option-label">{label(id)}</span>
            <span className="bl-option-amount">{formatPrice(modes[id])}</span>
          </button>
        ))}
      </div>
      {locked ? <p className="bl-hint">{t('splitLocked')}</p> : null}
    </section>
  )
}
