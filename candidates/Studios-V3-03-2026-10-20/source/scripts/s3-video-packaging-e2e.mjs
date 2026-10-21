import { mkdir, stat, writeFile } from 'node:fs/promises'
import { chromium } from '../../source/apps/web/node_modules/playwright/index.mjs'

const url = 'http://127.0.0.1:53988/'
const out = '/Users/jane/Documents/DeepSeek-Harness-Dev-Assets/Studios/S3/results/final-acceptance'
const videoPath = '/Users/jane/Documents/DeepSeek-Harness-Dev-Assets/Studios/S3/P5-07/editor/projects/p5-07-unified/assets/source.mp4'
const srtPath = '/Users/jane/Documents/DeepSeek-Harness-Dev-Assets/Studios/S3/results/ASR-reference-short-clip.srt'
const pngPath = '/Users/jane/Documents/DeepSeek-Harness-Dev-Assets/Studios/S3/results/technical-test-alpha.png'
await mkdir(out, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true })
const page = await context.newPage()
const evidence = { viewport: { width: 1440, height: 900, dpr: 1 }, origin: url, hostRemotes: [], dialogs: [], errors: [], projectId: null, assetId: null, renderStatus: null }
await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort())
page.on('pageerror', error => evidence.errors.push(`${error.name}: ${error.message.slice(0, 180)}`))
page.on('console', message => { if (message.type() === 'error') evidence.errors.push(`console: ${message.text().slice(0, 180)}`) })
page.on('dialog', async dialog => {
  const message = dialog.message()
  evidence.dialogs.push(message)
  if (message.includes('仅为本次研发验证加入测试工程')) await dialog.accept()
  else await dialog.dismiss()
})

async function enterPackaging() {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.waitForTimeout(1_000)
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
  if (await continueButton.count()) await continueButton.evaluate(button => button.click())
  await page.waitForTimeout(300)
  const studios = page.getByRole('button', { name: 'Studios', exact: true })
  if (await studios.count()) await studios.evaluate(button => button.click())
  await page.waitForTimeout(700)
  const later = page.getByRole('button', { name: 'Configure later', exact: true })
  if (await later.count()) await later.evaluate(button => button.click())
  await page.waitForTimeout(300)
  const videoStudio = page.getByRole('button', { name: /Video Studio/ })
  if (await videoStudio.count()) await videoStudio.evaluate(button => button.click())
  await page.waitForTimeout(300)
  const packaging = page.getByRole('button', { name: /Video Packaging/ })
  if (await packaging.count()) await packaging.evaluate(button => button.click())
  await page.locator('iframe[title="Video Packaging 编辑器"]').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(800)
}

