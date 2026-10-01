import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { useAuth } from '../../../contexts/AuthContext'
import { bakuDateString } from '../../../lib/bookingSlots'
import { createGroupBooking, getRestaurantBySlug } from '../api'
import { SLOT_ERRORS } from '../errors'
import { useRequireAuth } from '../hooks'
import { useSlots } from '../useSlots'
import { formatDateStr, isValidPhone } from '../timeFormat'
import TopBar from '../components/TopBar'
import SignInCard from '../components/SignInCard'
import RestaurantHeader from '../components/RestaurantHeader'
import DayStrip from '../components/DayStrip'
import PartyStepper from '../components/PartyStepper'
import SlotPicker, { allNotBookable } from '../components/SlotPicker'
import BookingSummary from '../components/BookingSummary'
import ConfirmForm from '../components/ConfirmForm'
import CreatedPanel from '../components/CreatedPanel'

const STEPS = 3
const DAYS = 30

function useRestaurant(slug) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState({ loading: true, data: null, error: null })
    getRestaurantBySlug(slug).then(({ data, error }) => {
      if (!cancelled) setState({ loading: false, data, error })
    })
    return () => { cancelled = true }
  }, [slug, attempt])
  return [state, () => setAttempt(a => a + 1)]
}

function Dots({ step }) {
  const { t } = useTranslation('bookings')
  return (
    <ol className="bk-dots" aria-label={t('wizard.stepOf', { n: step, total: STEPS })}>
      {Array.from({ length: STEPS }, (_, i) => (
        <li key={i} className={i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''} aria-current={i + 1 === step ? 'step' : undefined} />
      ))}
    </ol>
  )
}

