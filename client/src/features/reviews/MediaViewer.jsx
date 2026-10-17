import { useTranslation } from 'react-i18next'
import { BottomSheet, useSheetClose } from '../../components/ui'
import { CloseGlyph } from './Icons'
import './i18n'
import './reviews.css'

function CloseButton() {
  const { t } = useTranslation('reviews')
  const close = useSheetClose()
  return (
    <button type="button" className="rv-viewer-x" aria-label={t('closePhoto')} onClick={close}>
      <CloseGlyph size={18} />
    </button>
  )
}

/**
 * Full-screen photo of a review (BottomSheet variant "media": black, edge to edge, drag down or Back to close).
 * Mounted by CompactReview while open; the sheet animates out and then calls onClose.
 */
export default function MediaViewer({ src, alt = '', onClose }) {
  return (
    <BottomSheet
      onClose={onClose} variant="media" size="large" id="media" label={alt} padded={false}
      header={<div className="rv-viewer-bar"><CloseButton /></div>}
      bodyClassName="rv-viewer-body"
    >
      <img className="rv-viewer-img" src={src} alt={alt} decoding="async" />
    </BottomSheet>
  )
}
