import { useState, useRef, useEffect, useMemo } from 'react'

const SUGGESTIONS = [
  { label: 'Recommend a restaurant', icon: '🍽' },
  { label: "What's popular right now?", icon: '🔥' },
  { label: 'Show me Azerbaijani food', icon: '🇦🇿' },
  { label: 'Best Italian nearby', icon: '🍝' },
]

const RESPONSES = {
  'recommend a restaurant': "Based on what's trending, I'd suggest **Səda Ocağı** in İçərişəhər for authentic Azerbaijani cuisine, or **Sakura House** if you're in the mood for Japanese. Both have dishes available right now!",
  "what's popular right now?": "Right now, the most reviewed dishes are:\n\n🥇 **Margherita Pizza** at Bella Roma\n🥈 **Piti** at Səda Ocağı\n🥉 **Dragon Roll** at Sakura House\n\nAll currently available!",
  'show me azerbaijani food': "**Səda Ocağı** in İçərişəhər is your go-to! Try their:\n\n• **Piti** — slow-cooked lamb stew\n• **Dolma** — stuffed grape leaves\n• **Lavangi** — stuffed chicken\n\nAll dishes have real-time availability — check their menu to see what's cooking right now.",
  'best italian nearby': "**Trattoria Bella Roma** on Nizami St 42 is the top-rated Italian spot. Their highlights:\n\n• **Margherita Pizza** — classic\n• **Truffle Risotto** — chef's special\n• **Tiramisu** — highly reviewed\n\nYou can book a table right from their page!",
}

const DEFAULT_RESPONSE = "I'm still learning! Soon I'll be able to help with personalized restaurant recommendations, dietary preferences, and real-time availability. For now, try the **Explore** tab to discover dishes, or check out individual restaurant menus for live availability."

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 768)
  useEffect(() => {
    const h = () => setMobile(window.innerWidth <= 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return mobile
}

export default function AIPage() {
  const isMobile = useIsMobile()
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Hello! I'm your Rufesto assistant. How can I help you find the perfect meal today?" },
  ])
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend(text) {
    const msg = text || input.trim()
    if (!msg) return

    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setInput('')

    setTimeout(() => {
      const key = msg.toLowerCase().trim()
      const response = RESPONSES[key] || DEFAULT_RESPONSE
      setMessages(prev => [...prev, { role: 'bot', text: response }])
    }, 600)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const showSuggestions = messages.length <= 1

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: isMobile
        ? 'calc(100dvh - var(--nav-h) - var(--bottom-h))'
        : '100dvh',
      maxWidth: 470, margin: '0 auto',
    }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 10,
            animation: 'fadeSlideUp 0.3s ease forwards',
          }}>
            {m.role === 'bot' && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--accent)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', marginRight: 8, marginTop: 2,
              }}>🤖</div>
            )}
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: m.role === 'user' ? 'var(--accent)' : 'var(--s3)',
              color: m.role === 'user' ? '#F5F0E8' : 'var(--t1)',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}>
              {renderText(m.text)}
            </div>
          </div>
        ))}

        {showSuggestions && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 8, marginTop: 12,
          }}>
            {SUGGESTIONS.map(s => (
              <button
                key={s.label}
                onClick={() => handleSend(s.label)}
                style={{
                  padding: '12px 10px',
                  background: 'var(--s2)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <span style={{ fontSize: '1.2rem', display: 'block', marginBottom: 4 }}>{s.icon}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--t1)' }}>{s.label}</span>
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--s3)',
          borderRadius: 24,
          padding: '4px 4px 4px 16px',
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about restaurants..."
            style={{
              flex: 1, border: 'none', background: 'none',
              color: 'var(--t1)', fontSize: '0.88rem',
              outline: 'none', padding: '8px 0',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: input.trim() ? 'var(--accent)' : 'var(--s4)',
              border: 'none', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#F5F0E8' : 'var(--t3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div style={{ textAlign: 'center', padding: '6px 0 2px', fontSize: '0.65rem', color: 'var(--t4)' }}>
          Preview — AI features coming soon
        </div>
      </div>
    </div>
  )
}

function renderText(text) {
  const parts = text.split(/(\*\*.*?\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}
