// QR image generation for the print sheet. The encoder is loaded on demand so it
// stays out of the main bundle (same options as components/TableQRModal.jsx).

let encoder = null

async function load() {
  if (!encoder) {
    const mod = await import('qrcode')
    encoder = mod.default || mod
  }
  return encoder
}

/** PNG data URL for `url`, or throws. Callers catch and show a per-card retry. */
export async function qrDataUrl(url) {
  const qr = await load()
  return qr.toDataURL(url, {
    width: 640,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#1A1210', light: '#FFFFFF' },
  })
}
