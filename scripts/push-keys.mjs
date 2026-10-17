#!/usr/bin/env node
// Generates the Web Push secrets for Rufesto (docs/V2-CONTRACT.md section 21.3):
//   - a VAPID key pair (P-256) in the URL-safe base64 format `web-push` expects
//   - a random webhook secret shared by the database trigger and the send-push Edge Function
//
// Writes two files (default folder: the session scratchpad, override with --dir <folder>):
//   push.env         VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_WEBHOOK_SECRET,
//                    CONSUMER_ORIGIN, DASHBOARD_ORIGIN       (secret: never commit, never print)
//   push-public.env  VITE_VAPID_PUBLIC_KEY                    (the public key ships in both apps)
//
// Idempotent: refuses to overwrite an existing push.env unless --force. Rotating the VAPID key pair
// invalidates every existing browser subscription (users must switch push off and on again).
// Secret values are never printed; the script prints "written" and the public key only.
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DEFAULT_DIR = 'C:\\Users\\musay\\AppData\\Local\\Temp\\claude\\C--Users-musay-Desktop-claude\\9308ea1d-0f9a-4965-b895-2223492297b4\\scratchpad'
const SUBJECT = 'mailto:musayevrufat13@gmail.com'
const CONSUMER_ORIGIN = 'https://rufat-server.com'
const DASHBOARD_ORIGIN = 'https://resto.rufat-server.com'

const args = process.argv.slice(2)
const force = args.includes('--force')
const dirIdx = args.indexOf('--dir')
const dir = resolve(dirIdx >= 0 && args[dirIdx + 1] ? args[dirIdx + 1] : DEFAULT_DIR)
const envPath = join(dir, 'push.env')
const publicPath = join(dir, 'push-public.env')

if (existsSync(envPath) && !force) {
  console.error(`${envPath} already exists. Not overwriting. Use --force to rotate the keys (this invalidates every existing push subscription).`)
  process.exit(1)
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pub = publicKey.export({ format: 'jwk' })
const priv = privateKey.export({ format: 'jwk' })

// web-push wants the uncompressed public point (0x04 || X || Y, 65 bytes) and the raw private scalar (32 bytes),
// both as unpadded base64url. JWK coordinates are already base64url of the fixed-length big-endian values.
const x = Buffer.from(pub.x, 'base64url')
const y = Buffer.from(pub.y, 'base64url')
const d = Buffer.from(priv.d, 'base64url')
if (x.length !== 32 || y.length !== 32 || d.length !== 32) {
  console.error('Unexpected key length from node:crypto; aborting without writing anything.')
  process.exit(1)
}
const vapidPublic = Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64url')
const vapidPrivate = d.toString('base64url')
const webhookSecret = randomBytes(48).toString('base64url')

const lines = [
  `VAPID_PUBLIC_KEY=${vapidPublic}`,
  `VAPID_PRIVATE_KEY=${vapidPrivate}`,
  `VAPID_SUBJECT=${SUBJECT}`,
  `PUSH_WEBHOOK_SECRET=${webhookSecret}`,
  `CONSUMER_ORIGIN=${CONSUMER_ORIGIN}`,
  `DASHBOARD_ORIGIN=${DASHBOARD_ORIGIN}`,
]

mkdirSync(dir, { recursive: true })
writeFileSync(envPath, `${lines.join('\n')}\n`, { mode: 0o600 })
writeFileSync(publicPath, `VITE_VAPID_PUBLIC_KEY=${vapidPublic}\n`, { mode: 0o644 })

console.log('written')
console.log(`  ${envPath}`)
console.log(`  ${publicPath}`)
console.log(`VITE_VAPID_PUBLIC_KEY=${vapidPublic}`)
