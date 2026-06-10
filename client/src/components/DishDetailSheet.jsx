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
  const [likePop, setLikePop] = useState(false)
  const [savePop, setSavePop] = useState(false)
  const [showHeart, setShowHeart] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [showIngredients, setShowIngredients] = useState(false)
  const [myRating, setMyRating] = useState(0)
  const [myBody, setMyBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [myPhoto, setMyPhoto] = useState(null)
  const [myPhotoPreview, setMyPhotoPreview] = useState(null)
  const photoInputRef = useRef(null)
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
    let photoUrl = null
    if (myPhoto) {
      const ext = (myPhoto.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `reviews/${session.user.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('dish-photos').upload(path, myPhoto)
      if (upErr) { setSubmitting(false); setReviewError(`Photo upload failed: ${upErr.message}`); return }
      photoUrl = supabase.storage.from('dish-photos').getPublicUrl(path).data.publicUrl
    }
    const { data, error } = await supabase.from('reviews').insert({
      dish_id: dish.id,
      user_id: session.user.id,
      rating: myRating,
      body: myBody || null,
      photo: photoUrl,
    }).select('*, users(name, profile_photo)').single()
    setSubmitting(false)
    if (error) { setReviewError(error.message); return }
    setReviews(prev => [data, ...prev])
    setShowReviewForm(false)
    setMyRating(0)
    setMyBody('')
    if (myPhotoPreview) URL.revokeObjectURL(myPhotoPreview)
    setMyPhoto(null)
    setMyPhotoPreview(null)
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
    <div
      className="overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div className="sheet" style={{
        maxWidth: 470, width: '100%', margin: '0 auto',
        maxHeight: '93vh', overflowY: 'auto',
        background: 'var(--bg)',
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
      }}>
        <div className="sheet-handle" />

        {/* Sheet header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '8px 14px 10px', gap: 10,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: dishBackground(dish.category),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', flexShrink: 0,
            border: '1.5px solid var(--border)',
          }}>
            {categoryEmoji(dish.category)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 700, fontSize: '0.96rem', color: 'var(--t1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {dish.name}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--t4)', marginTop: 1 }}>
              {dish.menu_sections?.name || dish.restaurants?.name || dish.category}
            </div>
          </div>
          <button
            onClick={onClose}
            className="icon-btn"
            style={{ width: 30, height: 30, color: 'var(--t2)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Dish image — 4:5 */}
        <div
          onClick={handleDoubleTap}
          style={{
            width: '100%', aspectRatio: '4/5',
            background: dish.photo ? '#000' : dishBackground(dish.category),
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '7rem',
            cursor: 'pointer',
            overflow: 'hidden',
            userSelect: 'none',
            filter: dish.available ? 'none' : 'grayscale(0.45) brightness(0.65)',
          }}
        >
          {dish.photo ? (
            <img src={dish.photo} alt={dish.name} loading="lazy" style={{
              width: '100%', height: '100%', objectFit: 'cover',
            }} />
          ) : (
            <span style={{
              filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.5))',
              transition: 'transform 0.4s ease',
            }}>
              {categoryEmoji(dish.category)}
            </span>
          )}

          {/* Vignette */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.32) 100%)',
            pointerEvents: 'none',
          }} />

          {/* Availability badge */}
          {dish.available ? (
            <div style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 100, padding: '4px 11px',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span className="open-indicator" />
              <span style={{ fontSize: '0.63rem', fontWeight: 600, color: '#F5F0E8' }}>Available</span>
            </div>
          ) : (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.28)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                background: 'rgba(0,0,0,0.78)', padding: '6px 22px',
                borderRadius: 100, fontSize: '0.8rem', fontWeight: 700, color: '#F5F0E8',
                letterSpacing: 1.2, textTransform: 'uppercase',
              }}>Sold Out</span>
            </div>
          )}

          {/* Price badge */}
          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderRadius: 10, padding: '7px 14px',
          }}>
            <div style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '1.1rem', fontWeight: 700, color: '#F5F0E8', letterSpacing: -0.3,
            }}>
              {formatPrice(dish.price)}
            </div>
          </div>

          {/* Rating badge */}
          {dish.review_count > 0 && (
            <div style={{
              position: 'absolute', bottom: 16, right: 16,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 10, padding: '7px 12px',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ color: 'var(--gold)', fontSize: '0.75rem' }}>★</span>
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '0.82rem', fontWeight: 700, color: '#F5F0E8',
              }}>
                {Number(dish.avg_rating || 0).toFixed(1)}
              </span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.65rem', color: 'rgba(245,240,232,0.55)' }}>
                ({dish.review_count})
              </span>
            </div>
          )}

          {/* Double-tap heart burst */}
          {showHeart && (
            <span style={{
              position: 'absolute', top: '50%', left: '50%',
              fontSize: '5rem',
              animation: 'perfettoBurst 0.9s ease forwards',
              filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))',
              pointerEvents: 'none',
              transform: 'translate(-50%, -50%)',
            }}>
              👌
            </span>
          )}
        </div>

        {/* Action bar */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 16,
        }}>
          <button
            className="icon-btn"
            onClick={() => { setLiked(v => { if (!v) setLikePop(true); return !v }) }}
            style={{ width: 30, height: 30 }}
          >
            <svg viewBox="0 0 24 24"
              className={likePop ? 'like-btn-active' : undefined}
              onAnimationEnd={() => setLikePop(false)}
              style={{
              width: 24, height: 24,
              fill: liked ? 'var(--accent)' : 'none',
              stroke: liked ? 'var(--accent)' : 'var(--t1)',
              strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
              transition: 'fill 0.15s var(--ease-out), stroke 0.15s var(--ease-out)',
            }}>
              <path d="M8 14c-1.5-1-2.5-2.8-2-4.5.5-1.8 2-2.5 3.5-2s2.5 2 2 3.8c-.3 1-1 1.7-1.8 2" />
              <path d="M9.7 13.3c.8-.3 1.8-.2 2.8.5" />
              <path d="M12.5 13.8c.5-2.5 1.2-5 2-6.5.6-1 1.8-1.2 2.5-.5s.5 2-.2 3.5" />
              <path d="M14 14.5c.8-2 1.5-4 2.2-5.2.5-.8 1.5-1 2.2-.3s.3 1.8-.3 3.2" />
              <path d="M15.2 15c.6-1.5 1.2-3 1.8-4 .4-.7 1.3-.8 1.8-.2s.2 1.5-.3 2.8" />
              <path d="M7.5 15c-.5.8-.8 2-.5 3 .5 1.5 2 2.5 4 2.8s4-.2 5.5-1.5c1-1 1.5-2.5 1.5-4" />
            </svg>
          </button>

          <button
            className="icon-btn"
            onClick={() => setShowReviewForm(f => !f)}
            style={{ width: 30, height: 30, color: 'var(--t1)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.7" style={{ width: 24, height: 24, stroke: 'currentColor' }}>
              <path d="M7 2v8a3 3 0 006 0V2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 2v20" strokeLinecap="round" />
              <path d="M17 2v6c0 1.1.9 2 2 2h0c0 1.1-.9 2-2 2v10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div style={{ flex: 1 }} />

          <button
            className="icon-btn"
            onClick={() => { if (!saved) setSavePop(true); handleToggleSave() }}
            style={{ width: 30, height: 30, color: saved ? 'var(--accent)' : 'var(--t1)' }}
          >
            <svg viewBox="0 0 24 24"
              className={savePop ? 'like-btn-active' : undefined}
              onAnimationEnd={() => setSavePop(false)}
              style={{
              width: 24, height: 24,
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
              transition: 'fill 0.15s var(--ease-out), stroke 0.15s var(--ease-out)',
            }}>
              <ellipse cx="12" cy="14" rx="8" ry="4" fill={saved ? 'var(--accent)' : 'none'} />
              <path d="M12 3v7" />
              <circle cx="12" cy="3" r="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>

        {liked && (
          <div style={{
            padding: '0 14px 4px',
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--t1)',
          }}>
            1 like
          </div>
        )}

        {/* Caption */}
        <div style={{ padding: '0 14px 10px' }}>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.55 }}>
            <span style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 700, color: 'var(--t1)',
            }}>
              {dish.name}
            </span>
            {' '}
            <span style={{ color: 'var(--t2)', fontWeight: 400 }}>
              {dish.description || `${dish.category} dish`}
            </span>
          </p>

          {dish.calories && dish.prep_time_min && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginTop: 7,
              fontFamily: "'DM Mono', monospace",
              fontSize: '0.7rem', color: 'var(--t3)',
            }}>
              <span>{dish.calories} kcal</span>
              <span style={{ color: 'var(--border-strong)' }}>·</span>
              <span>{dish.prep_time_min} min prep</span>
            </div>
          )}

          {tags.length > 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: 6, lineHeight: 1.8 }}>
              {tags.map(t => `#${t}`).join(' ')}
            </p>
          )}
        </div>

        {/* Allergens */}
        {allergens.length > 0 && (
          <div style={{ padding: '0 14px 10px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--t3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Allergens
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {allergens.map((a, i) => (
                <span key={i} style={{
                  fontSize: '0.68rem', fontWeight: 600,
                  padding: '3px 9px', borderRadius: 100,
                  background: a.severity === 'high' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                  color: a.severity === 'high' ? 'var(--red)' : '#D97706',
                  border: `1px solid ${a.severity === 'high' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                }}>
                  {a.allergen_name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Ingredients */}
        {ingredients.length > 0 && (
          <div style={{ padding: '0 14px 12px' }}>
            <button onClick={() => setShowIngredients(!showIngredients)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: '0.76rem', fontWeight: 600, color: 'var(--t2)',
              display: 'flex', alignItems: 'center', gap: 5,
              transition: 'color 150ms var(--ease-out)',
            }}>
              Ingredients ({ingredients.length})
              <svg viewBox="0 0 16 16" fill="currentColor" style={{
                width: 12, height: 12, color: 'var(--t4)',
                transform: showIngredients ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s var(--ease-out)',
              }}>
                <path d="M8 11L3 6h10l-5 5z" />
              </svg>
            </button>
            {showIngredients && (
              <div style={{
                marginTop: 8, padding: '10px 12px',
                background: 'var(--s2)', borderRadius: 10,
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 0' }}>
                  {ingredients.map((ing, i) => (
                    <span key={i} style={{
                      fontSize: '0.74rem', color: 'var(--t2)',
                      display: 'flex', alignItems: 'center', gap: 4,
                      marginRight: 10,
                    }}>
                      <span style={{
                        width: 4, height: 4, borderRadius: '50%',
                        background: 'var(--gold)', flexShrink: 0,
                      }} />
                      {ing.ingredients?.name}
                      {ing.quantity_grams && (
                        <span style={{
                          fontFamily: "'DM Mono', monospace",
                          color: 'var(--t4)', fontSize: '0.66rem',
                        }}>
                          {ing.quantity_grams}{ing.unit || 'g'}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Separator */}
        <div style={{ height: 1, background: 'var(--border)', margin: '0 14px' }} />

        {/* Add to order */}
        {dish.available && tableId ? (
          <div style={{ padding: '12px 14px' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px 0', fontSize: '0.88rem', fontWeight: 700, borderRadius: 12 }}
              onClick={() => { addDish(dish); onClose() }}
              onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
              onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              Add to Order · {formatPrice(dish.price)}
            </button>
          </div>
        ) : dish.available && !tableId ? (
          <div style={{ padding: '12px 14px' }}>
            <div style={{
              width: '100%', padding: '11px 0',
              textAlign: 'center', fontSize: '0.82rem',
              color: 'var(--t3)', fontWeight: 500,
              background: 'var(--s2)', borderRadius: 12,
              border: '1px solid var(--border)',
            }}>
              Scan QR at table to order
            </div>
          </div>
        ) : null}

        {/* Reviews section */}
        {reviews.length > 0 && (
          <div style={{ padding: '4px 14px 2px' }}>
            <div style={{
              fontSize: '0.7rem', fontWeight: 700, color: 'var(--t3)',
              textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
            }}>
              Reviews · {reviews.length}
            </div>
            <div>
              {reviews.slice(0, showReviewForm ? 20 : 3).map(r => (
                <div key={r.id} style={{
                  display: 'flex', gap: 9, marginBottom: 10, alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--s3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', fontWeight: 700, color: 'var(--t2)', flexShrink: 0,
                    border: '1px solid var(--border)',
                  }}>
                    {(r.users?.name || 'A')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2,
                    }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--t1)' }}>
                        {r.users?.name || 'Anonymous'}
                      </span>
                      <span style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: '0.66rem', color: 'var(--gold)', letterSpacing: 0.5,
                      }}>
                        {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                      </span>
                      <span style={{ fontSize: '0.64rem', color: 'var(--t4)', marginLeft: 'auto' }}>
                        {timeAgo(r.created_at)}
                      </span>
                    </div>
                    {r.body && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--t2)', lineHeight: 1.45, fontWeight: 400 }}>
                        {r.body}
                      </p>
                    )}
                    {r.photo && (
                      <img src={r.photo} alt="Review photo" loading="lazy" style={{
                        marginTop: 6, width: '100%', maxWidth: 220, borderRadius: 10,
                        border: '1px solid var(--border)', display: 'block',
                      }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!showReviewForm && reviews.length > 3 && (
              <button onClick={() => setShowReviewForm(true)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.76rem', color: 'var(--t3)', padding: '0 0 8px',
                fontWeight: 500,
              }}>
                View all {reviews.length} reviews
              </button>
            )}
          </div>
        )}

        {/* Write review */}
        {session && !hasReviewed && (
          <div style={{
            padding: '10px 14px 14px',
            borderTop: '1px solid var(--border)',
          }}>
            {!showReviewForm ? (
              <button onClick={() => setShowReviewForm(true)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', color: 'var(--t3)', padding: 0, fontWeight: 500,
              }}>
                Add a review...
              </button>
            ) : (
              <form onSubmit={handleSubmitReview}>
                {/* Star rating */}
                <div style={{
                  display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center',
                }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setMyRating(n)} style={{
                      background: 'none', border: 'none',
                      fontSize: '1.4rem', cursor: 'pointer', padding: 2,
                      color: n <= myRating ? 'var(--gold)' : 'var(--border-strong)',
                      transition: 'color 0.1s var(--ease-out), transform 0.1s var(--ease-out)',
                      transform: n <= myRating ? 'scale(1.12)' : 'scale(1)',
                      lineHeight: 1,
                    }}>
                      {n <= myRating ? '★' : '☆'}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    className="input"
                    placeholder="Write a review..."
                    value={myBody}
                    onChange={e => setMyBody(e.target.value)}
                    style={{ flex: 1, fontSize: '0.82rem', padding: '9px 13px', borderRadius: 20 }}
                  />
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      if (myPhotoPreview) URL.revokeObjectURL(myPhotoPreview)
                      setMyPhoto(f)
                      setMyPhotoPreview(URL.createObjectURL(f))
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    aria-label="Add photo"
                    style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: myPhoto ? 'var(--gold)' : 'var(--s2)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                      fontSize: '0.95rem', lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    📷
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: 20, flexShrink: 0 }}
                    disabled={submitting || !myRating}
                  >
                    {submitting ? '...' : 'Post'}
                  </button>
                </div>
                {myPhotoPreview && (
                  <div style={{ position: 'relative', display: 'inline-block', marginTop: 8 }}>
                    <img src={myPhotoPreview} alt="Preview" style={{
                      width: 72, height: 72, objectFit: 'cover', borderRadius: 10,
                      border: '1px solid var(--border)', display: 'block',
                    }} />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => {
                        URL.revokeObjectURL(myPhotoPreview)
                        setMyPhoto(null)
                        setMyPhotoPreview(null)
                      }}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'var(--t1)', color: 'var(--s1)',
                        border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1, padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                {reviewError && (
                  <p style={{ color: 'var(--red)', fontSize: '0.72rem', marginTop: 5 }}>
                    {reviewError}
                  </p>
                )}
              </form>
            )}
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}
