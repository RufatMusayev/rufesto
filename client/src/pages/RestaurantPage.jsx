import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  cuisineEmoji, categoryEmoji, formatPrice, dishBackground,
  cuisineBackground, sectionEmoji, isRestaurantOpen, getTodayHours, timeAgo,
} from '../lib/helpers'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import BookingModal from '../components/BookingModal'
import DishDetailSheet from '../components/DishDetailSheet'

export default function RestaurantPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { tableId, restaurantId: cartRestaurantId, addDish } = useCart()
  const [restaurant, setRestaurant] = useState(null)
  const [sections, setSections] = useState([])
  const [dishes, setDishes] = useState([])
  const [activeSection, setActiveSection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showBook, setShowBook] = useState(false)
  const [dishDetail, setDishDetail] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [seatsFree, setSeatsFree] = useState(0)
  const [seatsTotal, setSeatsTotal] = useState(0)
  const [filters, setFilters] = useState([])

  const isSeatedHere = cartRestaurantId === restaurant?.id && !!tableId

  useEffect(() => {
    let dishChannel
    let tableChannel
    let cancelled = false

    async function loadRestaurant() {
      setLoading(true)
      const { data: rest } = await supabase
        .from('restaurants')
        .select('*, operating_hours(*)')
        .eq('slug', slug)
        .single()
      if (!rest || cancelled) { if (!rest) navigate('/'); return }
      setRestaurant(rest)

      const [{ data: menuData }, { data: dishData }] = await Promise.all([
        supabase
          .from('menu_sections')
          .select('*, menus!inner(restaurant_id, is_active)')
          .eq('menus.restaurant_id', rest.id)
          .eq('menus.is_active', true)
          .order('sort_order'),
        supabase
          .from('dishes')
          .select('*, menu_sections(name)')
          .eq('restaurant_id', rest.id)
          .order('sort_order'),
      ])
      if (cancelled) { setLoading(false); return }
      setSections(menuData || [])
      setDishes(dishData || [])
      setActiveSection(null)

      const { data: tablesData } = await supabase
        .from('tables')
        .select('id, state')
        .eq('restaurant_id', rest.id)
      if (tablesData && !cancelled) {
        setSeatsTotal(tablesData.length)
        setSeatsFree(tablesData.filter(t => t.state === 'free').length)
      }

      if (cancelled) { setLoading(false); return }
      setLoading(false)

      dishChannel = supabase
        .channel(`dishes-${rest.id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'dishes',
          filter: `restaurant_id=eq.${rest.id}`,
        }, payload => {
          setDishes(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d))
        })
        .subscribe()

      tableChannel = supabase
        .channel(`tables-${rest.id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'tables',
          filter: `restaurant_id=eq.${rest.id}`,
        }, () => {
          supabase.from('tables').select('id, state').eq('restaurant_id', rest.id)
            .then(({ data }) => {
              if (data) {
                setSeatsTotal(data.length)
                setSeatsFree(data.filter(t => t.state === 'free').length)
              }
            })
        })
        .subscribe()
    }

    loadRestaurant()
    return () => {
      cancelled = true
      if (dishChannel) supabase.removeChannel(dishChannel)
      if (tableChannel) supabase.removeChannel(tableChannel)
    }
  }, [slug])

  if (loading) return <LoadingSkeleton />

  const filteredDishes = dishes.filter(d => {
    if (filters.includes('vegan') && !d.is_vegan) return false
    if (filters.includes('vegetarian') && !d.is_vegetarian) return false
    if (filters.includes('gluten-free') && !d.is_gluten_free) return false
    if (filters.includes('spicy') && !d.is_spicy) return false
    return true
  })

  const sectionDishes = activeSection
    ? filteredDishes.filter(d => d.menu_section_id === activeSection)
    : filteredDishes

  const open = isRestaurantOpen(restaurant.operating_hours)
  const today = getTodayHours(restaurant.operating_hours)
  const emoji = cuisineEmoji(restaurant.cuisine_type)
  const availableCount = dishes.filter(d => d.available).length
  const reviewTotal = dishes.reduce((s, d) => s + (d.review_count || 0), 0)

  return (
    <div>
      {/* Back button */}
      <button onClick={() => navigate(-1)} style={{
        position: 'absolute', top: 'calc(var(--nav-h, 0px) + 14px)', left: 14, zIndex: 20,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: 'none', borderRadius: '50%',
        width: 36, height: 36, color: 'var(--t1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}>
        <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 18, height: 18 }}>
          <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Cover photo */}
      <div style={{
        height: 220, position: 'relative', overflow: 'hidden',
        background: cuisineBackground(restaurant.cuisine_type),
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '9rem', opacity: 0.2,
          filter: 'blur(2px)',
        }}>
          {emoji}
        </div>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 40%, var(--bg) 100%)',
        }} />
      </div>

      {/* Profile section */}
      <div style={{ maxWidth: 470, margin: '0 auto', padding: '0 16px' }}>
        {/* Avatar + Action buttons row */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginTop: -44, marginBottom: 16,
        }}>
          <div style={{
            width: 86, height: 86, borderRadius: '50%',
            border: '4px solid var(--bg)',
            background: cuisineBackground(restaurant.cuisine_type),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.4rem', flexShrink: 0,
          }}>
            {emoji}
          </div>

          {/* Stats — Instagram style */}
          <div style={{
            display: 'flex', gap: 24, paddingBottom: 6,
          }}>
            <div className="ig-stat">
              <div className="ig-stat-num">{dishes.length}</div>
              <div className="ig-stat-label">dishes</div>
            </div>
            <div className="ig-stat">
              <div className="ig-stat-num">{reviewTotal}</div>
              <div className="ig-stat-label">reviews</div>
            </div>
            <div className="ig-stat">
              <div className="ig-stat-num">{seatsFree}/{seatsTotal}</div>
              <div className="ig-stat-label">seats</div>
            </div>
          </div>
        </div>

        {/* Name */}
        <h1 style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: '0.92rem', fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.3,
        }}>
          {restaurant.name}
        </h1>

        {/* Category label */}
        <p style={{ color: 'var(--t3)', fontSize: '0.82rem', marginTop: 1 }}>
          {restaurant.cuisine_type} Restaurant
        </p>

        {/* Bio / description */}
        {restaurant.description && (
          <p style={{
            fontSize: '0.82rem', color: 'var(--t1)', marginTop: 6,
            lineHeight: 1.5, fontWeight: 400,
          }}>
            {restaurant.description}
          </p>
        )}

        {/* Location + hours inline */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          gap: '0 10px', marginTop: 4, fontSize: '0.78rem', color: 'var(--t3)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 12, height: 12 }}>
              <path fillRule="evenodd" d="M11.536 3.464a5 5 0 0 1 0 7.072l-3.536 3.536a.5.5 0 0 1-.707 0l-3.536-3.536a5 5 0 1 1 7.07-7.072zM8 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" clipRule="evenodd" />
            </svg>
            {restaurant.address}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: open ? 'var(--green)' : 'var(--red)',
            }} />
            <span style={{ color: open ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
              {open ? 'Open' : 'Closed'}
            </span>
            {today && (
              <span>· {today.open} – {today.close}</span>
            )}
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          <button className="btn btn-follow" onClick={() => setShowBook(true)}
            style={{ flex: 1, padding: '7px 0' }}>
            Reserve a Table
          </button>
          <button className="btn btn-ghost" style={{ flex: 1, padding: '7px 0', fontSize: '0.82rem', fontWeight: 700 }}>
            Follow
          </button>
          <button className="btn btn-ghost" style={{ width: 34, padding: 0 }}>
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}>
              <path d="M10 6L6.33 3.75a1 1 0 0 0-1.48.66l-.72 4.5a1 1 0 0 0 .29.87l3.23 3.22-1 5.75a1 1 0 0 0 1.48 1.05L12 17.25l3.87 2.55a1 1 0 0 0 1.48-1.05l-1-5.75 3.23-3.22a1 1 0 0 0 .29-.87l-.72-4.5a1 1 0 0 0-1.48-.66L14 6h-4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Section highlights — Instagram story highlights style */}
      {sections.length > 0 && (
        <div className="no-scrollbar" style={{
          display: 'flex', gap: 16, overflowX: 'auto',
          padding: '18px 16px 4px',
          maxWidth: 470, margin: '0 auto',
        }}>
          <HighlightCircle
            label="All"
            emoji="🍽️"
            active={!activeSection}
            onClick={() => setActiveSection(null)}
            count={dishes.length}
          />
          {sections.map(s => {
            const count = dishes.filter(d => d.menu_section_id === s.id).length
            return (
              <HighlightCircle
                key={s.id}
                label={s.name}
                emoji={sectionEmoji(s.name)}
                active={activeSection === s.id}
                onClick={() => setActiveSection(s.id)}
                count={count}
              />
            )
          })}
        </div>
      )}

      {/* Filter bar */}
      <FilterBar filters={filters} setFilters={setFilters} dishes={dishes} />

      {/* Tab bar — Grid / List toggle */}
      <div style={{
        display: 'flex', borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        marginTop: 12, maxWidth: 470, margin: '12px auto 0',
      }}>
        <button onClick={() => setViewMode('grid')} style={{
          flex: 1, padding: '10px 0', background: 'none', border: 'none',
          borderBottom: viewMode === 'grid' ? '1.5px solid var(--t1)' : '1.5px solid transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.2s',
        }}>
          <svg viewBox="0 0 24 24" fill="none" style={{
            width: 22, height: 22,
            stroke: viewMode === 'grid' ? 'var(--t1)' : 'var(--t3)',
            strokeWidth: 1.5,
          }}>
            <rect x="3" y="3" width="7" height="7" rx="0.5" />
            <rect x="14" y="3" width="7" height="7" rx="0.5" />
            <rect x="3" y="14" width="7" height="7" rx="0.5" />
            <rect x="14" y="14" width="7" height="7" rx="0.5" />
          </svg>
        </button>
        <button onClick={() => setViewMode('list')} style={{
          flex: 1, padding: '10px 0', background: 'none', border: 'none',
          borderBottom: viewMode === 'list' ? '1.5px solid var(--t1)' : '1.5px solid transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.2s',
        }}>
          <svg viewBox="0 0 24 24" fill="none" style={{
            width: 22, height: 22,
            stroke: viewMode === 'list' ? 'var(--t1)' : 'var(--t3)',
            strokeWidth: 1.5,
          }}>
            <line x1="4" y1="6" x2="20" y2="6" strokeLinecap="round" />
            <line x1="4" y1="12" x2="20" y2="12" strokeLinecap="round" />
            <line x1="4" y1="18" x2="20" y2="18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Dish content */}
      <div style={{ maxWidth: 470, margin: '0 auto' }}>
        {viewMode === 'grid' ? (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2,
          }}>
            {sectionDishes.map((d, i) => (
              <GridTile key={d.id} dish={d} index={i} onClick={() => setDishDetail(d)}
                isSeatedHere={isSeatedHere} onAddToCart={addDish} />
            ))}
          </div>
        ) : (
          <div style={{ padding: '0' }}>
            {sectionDishes.map((d, i) => (
              <ListDishCard key={d.id} dish={d} index={i} onClick={() => setDishDetail(d)} />
            ))}
          </div>
        )}

        {sectionDishes.length === 0 && (
          <div className="empty" style={{ padding: '4rem 1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8, opacity: 0.4 }}>🍽️</div>
            <p style={{ color: 'var(--t3)', fontSize: '0.82rem' }}>No dishes in this section</p>
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>

      {showBook && <BookingModal restaurant={restaurant} onClose={() => setShowBook(false)} />}
      {dishDetail && <DishDetailSheet dish={dishDetail} onClose={() => setDishDetail(null)} />}
    </div>
  )
}

function HighlightCircle({ label, emoji, active, onClick, count }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
    }}>
      <div style={{
        width: 58, height: 58, borderRadius: '50%',
        border: active ? '2px solid var(--t1)' : '1px solid var(--s4)',
        background: 'var(--s3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.4rem',
        transition: 'border-color 0.2s',
      }}>
        {emoji}
      </div>
      <span style={{
        fontSize: '0.65rem',
        color: active ? 'var(--t1)' : 'var(--t3)',
        fontWeight: active ? 600 : 400,
        width: 60, textAlign: 'center',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </button>
  )
}

function GridTile({ dish, index, onClick, isSeatedHere, onAddToCart }) {
  const bg = dishBackground(dish.category)
  const emoji = categoryEmoji(dish.category)

  return (
    <div className="ig-grid-tile menu-card" onClick={onClick} style={{
      aspectRatio: '1',
      background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '2.8rem', position: 'relative',
      opacity: dish.available ? 1 : 0.45,
      animationDelay: `${index * 0.03}s`,
      borderRadius: 0,
    }}>
      <span style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.4))' }}>
        {emoji}
      </span>

      {!dish.available && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: '0.55rem', color: 'var(--t1)', fontWeight: 700,
            letterSpacing: 1.2, textTransform: 'uppercase',
          }}>Sold Out</span>
        </div>
      )}

      {dish.available && !isSeatedHere && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--green)',
          boxShadow: '0 0 5px rgba(34,197,94,0.6)',
        }} />
      )}

      {/* Add to cart button when seated */}
      {dish.available && isSeatedHere && (
        <button onClick={e => { e.stopPropagation(); onAddToCart(dish) }} style={{
          position: 'absolute', top: 5, right: 5, zIndex: 5,
          width: 26, height: 26, borderRadius: '50%',
          background: 'var(--accent)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          transition: 'transform 0.15s',
        }}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" style={{
            width: 14, height: 14, stroke: '#F5F0E8',
          }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      )}

      {/* Hover info overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        background: 'rgba(0,0,0,0)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, opacity: 0,
        transition: 'all 0.2s',
        pointerEvents: 'none',
      }}
        className="tile-hover-info"
      >
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--t1)' }}>
          {formatPrice(dish.price)}
        </span>
      </div>

      {/* Bottom fade with name */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        padding: '16px 6px 5px',
      }}>
        <div style={{
          fontSize: '0.6rem', fontWeight: 600, color: '#F5F0E8',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}>
          {dish.name}
        </div>
        <div style={{ fontSize: '0.55rem', color: 'var(--gold)', fontWeight: 600 }}>
          {formatPrice(dish.price)}
        </div>
      </div>
    </div>
  )
}

