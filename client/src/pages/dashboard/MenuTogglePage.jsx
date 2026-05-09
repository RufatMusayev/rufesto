import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { categoryEmoji, formatPrice } from '../../lib/helpers'

export default function MenuTogglePage() {
  const { restaurantId } = useAuth()
  const [dishes,   setDishes]   = useState([])
  const [sections, setSections] = useState([])
  const [active,   setActive]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [toggling, setToggling] = useState(new Set())

  useEffect(() => {
    if (!restaurantId) return
    load()

    const channel = supabase
      .channel('menu-toggle-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dishes', filter: `restaurant_id=eq.${restaurantId}` },
        payload => setDishes(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d)))
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
    setActive(s?.[0]?.id || null)
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

  const filtered = active ? dishes.filter(d => d.menu_section_id === active) : dishes
  const availCount = filtered.filter(d => d.available).length

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1 className="page-title">Menu Toggle</h1>
        <span style={{ fontSize: '0.8rem', color: 'var(--t3)' }}>{availCount}/{filtered.length} available</span>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1.25rem' }}>
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

      {loading ? (
        <div style={{ color: 'var(--t3)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(d => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.85rem',
              background: 'var(--s2)', borderRadius: 12, padding: '0.85rem 1rem',
              border: '1px solid var(--border)',
              opacity: d.available ? 1 : 0.6, transition: 'opacity 0.2s',
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 10,
                background: 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem', flexShrink: 0,
              }}>{categoryEmoji(d.category)}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--t2)', marginTop: 2 }}>
                  {formatPrice(d.price)}
                  {d.menu_sections?.name && <span style={{ color: 'var(--t3)', marginLeft: 6 }}>· {d.menu_sections.name}</span>}
                </div>
              </div>

              <Toggle on={d.available} loading={toggling.has(d.id)} onToggle={() => toggle(d)} />
            </div>
          ))}
        </div>
      )}
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
