import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROMPT_EVENT, listenForSwNavigation } from './events'

// The prompt (and everything it pulls in: push.js, the RPC layer) is fetched only when a prompt is actually due.
const PushPrompt = lazy(() => import('./PushPrompt'))

/**
 * Mounted once, inside the router, by AppLayout. Two jobs:
 *  - a tap on a push notification asks this tab (public/sw.js) to open a page: navigate there without a reload;
 *  - draws the contextual "turn on notifications?" prompt when prompt.js announces one.
 */
export default function NotificationsHost() {
  const navigate = useNavigate()
  const [kind, setKind] = useState(null)

  useEffect(() => listenForSwNavigation(navigate), [navigate])

  useEffect(() => {
    const onPrompt = e => setKind(e.detail && e.detail.kind ? e.detail.kind : null)
    window.addEventListener(PROMPT_EVENT, onPrompt)
    return () => window.removeEventListener(PROMPT_EVENT, onPrompt)
  }, [])

  if (!kind) return null
  return (
    <Suspense fallback={null}>
      <PushPrompt kind={kind} onClose={() => setKind(null)} />
    </Suspense>
  )
}
