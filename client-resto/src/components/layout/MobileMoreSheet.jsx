import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import useDialog from '../../lib/useDialog'
import LanguageSwitcher from '../LanguageSwitcher'
import { ExitIcon, GlobeIcon, MoonIcon, SunIcon } from './navIcons'

// Phone-only bottom sheet behind the "More" button of the bottom nav. The desktop sidebar footer (language, theme,
// Sign Out) is hidden at <= 768px, so these controls live here on a phone: restaurant switcher (for staff of
// several restaurants), language, light / dark, Sign Out.
export default function MobileMoreSheet({ onClose }) {
  const { t } = useTranslation(['dashboard', 'common', 'nav', 'v2'])
  const { staffRow, staffRows, hasMultipleRestaurants, setActiveStaffId, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const uid = useId()
  const dialogRef = useDialog(onClose)
  const name = staffRow?.restaurants?.name || t('dashboard:restaurantFallback')
  const role = staffRow?.role

  return (
    <div className="overlay overlay-sheet" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal more-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <div className="more-sheet-head">
          <div className="dash-resto-badge more-sheet-badge" aria-hidden="true">{name.charAt(0)}</div>
          <div className="more-sheet-who">
            <div id={`${uid}-title`} className="more-sheet-name">{name}</div>
            <div className="more-sheet-role">{role ? t(`v2:role_${role}`, { defaultValue: role }) : t('dashboard:staff')}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common:close')}>✕</button>
        </div>

        {hasMultipleRestaurants && (
          <div className="more-sheet-row more-sheet-field">
            <label className="more-sheet-label" htmlFor={`${uid}-restaurant`}>{t('common:restaurant')}</label>
            <select id={`${uid}-restaurant`} className="input" value={staffRow?.id || ''}
              onChange={e => { setActiveStaffId(e.target.value); onClose() }}>
              {staffRows.map(s => (
                <option key={s.id} value={s.id}>{s.restaurants?.name || t('dashboard:restaurantFallback')}</option>
              ))}
            </select>
          </div>
        )}

        <div className="more-sheet-row">
          <span className="more-sheet-label more-sheet-label-icon"><GlobeIcon />{t('dashboard:navLanguage')}</span>
          <LanguageSwitcher />
        </div>

        <button type="button" className="more-sheet-row more-sheet-action" onClick={toggle}>
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          <span>{theme === 'dark' ? t('dashboard:navLight') : t('dashboard:navDark')}</span>
        </button>

        <button type="button" className="more-sheet-row more-sheet-action more-sheet-signout" onClick={signOut}>
          <ExitIcon />
          <span>{t('dashboard:navSignOut')}</span>
        </button>
      </div>
    </div>
  )
}
