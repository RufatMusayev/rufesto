import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCart } from '../../../contexts/CartContext'
import { useRequireAuth } from '../hooks'
import { PlusIcon } from './Icons'

/** Gold "+" that opens the new-post screen. HomeTabs shows it on the Feed tab only. */
export default function PostComposerFab() {
  const { t } = useTranslation('social')
  const navigate = useNavigate()
  const { tableId } = useCart()
  const { requireAuth, authModal } = useRequireAuth()
  return (
    <>
      <button
        type="button"
        // sits above the cart FAB while a table session is active
        className={`soc-fab${tableId ? ' soc-fab-raised' : ''}`}
        aria-label={t('home.newPost')}
        onClick={() => { if (requireAuth()) navigate('/post/new') }}
      >
        <PlusIcon />
      </button>
      {authModal}
    </>
  )
}
