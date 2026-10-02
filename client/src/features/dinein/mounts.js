import './styles.css'

// Dine-in helpers shared by the cart sheet, the table screen and the claim flows. Importing from here also loads the
// feature stylesheet.
export { default as OrderCard } from './components/OrderCard'
export { default as OrderTotals } from './components/OrderTotals'
export { default as SeatChip } from './components/SeatChip'
export { priceOrder, ratesFromOrders, ratesFromAnswer, DEFAULT_TAX_RATE, DEFAULT_SERVICE_RATE } from './pricing'
export { useOrderRates, rememberRates } from './useOrderRates'
export { claimErrorMessage } from './claimErrors'
export { LIVE_STATUSES, statusView } from './orderStatus'
