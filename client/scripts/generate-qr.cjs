const QRCode = require('qrcode')
const path = require('path')
const fs = require('fs')

const tables = [
  { name: 'BellaRoma-T1', token: 'a634a8db-9f06-485f-a333-087ec9189bca' },
  { name: 'BellaRoma-T2', token: '57a07553-399c-46b2-a72a-1798d818c175' },
  { name: 'SedaOcagi-T1', token: '6fbf30c5-fd68-435a-9863-fe062b32c763' },
  { name: 'SedaOcagi-VIP1', token: '70867f80-0941-4385-9c8d-46a2c48ecb37' },
  { name: 'SakuraHouse-T1', token: '01b65c55-d59c-4812-8b90-e6859a2a9522' },
  { name: 'SakuraHouse-B1', token: 'f53feff3-9ec0-4dc4-9963-b0e8b17b29e0' },
]

const outDir = path.join(__dirname, '..', 'qr-codes')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)

async function generate() {
  for (const t of tables) {
    const file = path.join(outDir, `${t.name}.png`)
    await QRCode.toFile(file, t.token, {
      width: 512,
      margin: 2,
      color: { dark: '#1A1210', light: '#F5F0E8' },
    })
    console.log(`Generated: ${file}`)
  }
}

generate().catch(console.error)
