import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { categoryEmoji, dishBackground, formatPrice } from '../lib/helpers'

/** Sponsored campaign card — interleaved into the home feed. */
export default function PromoCard({ campaign, index, onDishClick }) {
  const navigate = useNavigate()
  const dish = campaign.dishes
  const restaurant = campaign.restaurants
  const photo = campaign.image_url || dish?.photo

  function handleClick() {
    // Fire-and-forget click tracking — never block the UI on this
    try {
      supabase
        .rpc('track_campaign', { p_campaign_id: campaign.id, p_event: 'click' })
        .then(() => {}, () => {})
    } catch { /* ignore */ }

    if (dish) onDishClick(dish)
    else if (restaurant?.slug) navigate(`/restaurant/${restaurant.slug}`)
  }

  return (
    <article
      className="menu-card feed-post stagger-item"
      onClick={handleClick}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms`, cursor: 'pointer' }}
    >
      {/* Header — restaurant + promoted label */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 10,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: dishBackground(dish?.category),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', border: '1.5px solid var(--gold)',
        }}>
          {categoryEmoji(dish?.category)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--t1)' }}>
            {restaurant?.name}
          </span>
          <div style={{ fontSize: '0.68rem', color: 'var(--t3)', marginTop: 1 }}>
            Sponsored
          </div>
        </div>
        <span style={{
          fontSize: '0.6rem', fontWeight: 700, color: 'var(--gold)',
          textTransform: 'uppercase', letterSpacing: 1,
          padding: '3px 9px', borderRadius: 100, flexShrink: 0,
          background: 'rgba(196,154,44,0.12)', border: '1px solid rgba(196,154,44,0.35)',
        }}>
          Promoted
        </span>
      </div>

      {/* Image — campaign image, dish photo, or category gradient */}
      {(photo || dish) && (
        <div style={{
          width: '100%', aspectRatio: '4/3',
          background: photo ? '#000' : dishBackground(dish?.category),
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '5rem', overflow: 'hidden',
          userSelect: 'none',
        }}>
          {photo ? (
            <img src={photo} alt={dish?.name || campaign.title || campaign.name} loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
          ) : (
            <span style={{ filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.5))' }}>
              {categoryEmoji(dish?.category)}
            </span>
          )}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.3) 100%)',
            pointerEvents: 'none',
          }} />
          {dish && (
            <div style={{
              position: 'absolute', bottom: 14, left: 14,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: 10, padding: '6px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f5f5f5' }}>{dish.name}</span>
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)',
              }}>
                {formatPrice(dish.price)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Caption — title + description */}
      <div style={{ padding: '12px 16px 14px' }}>
        <p style={{ fontSize: '0.86rem', lineHeight: 1.55 }}>
          <span style={{
            fontWeight: 700, color: 'var(--t1)',
            fontFamily: "'Playfair Display', serif",
          }}>
            {campaign.title || campaign.name}
          </span>
          {campaign.description && (
            <>
              {' '}
              <span style={{ color: 'var(--t2)', fontWeight: 400 }}>
                {campaign.description.length > 140
                  ? campaign.description.slice(0, 140) + '…'
                  : campaign.description}
              </span>
            </>
          )}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600 }}>
            {dish ? 'View dish →' : 'Visit restaurant →'}
          </span>
          {dish?.review_count > 0 && (
            <span style={{
              fontSize: '0.7rem', color: 'var(--gold)',
              fontFamily: "'DM Mono', monospace",
            }}>
              ★ {Number(dish.avg_rating || 0).toFixed(1)} ({dish.review_count})
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
