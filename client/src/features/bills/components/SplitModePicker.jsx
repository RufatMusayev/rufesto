import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'

const OPTIONS = ['own', 'equal', 'all']

/** Pay my own / Split equally / Pay for everyone. Amounts are the server's (`modes`), so switching is instant;
 *  the host's choice is saved on the server right away (usePayPlan) so table mates see it live. Hidden for a
 *  solo guest. `canChoose` is false for a table mate: the server only takes the split from the host / the person
 *  who opened the bill, so they see the current plan read-only (all options disabled) and a line saying who
 *  chooses. `saving` marks a save in flight; `error` is the translated reason the last save failed (the picker
 *  has already gone back to the server's plan). Once a share is paid, `locked` freezes it for everyone. */
export default function SplitModePicker({ modes, memberCount, mode, onChange, locked, canChoose = true, saving = false, error = '' }) {
  const { t } = useTranslation('bills')
  if (memberCount <= 1) return null
  const label = id => (id === 'equal'
    ? t('splitEqual', { count: memberCount })
    : t(id === 'own' ? 'splitOwn' : 'splitAll'))

  return (
    <section className="bl-section" aria-labelledby="bl-split-title">
      <h2 id="bl-split-title" className="bl-section-title">{t('splitTitle')}</h2>
      <div
        className="bl-options" role="radiogroup" aria-labelledby="bl-split-title"
        aria-readonly={canChoose ? undefined : true} aria-busy={saving || undefined}
      >
        {OPTIONS.map(id => (
          <button
            key={id} type="button" role="radio" aria-checked={mode === id}
            className={`bl-option${mode === id ? ' bl-option-on' : ''}`}
            disabled={!canChoose || (locked && mode !== id)}
            onClick={() => canChoose && onChange(id)}
          >
            <span className="bl-option-label">{label(id)}</span>
            <span className="bl-option-amount">{formatPrice(modes[id])}</span>
          </button>
        ))}
      </div>
      {locked
        ? <p className="bl-hint">{t('splitLocked')}</p>
        : !canChoose ? <p className="bl-hint">{t('splitHostChooses')}</p> : null}
      {error && !locked ? <p className="bl-error" role="alert">{error}</p> : null}
    </section>
  )
}