function ListDishCard({ dish, index, onClick }) {
  const { addDish, tableId } = useCart()
  const emoji = categoryEmoji(dish.category)

  return (
    <div className="menu-card" onClick={onClick} style={{
      display: 'flex', gap: 12, padding: '12px 14px',
      borderBottom: '1px solid var(--border)',
      cursor: 'pointer', animationDelay: `${index * 0.04}s`,
      borderRadius: 0,
    }}>
      {/* Thumbnail */}
      <div style={{
        width: 52, height: 52, borderRadius: 8, flexShrink: 0,
        background: dishBackground(dish.category),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.5rem',
        opacity: dish.available ? 1 : 0.4,
      }}>
        {emoji}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{
            fontSize: '0.84rem', fontWeight: 600, color: 'var(--t1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {dish.name}
          </span>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
            {formatPrice(dish.price)}
          </span>
        </div>
        {dish.description && (
          <p style={{
            fontSize: '0.75rem', color: 'var(--t3)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {dish.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {dish.available ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', color: 'var(--green)', fontWeight: 600 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)' }} />
              Available
            </span>
          ) : (
            <span style={{ fontSize: '0.65rem', color: 'var(--red)', fontWeight: 600 }}>Sold Out</span>
          )}
          {dish.review_count > 0 && (
            <span style={{ fontSize: '0.65rem', color: 'var(--gold)' }}>
              {'★'.repeat(Math.round(dish.avg_rating))} <span style={{ color: 'var(--t3)' }}>{dish.review_count}</span>
            </span>
          )}
        </div>
      </div>

      {dish.available && tableId && (
        <button onClick={e => { e.stopPropagation(); addDish(dish) }} style={{
          alignSelf: 'center', background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--t2)', padding: 4,
        }}>
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" style={{
            width: 20, height: 20, stroke: 'currentColor',
          }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      )}
    </div>
  )
}

