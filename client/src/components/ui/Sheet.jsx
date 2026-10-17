import BottomSheet from './BottomSheet'

// Kept for the callers that predate BottomSheet (ConfirmSheets, profile sheets, DemoPaySheet): same props, same
// look (title row + X, content padded 4/16/16, sticky footer). See BottomSheet.jsx for the full prop list.
export default function Sheet(props) {
  return <BottomSheet {...props} />
}
