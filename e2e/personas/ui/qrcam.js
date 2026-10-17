'use strict'
// A fake phone camera for Chromium: turns the QR image printed on Leyla's /qr-sheet into a y4m video that
// --use-file-for-fake-video-capture plays on loop, so the consumer app's own scanner (html5-qrcode) reads it.
const fs = require('fs')
const path = require('path')
const { PNG } = require(require('path').join(__dirname, '..', '..', '..', 'client-resto', 'node_modules', 'pngjs'))

const SIZE = 480

/** dataUrl: 'data:image/png;base64,...' of the QR (640 px, margin 2). Writes a y4m (30 frames) and returns its path. */
function qrToY4m(dataUrl, out, frames = 30) {
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'))
  const rgb = Buffer.alloc(SIZE * SIZE * 3, 255)
  const q = 260, off = (SIZE - q) / 2   // the scanner only reads the 220 px box in the middle of the picture
  const k = png.width / q
  for (let y = 0; y < q; y++) for (let x = 0; x < q; x++) {
    let r = 0, g = 0, b = 0, n = 0   // area average of the source pixels under this pixel
    for (let sy = Math.floor(y * k); sy < Math.min(png.height, Math.ceil((y + 1) * k)); sy++) for (let sx = Math.floor(x * k); sx < Math.min(png.width, Math.ceil((x + 1) * k)); sx++) {
      const si = (sy * png.width + sx) * 4; r += png.data[si]; g += png.data[si + 1]; b += png.data[si + 2]; n++
    }
    const di = ((y + off) * SIZE + (x + off)) * 3
    rgb[di] = r / n; rgb[di + 1] = g / n; rgb[di + 2] = b / n
  }
  const Y = Buffer.alloc(SIZE * SIZE), U = Buffer.alloc(SIZE * SIZE / 4), V = Buffer.alloc(SIZE * SIZE / 4)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 3, r = rgb[i], g = rgb[i + 1], b = rgb[i + 2]
    Y[y * SIZE + x] = Math.max(0, Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b)))
    if (y % 2 === 0 && x % 2 === 0) {
      const ui = (y / 2) * (SIZE / 2) + x / 2
      U[ui] = Math.max(0, Math.min(255, Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b)))
      V[ui] = Math.max(0, Math.min(255, Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b)))
    }
  }
  const header = Buffer.from(`YUV4MPEG2 W${SIZE} H${SIZE} F10:1 Ip A1:1 C420jpeg\n`)
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Y, U, V])
  const parts = [header]
  for (let i = 0; i < frames; i++) parts.push(frame)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.concat(parts))
  return out
}

/** Chromium launch args that make getUserMedia return the y4m. */
const cameraArgs = y4m => ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`]

module.exports = { qrToY4m, cameraArgs }