function FilterBar({ filters, setFilters, dishes }) {
  const FILTER_OPTIONS = [
    { key: 'vegan', label: 'Vegan', icon: '🌱' },
    { key: 'vegetarian', label: 'Vegetarian', icon: '🥬' },
    { key: 'gluten-free', label: 'Gluten Free', icon: '🌾' },
    { key: 'spicy', label: 'Spicy', icon: '🌶️' },
  ]

  const counts = {
    vegan: dishes.filter(d => d.is_vegan).length,
    vegetarian: dishes.filter(d => d.is_vegetarian).length,
    'gluten-free': dishes.filter(d => d.is_gluten_free).length,
    spicy: dishes.filter(d => d.is_spicy).length,
  }

  const available = FILTER_OPTIONS.filter(f => counts[f.key] > 0)
  if (available.length === 0) return null

  function toggle(key) {
    setFilters(prev => prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key])
  }

  return (
    <div className="no-scrollbar" style={{
      display: 'flex', gap: 6, overflowX: 'auto',
      padding: '8px 16px 4px', maxWidth: 470, margin: '0 auto',
    }}>
      {available.map(f => {
        const active = filters.includes(f.key)
        return (
          <button key={f.key} onClick={() => toggle(f.key)} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 100, border: 'none',
            background: active ? 'var(--accent)' : 'var(--s3)',
            color: active ? '#F5F0E8' : 'var(--t2)',
            fontSize: '0.72rem', fontWeight: 600,
            cursor: 'pointer', flexShrink: 0,
            transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: '0.8rem' }}>{f.icon}</span>
            {f.label}
            <span style={{
              fontSize: '0.62rem', opacity: 0.7,
              marginLeft: 2,
            }}>
              {counts[f.key]}
            </span>
          </button>
        )
      })}
      {filters.length > 0 && (
        <button onClick={() => setFilters([])} style={{
          padding: '5px 10px', borderRadius: 100, border: 'none',
          background: 'var(--s4)', color: 'var(--t2)',
          fontSize: '0.72rem', fontWeight: 600,
          cursor: 'pointer', flexShrink: 0,
        }}>
          ✕ Clear
        </button>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ height: 220, borderRadius: 0 }} />
      <div style={{ padding: '0 16px', maxWidth: 470, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: -44, marginBottom: 16 }}>
          <div className="skeleton" style={{ width: 86, height: 86, borderRadius: '50%', border: '4px solid var(--bg)', flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: 24, paddingBottom: 6 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div className="skeleton" style={{ width: 28, height: 16, margin: '0 auto 4px' }} />
                <div className="skeleton" style={{ width: 32, height: 10 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="skeleton" style={{ height: 16, width: '50%', marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 12, width: '30%', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <div className="skeleton" style={{ flex: 1, height: 34, borderRadius: 8 }} />
          <div className="skeleton" style={{ flex: 1, height: 34, borderRadius: 8 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2, marginTop: 24, maxWidth: 470, margin: '24px auto 0' }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ aspectRatio: '1', borderRadius: 0 }} />
        ))}
      </div>
    </div>
  )
}
