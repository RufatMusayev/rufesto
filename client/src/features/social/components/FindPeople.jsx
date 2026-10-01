import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { searchUsers } from '../api'
import { useDebounced } from '../hooks'
import FriendRow, { RowSkeletons } from './FriendRow'
import FriendButton from './FriendButton'
import UserSearchInput from './UserSearchInput'

const MIN_CHARS = 2

/** "Find" tab: debounced user search (300ms, 2+ characters) with an Add / Pending / Friends control per result. */
export default function FindPeople({ guard, onError, onRelationChange }) {
  const { t } = useTranslation('social')
  const [q, setQ] = useState('')
  const debounced = useDebounced(q.trim(), 300)
  const [state, setState] = useState({ results: null, loading: false, error: null })
  const [attempt, setAttempt] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    if (debounced.length < MIN_CHARS) {
      seq.current++
      setState({ results: null, loading: false, error: null })
      return
    }
    const mine = ++seq.current
    setState(s => ({ ...s, loading: true, error: null }))
    searchUsers(debounced).then(({ data, error }) => {
      if (mine !== seq.current) return
      setState(error ? { results: null, loading: false, error } : { results: data, loading: false, error: null })
    })
  }, [debounced, attempt])

  function setStatus(userId, status) {
    setState(s => ({
      ...s,
      results: s.results ? s.results.map(r => (r.id === userId ? { ...r, status } : r)) : s.results,
    }))
    onRelationChange?.()
  }

  const typedEnough = q.trim().length >= MIN_CHARS
  const waiting = typedEnough && (state.loading || debounced !== q.trim())

  let body
  if (!typedEnough) {
    body = <p className="soc-hint">{q.trim() ? t('find.minChars') : t('find.hint')}</p>
  } else if (state.error) {
    body = <LoadError onRetry={() => setAttempt(a => a + 1)} />
  } else if (waiting && !state.results) {
    body = <RowSkeletons count={4} />
  } else if (state.results && state.results.length === 0) {
    body = <EmptyState icon="🔍" title={t('find.noResults')} body={t('find.noResultsBody')} />
  } else if (state.results) {
    body = (
      <div className={waiting ? 'soc-dim' : undefined}>
        {state.results.map(u => (
          <FriendRow
            key={u.id}
            user={u}
            right={(
              <FriendButton
                userId={u.id} name={u.name} status={u.status}
                onChange={setStatus} onError={onError} guard={guard}
              />
            )}
          />
        ))}
      </div>
    )
  }

  return (
    <div>
      <UserSearchInput value={q} onChange={setQ} placeholder={t('find.placeholder')} autoFocus />
      <div className="soc-list">{body}</div>
    </div>
  )
}
