import { useEffect, useRef, useState, useMemo } from 'react'
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
  const [restaurants, setRestaurants] = useState([])
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
      const lat = r.latitude || BAKU_CENTER[0] + (Math.random() - 0.5) * 0.02
      const lng = r.longitude || BAKU_CENTER[1] + (Math.random() - 0.5) * 0.02
      const color = CUISINE_COLORS[r.cuisine_type?.toLowerCase()] || '#f59e0b'

      const icon = window.L.divIcon({
        className: '',
        html: `<div style="
          width:32px;height:32px;border-radius:50%;
          background:${color};border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          font-size:14px;cursor:pointer;
        ">🍽</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })

      window.L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:system-ui;text-align:center;min-width:120px;">
            <strong style="font-size:13px;">${r.name}</strong><br/>
            <span style="font-size:11px;color:#666;">${r.cuisine_type || ''} · ${r.address || 'Baku'}</span><br/>
            <a href="/restaurant/${r.slug}" style="
              display:inline-block;margin-top:6px;padding:4px 12px;
              background:#8B2D42;color:#F5F0E8;border-radius:6px;
              font-size:11px;font-weight:600;text-decoration:none;
            ">View Menu</a>
          </div>
        `)
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
      borderRadius: isMobile ? 12 : 0,
      border: isMobile ? '1px solid var(--border)' : 'none',
    }}>
      <div ref={mapRef} style={{
        width: '100%',
        height: '100%',
      }} />

      <div style={{
        position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1000,
        display: 'flex', gap: 6,
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg)', borderRadius: 10,
          padding: '8px 12px',
          border: '1px solid var(--border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2">
            <circle cx="10.5" cy="10.5" r="7.5" />
            <line x1="16.5" y1="16.5" x2="22" y2="22" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: '0.82rem', color: 'var(--t3)' }}>Search restaurants nearby...</span>
        </div>
      </div>

      {restaurants.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 1000,
          display: 'flex', gap: 8, overflowX: 'auto',
          paddingBottom: 4,
        }} className="no-scrollbar">
          {restaurants.map(r => (
            <button
              key={r.id}
              onClick={() => navigate(`/restaurant/${r.slug}`)}
              style={{
                flex: '0 0 auto',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                minWidth: 160,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: CUISINE_COLORS[r.cuisine_type?.toLowerCase()] || '#f59e0b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', flexShrink: 0,
              }}>🍽</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap' }}>
                  {r.name}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                  {r.cuisine_type || 'Restaurant'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
