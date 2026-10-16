// Dashboard Posts page (/posts): publish as the restaurant, list, delete, role gate, phone layout.
// Contract: docs/V2-CONTRACT.md 17.1 / 17.6 (sql/58: create_restaurant_post, restaurant_posts, r/<restaurant id>/ photo folder).
// UI: client-resto/src/features/v2/pages/PostsPage.jsx, components/PostComposer.jsx, PostCard.jsx, DeletePostModal.jsx.
// Accounts: manager.sakura and waiter1.sakura (docs/REVIEW-ACCOUNTS.md, signed in over the auth API, never a password field).
// Everything lives on Sakura House (10000000-0000-0000-0000-000000000003); Trattoria Bella Roma is never touched.
// Every post this spec makes has a caption starting with "qa-posts"; afterEach and afterAll delete all of them (delete_post
// + the photo object) even when a test fails. Desktop project only, like the other dashboard specs; the phone test opens a
// 390 px context itself.
const { test, expect, settle } = require('../support/fixtures')
const F = require('../support/feat-dash')
const FF = require('../support/feat-feed')
const { tinyPng } = require('../support/v2')
const { walker } = require('../support/mobile')

const { SAKURA_ID } = FF
const TAG = 'qa-posts'
const RUN = Date.now().toString(36)
const url = p => F.RESTO_URL + p
const caption = label => `${TAG} ${RUN} ${label}`
const cardOf = (page, text) => page.getByRole('article').filter({ hasText: text })
const dialogOf = page => page.getByRole('dialog')
const pathOf = page => new URL(page.url()).pathname
const navHrefs = (page, sel = '.dash-nav a') => page.locator(sel).evaluateAll(as => as.map(a => new URL(a.href).pathname))
const publishBtn = page => page.getByRole('button', { name: 'Publish', exact: true })
const captionBox = page => page.getByLabel('Caption', { exact: true })
const NEED = 'Add a photo or write a caption to publish.'

/** REST / RPC / Storage client of a staff account; the session comes from the auth API. */
async function signIn(page, key) { return FF.client(page.request, await F.authenticate(page, key)) }

async function gotoPosts(page) {
  await page.goto(url('/posts'))
  await page.locator('.dash-layout').waitFor()
  await expect(page.getByRole('heading', { name: 'Posts', level: 1 })).toBeVisible()
  await expect(page.locator('.v2-skel-post')).toHaveCount(0)   // the list finished loading
}

const findPost = async (c, text) => (await FF.restaurantPosts(c)).items.find(i => i.caption === text)

