import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchMenuDesign, saveMenuDesign } from '../menuDesignApi'
import { v2Error, isColumnMissing } from '../errors'
import { liveMenuLink } from '../links'
import {
  ACCENT_PRESETS, MENU_THEMES, NOTE_MAX, THEME_DEFAULT_ACCENT,
  isAccentOk, normaliseHex, toColumns,
} from '../menuDesign'
import useLiveList from '../hooks/useLiveList'
import ErrorBanner from './ErrorBanner'
import LoadError from './LoadError'
import MenuThemePreview, { useCssVar } from './MenuThemePreview'
import Switch from './Switch'

function toForm(d) {
  const accent = d.accent ? normaliseHex(d.accent) : ''
  // `applied` = the last valid accent, so the previews keep it while a half-typed hex is invalid.
  return { theme: d.theme, accent, applied: accent || null, showPhotos: d.showPhotos, note: d.note }
}

function Swatch({ hex, selected, label, onPick }) {
  const ref = useCssVar('--sw', hex)
  return (
    <button ref={ref} type="button" className="v2-md-swatch" aria-pressed={selected} aria-label={label} onClick={() => onPick(hex)} />
  )
}

function ColourChip({ hex }) {
  const ref = useCssVar('--sw', hex)
  return <span ref={ref} className="v2-md-chip" aria-hidden="true" />
}

