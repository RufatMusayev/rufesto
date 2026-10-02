import { useTranslation } from 'react-i18next'
import QrCard from './QrCard'

/** Splits the printable cards into A4 pages of `perPage` cards. */
export function paginate(cards, perPage) {
  const pages = []
  for (let i = 0; i < cards.length; i += perPage) pages.push(cards.slice(i, i + perPage))
  return pages
}

// A4 sheets of QR cards (1, 4 or 6 per page). Used twice: the on-screen preview
// and the print-only copy that QrSheetPage portals into <body>. Sizes are in
// container units so the preview matches the printed page exactly. `cards` come
// from buildQrCards (table cards, plus one card per chair when "Per chair" is on).
export default function QrSheet({ cards, images, perPage, showCode, restaurantName, onRetry, label = true }) {
  const { t } = useTranslation('v2')
  const pages = paginate(cards, perPage)
  return (
    <>
      {pages.map((page, i) => (
        <section key={i} className={`v2-qr-page v2-qr-page--${perPage}`} aria-label={label ? t('qrPageLabel', { n: i + 1 }) : undefined}>
          {page.map(card => (
            <QrCard
              key={card.id}
              card={card}
              restaurantName={restaurantName}
              image={images[card.id]}
              showCode={showCode}
              onRetry={onRetry}
            />
          ))}
        </section>
      ))}
    </>
  )
}
