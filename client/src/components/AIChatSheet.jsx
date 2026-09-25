import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

/* ── Demo knowledge base (canned, references seed restaurants/dishes) ───────── */

const R = {
  bella:  { slug: 'bella-roma',   name: 'Trattoria Bella Roma' },
  seda:   { slug: 'seda-ocagi',   name: 'Səda Ocağı' },
  sakura: { slug: 'sakura-house', name: 'Sakura House' },
}

/* Copy for greeting/answers/quick chips lives in locales/{en,az}/ai.json (keys below),
 * so the demo speaks the visitor's chosen language instead of always English. */
const ANSWER_LINKS = {
  recommend:  [R.seda, R.bella],
  popular:    [R.bella, R.seda, R.sakura],
  azeri:      [R.seda],
  italian:    [R.bella],
  sushi:      [R.sakura],
  vegetarian: [R.bella, R.seda],
  surprise:   [R.sakura],
}

const QUICK_IDS = ['recommend', 'popular', 'azeri', 'italian', 'sushi', 'vegetarian', 'surprise']

/* keyword → answer id for free-text input (matches both English and Azerbaijani terms) */
function matchKeyword(raw) {
  const t = raw.toLowerCase()
  if (/(italian|pizza|pasta|risotto|bella|italyan)/.test(t)) return 'italian'
  if (/(sushi|japanese|roll|nigiri|sakura|suşi|yapon)/.test(t)) return 'sushi'
  if (/(azer|piti|dolma|lavangi|lavəngi|local|səda|seda|azərbaycan)/.test(t)) return 'azeri'
  if (/(veg|vegan|vegetarian|plant|vegetarian)/.test(t)) return 'vegetarian'
  if (/(popular|trend|best|top|reviewed|populyar|məşhur)/.test(t)) return 'popular'
  if (/(recommend|suggest|where|place|eat|hungry|tövsiyə|harada|ac )/.test(t)) return 'recommend'
  if (/(surprise|random|anything|whatever|sürpriz|təəccübləndir)/.test(t)) return 'surprise'
  return null
}

const cap = s => s[0].toUpperCase() + s.slice(1)

export default function AIChatSheet({ onClose }) {
  const { t } = useTranslation('ai')
  const navigate = useNavigate()
  const [messages, setMessages] = useState(() => [{ role: 'bot', text: t('greeting') }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const scrollRef = useRef(null)
  const timerRef = useRef(null)

  const QUICK = QUICK_IDS.map(id => ({ id, label: t(`quick${cap(id)}`) }))

  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => {
      document.body.classList.remove('modal-open')
      clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  function ask(id, userText) {
    const text = id ? t(`answer${cap(id)}`) : t('answerDefault')
    const links = id ? ANSWER_LINKS[id] : undefined
    setMessages(prev => [...prev, { role: 'user', text: userText }])
    setInput('')
    setTyping(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setTyping(false)
      setMessages(prev => [...prev, { role: 'bot', text, links }])
    }, 750)
  }

  function handleQuick(q) {
    ask(q.id, q.label.replace(/^\S+\s/, '')) // strip leading emoji for the user bubble
  }

  function handleSend() {
    const text = input.trim()
    if (!text) return
    ask(matchKeyword(text), text)
  }

  function goToRestaurant(slug) {
    onClose()
    navigate(`/restaurant/${slug}`)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="sheet"
        onClick={e => e.stopPropagation()}
        style={{ height: '86vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px 12px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'var(--brand-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <SparkleIcon size={20} color="#F5F0E8" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.05rem', fontWeight: 700, color: 'var(--t1)', lineHeight: 1.1 }}>
              {t('title')}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--t2)', marginTop: 2 }}>
              {t('subtitle')}
            </div>
          </div>
          <button onClick={onClose} aria-label={t('close')} className="icon-btn" style={{ width: 34, height: 34, color: 'var(--t2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
          {messages.map((m, i) => (
            <Bubble key={i} message={m} onLink={goToRestaurant} />
          ))}
          {typing && <TypingBubble />}
        </div>

        {/* Quick questions */}
        <div className="no-scrollbar" style={{
          display: 'flex', gap: 8, overflowX: 'auto',
          padding: '10px 14px', borderTop: '1px solid var(--border)',
        }}>
          {QUICK.map(q => (
            <button
              key={q.id}
              onClick={() => handleQuick(q)}
              style={{
                flexShrink: 0,
                padding: '8px 14px', borderRadius: 100,
                background: 'var(--s2)', border: '1px solid var(--border)',
                color: 'var(--t1)', fontSize: '0.78rem', fontWeight: 500,
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ padding: '10px 14px calc(10px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--s3)', borderRadius: 24, padding: '4px 4px 4px 16px' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend() } }}
              placeholder={t('inputPlaceholder')}
              style={{ flex: 1, border: 'none', background: 'none', color: 'var(--t1)', fontSize: '0.88rem', outline: 'none', padding: '8px 0', fontFamily: 'inherit' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              aria-label={t('send')}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: input.trim() ? 'var(--accent)' : 'var(--s4)',
                border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s', flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#F5F0E8' : 'var(--t3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Bubble({ message, onLink }) {
  const isUser = message.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 10,
      animation: 'fadeSlideUp 0.3s ease forwards',
    }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--brand-gradient)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginRight: 8, marginTop: 2,
        }}>
          <SparkleIcon size={14} color="#F5F0E8" />
        </div>
      )}
      <div style={{ maxWidth: '82%' }}>
        <div style={{
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? 'var(--accent)' : 'var(--s3)',
          color: isUser ? '#F5F0E8' : 'var(--t1)',
          fontSize: '0.85rem', lineHeight: 1.5, whiteSpace: 'pre-wrap',
        }}>
          {renderText(message.text)}
        </div>
        {message.links?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {message.links.map(l => (
              <button
                key={l.slug}
                onClick={() => onLink(l.slug)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 100,
                  background: 'var(--s2)', border: '1px solid var(--gold)',
                  color: 'var(--gold)', fontSize: '0.76rem', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {l.name}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'var(--brand-gradient)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginRight: 8, marginTop: 2,
      }}>
        <SparkleIcon size={14} color="#F5F0E8" />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '14px 14px', borderRadius: '16px 16px 16px 4px',
        background: 'var(--s3)',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%', background: 'var(--t2)',
            display: 'inline-block',
            animation: 'availPulse 1.1s ease-in-out infinite',
            animationDelay: `${i * 0.18}s`,
          }} />
        ))}
      </div>
    </div>
  )
}

function SparkleIcon({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.5l1.7 4.8a3 3 0 0 0 1.9 1.9L20.5 11l-4.9 1.8a3 3 0 0 0-1.9 1.9L12 19.5l-1.7-4.8a3 3 0 0 0-1.9-1.9L3.5 11l4.9-1.8a3 3 0 0 0 1.9-1.9L12 2.5z" />
      <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" opacity="0.85" />
    </svg>
  )
}

function renderText(text) {
  return text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  )
}
