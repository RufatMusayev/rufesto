import { useTranslation } from 'react-i18next'

export const PER_PAGE_OPTIONS = [1, 4, 6]

// Screen-only controls of the QR sheet: section filter, cards per page,
// access-code toggle and the Print button.
export default function PrintToolbar({
  sections, section, onSection, perPage, onPerPage, showCode, onShowCode, canPrint, onPrint,
}) {
  const { t } = useTranslation('v2')
  return (
    <div className="v2-toolbar">
      {sections.length > 1 && (
        <div className="v2-chips no-scrollbar" role="group" aria-label={t('qrSection')}>
          <button type="button" className={`chip${section === 'all' ? ' active' : ''}`} aria-pressed={section === 'all'} onClick={() => onSection('all')}>
            {t('sectionAll')}
          </button>
          {sections.map(s => (
            <button key={s.id} type="button" className={`chip${section === s.id ? ' active' : ''}`} aria-pressed={section === s.id} onClick={() => onSection(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="v2-toolbar-row">
        <div className="v2-segmented" role="radiogroup" aria-label={t('perPage')}>
          <span className="v2-segmented-label" aria-hidden="true">{t('perPage')}</span>
          {PER_PAGE_OPTIONS.map(n => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={perPage === n}
              className={`v2-segment${perPage === n ? ' is-active' : ''}`}
              onClick={() => onPerPage(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <label className="v2-check">
          <input type="checkbox" checked={showCode} onChange={e => onShowCode(e.target.checked)} />
          <span>{t('showCode')}</span>
        </label>

        <button type="button" className="btn btn-primary v2-print-btn" disabled={!canPrint} onClick={onPrint}>
          {t('print')}
        </button>
      </div>
    </div>
  )
}
