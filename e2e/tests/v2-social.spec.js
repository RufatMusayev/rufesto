// v2 Social (WP1): friends, feed, posts, likes, comments. @guest, uses the guest + manager QA users.
// Everything it creates (friendship, post) is removed through the UI at the end; the finally block
// repeats the cleanup over the API if a step failed halfway.
const { test, expect } = require('../support/fixtures')
const { CONSUMER_URL, creds } = require('../support/env')
const { signInGuest } = require('../support/guest')
const { openAs, rpc, tinyPng } = require('../support/v2')

const url = path => CONSUMER_URL + path
const MANAGER = 'QA Manager'
const GUEST = 'QA Guest'

test.describe('v2 social', { tag: ['@guest', '@consumer', '@v2'] }, () => {
  test.skip(!creds.guest || !creds.manager, 'set QA_GUEST_* and QA_MANAGER_*')

  test('friend request, feed post, like, comment, unfriend', async ({ page, browser, watch }, testInfo) => {
    test.setTimeout(120_000)
    const guest = await signInGuest(page, creds.guest)
    const mgr = await openAs(browser, testInfo, creds.manager)
    const caption = `qa-e2e post ${Date.now()}`
    let postId = null
    const row = (p, name) => p.locator('.soc-row').filter({ hasText: name })
    await rpc(page, guest, 'remove_friend', { p_user_id: mgr.session.user.id })   // stale state from an aborted run

    try {
      await test.step('/friends renders its three tabs', async () => {
        await page.goto(url('/friends'))
        for (const name of ['Friends', 'Requests', 'Find']) await expect(page.getByRole('tab', { name, exact: true })).toBeVisible()
      })

      await test.step('search needs 3+ chars, then lists the manager; send request -> Pending', async () => {
        await page.getByRole('tab', { name: 'Find', exact: true }).click()
        const search = page.getByPlaceholder('Search by name')
        await search.fill('Q')
        await expect(page.getByText('Type at least 3 letters.')).toBeVisible()
        await search.fill(MANAGER)
        await expect(row(page, MANAGER)).toBeVisible()
        await row(page, MANAGER).getByRole('button', { name: 'Add', exact: true }).click()
        await expect(row(page, MANAGER).getByText('Pending')).toBeVisible()
      })

      await test.step('manager accepts; both sides list each other under Friends', async () => {
        await mgr.page.goto(url('/friends?tab=requests'))
        await expect(row(mgr.page, GUEST)).toBeVisible()
        await row(mgr.page, GUEST).getByRole('button', { name: 'Accept', exact: true }).click()
        await mgr.page.getByRole('tab', { name: 'Friends', exact: true }).click()
        await expect(row(mgr.page, GUEST)).toBeVisible()
        await page.goto(url('/friends'))
        await expect(row(page, MANAGER)).toBeVisible()
      })

      await test.step('new post (photo is required while uploads are on) shows in Feed > All and on /u/<me>', async () => {
        await page.goto(url('/post/new'))
        await page.locator('input[type=file]').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: tinyPng() })
        await expect(page.getByAltText('Your photo')).toBeVisible()
        await page.getByLabel('Caption').fill(caption)
        const post = page.getByRole('button', { name: 'Post', exact: true })
        await post.click()
        // No photo bucket on this server: the screen drops to caption-only and the same button posts it.
        if (await page.getByText('Photo upload coming soon').isVisible({ timeout: 5_000 }).catch(() => false)) {
          testInfo.annotations.push({ type: 'note', description: 'post-photos bucket missing: posted caption-only' })
          await post.click()
        }
        await expect(page).toHaveURL(url('/'))
        await expect(page.getByRole('tab', { name: 'Feed', exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(page.locator('article.soc-post').filter({ hasText: caption })).toBeVisible()
        await page.goto(url(`/u/${guest.session.user.id}`))
        await page.getByRole('link', { name: caption }).click()
        await expect(page).toHaveURL(/\/post\/[\w-]+$/)
        postId = page.url().split('/').pop()
      })

      await test.step('like and comment', async () => {
        const article = page.locator('article.soc-post')
        await article.getByRole('button', { name: 'Like', exact: true }).click()
        await expect(article.getByRole('button', { name: 'Remove like' })).toHaveAttribute('aria-pressed', 'true')
        await expect(article.getByText('1 like')).toBeVisible()
        await page.getByLabel('Add a comment…').fill('qa-e2e comment')
        await page.getByRole('button', { name: 'Send comment' }).click()
        await expect(page.getByText('qa-e2e comment')).toBeVisible()
        await expect(page.getByLabel('Add a comment…')).toHaveValue('')
      })

      await test.step('delete the post, then remove the friend', async () => {
        await page.getByRole('button', { name: 'Post options' }).click()
        await page.getByRole('button', { name: 'Delete post' }).click()
        await expect(page).toHaveURL(url('/'))
        postId = null
        await page.goto(url('/friends'))
        await page.getByRole('button', { name: `More options for ${MANAGER}` }).click()
        await page.getByRole('button', { name: 'Remove friend' }).click()
        await expect(page.getByText('No friends yet')).toBeVisible()
      })
      expect(watch.consoleErrors, 'console errors for the guest').toEqual([])
    } finally {
      if (postId) await rpc(page, guest, 'delete_post', { p_id: postId })
      await rpc(page, guest, 'remove_friend', { p_user_id: mgr.session.user.id })
      await mgr.close()
    }
  })
})
