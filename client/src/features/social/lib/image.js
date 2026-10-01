// Client-side photo preparation for posts: longest edge <= 1600px, JPEG q0.85, <= 5 MB.
export const MAX_EDGE = 1600
export const MAX_BYTES = 5 * 1024 * 1024
const QUALITIES = [0.85, 0.7, 0.55]

const fail = code => Object.assign(new Error(code), { code })

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(fail('not_an_image'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

const toBlob = (canvas, quality) => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))

/** Returns { blob, url, width, height }. Rejects with an Error whose `code` is 'not_an_image' | 'photo_too_large'. */
export async function prepareImage(file) {
  if (!file || !/^image\//.test(file.type || '')) throw fail('not_an_image')
  let bitmap
  try { bitmap = await decode(file) } catch { throw fail('not_an_image') }

  const w0 = bitmap.width || bitmap.naturalWidth
  const h0 = bitmap.height || bitmap.naturalHeight
  if (!w0 || !h0) throw fail('not_an_image')
  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0))
  const width = Math.round(w0 * scale)
  const height = Math.round(h0 * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'            // JPEG has no alpha: flatten transparent PNGs onto white
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  if (typeof bitmap.close === 'function') bitmap.close()

  for (const q of QUALITIES) {
    const blob = await toBlob(canvas, q)
    if (blob && blob.size <= MAX_BYTES) return { blob, url: URL.createObjectURL(blob), width, height }
  }
  throw fail('photo_too_large')
}