export default function BookGroupPage() {
  const { slug } = useParams()
  const { t, i18n } = useTranslation(['bookings', 'common'])
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [rest, retryRest] = useRestaurant(slug)
  const restaurant = rest.data

  const today = useMemo(() => bakuDateString(), [])
  const [step, setStep] = useState(1)
  const [date, setDate] = useState(today)
  const [party, setParty] = useState(4)
  const [time, setTime] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', note: '', consent: false })
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState(null)
  const [disabledHere, setDisabledHere] = useState(false)
  const busy = useRef(false)

  const { session, authLoading, requireAuth, authModal } = useRequireAuth(() => setStep(3))
  const [slots, reloadSlots] = useSlots(restaurant?.id, date, party, step === 2)

  // Prefill the host from the profile once it is there, never over what the guest already typed.
  useEffect(() => {
    if (!profile) return
    setForm(f => ({ ...f, name: f.name || profile.name || '', phone: f.phone || profile.phone || '' }))
  }, [profile])

  // A time that stops being available (new slots arrived) must not stay selected.
  useEffect(() => {
    if (time && !slots.loading && !slots.slots.some(s => s.time === time && s.available)) setTime(null)
  }, [slots, time])

  const backTo = `/restaurant/${slug}`
  function back() {
    if (created) { navigate(backTo); return }
    if (step > 1) setStep(step - 1)
    else navigate(-1)
  }
  const pickDate = d => { setDate(d); setTime(null) }
  const pickParty = n => { setParty(n); setTime(null) }

  function toStep3() {
    if (!time) return
    if (requireAuth()) setStep(3)
  }

  function validate() {
    const errs = {}
    const name = form.name.trim()
    if (name.length < 2 || name.length > 80) errs.name = 'form.errName'
    if (!isValidPhone(form.phone)) errs.phone = 'form.errPhone'
    if (!form.consent) errs.consent = 'form.errConsent'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function submit(e) {
    e.preventDefault()
    if (busy.current || !restaurant || !time) return
    if (!requireAuth()) return
    setSubmitError(null)
    if (!validate()) return
    busy.current = true
    setPending(true)
    const { data, error } = await createGroupBooking({
      restaurantId: restaurant.id, date, time, partySize: party,
      note: form.note.trim(), name: form.name.trim(), phone: form.phone.trim(), consent: form.consent,
    })
    busy.current = false
    setPending(false)
    if (error) {
      if (error.code === 'bookings_disabled' || error.code === 'restaurant_not_found') setDisabledHere(true)
      else setSubmitError(error)
      return
    }
    setCreated(data)
  }

  const page = (title, children) => (
    <div className="bk-page">
      <TopBar title={title} backTo={backTo} onBack={back} />
      <div className="bk-body">{children}</div>
      {authModal}
    </div>
  )

  if (rest.loading) {
    return page(t('bookings:wizard.title'), (
      <div aria-busy="true">
        <div className="skeleton bk-sk-rest" />
        <div className="skeleton bk-sk-strip" />
        <div className="skeleton bk-sk-card" />
      </div>
    ))
  }
  if (rest.error) return page(t('bookings:wizard.title'), <LoadError onRetry={retryRest} />)
  if (!restaurant) {
    return page(t('bookings:wizard.title'), (
      <EmptyState
        icon="🔍" title={t('bookings:wizard.notFoundTitle')} body={t('bookings:wizard.notFoundBody')}
        action={<Link to="/explore" className="btn btn-ghost">{t('bookings:wizard.browse')}</Link>}
      />
    ))
  }
  if (disabledHere || (step === 2 && allNotBookable(slots.slots))) {
    return page(t('bookings:wizard.title'), (
      <EmptyState
        icon="📅" title={t('bookings:wizard.disabledTitle')} body={t('bookings:wizard.disabledBody')}
        action={<Link to={backTo} className="btn btn-ghost">{t('bookings:wizard.backToRestaurant')}</Link>}
      />
    ))
  }
  if (created) {
    return page(t('bookings:wizard.title'), <CreatedPanel created={created} restaurantName={restaurant.name} />)
  }

  return page(t('bookings:wizard.title'), (
    <>
      <Dots step={step} />
      <RestaurantHeader restaurant={restaurant} />

      {step === 1 && (
        <section className="bk-step">
          <h2 className="bk-section-title">{t('bookings:wizard.pickDate')}</h2>
          <DayStrip today={today} days={DAYS} value={date} onChange={pickDate} />
          <h2 className="bk-section-title">{t('bookings:wizard.partySize')}</h2>
          <PartyStepper value={party} onChange={pickParty} />
          <button type="button" className="btn btn-primary bk-block" onClick={() => setStep(2)}>
            {t('bookings:wizard.next')}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="bk-step">
          <p className="bk-recap">
            <span>{formatDateStr(date, i18n.language)}</span>
            <span aria-hidden="true"> · </span>
            <span>{t('bookings:partyOf', { n: party })}</span>
          </p>
          <h2 className="bk-section-title">{t('bookings:wizard.pickTime')}</h2>
          <SlotPicker
            state={slots} value={time} onChange={setTime}
            onRetry={reloadSlots} onAnotherDay={() => setStep(1)}
          />
          <button type="button" className="btn btn-primary bk-block" disabled={!time || authLoading} onClick={toStep3}>
            {session ? t('bookings:wizard.next') : t('bookings:wizard.signInToContinue')}
          </button>
        </section>
      )}

      {step === 3 && (
        <form className="bk-step" onSubmit={submit} noValidate>
          <BookingSummary
            restaurantName={restaurant.name} dateLabel={formatDateStr(date, i18n.language)}
            timeLabel={time || ''} partySize={party}
          />
          {!session && !authLoading ? (
            <SignInCard title={t('bookings:wizard.signInTitle')} body={t('bookings:wizard.signInBody')} />
          ) : (
            <>
              <ConfirmForm values={form} errors={fieldErrors} disabled={pending} onChange={setForm} />
              {submitError ? (
                <div className="bk-submit-error" role="alert">
                  <p className="bk-error">{t(submitError.key)}</p>
                  {SLOT_ERRORS.includes(submitError.code) ? (
                    <button type="button" className="btn btn-ghost" onClick={() => { setSubmitError(null); setTime(null); setStep(2) }}>
                      {t('bookings:wizard.changeTime')}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <button type="submit" className="btn btn-primary bk-block" disabled={pending || !time}>
                {pending ? <span className="spinner" aria-hidden="true" /> : null}
                {pending ? t('bookings:wizard.creating') : t('bookings:wizard.create')}
              </button>
            </>
          )}
        </form>
      )}
    </>
  ))
}
