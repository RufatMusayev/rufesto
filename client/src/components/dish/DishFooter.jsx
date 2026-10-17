import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { formatPrice } from '../../lib/helpers'

/**
 * The sticky footer, one of four (UX plan 7.2):
 * 1. seated here: "Add to order . price" (full width, primary)
 * 2. seated elsewhere: "You're seated at <venue>" (text, no button)
 * 3. not seated: "Scan QR to order" (primary, flex 1) + ghost "Reserve"
 * 4. sold out: muted "Sold out today" + ghost "Reserve" (no Reserve when seated)
 */
export default function DishFooter({ dish, seatedHere, seatedElsewhere, seatedName, onAdd, onScan, toast }) {
  const { t } = useTranslation(['menu', 'restaurant'])
  const slug = dish.restaurants?.slug
  const reserve = slug ? <Link to={`/book/${slug}`} className="btn btn-ghost dds-reserve">{t('menu:dish.reserve')}</Link> : null
  let body
  if (!dish.available) {
    body = (
      <>
        <span className="dds-soldnote">{t('menu:dish.soldOutToday')}</span>
        {!seatedHere && !seatedElsewhere && reserve}
      </>
    )
  } else if (seatedElsewhere) {
    body = (
      <p className="dds-seated" role="status">
        {seatedName
          ? <Trans t={t} i18nKey="restaurant:dish.seatedAt" values={{ venue: seatedName }} components={{ b: <strong /> }} />
          : t('restaurant:dish.seatedElsewhere')}
      </p>
    )
  } else if (seatedHere) {
    body = (
      <button type="button" className="btn btn-primary dds-cta pressable" onClick={onAdd}>
        {t('menu:addToOrder', { price: formatPrice(dish.price) })}
      </button>
    )
  } else {
    body = (
      <>
        <button type="button" className="btn btn-primary dds-cta pressable" onClick={onScan}>{t('restaurant:dish.scanToOrder')}</button>
        {reserve}
      </>
    )
  }
  return (
    <>
      {toast ? <div className="dds-toast" role="status">{toast}</div> : null}
      <div className="dds-foot">{body}</div>
    </>
  )
}
