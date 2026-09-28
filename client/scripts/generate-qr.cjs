const QRCode = require('qrcode')
const path = require('path')
const fs = require('fs')

// Local, gitignored input file — never commit real table tokens (this repo is public).
// Create client/scripts/qr-tables.local.json with the shape:
//
//   [
//     { "name": "BellaRoma-T1", "token": "<tables.qr_code_token uuid>" },
//     { "name": "BellaRoma-T2", "token": "<tables.qr_code_token uuid>" }
//   ]
//
// `name` is just the output PNG's filename (no extension); `token` is the live
// `tables.qr_code_token` value for that table, straight from the database — get it
// from the database agent / Supabase dashboard, never hardcode it here.
const INPUT_FILE = path.join(__dirname, 'qr-tables.local.json')
const outDir = path.join(__dirname, '..', 'qr-codes')

function loadTables() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Missing ${INPUT_FILE}`)
    console.error('Create it with an array of { "name": "...", "token": "..." } — see the comment at the top of this file.')
    process.exit(1)
  }
  const raw = fs.readFileSync(INPUT_FILE, 'utf8')
  let tables
  try {
    tables = JSON.parse(raw)
  } catch (err) {
    console.error(`Could not parse ${INPUT_FILE} as JSON:`, err.message)
    process.exit(1)
  }
  if (!Array.isArray(tables) || tables.some(t => !t?.name || !t?.token)) {
    console.error(`${INPUT_FILE} must be a JSON array of { "name": string, "token": string } objects.`)
    process.exit(1)
  }
  return tables
}

async function generate() {
  const tables = loadTables()
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)

  for (const t of tables) {
    const file = path.join(outDir, `${t.name}.png`)
    await QRCode.toFile(file, t.token, {
      width: 512,
      margin: 2,
      color: { dark: '#1A1210', light: '#F5F0E8' },
    })
    // Never print the token value — only the output filename.
    console.log(`Generated: ${file}`)
  }
}

generate().catch(console.error)
