// Runs before the first paint: a classic script in <head> served from the same origin (the enforced CSP allows
// 'self' scripts, not inline ones). Four jobs, all tiny:
//  1. the theme goes on <html> now, so a guest never sees a flash of the wrong one while the app boots: the saved choice
//     (rufesto_theme, written only by the toggle), else the operating system's colour scheme. The browser theme-color
//     follows it;
//  2. <html lang> gets the saved (else browser) language - the app keeps it in sync after boot;
//  3. the Google Fonts stylesheet is linked with media="print" so it does not block the first paint; it is switched
//     to "all" as soon as it has loaded (the fonts use display=swap, so text shows in a fallback face meanwhile).
(function () {
  var root = document.documentElement
  var theme = null
  try { theme = localStorage.getItem('rufesto_theme') } catch (e) { /* storage blocked: follow the OS */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  root.setAttribute('data-theme', theme)
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F5F0E8' : '#1A1210')
  try {
    var lang = localStorage.getItem('rufesto_lang')
    if (lang !== 'az' && lang !== 'en') lang = String(navigator.language || 'en').slice(0, 2) === 'az' ? 'az' : 'en'
    root.lang = lang
  } catch (e) { /* keep lang="en" */ }
  // 4. only Home has the top bar, so the first-paint placeholder of it is hidden on every other route (index.css)
  root.setAttribute('data-boot-home', location.pathname === '/' ? '1' : '0')
  var css = document.getElementById('gf-css')
  if (css) {
    var show = function () { css.media = 'all' }
    if (css.sheet) show()
    else css.addEventListener('load', show)
  }
})()
