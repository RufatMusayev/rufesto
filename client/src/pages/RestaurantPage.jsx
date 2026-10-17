import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LoadError from '../components/LoadError'
import AuthModal from '../components/AuthModal'
import DishDetailSheet from '../components/DishDetailSheet'
import FloorPlanSheet from '../components/FloorPlanSheet'
import { useCart } from '../contexts/CartContext'
import CartErrorBanner from '../features/restaurant/CartErrorBanner'
import PageSkeleton from '../features/restaurant/PageSkeleton'
import PostsTab from '../features/restaurant/PostsTab'
import RestaurantHeader from '../features/restaurant/RestaurantHeader'
import RestaurantNotFound from '../features/restaurant/RestaurantNotFound'
import RestaurantTabs, { TAB_IDS } from '../features/restaurant/RestaurantTabs'
import MenuTab from '../features/restaurant/menu/MenuTab'
import { findDish, toSheetDish } from '../features/restaurant/mappers'
import { takeScroll, useFollow, useRestaurant, useSeats } from '../features/restaurant/hooks'
import { useMenu } from '../features/restaurant/useMenu'
import '../features/restaurant/restaurant.css'

// Restaurant page shell (docs/V2-CONTRACT.md 19.2): header, a sticky Posts | Menu tab bar, and the two tabs.
// All data and rendering live in features/restaurant; this file only wires them and owns the tab / deep-link state.
export default function RestaurantPage() {
  const { slug } = useParams()
  return <RestaurantView key={slug} slug={slug} />   // a different restaurant is a fresh page, never a patched one
}

function RestaurantView({ slug }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { i18n } = useTranslation()
  const { tableId, tableReady, restaurantId: cartRestaurantId, addDish, cartError, clearCartError } = useCart()
  const { status, restaurant, retry } = useRestaurant(slug)
  const rid = restaurant?.id
  const menuState = useMenu(slug, rid)
  const seats = useSeats(rid)
  const follow = useFollow(rid)
  const [showFloor, setShowFloor] = useState(false)
  const [dishDetail, setDishDetail] = useState(null)
  const [impatient, setImpatient] = useState(false)
  const anchor = useRef(null)
  const openedDish = useRef(null)
  const defaultTab = useRef(null)
  const visited = useRef(new Set())

  const lang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2)
  const menu = menuState.menu
  const dishParam = params.get('dish')
  const isSeatedHere = !!rid && cartRestaurantId === rid && !!tableId

  // Which tab opens: ?tab=, else Menu for a "Order this" link (?dish=) and for a guest seated here, else Posts.
  // Decided once, when the restaurant first shows AND the cart knows whether the guest is seated (tableReady; a
  // fresh tab waits one server read, never longer than 1.5 s), so a late seat sync never yanks the guest off Posts.
  const urlTab = params.get('tab')
  const explicit = TAB_IDS.includes(urlTab) ? urlTab : null
  if (defaultTab.current === null && restaurant && (explicit || dishParam || tableReady || impatient)) {
    defaultTab.current = dishParam || isSeatedHere ? 'menu' : 'posts'
  }
  const tab = explicit || defaultTab.current || 'posts'
  const known = !!restaurant && (!!explicit || defaultTab.current !== null)
  const deciding = !!restaurant && !known
  if (known) visited.current.add(tab)                       // a tab mounts on its first visit and then stays: no refetch

  // An unknown / inactive slug (header read finds nothing, or restaurant_menu says restaurant_not_found) gets its own
  // "Restaurant not found" page; it is not a redirect, so a mistyped or stale link says what happened.
  const notFound = status === 'missing' || (menuState.status === 'error' && menuState.error?.code === 'restaurant_not_found')

  useEffect(() => {
    const id = setTimeout(() => setImpatient(true), 1500)
    return () => clearTimeout(id)
  }, [])

  // Back from a post opened in the grid: return to where the guest was.
  useLayoutEffect(() => {
    if (status !== 'ready') return
    const y = takeScroll(slug)
    if (y) window.scrollTo({ top: y, behavior: 'instant' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectTab = useCallback(next => {
    if (next === tab) return
    const el = anchor.current
    if (el) {
      const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')) || 0
      const top = el.getBoundingClientRect().top + window.scrollY - dock
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'instant' })   // new tab starts at its top
    }
    const nextParams = new URLSearchParams(params)
    nextParams.set('tab', next)
    nextParams.delete('dish')
    setParams(nextParams, { replace: true })
  }, [tab, params, setParams])

  const openDishById = useCallback(id => {
    const dish = findDish(menu, id)
    if (dish) setDishDetail(toSheetDish(dish, lang, restaurant))
  }, [menu, lang, restaurant])

  // ?dish=<id> (Home post / promo "Order this"): open that dish once the menu is here; unknown ids are ignored.
  useEffect(() => {
    if (!dishParam || menuState.status !== 'ready' || !restaurant) return
    const tag = `${slug}:${dishParam}`
    if (openedDish.current === tag) return
    openedDish.current = tag
    openDishById(dishParam)
  }, [dishParam, menuState.status, restaurant, slug, openDishById])

  if (notFound) return <RestaurantNotFound />
  if (status === 'loading' || deciding) return <PageSkeleton />
  if (status === 'error') return <div className="rst-page"><LoadError onRetry={retry} /></div>
  if (!restaurant) return null

  const stats = {
    dishes: menu ? menu.dishCount : null,
    reviews: menu ? menu.reviewCount : null,
    followers: follow.count,
    seatsFree: seats.free,
    seatsTotal: seats.total,
  }

  return (
    <div className="rst-page">
      <CartErrorBanner message={cartError} onClose={clearCartError} />
      <RestaurantHeader
        restaurant={restaurant}
        stats={stats}
        follow={follow}
        onBack={() => (location.key === 'default' ? navigate('/') : navigate(-1))}
        onFloor={() => setShowFloor(true)}
      />

      <div ref={anchor} className="rst-anchor" aria-hidden="true" />
      <RestaurantTabs tab={tab} onChange={selectTab} />

      {TAB_IDS.map(id => (
        <div key={id} role="tabpanel" id={`rst-panel-${id}`} aria-labelledby={`rst-tab-${id}`} className="rst-panel" hidden={tab !== id}>
          {visited.current.has(id) && (id === 'posts' ? (
            <PostsTab restaurant={restaurant} accent={menu?.design.accent} onOpenDish={openDishById} />
          ) : (
            <MenuTab
              menuState={menuState}
              restaurant={restaurant}
              seated={isSeatedHere}
              active={tab === 'menu'}
              onOpenDish={setDishDetail}
              onAdd={addDish}
            />
          ))}
        </div>
      ))}

      {showFloor && (
        <FloorPlanSheet
          restaurant={restaurant}
          onClose={() => setShowFloor(false)}
          onReserve={table => {
            // The one booking flow picks the table itself (create_group_booking), so the floor plan hands over to it.
            // The picked table travels as ?table=<id> (+ its number in the router state) and is only shown there.
            setShowFloor(false)
            navigate(`/book/${slug}?table=${encodeURIComponent(table.id)}`, {
              state: { table: { id: table.id, number: table.table_number, section: table.sections?.name || null } },
            })
          }}
        />
      )}
      {dishDetail && <DishDetailSheet dish={dishDetail} onClose={() => setDishDetail(null)} />}
      {follow.askAuth && <AuthModal onClose={follow.cancelAuth} onSuccess={follow.closeAuth} />}
    </div>
  )
}
