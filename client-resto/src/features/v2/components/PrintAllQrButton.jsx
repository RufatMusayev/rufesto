import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { canOpenV2 } from '../roles'

// Header button on the Tables page linking to /qr-sheet. Only managers and
// admins can open that page, so everyone else sees nothing.
export default function PrintAllQrButton() {
  const { staffRow } = useAuth()
  const { t } = useTranslation('v2')
  if (!canOpenV2(staffRow?.role, '/qr-sheet')) return null
  return <Link to="/qr-sheet" className="btn btn-ghost btn-sm">{t('printAllQr')}</Link>
}
