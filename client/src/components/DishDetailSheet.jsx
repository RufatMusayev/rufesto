import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { categoryEmoji, dishBackground, formatPrice, timeAgo } from '../lib/helpers'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'

export default function DishDetailSheet({ dish, onClose }) {
  const { addDish, tableId } = useCart()
  const { session } = useAuth()
  const [reviews, setReviews] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [allergens, setAllergens] = useState([])
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showHeart, setShowHeart] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [showIngredients, setShowIngredients] = useState(false)
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

    supabase
      .from('dish_ingredients')
      .select('quantity_grams, unit, ingredients(name)')
      .eq('dish_id', dish.id)
      .then(({ data }) => setIngredients(data || []))

    supabase
      .from('dish_allergens')
      .select('allergen_name, severity')
      .eq('dish_id', dish.id)
      .then(({ data }) => setAllergens(data || []))

    if (session) {
      supabase
        .from('saved_dishes')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('dish_id', dish.id)
        .maybeSingle()
        .then(({ data }) => setSaved(!!data))
    }
  }, [dish.id, session?.user?.id])

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

  async function handleToggleSave() {
    const next = !saved
    setSaved(next)
    if (!session) return
    try {
      if (next) {
        const { error } = await supabase.from('saved_dishes').upsert(
          { user_id: session.user.id, dish_id: dish.id },
          { onConflict: 'user_id,dish_id' }
        )
        if (error) { console.error('Save failed:', error.message); setSaved(false) }
      } else {
        const { error } = await supabase.from('saved_dishes').delete().eq('user_id', session.user.id).eq('dish_id', dish.id)
        if (error) { console.error('Unsave failed:', error.message); setSaved(true) }
      }
    } catch (err) {
      console.error('Save error:', err)
      setSaved(!next)
    }
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

        {/* Post header */}
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
              {dish.menu_sections?.name || dish.restaurants?.name || dish.category}
            </div>
          </div>
          <button onClick={onClose} className="icon-btn" style={{ width: 28, height: 28, color: 'var(--t1)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Post image — 4:5 */}
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
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#F5F0E8' }}>Available</span>
            </div>
          )}

          {!dish.available && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                background: 'rgba(0,0,0,0.75)', padding: '6px 20px',
                borderRadius: 100, fontSize: '0.82rem', fontWeight: 700, color: '#F5F0E8',
                letterSpacing: 1, textTransform: 'uppercase',
              }}>Sold Out</span>
            </div>
          )}

          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
            borderRadius: 8, padding: '6px 12px',
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#F5F0E8' }}>
              {formatPrice(dish.price)}
            </div>
          </div>

          {showHeart && (
            <span style={{
              position: 'absolute', top: '50%', left: '50%',
              fontSize: '5rem',
              animation: 'perfettoBurst 0.9s ease forwards',
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))',
              pointerEvents: 'none',
            }}>
              👌
            </span>
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
              fill: liked ? 'var(--accent)' : 'none',
              stroke: liked ? 'var(--accent)' : 'var(--t1)',
              strokeWidth: 1.8,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              transition: 'all 0.15s',
            }}>
              <path d="M8 14c-1.5-1-2.5-2.8-2-4.5.5-1.8 2-2.5 3.5-2s2.5 2 2 3.8c-.3 1-1 1.7-1.8 2" />
              <path d="M9.7 13.3c.8-.3 1.8-.2 2.8.5" />
              <path d="M12.5 13.8c.5-2.5 1.2-5 2-6.5.6-1 1.8-1.2 2.5-.5s.5 2-.2 3.5" />
              <path d="M14 14.5c.8-2 1.5-4 2.2-5.2.5-.8 1.5-1 2.2-.3s.3 1.8-.3 3.2" />
              <path d="M15.2 15c.6-1.5 1.2-3 1.8-4 .4-.7 1.3-.8 1.8-.2s.2 1.5-.3 2.8" />
              <path d="M7.5 15c-.5.8-.8 2-.5 3 .5 1.5 2 2.5 4 2.8s4-.2 5.5-1.5c1-1 1.5-2.5 1.5-4" />
            </svg>
          </button>

          <button className="icon-btn" onClick={() => setShowReviewForm(f => !f)}
            style={{ width: 28, height: 28, color: 'var(--t1)' }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.6" style={{ width: 24, height: 24, stroke: 'currentColor' }}>
              <path d="M7 2v8a3 3 0 006 0V2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 2v20" strokeLinecap="round" />
              <path d="M17 2v6c0 1.1.9 2 2 2h0c0 1.1-.9 2-2 2v10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div style={{ flex: 1 }} />

          {dish.review_count > 0 && (
            <span style={{ color: 'var(--gold)', fontSize: '0.78rem', letterSpacing: 0.5 }}>
              {'★'.repeat(Math.round(dish.avg_rating))} <span style={{ color: 'var(--t3)', fontSize: '0.72rem' }}>{Number(dish.avg_rating).toFixed(1)}</span>
            </span>
          )}

          <button className="icon-btn" onClick={handleToggleSave}
            style={{ width: 28, height: 28, color: 'var(--t1)' }}>
            <svg viewBox="0 0 24 24" style={{
              width: 24, height: 24,
              fill: saved ? 'none' : 'none',
              stroke: saved ? 'var(--accent)' : 'var(--t1)',
              strokeWidth: 1.8,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              transition: 'all 0.15s',
            }}>
              <ellipse cx="12" cy="14" rx="8" ry="4" fill={saved ? 'var(--accent)' : 'none'} />
              <path d="M12 3v7" />
              <circle cx="12" cy="3" r="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>

        {liked && (
          <div style={{ padding: '0 14px 4px', fontSize: '0.82rem', fontWeight: 700 }}>
            1 like
          </div>
        )}

        {/* Caption */}
        <div style={{ padding: '0 14px 8px' }}>
          <p style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{dish.name}</span>
            {' '}
            <span style={{ color: 'var(--t2)', fontWeight: 400 }}>
              {dish.description || `${dish.category} dish`}
            </span>
          </p>

          {tags.length > 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--accent)', marginTop: 4 }}>
              {tags.map(t => `#${t}`).join(' ')}
            </p>
          )}

          {dish.calories && dish.prep_time_min && (
            <p style={{ fontSize: '0.72rem', color: 'var(--t3)', marginTop: 4 }}>
              {dish.calories} kcal · {dish.prep_time_min} min prep
            </p>
          )}
        </div>

        {/* Allergens */}
        {allergens.length > 0 && (
          <div style={{ padding: '0 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {allergens.map((a, i) => (
              <span key={i} style={{
                fontSize: '0.68rem', fontWeight: 600,
                padding: '3px 8px', borderRadius: 100,
                background: a.severity === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                color: a.severity === 'high' ? 'var(--red)' : '#D97706',
                border: `1px solid ${a.severity === 'high' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
              }}>
                {a.allergen_name}
              </span>
            ))}
          </div>
        )}

        {/* Ingredients */}
        {ingredients.length > 0 && (
          <div style={{ padding: '0 14px 10px' }}>
            <button onClick={() => setShowIngredients(!showIngredients)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: '0.78rem', fontWeight: 600, color: 'var(--t2)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              Ingredients ({ingredients.length})
              <span style={{
                transform: showIngredients ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s', fontSize: '0.7rem',
              }}>▼</span>
            </button>
            {showIngredients && (
              <div style={{
                marginTop: 6, padding: '8px 10px',
                background: 'var(--s3)', borderRadius: 8,
                display: 'flex', flexWrap: 'wrap', gap: '4px 10px',
              }}>
                {ingredients.map((ing, i) => (
                  <span key={i} style={{ fontSize: '0.72rem', color: 'var(--t2)' }}>
                    {ing.ingredients?.name}
                    {ing.quantity_grams && (
                      <span style={{ color: 'var(--t4)', marginLeft: 2 }}>
                        {ing.quantity_grams}{ing.unit || 'g'}
                      </span>
                    )}
                    {i < ingredients.length - 1 && ','}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add to order */}
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
              Scan QR to order
            </div>
          </div>
        ) : null}

        {/* Reviews */}
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
                  <span style={{ color: 'var(--gold)', fontSize: '0.72rem' }}>{'★'.repeat(r.rating)}</span>
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

        {/* Write review */}
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
                      color: n <= myRating ? 'var(--gold)' : 'var(--s4)',
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