test.describe('feat resto posts', { tag: ['@staff', '@resto', '@posts'] }, () => {
  test.skip(!(F.accounts.manager && F.accounts.waiter1), 'docs/REVIEW-ACCOUNTS.md must list manager.sakura and waiter1.sakura')
  test.describe.configure({ mode: 'default' })   // one worker for the file, a failing test does not skip the next ones

  // cleanup: after each test through its own page, once more at the end through a fresh context (the page may be gone after a timeout)
  test.afterEach(async ({ page }) => {
    try { await FF.purgePosts(await signIn(page, 'manager'), TAG) } catch (err) { console.log(`[cleanup] afterEach: ${err.message}`) }
  })
  test.afterAll(async ({ browser }, testInfo) => {
    const s = await F.openAs(browser, testInfo, 'manager')
    try { await FF.purgePosts(FF.client(s.page.request, s.who), TAG) } finally { await s.close() }
  })

  test('a caption-only post: Publish needs content, then a card appears at the top with 0 likes and 0 comments', async ({ page, watch }) => {
    const c = await signIn(page, 'manager')
    const sakura = (await c.get(`restaurants?id=eq.${SAKURA_ID}&select=name,slug`)).data[0]
    const text = caption('caption only')
    await gotoPosts(page)

    await expect(publishBtn(page)).toBeDisabled()
    await expect(page.getByText(NEED)).toBeVisible()
    await captionBox(page).fill(text)
    await expect(page.getByText(`${text.length} / 2000`)).toBeVisible()
    await expect(publishBtn(page)).toBeEnabled()
    await expect(page.getByText(NEED)).toHaveCount(0)
    await publishBtn(page).click()

    await expect(page.getByText('Published. Guests can see it on Home.')).toBeVisible()
    await expect(captionBox(page), 'the composer is cleared after publishing').toHaveValue('')
    const card = cardOf(page, text)
    await expect(card).toHaveCount(1)
    await expect(page.locator('.v2-post-grid > article').first(), 'newest first').toContainText(text)
    await expect(card.getByRole('img'), 'no photo was added').toHaveCount(0)
    await expect(card.locator('.v2-post-dish'), 'no dish was tagged').toHaveCount(0)
    await expect(card.getByText('0 likes', { exact: true })).toHaveCount(1)
    await expect(card.getByText('0 comments', { exact: true })).toHaveCount(1)
    await expect(card.locator('.v2-post-stats')).toContainText('🤌 0')
    await expect(card.locator('.v2-post-stats')).toContainText('🍽️ 0')
    await expect(card.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)

    const row = await findPost(c, text)
    expect(row, 'the post is listed by restaurant_posts').toBeTruthy()
    expect(row).toMatchObject({ photo_url: null, dish: null, like_count: 0, comment_count: 0, author: { type: 'restaurant', slug: sakura.slug } })
    expect(row.user, 'the staff member never leaves the server (17.2)').toMatchObject({ id: null, name: sakura.name })
    expect(JSON.stringify(row)).not.toContain(c.userId)
    await settle(page)
    expect(watch.consoleErrors, 'console errors on /posts').toEqual([])
  })

  test('a post with photo, caption and dish: the card shows them and the photo is stored under r/<restaurant id>/', async ({ page, watch }) => {
    const c = await signIn(page, 'manager')
    const { available: dish, soldOut } = await FF.sakuraDishes(c)
    test.skip(!dish, 'Sakura House has no available dish to tag')
    const text = caption('photo and dish')
    await gotoPosts(page)

    await page.locator('input[type=file]').setInputFiles({ name: 'qa-post.png', mimeType: 'image/png', buffer: tinyPng() })
    await expect(page.getByAltText('Preview of the selected photo')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible()
    await expect(publishBtn(page), 'a photo alone is enough to publish').toBeEnabled()
    await captionBox(page).fill(text)
    const dishSelect = page.getByLabel('Tag a dish (optional)')
    if (soldOut) await expect(dishSelect.locator(`option[value="${soldOut.id}"]`), 'a sold-out dish is marked in the select').toHaveText(`${soldOut.name} · Sold out`)
    await dishSelect.selectOption(dish.id)
    await publishBtn(page).click()

    await expect(page.getByText('Published. Guests can see it on Home.')).toBeVisible()
    await expect(page.getByAltText('Preview of the selected photo'), 'the preview is cleared').toHaveCount(0)
    await expect(dishSelect, 'the dish tag is cleared').toHaveValue('')
    const card = cardOf(page, text)
    await expect(card).toHaveCount(1)
    await expect(page.locator('.v2-post-grid > article').first(), 'newest first').toContainText(text)
    const photo = card.getByRole('img', { name: 'Post photo' })
    await expect(photo).toBeVisible()
    await expect.poll(() => photo.evaluate(i => i.complete && i.naturalWidth > 0), { message: 'the signed photo URL loads' }).toBe(true)
    await expect(card.locator('.v2-post-dish')).toContainText(dish.name)
    await expect(card.locator('.v2-post-dish').getByText('Available', { exact: true })).toBeVisible()
    await expect(card.getByText('0 likes', { exact: true })).toHaveCount(1)
    await expect(card.getByText('0 comments', { exact: true })).toHaveCount(1)

    await test.step('the row: restaurant author, dish with price + availability, photo path under r/<restaurant id>/', async () => {
      const row = await findPost(c, text)
      expect(row.photo_url).toMatch(new RegExp(`^r/${SAKURA_ID}/[0-9a-f-]{36}\\.jpg$`))   // the browser resizes to JPEG
      expect(row.dish).toMatchObject({ id: dish.id, name: dish.name, available: true })
      expect(row.dish.price).not.toBeNull()
      expect(row.author.type).toBe('restaurant')
      expect(await c.objectStatus(row.photo_url), 'the uploaded object exists').toBe(200)
    })

    if (soldOut) {
      await test.step('a sold-out dish shows the red Sold out pill', async () => {
        const t2 = caption('sold out dish')
        await FF.seedPost(c, { caption: t2, dishId: soldOut.id })
        await gotoPosts(page)
        const dishLine = cardOf(page, t2).locator('.v2-post-dish')
        await expect(dishLine).toContainText(soldOut.name)
        await expect(dishLine.getByText('Sold out', { exact: true })).toBeVisible()
      })
    }
    await settle(page)
    expect(watch.consoleErrors, 'console errors on /posts').toEqual([])
  })

  test('delete asks first (Cancel and Esc keep the post); confirming removes the card, the row and the photo object', async ({ page }) => {
    const c = await signIn(page, 'manager')
    const textA = caption('delete me'), textB = caption('keep me')
    const a = await FF.seedPost(c, { caption: textA, photo: true })
    await FF.seedPost(c, { caption: textB })
    await gotoPosts(page)
    expect(await c.objectStatus(a.path), 'the photo object exists before the delete').toBe(200)

    const cardA = cardOf(page, textA), cardB = cardOf(page, textB)
    await expect(cardA).toHaveCount(1)
    await expect(cardB).toHaveCount(1)
    const del = card => card.getByRole('button', { name: 'Delete', exact: true })
    const dialog = dialogOf(page)

    await del(cardA).click()
    await expect(dialog.getByRole('heading', { name: 'Delete this post?' })).toBeVisible()
    await expect(dialog).toContainText("This can't be undone.")
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(cardA, 'Cancel keeps the post').toHaveCount(1)

    await del(cardA).click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(cardA, 'Esc keeps the post').toHaveCount(1)

    await del(cardA).click()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(cardA).toHaveCount(0)
    await expect(cardB, 'only the chosen post goes').toHaveCount(1)

    await expect.poll(async () => (await FF.restaurantPosts(c)).items.map(i => i.caption), { message: 'restaurant_posts after the delete' }).not.toContain(textA)
    expect((await FF.restaurantPosts(c)).items.map(i => i.caption)).toContain(textB)
    await expect.poll(() => c.objectStatus(a.path), { message: 'the photo object is removed after the delete' }).not.toBe(200)
    await gotoPosts(page)
    await expect(cardA, 'still gone after a reload').toHaveCount(0)
    await expect(cardB).toHaveCount(1)
  })

  test('a waiter has no Posts entry (sidebar, bottom bar, More sheet), /posts bounces to /waiter, create and delete are refused', async ({ page }) => {
    const c = await signIn(page, 'waiter1')
    const m = await signIn(page, 'manager')   // second sign-in: only its API token is used here, the page keeps the waiter's session
    const mine = await FF.seedPost(m, { caption: caption('waiter cannot delete') })
    const del = await c.rpc('delete_post', { p_id: mine.id })
    expect(del.ok, `delete_post of a restaurant post as a waiter (HTTP ${del.status})`).toBe(false)
    expect(del.message).toBe('forbidden')   // sql/58b: only a manager of the restaurant (or a platform admin) may delete it
    expect((await FF.restaurantPosts(m)).items.map(i => i.id), 'the post is still there').toContain(mine.id)

    await page.goto(url('/waiter'))
    await page.locator('.dash-layout').waitFor()
    expect(await navHrefs(page), 'waiter sidebar').not.toContain('/posts')
    await expect(page.getByRole('link', { name: 'Posts', exact: true })).toHaveCount(0)

    await page.goto(url('/posts'))
    await page.locator('.dash-layout').waitFor()
    await expect.poll(() => pathOf(page), { message: 'waiter on /posts' }).toBe('/waiter')
    await expect(page.getByRole('heading', { name: 'Posts', level: 1 })).toHaveCount(0)

    await page.setViewportSize({ width: 390, height: 844 })
    expect(await navHrefs(page, '.dash-mobile-nav a'), 'waiter bottom bar').not.toContain('/posts')
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await expect(dialogOf(page)).toBeVisible()
    await expect(dialogOf(page).getByRole('link', { name: 'Posts' }), 'waiter More sheet').toHaveCount(0)

    const r = await c.rpc('create_restaurant_post', { p_restaurant_id: SAKURA_ID, p_photo_url: null, p_caption: caption('waiter must be refused'), p_dish_id: null })
    expect(r.ok, `create_restaurant_post as a waiter (HTTP ${r.status})`).toBe(false)
    expect(r.message).toBe('forbidden')
  })

  test('on a phone the manager reaches Posts from the bottom bar and the More sheet, publishes, and the page fits 390 px', async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const s = await F.openAs(browser, testInfo, 'manager', { viewport: { width: 390, height: 844 } })
    try {
      const { page } = s
      const w = walker(page, s.watch, testInfo)
      await page.goto(url('/'))
      await page.locator('.dash-layout').waitFor()
      await expect(page.locator('.dash-sidebar'), 'the sidebar is hidden on a phone').toBeHidden()
      await expect(page.locator('.dash-mobile-nav a[href="/posts"]'), 'Posts in the bottom bar').toHaveCount(1)

      await page.getByRole('button', { name: 'More', exact: true }).click()
      const link = dialogOf(page).getByRole('link', { name: 'Posts', exact: true })
      await expect(link, 'Posts in the More sheet').toBeVisible()
      expect((await link.boundingBox()).height, 'More sheet row height').toBeGreaterThanOrEqual(40)
      await link.click()
      await expect(page).toHaveURL(url('/posts'))
      await expect(dialogOf(page), 'the sheet closes on navigation').toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Posts', level: 1 })).toBeVisible()
      await expect(page.locator('.v2-skel-post')).toHaveCount(0)

      await page.goto(url('/'))   // the bottom bar entry works too
      await page.locator('.dash-layout').waitFor()
      const bar = page.locator('.dash-mobile-nav a[href="/posts"]')
      await bar.scrollIntoViewIfNeeded()
      await bar.click()
      await expect(page).toHaveURL(url('/posts'))
      await expect(page.locator('.v2-skel-post')).toHaveCount(0)
      await w.check('manager /posts at 390')

      const text = caption('from a phone')
      await captionBox(page).fill(text)
      expect((await publishBtn(page).boundingBox()).height, 'Publish button height').toBeGreaterThanOrEqual(40)
      await publishBtn(page).click()
      await expect(cardOf(page, text)).toHaveCount(1)
      await w.check('manager /posts at 390 with a card')
      await w.scrollThrough('manager /posts')
    } finally { await s.close() }
  })
})
