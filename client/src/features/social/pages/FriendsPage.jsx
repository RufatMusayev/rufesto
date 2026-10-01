import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { cleanDisplayName, timeAgo } from '../../../lib/helpers'
import { useRequireAuth, useToast } from '../hooks'
import { useFriendsData } from '../useFriendsData'
import TopBar from '../components/TopBar'
import SignInCard from '../components/SignInCard'
import FriendRow, { RowSkeletons } from '../components/FriendRow'
import FindPeople from '../components/FindPeople'
import ConfirmSheet from '../components/ConfirmSheet'
import { MoreIcon } from '../components/Icons'

const TABS = ['friends', 'requests', 'find']

export default function FriendsPage() {
  const { t, i18n } = useTranslation('social')
  const { session, authLoading, requireAuth, authModal } = useRequireAuth()
  const { toast, showToast } = useToast()
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'friends'
  const setTab = id => setParams(id === 'friends' ? {} : { tab: id }, { replace: true })
  const data = useFriendsData(session?.user?.id)

  const page = children => (
    <div className="soc-page">
      <TopBar title={t('friends.title')} />
      {children}
      {toast}
      {authModal}
    </div>
  )

  if (authLoading) return page(<div className="soc-body"><RowSkeletons /></div>)
  if (!session) {
    return page(<div className="soc-body"><SignInCard title={t('friends.signInTitle')} body={t('friends.signInBody')} /></div>)
  }

  const incomingCount = data.incoming.length
  return page(
    <>
      <div className="soc-tabs no-scrollbar" role="tablist" aria-label={t('friends.title')}>
        {TABS.map(id => (
          <button
            key={id} type="button" role="tab" aria-selected={tab === id}
            className={`chip${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}
          >
            {t(`friends.tab_${id}`)}
            {id === 'requests' && incomingCount > 0
              ? <span className="soc-count-badge" aria-label={t('friends.pendingCount', { count: incomingCount })}>{incomingCount}</span>
              : null}
          </button>
        ))}
      </div>
      <div className="soc-body">
        {tab === 'find' ? (
          <FindPeople guard={requireAuth} onError={k => showToast(k)} onRelationChange={() => data.reload({ silent: true })} />
        ) : data.error ? (
          <LoadError onRetry={() => data.reload()} />
        ) : data.loading ? (
          <RowSkeletons />
        ) : tab === 'friends' ? (
          <FriendsList data={data} lang={i18n.language} goFind={() => setTab('find')} />
        ) : (
          <RequestsList data={data} lang={i18n.language} onError={k => showToast(k)} />
        )}
      </div>
    </>,
  )
}

function FriendsList({ data, lang, goFind }) {
  const { t } = useTranslation('social')
  const [target, setTarget] = useState(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)

  if (data.friends.length === 0) {
    return (
      <EmptyState
        icon="🍽️" title={t('friends.emptyTitle')} body={t('friends.emptyBody')}
        action={<button type="button" className="btn btn-primary" onClick={goFind}>{t('friends.emptyAction')}</button>}
      />
    )
  }

  async function confirm() {
    setPending(true)
    setError(null)
    const { error: err } = await data.unfriend(target)
    setPending(false)
    if (err) { setError(err.key); return }
    setTarget(null)
  }

  return (
    <div className="soc-list">
      {data.friends.map(f => (
        <FriendRow
          key={f.userId}
          user={{ id: f.userId, name: f.name, photo: f.photo }}
          subtitle={f.since ? t('friends.since', { when: timeAgo(f.since, lang) }) : null}
          right={(
            <button
              type="button" className="icon-btn" aria-label={t('friends.more', { name: cleanDisplayName(f.name) })}
              onClick={() => { setError(null); setTarget(f) }}
            >
              <MoreIcon />
            </button>
          )}
        />
      ))}
      <ConfirmSheet
        open={!!target}
        title={t('friend.removeTitle', { name: cleanDisplayName(target?.name) })}
        body={t('friend.removeBody', { name: cleanDisplayName(target?.name) })}
        confirmLabel={t('friend.removeConfirm')}
        pending={pending}
        error={error}
        onConfirm={confirm}
        onClose={() => setTarget(null)}
      />
    </div>
  )
}

function RequestsList({ data, lang, onError }) {
  const { t } = useTranslation('social')
  const [busy, setBusy] = useState(() => new Set())

  if (data.incoming.length === 0 && data.outgoing.length === 0) {
    return <EmptyState icon="📬" title={t('requests.emptyTitle')} body={t('requests.emptyBody')} />
  }

  async function run(req, fn) {
    if (busy.has(req.id)) return
    setBusy(s => new Set(s).add(req.id))
    const { error } = await fn(req)
    setBusy(s => { const n = new Set(s); n.delete(req.id); return n })
    if (error) onError(error.key)
  }

  return (
    <div>
      {data.incoming.length > 0 && (
        <section>
          <h2 className="soc-section-title">{t('requests.incoming')}</h2>
          <div className="soc-list">
            {data.incoming.map(r => (
              <FriendRow
                key={r.id}
                user={{ id: r.userId, name: r.name, photo: r.photo }}
                subtitle={r.createdAt ? timeAgo(r.createdAt, lang) : null}
                stack
                right={(
                  <>
                    <button type="button" className="btn btn-primary soc-btn-sm" disabled={busy.has(r.id)} onClick={() => run(r, data.accept)}>
                      {t('requests.accept')}
                    </button>
                    <button type="button" className="btn btn-ghost soc-btn-sm" disabled={busy.has(r.id)} onClick={() => run(r, data.decline)}>
                      {t('requests.decline')}
                    </button>
                  </>
                )}
              />
            ))}
          </div>
        </section>
      )}
      {data.outgoing.length > 0 && (
        <section>
          <h2 className="soc-section-title">{t('requests.outgoing')}</h2>
          <div className="soc-list">
            {data.outgoing.map(r => (
              <FriendRow
                key={r.id}
                user={{ id: r.userId, name: r.name, photo: r.photo }}
                subtitle={r.createdAt ? timeAgo(r.createdAt, lang) : null}
                right={(
                  <button type="button" className="btn btn-ghost soc-btn-sm" disabled={busy.has(r.id)} onClick={() => run(r, data.cancel)}>
                    {t('requests.cancel')}
                  </button>
                )}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
