import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '@shared/helpers'
import { THEME_DEFAULT_ACCENT } from '../menuDesign'

const ROWS = [
  { id: 1, price: 6.5, desc: true },
  { id: 2, price: 18 },
  { id: 3, price: 7, soldOut: true },
]

/** Sets a CSS custom property from data (a colour the owner picked) without an inline style attribute. */
export function useCssVar(name, value) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    ref.current?.style.setProperty(name, value)
  }, [name, value])
  return ref
}

// Live mini-preview of one menu style: one section title and three dishes (name, leader, price, an italic
// description, a sold-out row). A port of the consumer menu themes: the two apps share no code, so the look
// is repeated in menuDesign.css under .v2-mp--<theme>. Decorative: the surrounding control carries the name.
export default function MenuThemePreview({ theme, accent, showPhotos, note }) {
  const { t } = useTranslation('v2')
  const ref = useCssVar('--mp-accent', accent || THEME_DEFAULT_ACCENT[theme])
  const trimmed = note.trim()

  return (
    <div ref={ref} className={`v2-mp v2-mp--${theme}`} aria-hidden="true">
      {trimmed && <div className="v2-mp-note">{trimmed}</div>}
      <div className="v2-mp-head">
        <div className="v2-mp-title">{t('mdSampleSection')}</div>
        <div className="v2-mp-orn"><i /></div>
      </div>
      <ul className="v2-mp-list">
        {ROWS.map(r => (
          <li key={r.id} className={`v2-mp-row${r.soldOut ? ' is-sold' : ''}`}>
            <div className="v2-mp-body">
              <div className="v2-mp-line">
                <span className="v2-mp-name">{t(`mdSampleDish${r.id}`)}</span>
                {r.soldOut && <span className="v2-mp-tag">{t('mdSoldOut')}</span>}
                <span className="v2-mp-leader" />
                <span className="v2-mp-price">{formatPrice(r.price)}</span>
              </div>
              {r.desc && <div className="v2-mp-desc">{t('mdSampleDesc1')}</div>}
            </div>
            {showPhotos && <span className="v2-mp-thumb" />}
          </li>
        ))}
      </ul>
    </div>
  )
}
