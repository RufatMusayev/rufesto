import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { categoryEmoji, formatPrice } from '@shared/helpers'
import DishFormModal from '../components/DishFormModal'
import DeleteConfirmModal from '../components/DeleteConfirmModal'

export default function MenuPage() {
  const { restaurantId } = useAuth()
  const [dishes, setDishes] = useState([])
  const [sections, setSections] = useState([])
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(new Set())

  const [showAdd, setShowAdd] = useState(false)
  const [editDish, setEditDish] = useState(null)
  const [deleteDish, setDeleteDish] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!restaurantId) return
    load()

    const channel = supabase
      .channel(`menu-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes', filter: `restaurant_id=eq.${restaurantId}` },
        payload => {
          if (payload.eventType === 'DELETE') {
            setDishes(prev => prev.filter(d => d.id !== payload.old.id))
          } else {
            setDishes(prev => {
              const exists = prev.find(d => d.id === payload.new.id)
              if (exists) return prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d)
              return [...prev, payload.new]
            })
          }
        })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [restaurantId])

  async function load() {
    const [{ data: d }, { data: s }] = await Promise.all([
      supabase.from('dishes').select('*, menu_sections(name)').eq('restaurant_id', restaurantId).order('sort_order'),
      supabase.from('menu_sections').select('*, menus!inner(restaurant_id)').eq('menus.restaurant_id', restaurantId).order('sort_order'),
    ])
    setDishes(d || [])
    setSections(s || [])
    setLoading(false)
  }

  async function toggle(dish) {
    setToggling(prev => new Set(prev).add(dish.id))
    const { error } = await supabase
      .from('dishes')
      .update({ available: !dish.available, toggled_at: new Date().toISOString() })
      .eq('id', dish.id)

    if (!error) {
      setDishes(prev => prev.map(d => d.id === dish.id ? { ...d, available: !d.available } : d))
    }
    setToggling(prev => { const s = new Set(prev); s.delete(dish.id); return s })
  }

  async function handleDelete(id) {
    setDeleting(true)
    const dish = dishes.find(d => d.id === id)
    if (dish?.photo) {
      const path = dish.photo.split('/dish-photos/')[1]
      if (path) await supabase.storage.from('dish-photos').remove([path])
    }
    await supabase.from('dish_photos').delete().eq('dish_id', id)
    await supabase.from('dishes').delete().eq('id', id)
    setDishes(prev => prev.filter(d => d.id !== id))
    setDeleteDish(null)
    setDeleting(false)
  }

  const filtered = active ? dishes.filter(d => d.menu_section_id === active) : dishes
  const availCount = filtered.filter(d => d.available).length

  return (
    <div style={{ padding: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">Menu</h1>
          <span style={{ fontSize: '0.75rem', color: 'var(--t3)' }}>
            {availCount}/{filtered.length} available · {dishes.length} total
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ gap: '0.35rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Dish
        </button>
      </div>

      {/* Section chips */}
      <div className="no-scrollbar" style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1.25rem' }}>
        <button className={`chip${!active ? ' active' : ''}`}
          onClick={() => setActive(null)}>All ({dishes.length})</button>
        {sections.map(s => {
          const cnt = dishes.filter(d => d.menu_section_id === s.id).length
          return (
            <button key={s.id} className={`chip${active === s.id ? ' active' : ''}`}
              onClick={() => setActive(s.id)}>{s.name} ({cnt})</button>
          )
        })}
      </div>

      {/* Dish list */}
      {loading ? (
        <div style={{ color: 'var(--t3)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🍽️</div>
          No dishes yet. Add your first dish.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(d => (
            <DishRow key={d.id} dish={d}
              toggling={toggling.has(d.id)}
              onToggle={() => toggle(d)}
              onEdit={() => setEditDish(d)}
              onDelete={() => setDeleteDish(d)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <DishFormModal
          sections={sections}
          restaurantId={restaurantId}
          onClose={() => setShowAdd(false)}
          onSaved={load}
        />
      )}
      {editDish && (
        <DishFormModal
          dish={editDish}
          sections={sections}
          restaurantId={restaurantId}
          onClose={() => setEditDish(null)}
          onSaved={load}
        />
      )}
      {deleteDish && (
        <DeleteConfirmModal
          dishName={deleteDish.name}
          loading={deleting}
          onConfirm={() => handleDelete(deleteDish.id)}
          onCancel={() => setDeleteDish(null)}
        />
      )}
    </div>
  )
}

function DishRow({ dish: d, toggling, onToggle, onEdit, onDelete }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.85rem',
      background: 'var(--s2)', borderRadius: 12, padding: '0.85rem 1rem',
      border: '1px solid var(--border)',
      opacity: d.available ? 1 : 0.6, transition: 'opacity 0.2s',
    }}>
      {/* Photo or emoji */}
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.4rem', flexShrink: 0, overflow: 'hidden',
      }}>
        {d.photo ? (
          <img src={d.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          categoryEmoji(d.category)
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.name}
          </span>
          {d.is_featured && (
            <span style={{ fontSize: '0.6rem', background: 'rgba(196,154,44,0.15)', color: 'var(--gold)', padding: '1px 6px', borderRadius: 100, fontWeight: 600 }}>
              Featured
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--t2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          {formatPrice(d.price)}
          {d.menu_sections?.name && <span style={{ color: 'var(--t3)' }}>· {d.menu_sections.name}</span>}
          {d.is_vegan && <span style={{ fontSize: '0.7rem' }}>🌱</span>}
          {d.is_vegetarian && <span style={{ fontSize: '0.7rem' }}>🥬</span>}
          {d.is_gluten_free && <span style={{ fontSize: '0.7rem' }}>🌾</span>}
          {d.is_spicy && <span style={{ fontSize: '0.7rem' }}>🌶️</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <button onClick={onEdit} title="Edit" style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'none', border: 'none', color: 'var(--t3)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--t1)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button onClick={onDelete} title="Delete" style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'none', border: 'none', color: 'var(--t3)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
        <Toggle on={d.available} loading={toggling} onToggle={onToggle} />
      </div>
    </div>
  )
}

function Toggle({ on, loading, onToggle }) {
  return (
    <button onClick={onToggle} disabled={loading} style={{
      width: 48, height: 26, borderRadius: 100, flexShrink: 0,
      background: on ? 'var(--green)' : 'var(--s4)',
      border: 'none',
      cursor: loading ? 'wait' : 'pointer',
      position: 'relative', transition: 'background 0.2s',
      opacity: loading ? 0.5 : 1,
    }}>
      <div style={{
        position: 'absolute',
        left: on ? 'calc(100% - 22px)' : 3,
        top: '50%', transform: 'translateY(-50%)',
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}
