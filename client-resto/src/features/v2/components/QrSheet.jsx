import { useTranslation } from 'react-i18next'
import QrCard from './QrCard'

/** Splits the printable tables into A4 pages of `perPage` cards. */
export function paginate(tables, perPage) {
  const pages = []
  for (let i = 0; i < tables.length; i += perPage) pages.push(tables.slice(i, i + perPage))
  return pages
}

// A4 sheets of QR cards (1, 4 or 6 per page). Used twice: the on-screen preview
// and the print-only copy that QrSheetPage portals into <body>. Sizes are in
// container units so the preview matches the printed page exactly.
export default function QrSheet({ tables, images, perPage, showCode, restaurantName, onRetry, label = true }) {
  const { t } = useTranslation('v2')
  const pages = paginate(tables, perPage)
  return (
    <>
      {pages.map((page, i) => (
        <section key={i} className={`v2-qr-page v2-qr-page--${perPage}`} aria-label={label ? t('qrPageLabel', { n: i + 1 }) : undefined}>
          {page.map(table => (
            <QrCard
              key={table.id}
              table={table}
              restaurantName={restaurantName}
              image={images[table.id]}
              showCode={showCode}
              onRetry={onRetry}
            />
          ))}
        </section>
      ))}
    </>
  )
}
