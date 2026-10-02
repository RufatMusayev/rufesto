import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import MobileMoreSheet from './MobileMoreSheet'
import { MoreIcon } from './navIcons'

// Bottom nav of the phone layout. Admin and manager have 11 entries, which do
// not fit in 390 px, so the bar scrolls sideways: a fade with an arrow marks
// each edge that has more items behind it, and the current page's item is
// scrolled into view when the route changes. `items` = [{ to, label, end, icon }].
// A "More" button stays pinned at the right end: it opens the sheet with language, theme and Sign Out, which the
// desktop sidebar footer holds but a phone does not show.
export default function MobileNav({ items }) {
  const { t } = useTranslation('nav')
  const [moreOpen, setMoreOpen] = useState(false)
  const navRef = useRef(null)
  const { pathname } = useLocation()
  const [more, setMore] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = navRef.current
    if (!el) return
    const left = el.scrollLeft > 4
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setMore(prev => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useEffect(() => {
    const el = navRef.current
    if (!el) return undefined
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, items.length])

  useEffect(() => {
    const el = navRef.current
    const active = el?.querySelector('.dash-mobile-nav-item.active')
    if (!el || !active) return
    el.scrollLeft = Math.max(0, active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2)
    measure()
  }, [pathname, measure])

  return (
    <div className={`dash-mobile-nav-wrap${more.left ? ' has-more-left' : ''}${more.right ? ' has-more-right' : ''}`}>
      <nav className="dash-mobile-nav" ref={navRef} onScroll={measure}>
        {items.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `dash-mobile-nav-item${isActive ? ' active' : ''}`}>
            <n.icon />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <button type="button" className="dash-mobile-nav-item dash-mobile-more" aria-haspopup="dialog"
        aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
        <MoreIcon />
        <span>{t('more')}</span>
      </button>
      {moreOpen && <MobileMoreSheet onClose={() => setMoreOpen(false)} />}
    </div>
  )
}
