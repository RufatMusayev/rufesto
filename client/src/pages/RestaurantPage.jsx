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
import FloorPlanSheet from '../components/FloorPlanSheet'

export default function RestaurantPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { tableId, restaurantId: cartRestaurantId, addDish, cartError, clearCartError } = useCart()
  const [restaurant, setRestaurant] = useState(null)
  const [sections, setSections] = useState([])
  const [dishes, setDishes] = useState([])
  const [activeSection, setActiveSection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showBook, setShowBook] = useState(false)
  const [showFloor, setShowFloor] = useState(false)
  const [pickedTable, setPickedTable] = useState(null)
  const [dishDetail, setDishDetail] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [seatsFree, setSeatsFree] = useState(0)
  const [seatsTotal, setSeatsTotal] = useState(0)
  const [filters, setFilters] = useState([])
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const { session } = useAuth()

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

  useEffect(() => {
    if (!restaurant) return
    supabase
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurant.id)
      .then(({ count }) => setFollowerCount(count || 0))

    if (session) {
      supabase
        .from('user_follows')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('restaurant_id', restaurant.id)
        .maybeSingle()
        .then(({ data }) => setIsFollowing(!!data))
    }
  }, [session?.user?.id, restaurant?.id])

  async function handleFollow() {
    if (!session || !restaurant || followLoading) return
    setFollowLoading(true)
    const next = !isFollowing
    setIsFollowing(next)
    setFollowerCount(c => c + (next ? 1 : -1))
    try {
      if (next) {
        const { error } = await supabase.from('user_follows').insert({
          user_id: session.user.id,
          restaurant_id: restaurant.id,
        })
        if (error) { setIsFollowing(false); setFollowerCount(c => c - 1); console.error('Follow failed:', error.message) }
      } else {
        const { error } = await supabase.from('user_follows').delete()
          .eq('user_id', session.user.id)
          .eq('restaurant_id', restaurant.id)
        if (error) { setIsFollowing(true); setFollowerCount(c => c + 1); console.error('Unfollow failed:', error.message) }
      }
    } catch (err) {
      setIsFollowing(!next)
      setFollowerCount(c => c + (next ? -1 : 1))
      console.error('Follow error:', err)
    }
    setFollowLoading(false)
  }

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
      {/* Cross-restaurant cart error banner */}
      {cartError && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, maxWidth: 420, width: 'calc(100% - 32px)',
          background: 'rgba(30,10,10,0.92)', backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10,
          padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ flex: 1, fontSize: '0.78rem', color: '#fca5a5', lineHeight: 1.45 }}>
            {cartError}
          </span>
          <button
            onClick={clearCartError}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(252,165,165,0.6)', padding: 0, flexShrink: 0,
              fontSize: '1rem', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Back button */}
      <button onClick={() => navigate(-1)} style={{
        position: 'absolute', top: 'calc(var(--nav-h, 0px) + 14px)', left: 14, zIndex: 20,
        background: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%',
        width: 36, height: 36, color: '#F5F0E8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'background 150ms var(--ease-out)',
      }}>
        <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 17, height: 17 }}>
          <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Cover photo */}
      <div style={{
        height: 230, position: 'relative', overflow: 'hidden',
        background: cuisineBackground(restaurant.cuisine_type),
      }}>
        {restaurant.cover_photo ? (
          <img
            src={restaurant.cover_photo}
            alt={restaurant.name}
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center',
              position: 'absolute', inset: 0,
              imageRendering: 'auto',
            }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10rem', opacity: 0.18,
            filter: 'blur(3px)',
          }}>
            {emoji}
          </div>
        )}
        {/* Bottom-to-top gradient fade into page background */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 35%, rgba(0,0,0,0.45) 75%, var(--bg) 100%)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Profile section */}
      <div style={{ maxWidth: 470, margin: '0 auto', padding: '0 16px' }}>
        {/* Avatar + Stats row */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginTop: -46, marginBottom: 14,
        }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            border: '3.5px solid var(--bg)',
            background: cuisineBackground(restaurant.cuisine_type),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.5rem', flexShrink: 0,
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {restaurant.logo_photo ? (
              <img
                src={restaurant.logo_photo}
                alt={restaurant.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
              />
            ) : (
              <span style={{ position: 'relative', zIndex: 1 }}>{emoji}</span>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 18, paddingBottom: 8 }}>
            <StatPill label="dishes" value={dishes.length} />
            <StatPill label="followers" value={followerCount} />
            <StatPill label="reviews" value={reviewTotal} />
            <StatPill label="seats" value={`${seatsFree}/${seatsTotal}`} />
          </div>
        </div>

        {/* Name */}
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '1.45rem', fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.2,
          color: 'var(--t1)', marginBottom: 2,
        }}>
          {restaurant.name}
        </h1>

        {/* Cuisine + open status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          marginBottom: 6,
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--t3)', fontWeight: 500 }}>
            {restaurant.cuisine_type} Restaurant
          </span>
          <span style={{ color: 'var(--border-strong)', fontSize: '0.7rem' }}>·</span>
          {open ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '0.74rem', fontWeight: 600, color: 'var(--sage)',
            }}>
              <span className="open-indicator" />
              Open
              {today && (
                <span style={{ fontWeight: 400, color: 'var(--t3)', fontFamily: "'DM Mono', monospace", fontSize: '0.7rem' }}>
                  · until {today.close}
                </span>
              )}
            </span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '0.74rem', fontWeight: 600, color: 'var(--red)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--red)',
                flexShrink: 0,
              }} />
              Closed
              {today && (
                <span style={{ fontWeight: 400, color: 'var(--t3)', fontFamily: "'DM Mono', monospace", fontSize: '0.7rem' }}>
                  · opens {today.open}
                </span>
              )}
            </span>
          )}
        </div>

        {/* Description */}
        {restaurant.description && (
          <p style={{
            fontSize: '0.82rem', color: 'var(--t2)', lineHeight: 1.55,
            marginBottom: 6, fontWeight: 400,
          }}>
            {restaurant.description}
          </p>
        )}

        {/* Location */}
        {restaurant.address && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            marginBottom: 14, fontSize: '0.76rem', color: 'var(--t3)',
          }}>
            <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 11, height: 11, flexShrink: 0, opacity: 0.6 }}>
              <path fillRule="evenodd" d="M11.536 3.464a5 5 0 0 1 0 7.072l-3.536 3.536a.5.5 0 0 1-.707 0l-3.536-3.536a5 5 0 1 1 7.07-7.072zM8 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" clipRule="evenodd" />
            </svg>
            {restaurant.address}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 7, marginBottom: 4 }}>
          <button
            className="btn btn-primary"
            onClick={() => { setPickedTable(null); setShowBook(true) }}
            style={{ flex: 1, padding: '8px 0', fontSize: '0.82rem', fontWeight: 700, borderRadius: 10 }}
          >
            Reserve a Table
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => setShowFloor(true)}
            aria-label="Floor plan"
            title="Floor plan"
            style={{
              width: 38, padding: '8px 0', borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="12" x2="12" y2="12" />
              <line x1="12" y1="3" x2="12" y2="21" />
              <circle cx="7.5" cy="7.5" r="1.6" />
              <circle cx="17" cy="16" r="2.2" />
            </svg>
          </button>
          <button
            onClick={handleFollow}
            disabled={followLoading}
            style={{
              flex: 1, padding: '8px 0', fontSize: '0.82rem', fontWeight: 700, borderRadius: 10,
              border: `1.5px solid ${isFollowing ? 'var(--sage)' : 'var(--accent)'}`,
              background: isFollowing ? 'rgba(77,124,63,0.08)' : 'transparent',
              color: isFollowing ? 'var(--sage)' : 'var(--accent)',
              cursor: 'pointer',
              transition: 'background 150ms var(--ease-out), color 150ms, border-color 150ms',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              fontFamily: 'inherit',
            }}
          >
            {followLoading ? '...' : isFollowing ? '✓ Following' : 'Follow'}
          </button>
        </div>
      </div>

      {/* Section highlights — story circles */}
      {sections.length > 0 && (
        <div className="no-scrollbar" style={{
          display: 'flex', gap: 14, overflowX: 'auto',
          padding: '18px 16px 6px',
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

      {/* View mode toggle */}
      <div style={{
        display: 'flex', borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        marginTop: 12, maxWidth: 470, margin: '10px auto 0',
      }}>
        <button onClick={() => setViewMode('grid')} style={{
          flex: 1, padding: '10px 0', background: 'none', border: 'none',
          borderBottom: viewMode === 'grid' ? '2px solid var(--t1)' : '2px solid transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.2s',
        }}>
          <svg viewBox="0 0 24 24" fill="none" style={{
            width: 20, height: 20,
            stroke: viewMode === 'grid' ? 'var(--t1)' : 'var(--t4)',
            strokeWidth: 1.6,
            transition: 'stroke 0.2s',
          }}>
            <rect x="3" y="3" width="7" height="7" rx="0.5" />
            <rect x="14" y="3" width="7" height="7" rx="0.5" />
            <rect x="3" y="14" width="7" height="7" rx="0.5" />
            <rect x="14" y="14" width="7" height="7" rx="0.5" />
          </svg>
        </button>
        <button onClick={() => setViewMode('list')} style={{
          flex: 1, padding: '10px 0', background: 'none', border: 'none',
          borderBottom: viewMode === 'list' ? '2px solid var(--t1)' : '2px solid transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.2s',
        }}>
          <svg viewBox="0 0 24 24" fill="none" style={{
            width: 20, height: 20,
            stroke: viewMode === 'list' ? 'var(--t1)' : 'var(--t4)',
            strokeWidth: 1.6,
            transition: 'stroke 0.2s',
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
              <GridTile
                key={d.id} dish={d} index={i}
                onClick={() => setDishDetail(d)}
                isSeatedHere={isSeatedHere}
                onAddToCart={addDish}
              />
            ))}
          </div>
        ) : (
          <div>
            {sectionDishes.map((d, i) => (
              <ListDishCard key={d.id} dish={d} index={i} onClick={() => setDishDetail(d)} />
            ))}
          </div>
        )}

        {sectionDishes.length === 0 && (
          <div className="empty" style={{ padding: '4.5rem 1.5rem' }}>
            <div style={{ fontSize: '2.2rem', marginBottom: 10, opacity: 0.35 }}>🍽️</div>
            <p style={{ color: 'var(--t3)', fontSize: '0.82rem' }}>No dishes in this section</p>
          </div>
        )}

        <div style={{ height: 48 }} />
      </div>

      {showBook && (
        <BookingModal
          restaurant={restaurant}
          preselectedTable={pickedTable}
          onClose={() => { setShowBook(false); setPickedTable(null) }}
        />
      )}
      {showFloor && (
        <FloorPlanSheet
          restaurant={restaurant}
          onClose={() => setShowFloor(false)}
          onReserve={table => {
            setShowFloor(false)
            setPickedTable(table)
            setShowBook(true)
          }}
        />
      )}
      {dishDetail && <DishDetailSheet dish={dishDetail} onClose={() => setDishDetail(null)} />}
    </div>
  )
}

function StatPill({ label, value }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    }}>
      <span style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: '0.9rem', fontWeight: 700, color: 'var(--t1)', lineHeight: 1.2,
      }}>
        {value}
      </span>
      <span style={{
        fontSize: '0.62rem', color: 'var(--t4)', fontWeight: 500, letterSpacing: 0.2,
      }}>
        {label}
      </span>
    </div>
  )
}