try {
  await enterPackaging()
  const editor = page.frameLocator('iframe[title="Video Packaging 编辑器"]')
  evidence.preview = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }))
  evidence.initialBadge = await editor.locator('#runtime-badge').textContent()

  await editor.locator('#video-file').setInputFiles(videoPath)
  await editor.locator('#asset-status').getByText('已导入').waitFor({ timeout: 90_000 })
  const projectIdInput = page.getByLabel('Host 工程 ID')
  await page.waitForFunction(() => document.querySelector('input[aria-label="Host 工程 ID"]')?.value.length > 10, null, { timeout: 30_000 })
  evidence.projectId = await projectIdInput.inputValue()
  evidence.videoMeta = await editor.locator('#video-meta').textContent()

  await editor.locator('#subtitle-file').setInputFiles(srtPath)
  await editor.locator('#transcript-status').getByText('17 段').waitFor({ timeout: 30_000 })
  evidence.transcriptStatus = await editor.locator('#transcript-status').textContent()

  await editor.locator('[data-add="title"]').click()
  await editor.locator('[data-prop="text"]').fill('先整理认可作品的风格规则')
  await editor.locator('[data-prop="start"]').fill('8.7')
  await editor.locator('[data-prop="duration"]').fill('4.2')
  await editor.locator('[data-prop="x"]').fill('56')

  await editor.locator('#register-name').fill('隔离技术测试透明 PNG')
  await editor.locator('#register-category').fill('技术验证')
  await editor.locator('#register-purpose-tags').fill('不要')
  await editor.locator('#register-style-tags').fill('透明 PNG 技术验证')
  await editor.locator('#register-scenes').fill('隔离测试')
  await editor.locator('#register-width').fill('320')
  await editor.locator('#register-height').fill('180')
  await editor.locator('#register-duration').fill('1.5')
  await editor.locator('#register-source').fill('P5-04 已有透明通道技术测试素材副本')
  await editor.locator('#register-license').fill('仅限隔离技术测试；不代表正式复用许可')
  await editor.locator('#visual-file').setInputFiles(pngPath)
  await editor.locator('#development-library-list .visual-asset-entry').first().waitFor({ timeout: 30_000 })
  evidence.libraryState = await editor.locator('#development-library-list').innerText()
  evidence.assetPreviewLoaded = await editor.locator('#development-library-list img[data-host-asset]').first().evaluate(image => image.complete && image.naturalWidth > 0)

  await editor.locator('#retrieve-assets').click()
  await editor.locator('[data-accept-recommendation]').first().waitFor({ timeout: 20_000 })
  evidence.recommendation = (await editor.locator('.asset-recommendation-card').first().innerText()).slice(0, 1000)
  await editor.locator('[data-accept-recommendation]').first().click()
  await page.waitForTimeout(500)
  evidence.dialogAcceptedTestOnly = evidence.dialogs.some(message => message.includes('仅为本次研发验证加入测试工程'))
  evidence.componentCountBeforeSave = await editor.locator('#component-count').textContent()
  evidence.timelineBeforeSave = await editor.locator('#track-list').innerText()
  await editor.locator('#save-button').click()
  evidence.saveNotice = await page.locator('main[aria-label="Video Packaging"] header').innerText()
  await editor.getByText('已保存到磁盘').waitFor({ timeout: 20_000 })
  await page.screenshot({ path: `${out}/s3-video-packaging-edited.png`, fullPage: true })

  // Reload the full formal Client route; the Host project ID remains in the URL.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.waitForTimeout(1_200)
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
  if (await continueButton.count()) await continueButton.evaluate(button => button.click())
  await page.waitForTimeout(300)
  const studios = page.getByRole('button', { name: 'Studios', exact: true })
  if (await studios.count()) await studios.evaluate(button => button.click())
  await page.waitForTimeout(700)
  const later = page.getByRole('button', { name: 'Configure later', exact: true })
  if (await later.count()) await later.evaluate(button => button.click())
  await page.waitForTimeout(300)
  const videoStudio = page.getByRole('button', { name: /Video Studio/ })
  if (await videoStudio.count()) await videoStudio.evaluate(button => button.click())
  await page.waitForTimeout(300)
  const packaging = page.getByRole('button', { name: /Video Packaging/ })
  if (await packaging.count()) await packaging.evaluate(button => button.click())
  await page.locator('iframe[title="Video Packaging 编辑器"]').waitFor({ state: 'visible', timeout: 15_000 })
  const restored = page.frameLocator('iframe[title="Video Packaging 编辑器"]')
  await restored.locator('#asset-status').getByText('已导入').waitFor({ timeout: 60_000 })
  await restored.locator('#track-list [data-clip]').first().click()
  evidence.restoredProjectId = await page.getByLabel('Host 工程 ID').inputValue()
  evidence.restoredTitle = await restored.locator('[data-prop="text"]').inputValue()
  evidence.restoredStart = await restored.locator('[data-prop="start"]').inputValue()
  evidence.restoredAssetCount = await restored.locator('#visual-asset-count').textContent()
  evidence.restoredComponentCount = await restored.locator('#component-count').textContent()
  evidence.restoredTimeline = await restored.locator('#track-list').innerText()
  evidence.assetPreviewLoaded = await restored.locator('#development-library-list img').first().evaluate(image => image.complete && image.naturalWidth > 0)

  await restored.locator('#render-button').click()
  await restored.locator('#render-status').getByText('渲染完成', { exact: false }).waitFor({ timeout: 660_000 })
  evidence.renderStatus = await restored.locator('#render-status').innerText()
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
  await page.locator('[data-host-render-download]').click()
  const download = await downloadPromise
  await download.saveAs(`${out}/s3-video-packaging.mp4`)
  evidence.outputBytes = (await stat(`${out}/s3-video-packaging.mp4`)).size
  await page.screenshot({ path: `${out}/s3-video-packaging-rendered.png`, fullPage: true })
  await writeFile(`${out}/s3-video-packaging-e2e.json`, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  evidence.failure = `${error.name}: ${error.message}`
  try { await page.screenshot({ path: `${out}/s3-video-packaging-e2e-failure.png`, fullPage: true }) } catch {}
  await writeFile(`${out}/s3-video-packaging-e2e.json`, `${JSON.stringify(evidence, null, 2)}\n`)
  console.error(JSON.stringify(evidence, null, 2))
  process.exitCode = 1
} finally {
  await browser.close()
}
