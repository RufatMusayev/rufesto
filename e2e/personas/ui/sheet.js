// contact sheet (view several screenshots in one image): node personas/ui/sheet.js out.png in1.png in2.png ...
const { chromium } = require('@playwright/test')
const path = require('path'), fs = require('fs')
const fwd = p => path.resolve(p).split(path.sep).join('/')
;(async () => {
  const [out, ...ins] = process.argv.slice(2)
  const H = 1100
  const html = `<body style="margin:0;background:#444;display:flex;gap:8px;align-items:flex-start">${ins.map(p => `<img style="height:${H}px" src="file:///${fwd(p)}">`).join('')}</body>`
  const f = path.join(require('os').tmpdir(), 'sheet-' + Date.now() + '.html'); fs.writeFileSync(f, html)
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 548 * ins.length, height: H } })
  await pg.goto('file:///' + fwd(f)); await pg.waitForLoadState('load'); await pg.waitForTimeout(400)
  await pg.screenshot({ path: out }); await b.close(); fs.unlinkSync(f)
})()