function HighlightCircle({ label, emoji, active, onClick, count }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
      background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        border: active ? '2px solid var(--accent)' : '1.5px solid var(--border)',
        background: active ? 'rgba(139,45,66,0.08)' : 'var(--s2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.5rem',
        transition: 'border-color 180ms var(--ease-out), background 180ms var(--ease-out)',
        boxShadow: active ? '0 0 0 3px rgba(139,45,66,0.12)' : 'none',
      }}>
        {emoji}
      </div>
      <span style={{
        fontSize: '0.63rem',
        color: active ? 'var(--accent)' : 'var(--t3)',
        fontWeight: active ? 700 : 400,
        width: 62, textAlign: 'center',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        transition: 'color 180ms var(--ease-out)',
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
    <div
      className="ig-grid-tile menu-card"
      onClick={onClick}
      style={{
        aspectRatio: '1',
        background: dish.photo ? '#000' : bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2.8rem', position: 'relative',
        opacity: dish.available ? 1 : 0.45,
        animationDelay: `${Math.min(index, 10) * 0.03}s`,
        borderRadius: 0,
        cursor: 'pointer',
      }}
    >
      {dish.photo ? (
        <img src={dish.photo} alt={dish.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
      ) : (
        <span style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.4))' }}>
          {emoji}
        </span>
      )}

      {!dish.available && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.44)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: '0.55rem', color: '#F5F0E8', fontWeight: 700,
            letterSpacing: 1, textTransform: 'uppercase',
            background: 'rgba(163,45,45,0.85)', padding: '3px 8px', borderRadius: 100,
          }}>Sold Out</span>
        </div>
      )}

      {dish.available && !isSeatedHere && (
        <div style={{ position: 'absolute', top: 5, right: 5 }}>
          <span style={{
            fontSize: '0.52rem', color: '#F5F0E8', fontWeight: 700,
            letterSpacing: 0.8, textTransform: 'uppercase',
            background: 'rgba(77,124,63,0.85)', padding: '2px 6px', borderRadius: 100,
            display: 'block',
          }}>Available</span>
        </div>
      )}

      {dish.available && isSeatedHere && (
        <button
          onClick={e => { e.stopPropagation(); onAddToCart(dish) }}
          style={{
            position: 'absolute', top: 6, right: 6, zIndex: 5,
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--accent)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 2px 10px rgba(139,45,66,0.5)',
            transition: 'transform 0.15s var(--ease-out)',
          }}
          onPointerDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
          onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" style={{
            width: 14, height: 14, stroke: '#F5F0E8',
          }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      )}

      {/* Bottom fade with name + price */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.72))',
        padding: '18px 7px 6px',
      }}>
        <div style={{
          fontSize: '0.6rem', fontWeight: 600, color: '#F5F0E8',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}>
          {dish.name}
        </div>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '0.55rem', color: 'var(--gold)', fontWeight: 600,
        }}>
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
    <div
      className="menu-card"
      onClick={onClick}
      style={{
        display: 'flex', gap: 13, padding: '13px 16px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer', animationDelay: `${Math.min(index, 10) * 0.04}s`,
        borderRadius: 0, alignItems: 'center',
        transition: 'background-color 150ms var(--ease-out)',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 56, height: 56, borderRadius: 10, flexShrink: 0,
        background: dish.photo ? '#000' : dishBackground(dish.category),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.55rem',
        opacity: dish.available ? 1 : 0.4,
        overflow: 'hidden', position: 'relative',
      }}>
        {dish.photo ? (
          <img src={dish.photo} alt={dish.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : emoji}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2,
        }}>
          <span style={{
            fontSize: '0.86rem', fontWeight: 600, color: 'var(--t1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {dish.name}
          </span>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '0.82rem', fontWeight: 700, color: 'var(--t1)', flexShrink: 0,
          }}>
            {formatPrice(dish.price)}
          </span>
        </div>
        {dish.description && (
          <p style={{
            fontSize: '0.74rem', color: 'var(--t3)', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}>
            {dish.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
          {dish.available ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.64rem', color: 'var(--sage)', fontWeight: 600 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sage)', flexShrink: 0 }} />
              Available
            </span>
          ) : (
            <span style={{ fontSize: '0.64rem', color: 'var(--red)', fontWeight: 600 }}>Sold Out</span>
          )}
          {dish.review_count > 0 && (
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '0.64rem', color: 'var(--gold)',
              display: 'flex', alignItems: 'center', gap: 2,
            }}>
              ★ {Number(dish.avg_rating || 0).toFixed(1)}
              <span style={{ color: 'var(--t4)', marginLeft: 1 }}>({dish.review_count})</span>
            </span>
          )}
        </div>
      </div>

      {/* Add button */}
      {dish.available && tableId && (
        <button
          onClick={e => { e.stopPropagation(); addDish(dish) }}
          style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'var(--s3)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--t2)',
            transition: 'background 150ms var(--ease-out), transform 150ms var(--ease-out)',
          }}
          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.9)'; e.currentTarget.style.background = 'var(--s4)' }}
          onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'var(--s3)' }}
          onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'var(--s3)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" style={{
            width: 16, height: 16, stroke: 'currentColor',
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
      padding: '8px 16px 6px', maxWidth: 470, margin: '0 auto',
    }}>
      {available.map(f => {
        const active = filters.includes(f.key)
        return (
          <button key={f.key} onClick={() => toggle(f.key)} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 12px', borderRadius: 100,
            border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
            background: active ? 'rgba(196,154,44,0.11)' : 'transparent',
            color: active ? 'var(--gold)' : 'var(--t3)',
            fontSize: '0.72rem', fontWeight: active ? 600 : 500,
            cursor: 'pointer', flexShrink: 0,
            transition: 'all 150ms var(--ease-out)',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ fontSize: '0.78rem' }}>{f.icon}</span>
            {f.label}
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.62rem', opacity: 0.75, marginLeft: 1 }}>
              {counts[f.key]}
            </span>
          </button>
        )
      })}
      {filters.length > 0 && (
        <button onClick={() => setFilters([])} style={{
          padding: '4px 12px', borderRadius: 100,
          border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--t3)',
          fontSize: '0.72rem', fontWeight: 500,
          cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
          transition: 'all 150ms var(--ease-out)',
        }}>
          Clear
        </button>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ height: 230, borderRadius: 0 }} />
      <div style={{ padding: '0 16px', maxWidth: 470, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: -46, marginBottom: 14 }}>
          <div className="skeleton" style={{ width: 88, height: 88, borderRadius: '50%', border: '3.5px solid var(--bg)', flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: 18, paddingBottom: 8 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div className="skeleton" style={{ width: 30, height: 16, margin: '0 auto 4px', borderRadius: 4 }} />
                <div className="skeleton" style={{ width: 36, height: 10, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
        <div className="skeleton" style={{ height: 22, width: '55%', marginBottom: 8, borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 12, width: '35%', marginBottom: 16, borderRadius: 4 }} />
        <div style={{ display: 'flex', gap: 7 }}>
          <div className="skeleton" style={{ flex: 1, height: 36, borderRadius: 10 }} />
          <div className="skeleton" style={{ flex: 1, height: 36, borderRadius: 10 }} />
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
