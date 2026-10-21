// Web e2e scenario for the collapsed rail's native Workspace/Session flyout.
// The Workspace browser must remain available without widening the sidebar;
// its existing session search is revealed within the flyout.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

/** Allow the Workspace browser flyout and search input to settle. */
const FOCUS_SETTLE_MS = 600

describe('web e2e: collapsed rail Workspace browser flyout', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('opens session search without expanding the sidebar', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rail-search-expand'))
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    const collapsedSidebar = page.locator('[data-sidebar-collapsed="true"]')
    await collapsedSidebar.waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'Workspaces' }).click()
    const flyout = page.locator('[class*="flyout"]')
    await expect.poll(() => flyout.count()).toBeGreaterThan(0)
    await expect.poll(() => collapsedSidebar.count()).toBeGreaterThan(0)

    const searchButton = flyout.getByRole('button', { name: 'Search sessions' })
    await searchButton.click()
    await expect.poll(() => searchButton.getAttribute('aria-expanded')).toBe('true')
    const input = page.getByPlaceholder('Search sessions...')
    await input.waitFor({ state: 'visible' })
    await expect.poll(
      async () => input.evaluate(el => document.activeElement === el),
      { timeout: FOCUS_SETTLE_MS + 10_000 },
    ).toBe(true)

    await flyout.getByRole('button', { name: 'Close' }).click()
    await expect.poll(() => flyout.count()).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
