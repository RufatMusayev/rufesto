import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { categoryEmoji, dishBackground, formatPrice } from '../lib/helpers'
import DishDetailSheet from '../components/DishDetailSheet'

const FILTERS = [
  { id: 'all',         label: 'All'          },
  { id: 'available',   label: 'Available'    },
  { id: 'vegan',       label: 'Vegan'        },
  { id: 'vegetarian',  label: 'Veggie'       },
  { id: 'gluten_free', label: 'Gluten-free'  },
  { id: 'spicy',       label: 'Spicy'        },
]

export default function ExplorePage() {
  const [dishes, setDishes] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [dishDetail, setDishDetail] = useState(null)

  useEffect(() => {
    supabase
      .from('dishes')
      .select('*, restaurants(name, slug, cuisine_type)')
      .order('review_count', { ascending: false })
      .limit(100)
      .then(({ data }) => { setDishes(data || []); setLoading(false) })

    const channel = supabase
      .channel('explore-dishes-realtime')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dishes' },
        (payload) => {
          setDishes(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d))
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const filtered = dishes.filter(d => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !(d.restaurants?.name || '').toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'vegan' && !d.is_vegan) return false
    if (filter === 'vegetarian' && !d.is_vegetarian) return false
    if (filter === 'gluten_free' && !d.is_gluten_free) return false
    if (filter === 'spicy' && !d.is_spicy) return false
    if (filter === 'available' && !d.available) return false
    return true
  })

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Sticky search bar */}
      <div style={{
        padding: '12px 16px',
        position: 'sticky', top: 'var(--nav-h)',
        background: 'var(--bg)', zIndex: 5,
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ position: 'relative' }}>
          <svg
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="10.5" cy="10.5" r="7.5" />
            <line x1="16.5" y1="16.5" x2="22" y2="22" strokeLinecap="round" />
          </svg>
          <input
            className="input"
            placeholder="Dishes, restaurants…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 40, borderRadius: 12, fontSize: '0.9rem' }}
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className="no-scrollbar" style={{
        display: 'flex', gap: 6, padding: '10px 16px',
        overflowX: 'auto', borderBottom: '1px solid var(--border)',
      }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              flexShrink: 0, padding: '5px 14px', borderRadius: 100,
              border: 'none', cursor: 'pointer',
              background: filter === f.id ? 'var(--accent)' : 'var(--s3)',
              color: filter === f.id ? '#F5F0E8' : 'var(--t3)',
              fontSize: '0.76rem', fontWeight: 600,
              transition: 'background 150ms var(--ease-out), color 150ms',
              whiteSpace: 'nowrap',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px' }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{ background: 'var(--s2)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div className="skeleton" style={{ aspectRatio: '1' }} />
              <div style={{ padding: '8px 10px' }}>
                <div className="skeleton" style={{ height: 11, width: '75%', marginBottom: 5, borderRadius: 4 }} />
                <div className="skeleton" style={{ height: 9, width: '50%', marginBottom: 6, borderRadius: 4 }} />
                <div className="skeleton" style={{ height: 11, width: '35%', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--t3)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Nothing found</div>
          <div style={{ fontSize: '0.82rem' }}>Try a different search or filter</div>
        </div>
      )}

      {/* Dish grid */}
      {!loading && filtered.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 10, padding: '12px 16px',
        }}>
          {filtered.map((dish, i) => (
            <div
              key={dish.id}
              className="stagger-item"
              onClick={() => setDishDetail(dish)}
              style={{
                background: 'var(--s2)', borderRadius: 12,
                overflow: 'hidden', border: '1px solid var(--border)',
                cursor: 'pointer',
                animationDelay: `${Math.min(i, 9) * 40}ms`,
                transition: 'transform 180ms var(--ease-out)',
              }}
              onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
              onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {/* Image */}
              <div style={{
                aspectRatio: '1',
                background: dish.photo ? '#000' : dishBackground(dish.category),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2.5rem', position: 'relative', overflow: 'hidden',
              }}>
                {dish.photo ? (
                  <img
                    src={dish.photo}
                    alt={dish.name}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                  />
                ) : (
                  <span style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}>
                    {categoryEmoji(dish.category)}
                  </span>
                )}
                {!dish.available && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(26,18,16,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 700, color: 'var(--t3)',
                      background: 'rgba(26,18,16,0.8)', padding: '2px 8px',
                      borderRadius: 100, textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                      Unavailable
                    </span>
                  </div>
                )}
                {dish.available && (
                  <div style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--sage)',
                    boxShadow: '0 0 5px var(--sage)',
                  }} />
                )}
              </div>

              {/* Info */}
              <div style={{ padding: '8px 10px' }}>
                <div style={{
                  fontSize: '0.8rem', fontWeight: 600, color: 'var(--t1)',
                  marginBottom: 2, lineHeight: 1.3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {dish.name}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--t3)', marginBottom: 6 }}>
                  {dish.restaurants?.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '0.82rem', fontWeight: 600, color: 'var(--t1)',
                  }}>
                    {formatPrice(dish.price)}
                  </span>
                  {dish.review_count > 0 && (
                    <span style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '0.65rem', color: 'var(--gold)',
                    }}>
                      ★{(dish.rating_avg || 0).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 80 }} />

      {dishDetail && (
        <DishDetailSheet dish={dishDetail} onClose={() => setDishDetail(null)} />
      )}
    </div>
  )
}
