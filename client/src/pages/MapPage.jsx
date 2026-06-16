import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const h = () => setMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return mobile
}

const BAKU_CENTER = [40.4093, 49.8671]

const CUISINE_COLORS = {
  italian: '#e74c3c',
  azerbaijani: '#27ae60',
  japanese: '#3498db',
}

export default function MapPage() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef({})
  const [restaurants, setRestaurants] = useState([])
  const [selected, setSelected] = useState(null)
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  useEffect(() => {
    supabase
      .from('restaurants')
      .select('id, name, slug, cuisine_type, address, latitude, longitude')
      .then(({ data }) => setRestaurants(data || []))
  }, [])

  useEffect(() => {
    if (mapInstance.current || !mapRef.current || !window.L) return

    const map = window.L.map(mapRef.current, {
      zoomControl: false,
    }).setView(BAKU_CENTER, 13)

    window.L.control.zoom({ position: 'bottomright' }).addTo(map)

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    mapInstance.current = map

    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapInstance.current || !restaurants.length) return

    const map = mapInstance.current

    restaurants.forEach(r => {
      const lat = r.latitude != null ? r.latitude : BAKU_CENTER[0] + (Math.random() - 0.5) * 0.02
      const lng = r.longitude != null ? r.longitude : BAKU_CENTER[1] + (Math.random() - 0.5) * 0.02
      const color = CUISINE_COLORS[r.cuisine_type?.toLowerCase()] || '#8B2D42'

      const icon = window.L.divIcon({
        className: '',
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:${color};border:3px solid #F5F0E8;
          box-shadow:0 4px 12px rgba(0,0,0,0.25);
          display:flex;align-items:center;justify-content:center;
          font-size:15px;cursor:pointer;
          transition:transform 0.15s;
        ">🍽</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

      const marker = window.L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:'DM Sans',system-ui;text-align:center;min-width:140px;padding:4px 0;">
            <strong style="font-family:'Playfair Display',serif;font-size:14px;color:#1a120e;">${r.name}</strong><br/>
            <span style="font-size:11px;color:#8B6B5A;">${r.cuisine_type || ''} · ${r.address || 'Baku'}</span><br/>
            <a href="/restaurant/${r.slug}" style="
              display:inline-block;margin-top:8px;padding:6px 16px;
              background:#8B2D42;color:#F5F0E8;border-radius:8px;
              font-size:11px;font-weight:700;text-decoration:none;
              font-family:'DM Sans',system-ui;
            ">View Menu</a>
          </div>
        `)
      markersRef.current[r.id] = marker
    })
  }, [restaurants, navigate])

  return (
    <div style={{
      position: 'relative',
      height: isMobile
        ? 'calc(100dvh - var(--nav-h) - var(--bottom-h) - 40px)'
        : '100dvh',
      overflow: 'hidden',
      margin: isMobile ? '8px 8px 32px' : 0,
      borderRadius: isMobile ? 16 : 0,
      border: isMobile ? '1px solid var(--border)' : 'none',
      boxShadow: isMobile ? '0 4px 24px rgba(0,0,0,0.12)' : 'none',
    }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Search overlay */}
      <div style={{
        position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1000,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--bg)', borderRadius: 12,
          padding: '10px 14px',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2">
            <circle cx="10.5" cy="10.5" r="7.5" />
            <line x1="16.5" y1="16.5" x2="22" y2="22" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: '0.86rem', color: 'var(--t3)', fontFamily: "'DM Sans', system-ui" }}>
            Restaurants near you…
          </span>
        </div>
      </div>

      {/* Restaurant chips at bottom */}
      {restaurants.length > 0 && (
        <div
          className="no-scrollbar"
          style={{
            position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 1000,
            display: 'flex', gap: 8, overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {restaurants.map(r => {
            const isSelected = selected === r.id
            return (
              <button
                key={r.id}
                onClick={() => {
                  const lat = r.latitude != null ? r.latitude : BAKU_CENTER[0]
                  const lng = r.longitude != null ? r.longitude : BAKU_CENTER[1]
                  setSelected(r.id)
                  if (mapInstance.current) {
                    mapInstance.current.setView([lat, lng], 16)
                    markersRef.current[r.id]?.openPopup()
                  }
                }}
                style={{
                  flex: '0 0 auto',
                  background: isSelected ? 'var(--accent)' : 'var(--bg)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 12,
                  padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                  minWidth: 160,
                  transition: 'all 150ms var(--ease-out)',
                }}
                onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: CUISINE_COLORS[r.cuisine_type?.toLowerCase()] || '#8B2D42',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '15px', flexShrink: 0,
                }}>
                  🍽
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: isSelected ? '#F5F0E8' : 'var(--t1)', whiteSpace: 'nowrap' }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: isSelected ? 'rgba(245,240,232,0.7)' : 'var(--t3)', whiteSpace: 'nowrap' }}>
                    {r.cuisine_type || 'Restaurant'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
