import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BottomSheet, useSheetClose } from '../../components/ui'

// "Open in": hands the trip over to a navigation app (docs/MAP-PLAN-2026-10-18.md 4, Directions). No turn-by-turn here.
// Walking mode up to 1.5 km when the distance is known, driving otherwise. The app used last moves to the top.
const KEY = 'rufesto_nav_app'
const WALK_KM = 1.5

const isApple = () => {
  try {
    const ua = navigator.userAgent || ''
    const platform = navigator.platform || ''
    return /iPad|iPhone|iPod/.test(ua) || /Mac/.test(platform)
  } catch {
    return false
  }
}

const readLast = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const writeLast = id => { try { localStorage.setItem(KEY, id) } catch { /* storage blocked */ } }

const APPS = {
  google: { label: 'Google Maps', url: (ll, walk) => `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=${walk ? 'walking' : 'driving'}` },
  waze: { label: 'Waze', url: ll => `https://waze.com/ul?ll=${ll}&navigate=yes` },
  yandex: { labelKey: 'yandex', url: (ll, walk) => `https://yandex.com/maps/?rtext=~${ll}&rtt=${walk ? 'pd' : 'auto'}` },
  apple: { label: 'Apple Maps', url: (ll, walk) => `https://maps.apple.com/?daddr=${ll}&dirflg=${walk ? 'w' : 'd'}` },
}

/** Exported for tests: the destination links in the order they are listed. */
export function directionLinks(place, km, apple = isApple(), last = readLast()) {
  const ll = `${place.lat},${place.lng}`
  const walk = km != null && km <= WALK_KM
  const ids = ['google', 'waze', 'yandex', ...(apple ? ['apple'] : [])]
  if (last && ids.includes(last)) ids.splice(0, 0, ...ids.splice(ids.indexOf(last), 1))
  return ids.map(id => ({ id, labelKey: APPS[id].labelKey, label: APPS[id].label, href: APPS[id].url(ll, walk) }))
}

function Rows({ place, km, onCopied }) {
  const { t } = useTranslation('map')
  const close = useSheetClose()
  const links = useMemo(() => directionLinks(place, km), [place, km])

  const open = link => {
    writeLast(link.id)
    window.open(link.href, '_blank', 'noopener')
    close()
  }

  async function copy() {
    const text = place.address || place.name
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.className = 'mp-clip'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        ta.remove()
      } catch { ok = false }
    }
    close()
    if (ok) onCopied?.()
  }

  return (
    <>
    <p className="mp-dir-sub">{place.name}</p>
    <ul className="mp-dir-list">
      {links.map(l => (
        <li key={l.id}>
          <button type="button" className="mp-dir-row" onClick={() => open(l)}>
            <span>{l.labelKey ? t(l.labelKey) : l.label}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </button>
        </li>
      ))}
      <li>
        <button type="button" className="mp-dir-row mp-dir-copy" onClick={copy}>
          <span>{t('copyAddress')}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </svg>
        </button>
      </li>
    </ul>
    </>
  )
}

/** A modal sheet above the map (it takes a normal scroll lock and makes the page inert). Mount it while open. */
export default function DirectionsSheet({ place, km, onClose, onCopied }) {
  const { t } = useTranslation('map')
  return (
    <BottomSheet title={t('openIn')} onClose={onClose} id="map-directions" className="mp-dir-sheet">
      <Rows place={place} km={km} onCopied={onCopied} />
    </BottomSheet>
  )
}