// Settings -> Menu design (V2-CONTRACT 19.3): style, accent colour, small photos and a note for the guest
// menu, with a live mini-preview per style. Loads and saves restaurant_settings' four menu_* columns. When
// they aren't deployed yet (sql/62) the card shows read-only instead of failing the Settings page.
export default function MenuDesignCard({ restaurantId, onSaved }) {
  const { t } = useTranslation(['v2', 'dashboard'])
  const load = useCallback(() => fetchMenuDesign(restaurantId), [restaurantId])
  const { data, error, loading, retry } = useLiveList(load, null, restaurantId)

  const [form, setForm] = useState(null)
  const [baseline, setBaseline] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!data) return
    const next = toForm(data)
    setForm(next)
    setBaseline(next)
  }, [data])

  const set = patch => setForm(f => ({ ...f, ...patch }))
  const setAccent = text => {
    const accent = normaliseHex(text)
    setForm(f => ({ ...f, accent, applied: isAccentOk(accent) ? accent || null : f.applied }))
  }

  const accentOk = !form || isAccentOk(form.accent)
  const dirty = useMemo(
    () => !!form && !!baseline && JSON.stringify(toColumns(form)) !== JSON.stringify(toColumns(baseline)),
    [form, baseline],
  )

  async function handleSave() {
    if (saving || !dirty || !accentOk) return
    setSaving(true)
    setSaveError('')
    const { error: err } = await saveMenuDesign(restaurantId, form)
    setSaving(false)
    if (err) return setSaveError(isColumnMissing(err) ? t('mdSoon') : v2Error(err, t))
    setBaseline(form)
    onSaved()
  }

  if (loading) {
    return (
      <div aria-hidden="true">
        {[0, 1].map(i => <div key={i} className="skeleton v2-skel-card" />)}
      </div>
    )
  }
  if (!form) return <LoadError message={v2Error(error, t)} onRetry={retry} />

  const ready = data.ready
  const link = liveMenuLink(data.slug)
  const presets = ACCENT_PRESETS[form.theme]
  const chipColour = form.applied || THEME_DEFAULT_ACCENT[form.theme]

  return (
    <div className="v2-stack">
      <ErrorBanner message={saveError} onDismiss={() => setSaveError('')} />
      {!ready && <div className="v2-banner v2-banner--warn" role="status">{t('mdSoon')}</div>}

      <section className="v2-card" aria-labelledby="v2-md-title">
        <div>
          <h2 id="v2-md-title" className="dash-section-title">{t('mdTitle')}</h2>
          <p className="v2-hint">{t('mdIntro')}</p>
        </div>

        <fieldset className="v2-md-form" disabled={!ready || saving}>
          <fieldset className="v2-md-group">
            <legend className="label">{t('mdStyle')}</legend>
            <div className="v2-md-themes">
              {MENU_THEMES.map(id => (
                <label key={id} className={`v2-md-theme${form.theme === id ? ' is-selected' : ''}${ready ? '' : ' is-locked'}`}>
                  <input
                    type="radio"
                    name="v2-md-theme"
                    className="v2-sr-only"
                    value={id}
                    checked={form.theme === id}
                    onChange={() => set({ theme: id })}
                  />
                  <MenuThemePreview theme={id} accent={form.applied} showPhotos={form.showPhotos} note={form.note} />
                  <span className="v2-md-theme-text">
                    <span className="v2-md-theme-name">{t(`mdTheme_${id}`)}<span className="v2-md-dot" aria-hidden="true" /></span>
                    <span className="v2-md-theme-hint">{t(`mdThemeHint_${id}`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="v2-md-group">
            <legend className="label">{t('mdAccent')}</legend>
            <p className="v2-hint">{t('mdAccentHint')}</p>
            <div className="v2-md-swatches" role="group" aria-label={t('mdAccent')}>
              {presets.map(hex => (
                <Swatch
                  key={hex}
                  hex={hex}
                  selected={form.accent === hex}
                  label={t('mdSwatch', { hex })}
                  onPick={setAccent}
                />
              ))}
            </div>
            <div className="v2-field">
              <label className="label" htmlFor="v2-md-hex">{t('mdHex')}</label>
              <div className="v2-md-hex">
                <ColourChip hex={chipColour} />
                <input
                  id="v2-md-hex"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={7}
                  placeholder="#RRGGBB"
                  className={`input${accentOk ? '' : ' is-invalid'}`}
                  value={form.accent}
                  aria-invalid={!accentOk}
                  aria-describedby={accentOk ? undefined : 'v2-md-hex-err'}
                  onChange={e => setAccent(e.target.value)}
                />
                {form.accent !== '' && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAccent('')}>{t('mdAccentReset')}</button>
                )}
              </div>
              {!accentOk && <div id="v2-md-hex-err" className="v2-field-error" role="alert">{t('mdHexInvalid')}</div>}
            </div>
          </fieldset>

          <div className="v2-switch-row">
            <div>
              <div className="v2-switch-label">{t('mdPhotos')}</div>
              <div className="v2-hint">{t('mdPhotosHint')}</div>
            </div>
            <Switch checked={form.showPhotos} onChange={v => set({ showPhotos: v })} label={t('mdPhotos')} disabled={!ready || saving} />
          </div>

          <div className="v2-field">
            <label className="label" htmlFor="v2-md-note">{t('mdNote')}</label>
            <textarea
              id="v2-md-note"
              className="input v2-textarea"
              rows={3}
              maxLength={NOTE_MAX}
              placeholder={t('mdNotePlaceholder')}
              value={form.note}
              aria-describedby="v2-md-note-hint v2-md-note-count"
              onChange={e => set({ note: e.target.value })}
            />
            <div className="v2-hint v2-field-hint" id="v2-md-note-hint">{t('mdNoteHint')}</div>
            <div className="v2-md-count" id="v2-md-note-count">{t('mdNoteCount', { count: form.note.length, max: NOTE_MAX })}</div>
          </div>
        </fieldset>

        {link && (
          <a className="v2-md-link" href={link} target="_blank" rel="noopener noreferrer">{t('mdOpenLive')}</a>
        )}
      </section>

      {ready && (
        <div className="v2-savebar">
          <span className="v2-savebar-note" role="status">{!accentOk ? t('fixRules') : dirty ? t('unsaved') : ''}</span>
          <button type="button" className="btn btn-primary" disabled={!dirty || !accentOk || saving} onClick={handleSave}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {t('mdSave')}
          </button>
        </div>
      )}
    </div>
  )
}
