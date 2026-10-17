import { Component } from 'react'
import i18n from '../lib/i18n'

/**
 * Catches a render crash (or a lazy chunk that failed to load) anywhere below it and shows a friendly screen
 * instead of a blank app. App.jsx puts one around everything (providers included); AppLayout puts one around the page
 * itself with `resetKey` = the pathname, so the bottom nav stays and a crashed page clears as soon as the guest
 * navigates elsewhere. The text comes straight from i18n (no hook: this is a class and must not depend on context).
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    const t = key => i18n.t(`common:${key}`)
    return (
      <div className="app-crash" role="alert">
        <div className="app-crash-icon" aria-hidden="true">🍽️</div>
        <h1 className="app-crash-title">{t('errorTitle')}</h1>
        <p className="app-crash-body">{t('errorBody')}</p>
        <div className="app-crash-actions">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>{t('errorReload')}</button>
          <a href="/" className="btn btn-ghost">{t('errorHome')}</a>
        </div>
      </div>
    )
  }
}
