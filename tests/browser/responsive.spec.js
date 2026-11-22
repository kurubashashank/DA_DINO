import { expect, test } from '@playwright/test'

const viewports = [320, 360, 375, 390, 393, 414, 430, 480, 768, 820, 1024, 1280, 1366, 1440, 1920]
const routes = ['/', '/shop', '/collections/ready-made-t-shirts', '/products/after-hours-oversized-tee', '/custom-order', '/cart', '/wishlist', '/account', '/checkout', '/admin/login', '/admin/signup']

async function bypassIntro(page) {
  await page.addInitScript(() => sessionStorage.setItem('da-dino-cinema-intro-seen', 'true'))
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
  expect(dimensions.scrollWidth, `${await page.url()} at ${dimensions.innerWidth}px`).toBeLessThanOrEqual(dimensions.innerWidth + 1)
}

test('the dinosaur intro can be skipped and does not replay during the browser visit', async ({ page }) => {
  await page.goto('/')
  const intro = page.locator('.cinema-intro')
  await expect(intro).toBeVisible()
  await expect(intro.locator('audio')).toHaveAttribute('src', '/Logo-audio.mp3')
  await expect(intro.locator('audio')).toHaveAttribute('autoplay', '')
  await intro.click({ position: { x: 20, y: 20 } })
  await expect(intro).toBeHidden()
  await page.getByRole('link', { name: /shop collection/i }).click()
  await expect(page).toHaveURL(/\/shop/)
  await expect(intro).toHaveCount(0)
  await page.reload()
  await expect(intro).toBeVisible()
})

test('a mobile touch pointer skips the dinosaur intro', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const intro = page.locator('.cinema-intro')
  await expect(intro).toBeVisible()
  await intro.click({ position: { x: 20, y: 20 } })
  await expect(intro).toBeHidden()
})

test('the 3D dinosaur scene loads and reveals the brand', async ({ page }) => {
  await page.goto('/')
  const intro = page.locator('.cinema-intro')
  await expect(intro).toBeVisible()
  await expect(intro.locator('canvas')).toBeVisible({ timeout: 15000 })
  const logoReveal = intro.locator('.cinema-logo-reveal')
  await expect(logoReveal).toHaveClass(/visible/, { timeout: 22000 })
  await expect(logoReveal.locator('.cinema-logo-wordmark strong')).toHaveText('DINO')
})

test('the 3D dinosaur intro completes once and enters the site', async ({ page }) => {
  await page.goto('/')
  const intro = page.locator('.cinema-intro')
  await intro.waitFor({ state: 'visible' })
  await expect(intro).toBeHidden({ timeout: 16000 })
  await expect(page.locator('main')).toBeVisible()
  await page.reload()
  await expect(intro).toBeVisible()
})

test('the dinosaur intro respects reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.cinema-intro')).toHaveCount(0)
  await expect(page.locator('main')).toBeVisible()
})

test('announcement bar renders scrolling and static modes accessibly', async ({ page }) => {
  await bypassIntro(page)
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Store announcement' })).toBeVisible()
  await expect(page.locator('.announcement')).toHaveClass(/is-scrolling/)

  await page.route('**/api/announcements', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'static-preview', message: 'Static mobile-safe announcement', enabled: true, mode: 'static', scrollSpeed: 'slow', linkText: 'Shop now', linkUrl: '/shop', openInNewTab: false, priority: 1, displayOrder: 0 }]) }))
  await page.reload()
  await expect(page.locator('.announcement')).toHaveClass(/is-static/)
  await expect(page.getByRole('region', { name: 'Store announcement' }).getByRole('link', { name: 'Shop now' })).toBeVisible()
})

test('mobile drawer opens, closes, and does not leave page overflow', async ({ page }) => {
  await bypassIntro(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Mobile navigation' }).getByRole('button', { name: 'Close menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('homepage has no horizontal overflow at the requested emulated viewport widths', async ({ page }, testInfo) => {
  await bypassIntro(page)
  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.locator('main')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    if ([320, 768, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true })
  }
})

test('public, account, checkout, and admin entry routes remain responsive', async ({ page }) => {
  await bypassIntro(page)
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of routes) {
      await page.goto(route)
      await expect(page.locator('body')).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }
  }
  expect(pageErrors).toEqual([])
})

test('local brand asset and public product imagery load on the storefront', async ({ page }) => {
  await bypassIntro(page); await page.goto('/')
  await expect(page.locator('.brand-logo-image').first()).toBeVisible()
  await expect.poll(() => page.locator('.product-card img').count()).toBeGreaterThan(0)
  const broken = await page.locator('img').evaluateAll(images => images.filter(image => image.complete && image.naturalWidth === 0).map(image => image.currentSrc || image.src))
  expect(broken).toEqual([])
})
