import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { categoryEmoji, dishBackground, formatPrice } from '../lib/helpers'

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

  useEffect(() => {
    supabase
      .from('dishes')
      .select('*, restaurants(name, slug, cuisine_type)')
      .order('review_count', { ascending: false })
      .limit(100)
      .then(({ data }) => { setDishes(data || []); setLoading(false) })
  }, [])

  const filtered = dishes.filter(d => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !d.restaurants?.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'vegan' && !d.is_vegan) return false
    if (filter === 'vegetarian' && !d.is_vegetarian) return false
    if (filter === 'gluten_free' && !d.is_gluten_free) return false
    if (filter === 'spicy' && !d.is_spicy) return false
    if (filter === 'available' && !d.available) return false
    return true
  })

  return (
    <div>
      {/* Search + filters */}
      <div style={{
        position: 'sticky', top: 'var(--nav-h)', zIndex: 40,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 14px 0',
      }}>
        <div style={{ position: 'relative', maxWidth: 470, margin: '0 auto 10px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)',
          }}>
            <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input className="input" placeholder="Search"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{
              paddingLeft: '2.25rem',
              background: 'var(--s3)',
              borderRadius: 10,
              border: 'none',
            }}
          />
        </div>

        <div className="no-scrollbar" style={{
          display: 'flex', gap: '0.35rem', overflowX: 'auto',
          paddingBottom: '10px', maxWidth: 470, margin: '0 auto',
        }}>
          {FILTERS.map(f => (
            <button key={f.id} className={`chip${filter === f.id ? ' active' : ''}`}
              onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Explore grid */}
      <div style={{ maxWidth: 470, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2 }}>
            {Array.from({ length: 12 }).map((_, i) => {
              const isLarge = i === 2 || i === 6
              return (
                <div key={i} className="skeleton" style={{
                  aspectRatio: isLarge ? '1/2' : '1', borderRadius: 0,
                  gridRow: isLarge ? 'span 2' : undefined,
                }} />
              )
            })}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty" style={{ padding: '4rem 1.5rem' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 48, height: 48, margin: '0 auto 1rem', opacity: 0.3 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
            </svg>
            <p style={{ fontSize: '0.82rem', color: 'var(--t3)' }}>No dishes found</p>
          </div>
        ) : (
          <ExploreGrid dishes={filtered} />
        )}
      </div>
    </div>
  )
}

function ExploreGrid({ dishes }) {
  const cells = []
  let i = 0

  while (i < dishes.length) {
    const batch = dishes.slice(i, i + 9)

    if (batch.length >= 3) {
      cells.push(<SmallTile key={batch[0].id} dish={batch[0]} />)
      cells.push(<SmallTile key={batch[1].id} dish={batch[1]} />)
      cells.push(
        <LargeTile key={batch[2].id} dish={batch[2]} spanRow />
      )
    }

    if (batch.length >= 6) {
      cells.push(<SmallTile key={batch[3].id} dish={batch[3]} />)
      cells.push(<SmallTile key={batch[4].id} dish={batch[4]} />)
      cells.push(<SmallTile key={batch[5].id} dish={batch[5]} />)
    } else {
      for (let j = 3; j < batch.length; j++) {
        cells.push(<SmallTile key={batch[j].id} dish={batch[j]} />)
      }
    }

    if (batch.length >= 9) {
      cells.push(
        <LargeTile key={batch[6].id} dish={batch[6]} spanRow />
      )
      cells.push(<SmallTile key={batch[7].id} dish={batch[7]} />)
      cells.push(<SmallTile key={batch[8].id} dish={batch[8]} />)
    } else {
      for (let j = 6; j < batch.length; j++) {
        cells.push(<SmallTile key={batch[j].id} dish={batch[j]} />)
      }
    }

    i += 9
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 2,
    }}>
      {cells}
    </div>
  )
}

function SmallTile({ dish }) {
  return (
    <Link to={`/restaurant/${dish.restaurants?.slug}`}>
      <div className="ig-grid-tile" style={{
        aspectRatio: '1',
        background: dishBackground(dish.category),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2.5rem',
        opacity: dish.available ? 1 : 0.4,
        position: 'relative',
      }}>
        <span style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}>
          {categoryEmoji(dish.category)}
        </span>

        {dish.available && (
          <div style={{
            position: 'absolute', top: 5, right: 5,
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--green)', boxShadow: '0 0 4px rgba(34,197,94,0.5)',
          }} />
        )}

        {!dish.available && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontSize: '0.5rem', color: '#e5e5e5', fontWeight: 700,
              letterSpacing: 1, textTransform: 'uppercase',
            }}>Sold Out</span>
          </div>
        )}

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
          padding: '14px 5px 4px',
        }}>
          <div style={{
            fontSize: '0.58rem', fontWeight: 600, color: '#f5f5f5',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {dish.name}
          </div>
          <div style={{ fontSize: '0.5rem', color: 'var(--accent)', fontWeight: 600 }}>
            {formatPrice(dish.price)}
          </div>
        </div>
      </div>
    </Link>
  )
}

function LargeTile({ dish, spanRow }) {
  return (
    <Link to={`/restaurant/${dish.restaurants?.slug}`} style={{
      gridRow: spanRow ? 'span 2' : undefined,
    }}>
      <div className="ig-grid-tile" style={{
        aspectRatio: '1/2',
        background: dishBackground(dish.category),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '4rem',
        opacity: dish.available ? 1 : 0.4,
        position: 'relative',
      }}>
        <span style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}>
          {categoryEmoji(dish.category)}
        </span>

        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.25) 100%)',
          pointerEvents: 'none',
        }} />

        {dish.available && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
            borderRadius: 100, padding: '3px 8px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 5px var(--green)' }} />
            <span style={{ fontSize: '0.55rem', fontWeight: 600, color: '#e5e5e5' }}>Live</span>
          </div>
        )}

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
          padding: '24px 10px 8px',
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f5f5f5', marginBottom: 1 }}>
            {dish.name}
          </div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.7)' }}>
            {dish.restaurants?.name} · {formatPrice(dish.price)}
          </div>
        </div>
      </div>
    </Link>
  )
}
