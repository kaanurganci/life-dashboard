import { test, expect } from '@playwright/test'
import { admin, signInAsFreshUser, type FreshUser } from './helpers'

// Mirrors src/lib/date.ts's localDay() so the DB assertions below check the
// exact same calendar day the app itself would have written to.
function localDay(timeZone = 'Europe/London'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

const TODAY = localDay()

test.describe('morning log', () => {
  let user: FreshUser | undefined

  test.afterEach(async () => {
    if (user) await user.cleanup()
    user = undefined
  })

  test('logs a morning and persists across reload', async ({ page, context }) => {
    user = await signInAsFreshUser(page, context)

    await page.goto('/')

    const toggle = page.getByRole('switch', { name: 'Creatine' })
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    // metric-slider only commits on pointerup/keyup, not on every input
    // event, so drive it with the keyboard rather than locator.fill() --
    // fill() sets the value and fires input/change but never keyup, so the
    // commit callback (log()) would never run.
    const slider = page.getByRole('slider', { name: 'Sleep Quality' })
    await slider.focus()
    await slider.press('End') // scale_max is 10 for this metric
    await expect(slider).toHaveValue('10')

    // Give the optimistic write a moment to actually reach the server
    // before reloading, so the reload reads back a real row rather than
    // racing the in-flight request.
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('metric_entries')
          .select('value_bool')
          .eq('user_id', user!.userId)
          .eq('metric_id', user!.creatineMetricId)
          .eq('logged_on', TODAY)
          .maybeSingle()
        return data?.value_bool ?? null
      }, { timeout: 10_000 })
      .toBe(true)

    await page.reload()

    await expect(page.getByRole('switch', { name: 'Creatine' }))
      .toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('slider', { name: 'Sleep Quality' }))
      .toHaveValue('10')
  })

  test('queues a write made offline and drains it on reconnect', async ({ page, context }) => {
    user = await signInAsFreshUser(page, context)

    await page.goto('/')
    const toggle = page.getByRole('switch', { name: 'Creatine' })
    await expect(toggle).toBeVisible()

    // Confirm the row genuinely does not exist yet, so the later assertion
    // that it reached the database is proof the offline write drained --
    // not a false positive from a leftover row.
    const before = await admin
      .from('metric_entries')
      .select('id')
      .eq('user_id', user.userId)
      .eq('metric_id', user.creatineMetricId)
      .eq('logged_on', TODAY)
      .maybeSingle()
    expect(before.data).toBeNull()

    await context.setOffline(true)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('status')).toContainText('waiting to sync')

    // Prove the write really is queued, not silently dropped: while still
    // offline, the row must not exist server-side yet.
    const whileOffline = await admin
      .from('metric_entries')
      .select('id')
      .eq('user_id', user.userId)
      .eq('metric_id', user.creatineMetricId)
      .eq('logged_on', TODAY)
      .maybeSingle()
    expect(whileOffline.data).toBeNull()

    await context.setOffline(false)

    // The badge clearing proves the UI thinks the write settled -- but only
    // that the mutation stopped being *paused*. `pendingCount` (see
    // src/hooks/use-log-metric.ts) counts pending mutations with
    // `state.isPaused`, and `resumePausedMutations()` flips `isPaused` to
    // false the instant it *starts* retrying, before the network call to
    // Supabase actually resolves. So the badge can (and, empirically, does)
    // disappear a beat before the row commits -- which is exactly the
    // badge-only false positive this test exists to rule out. Poll for the
    // row rather than asserting the exact instant the badge hides.
    await expect(page.getByRole('status')).toBeHidden({ timeout: 15_000 })

    // The row existing proves the queue actually drained to the database --
    // a badge-only assertion would pass even if the mutation had merely
    // errored out of the pending state without ever reaching the server.
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('metric_entries')
          .select('value_bool')
          .eq('user_id', user!.userId)
          .eq('metric_id', user!.creatineMetricId)
          .eq('logged_on', TODAY)
          .maybeSingle()
        return data?.value_bool ?? null
      }, { timeout: 5_000 })
      .toBe(true)
  })
})
