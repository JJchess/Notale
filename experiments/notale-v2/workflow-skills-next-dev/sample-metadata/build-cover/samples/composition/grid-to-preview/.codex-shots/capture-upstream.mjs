import { chromium } from '/tmp/grid-playwright/node_modules/playwright/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'

const out = new URL('./upstream/', import.meta.url)
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const log = { console: [], failed: [], external: [] }
page.on('console', message => log.console.push({ type: message.type(), text: message.text() }))
page.on('requestfailed', request => log.failed.push({ url: request.url(), error: request.failure()?.errorText }))
page.on('request', request => {
  const url = new URL(request.url())
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) log.external.push(request.url())
})

const shot = name => page.screenshot({ path: new URL(name, out).pathname })
const leave = async (wait = 650) => {
  await page.mouse.move(800, 20)
  await page.waitForTimeout(wait)
}
const hover = async index => page.locator('.product').nth(index).hover({ position: { x: 24, y: 24 } })

await page.goto('http://127.0.0.1:4311/', { waitUntil: 'networkidle' })
await page.waitForSelector('body:not(.loading)')
await shot('01-grid-1600x900.png')

await hover(0)
await page.waitForTimeout(800)
await shot('02-left-card-preview.png')
await leave()

await hover(3)
await page.waitForTimeout(800)
await shot('03-right-card-preview.png')
await leave()

await hover(0)
await page.waitForTimeout(350)
await shot('04-preview-midframe.png')
await leave()

await hover(0)
await page.waitForTimeout(165)
await leave(55)
await hover(3)
await page.waitForTimeout(165)
await shot('05a-rapid-switch-crossing.png')
await page.waitForTimeout(450)
await shot('05b-rapid-switch-settled.png')
await leave(65)
await hover(1)
await page.waitForTimeout(160)
await leave(520)
await shot('05c-rapid-reversal-restored.png')

log.geometry = await page.evaluate(() => ({
  products: [...document.querySelectorAll('.product')].map((node, index) => ({ index, rect: node.getBoundingClientRect().toJSON(), transform: getComputedStyle(node).transform, opacity: getComputedStyle(node).opacity })),
  previews: [...document.querySelectorAll('.product-preview')].map(node => ({ side: [...node.classList].find(name => name.startsWith('--')), rect: node.getBoundingClientRect().toJSON(), transform: getComputedStyle(node).transform, opacity: getComputedStyle(node).opacity })),
  body: { width: document.body.scrollWidth, height: document.body.scrollHeight }
}))
await writeFile(new URL('capture-log.json', out), JSON.stringify(log, null, 2))
await browser.close()
