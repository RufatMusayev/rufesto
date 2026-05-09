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

export default function RestaurantPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
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

  useEffect(() => { loadRestaurant() }, [slug])

  async function loadRestaurant() {
    setLoading(true)
    const { data: rest } = await supabase
      .from('restaurants')
      .select('*, operating_hours(*)')
      .eq('slug', slug)
      .single()
    if (!rest) { navigate('/'); return }
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
    setSections(menuData || [])
    setDishes(dishData || [])
    setActiveSection(null)

    const { data: tablesData } = await supabase
      .from('tables')
      .select('id, state')
      .eq('restaurant_id', rest.id)
    if (tablesData) {
      setSeatsTotal(tablesData.length)
      setSeatsFree(tablesData.filter(t => t.state === 'free').length)
    }

    setLoading(false)

    const dishChannel = supabase
      .channel(`dishes-${rest.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'dishes',
        filter: `restaurant_id=eq.${rest.id}`,
      }, payload => {
        setDishes(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d))
      })
      .subscribe()

    const tableChannel = supabase
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

    return () => {
      supabase.removeChannel(dishChannel)
      supabase.removeChannel(tableChannel)
    }
  }

  if (loading) return <LoadingSkeleton />

  const sectionDishes = activeSection
    ? dishes.filter(d => d.menu_section_id === activeSection)
    : dishes

  const open = isRestaurantOpen(restaurant.operating_hours)
  const today = getTodayHours(restaurant.operating_hours)
  const emoji = cuisineEmoji(restaurant.cuisine_type)
  const availableCount = dishes.filter(d => d.available).length
  const reviewTotal = dishes.reduce((s, d) => s + (d.review_count || 0), 0)

  return (
    <div>
      {/* Back button */}
      <button onClick={() => navigate(-1)} style={{
        position: 'absolute', top: 14, left: 14, zIndex: 20,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: 'none', borderRadius: '50%',
        width: 36, height: 36, color: '#f5f5f5',
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
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
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
              <GridTile key={d.id} dish={d} index={i} onClick={() => setDishDetail(d)} />
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

function GridTile({ dish, index, onClick }) {
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
            fontSize: '0.55rem', color: '#f5f5f5', fontWeight: 700,
            letterSpacing: 1.2, textTransform: 'uppercase',
          }}>Sold Out</span>
        </div>
      )}

      {dish.available && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--green)',
          boxShadow: '0 0 5px rgba(34,197,94,0.6)',
        }} />
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
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff' }}>
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
          fontSize: '0.6rem', fontWeight: 600, color: '#f5f5f5',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}>
          {dish.name}
        </div>
        <div style={{ fontSize: '0.55rem', color: 'var(--accent)', fontWeight: 600 }}>
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
            <span style={{ fontSize: '0.65rem', color: 'var(--t3)' }}>
              {'★'.repeat(Math.round(dish.avg_rating))} {dish.review_count}
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

function DishDetailSheet({ dish, onClose }) {
  const { addDish, tableId } = useCart()
  const { session } = useAuth()
  const [reviews, setReviews] = useState([])
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showHeart, setShowHeart] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [myRating, setMyRating] = useState(0)
  const [myBody, setMyBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const tapTimer = useRef(null)
  const tapCount = useRef(0)

  useEffect(() => {
    supabase
      .from('reviews')
      .select('*, users(name, profile_photo)')
      .eq('dish_id', dish.id)
      .eq('is_flagged', false)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setReviews(data || []))
  }, [dish.id])

  const hasReviewed = session && reviews.some(r => r.user_id === session.user.id)

  function handleDoubleTap() {
    tapCount.current++
    if (tapCount.current === 1) {
      tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 300)
    } else if (tapCount.current === 2) {
      clearTimeout(tapTimer.current)
      tapCount.current = 0
      if (!liked) setLiked(true)
      setShowHeart(true)
      setTimeout(() => setShowHeart(false), 900)
    }
  }

  async function handleSubmitReview(e) {
    e.preventDefault()
    if (!myRating) { setReviewError('Select a rating'); return }
    setReviewError('')
    setSubmitting(true)
    const { data, error } = await supabase.from('reviews').insert({
      dish_id: dish.id,
      user_id: session.user.id,
      rating: myRating,
      body: myBody || null,
    }).select('*, users(name, profile_photo)').single()
    setSubmitting(false)
    if (error) { setReviewError(error.message); return }
    setReviews(prev => [data, ...prev])
    setShowReviewForm(false)
    setMyRating(0)
    setMyBody('')
  }

  const tags = [
    dish.is_vegan && 'vegan',
    dish.is_vegetarian && 'vegetarian',
    dish.is_gluten_free && 'glutenfree',
    dish.is_spicy && 'spicy',
    dish.calories && `${dish.calories}kcal`,
    dish.prep_time_min && `${dish.prep_time_min}min`,
  ].filter(Boolean)

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div className="sheet" style={{
        maxWidth: 470, width: '100%', margin: '0 auto',
        maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--bg)',
        borderTopLeftRadius: 14, borderTopRightRadius: 14,
      }}>
        <div className="sheet-handle" />

        {/* Post header — like Instagram */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '8px 14px', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: dishBackground(dish.category),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem', flexShrink: 0,
          }}>
            {categoryEmoji(dish.category)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--t1)' }}>
              {dish.name}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--t3)' }}>
              {dish.menu_sections?.name || dish.category}
            </div>
          </div>
          <button onClick={onClose} className="icon-btn" style={{ width: 28, height: 28, color: 'var(--t1)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Post image — 4:5 like Instagram */}
        <div
          onClick={handleDoubleTap}
          style={{
            width: '100%', aspectRatio: '4/5',
            background: dishBackground(dish.category),
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '7rem',
            cursor: 'pointer',
            overflow: 'hidden',
            userSelect: 'none',
            filter: dish.available ? 'none' : 'grayscale(0.5) brightness(0.6)',
          }}
        >
          <span style={{
            filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))',
            transition: 'transform 0.4s ease',
          }}>
            {categoryEmoji(dish.category)}
          </span>

          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.35) 100%)',
            pointerEvents: 'none',
          }} />

          {dish.available && (
            <div style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
              borderRadius: 100, padding: '4px 10px',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#22C55E',
                boxShadow: '0 0 6px #22C55E',
              }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#f5f5f5' }}>Available</span>
            </div>
          )}

          {!dish.available && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                background: 'rgba(0,0,0,0.75)', padding: '6px 20px',
                borderRadius: 100, fontSize: '0.82rem', fontWeight: 700, color: '#e5e5e5',
                letterSpacing: 1, textTransform: 'uppercase',
              }}>Sold Out</span>
            </div>
          )}

          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
            borderRadius: 8, padding: '6px 12px',
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f5f5f5' }}>
              {formatPrice(dish.price)}
            </div>
          </div>

          {showHeart && (
            <svg viewBox="0 0 24 24" fill="#fff" style={{
              position: 'absolute', top: '50%', left: '50%',
              width: 80, height: 80,
              animation: 'heartBurst 0.9s ease forwards',
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))',
              pointerEvents: 'none',
            }}>
              <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          )}
        </div>

        {/* Action bar */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 14,
        }}>
          <button className="icon-btn" onClick={() => setLiked(!liked)}
            style={{ width: 28, height: 28 }}>
            <svg viewBox="0 0 24 24" style={{
              width: 24, height: 24,
              fill: liked ? '#ef4444' : 'none',
              stroke: liked ? '#ef4444' : 'var(--t1)',
              strokeWidth: 1.8,
              transition: 'all 0.15s',
            }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </button>

          <button className="icon-btn" onClick={() => setShowReviewForm(f => !f)}
            style={{ width: 28, height: 28, color: 'var(--t1)' }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" style={{ width: 24, height: 24, stroke: 'currentColor' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
            </svg>
          </button>

          <button className="icon-btn" style={{ width: 28, height: 28, color: 'var(--t1)' }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" style={{ width: 24, height: 24, stroke: 'currentColor' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>

          <div style={{ flex: 1 }} />

          {dish.review_count > 0 && (
            <span style={{ color: '#F59E0B', fontSize: '0.78rem', letterSpacing: 0.5 }}>
              {'★'.repeat(Math.round(dish.avg_rating))} <span style={{ color: 'var(--t3)', fontSize: '0.72rem' }}>{Number(dish.avg_rating).toFixed(1)}</span>
            </span>
          )}

          <button className="icon-btn" onClick={() => setSaved(!saved)}
            style={{ width: 28, height: 28, color: 'var(--t1)' }}>
            <svg viewBox="0 0 24 24" style={{
              width: 24, height: 24,
              fill: saved ? 'var(--t1)' : 'none',
              stroke: 'var(--t1)',
              strokeWidth: 1.8,
              transition: 'all 0.15s',
            }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0z" />
            </svg>
          </button>
        </div>

        {/* Likes */}
        {liked && (
          <div style={{ padding: '0 14px 4px', fontSize: '0.82rem', fontWeight: 700 }}>
            1 like
          </div>
        )}

        {/* Caption — Instagram style: bold name + description */}
        <div style={{ padding: '0 14px 8px' }}>
          <p style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{dish.name}</span>
            {' '}
            <span style={{ color: 'var(--t2)', fontWeight: 400 }}>
              {dish.description || `${dish.category} dish`}
            </span>
          </p>

          {tags.length > 0 && (
            <p style={{ fontSize: '0.82rem', color: '#0095f6', marginTop: 4 }}>
              {tags.map(t => `#${t}`).join(' ')}
            </p>
          )}

          {dish.calories && dish.prep_time_min && (
            <p style={{ fontSize: '0.72rem', color: 'var(--t3)', marginTop: 4 }}>
              {dish.calories} kcal · {dish.prep_time_min} min prep
            </p>
          )}
        </div>

        {/* Add to order — gated on tableId */}
        {dish.available && tableId ? (
          <div style={{ padding: '0 14px 12px' }}>
            <button className="btn btn-follow" style={{ width: '100%', padding: '10px 0', fontSize: '0.88rem' }}
              onClick={() => { addDish(dish); onClose() }}>
              Add to Order · {formatPrice(dish.price)}
            </button>
          </div>
        ) : dish.available && !tableId ? (
          <div style={{ padding: '0 14px 12px' }}>
            <div style={{
              width: '100%', padding: '10px 0',
              textAlign: 'center', fontSize: '0.82rem',
              color: 'var(--t3)', fontWeight: 500,
              background: 'var(--s3)', borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              Book a table to order
            </div>
          </div>
        ) : null}

        {/* View reviews link */}
        {reviews.length > 0 && !showReviewForm && (
          <div style={{ padding: '0 14px 2px' }}>
            <button onClick={() => setShowReviewForm(false)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.82rem', color: 'var(--t3)', padding: 0,
            }}>
              View all {reviews.length} review{reviews.length !== 1 ? 's' : ''}
            </button>
          </div>
        )}

        {/* Reviews as Instagram-style comments */}
        <div style={{ padding: '4px 14px 6px' }}>
          {reviews.slice(0, showReviewForm ? 20 : 3).map(r => (
            <div key={r.id} style={{
              display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', background: 'var(--s4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.6rem', fontWeight: 700, color: 'var(--t2)', flexShrink: 0,
                marginTop: 1,
              }}>
                {(r.users?.name || 'A')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, color: 'var(--t1)' }}>
                    {r.users?.name || 'Anonymous'}
                  </span>
                  {' '}
                  <span style={{ color: '#F59E0B', fontSize: '0.72rem' }}>{'★'.repeat(r.rating)}</span>
                  {r.body && (
                    <>
                      {' '}
                      <span style={{ color: 'var(--t2)', fontWeight: 400 }}>{r.body}</span>
                    </>
                  )}
                </p>
                <span style={{ fontSize: '0.68rem', color: 'var(--t4)' }}>{timeAgo(r.created_at)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Write review — inline comment style */}
        {session && !hasReviewed && (
          <div style={{
            padding: '8px 14px 14px',
            borderTop: '1px solid var(--border)',
          }}>
            {!showReviewForm ? (
              <button onClick={() => setShowReviewForm(true)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.82rem', color: 'var(--t3)', padding: 0,
              }}>
                Add a review...
              </button>
            ) : (
              <form onSubmit={handleSubmitReview}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setMyRating(n)} style={{
                      background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer',
                      color: n <= myRating ? '#F59E0B' : 'var(--s4)',
                      transition: 'color 0.1s', padding: 0,
                    }}>{n <= myRating ? '★' : '☆'}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="input" placeholder="Write a review..." value={myBody}
                    onChange={e => setMyBody(e.target.value)}
                    style={{ flex: 1, fontSize: '0.82rem', padding: '8px 12px', borderRadius: 20 }} />
                  <button className="btn btn-follow" style={{ padding: '6px 16px', fontSize: '0.82rem', borderRadius: 20 }}
                    disabled={submitting || !myRating}>
                    {submitting ? '...' : 'Post'}
                  </button>
                </div>
                {reviewError && <p style={{ color: 'var(--red)', fontSize: '0.72rem', marginTop: 4 }}>{reviewError}</p>}
              </form>
            )}
          </div>
        )}

        <div style={{ height: 20 }} />
      </div>
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
