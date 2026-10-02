import { test, expect } from '@playwright/test'
import { admin, signInAsFreshUser, type FreshUser } from './helpers'

function londonDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at)
}

async function creatineDays(user: FreshUser): Promise<string[]> {
  const { data } = await admin
    .from('metric_entries')
    .select('logged_on, value_bool')
    .eq('user_id', user.userId)
    .eq('metric_id', user.creatineMetricId)
    .order('logged_on')
  return (data ?? []).map((r) => `${r.logged_on}:${r.value_bool}`)
}

// A home-screen PWA resumed the next morning must write to the NEW day, not
// overwrite yesterday's row. The page's day was once frozen at server render.
test.describe('day rollover', () => {
  let user: FreshUser | undefined

  test.afterEach(async () => {
    if (user) await user.cleanup()
    user = undefined
  })

  for (const resume of ['visibilitychange and focus', 'the interval backstop'] as const) {
    test(`logs onto the new day after midnight passes (${resume})`, async ({ page, context }) => {
      user = await signInAsFreshUser(page, context)

      const start = new Date()
      const tomorrow = new Date(start.getTime() + 24 * 60 * 60 * 1000)
      const day1 = londonDay(start)
      const day2 = londonDay(tomorrow)
      expect(day2).not.toBe(day1)

      // Real "now", but under the test's control so it can be advanced.
      await page.clock.install({ time: start })
      await page.goto('/')

      const toggle = page.getByRole('switch', { name: 'Creatine' })
      await expect(toggle).toBeVisible()
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'true')
      await expect.poll(() => creatineDays(user!), { timeout: 10_000 })
        .toEqual([`${day1}:true`])

      // The phone sat in a pocket overnight, then the app came forward.
      if (resume === 'the interval backstop') {
        await page.clock.fastForward('24:00:00')
        await page.clock.runFor('01:00')
      } else {
        await page.clock.fastForward('24:00:00')
        await page.evaluate(() => {
          document.dispatchEvent(new Event('visibilitychange'))
          window.dispatchEvent(new Event('focus'))
        })
      }

      // New day, nothing logged yet: the toggle must read unchecked.
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'true')

      await expect.poll(() => creatineDays(user!), { timeout: 10_000 })
        .toEqual([`${day1}:true`, `${day2}:true`])
    })
  }
})
