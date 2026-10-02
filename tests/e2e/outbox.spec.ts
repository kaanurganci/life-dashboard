import { test, expect } from '@playwright/test'
import { admin, signInAsFreshUser, type FreshUser } from './helpers'

const SUPABASE_URL = process.env.SUPABASE_TEST_URL!

// The outbox is only inert if the persister never got a user key, which would
// happen if the app stayed on the signed-out key after login. This signs in
// (full navigation, as the magic-link callback does), loses the backend, writes,
// RELOADS, and only then restores connectivity: the write must come back out of
// IndexedDB and reach the database.
test.describe('outbox', () => {
  let user: FreshUser | undefined

  test.afterEach(async () => {
    if (user) await user.cleanup()
    user = undefined
  })

  test('a write made while the backend is unreachable survives a reload and lands', async ({ page, context }) => {
    user = await signInAsFreshUser(page, context)
    await page.goto('/')

    const toggle = page.getByRole('switch', { name: 'Creatine' })
    await expect(toggle).toBeVisible()

    // Weak signal: the device still reports online, but every backend call fails.
    // (context.setOffline would also stop the reload from reaching the app.)
    const blockBackend = (route: { abort: (c: string) => Promise<void> }) => route.abort('failed')
    await page.route(`${SUPABASE_URL}/**`, blockBackend)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    // Wait until the queue has actually been written to this user's IndexedDB key.
    await expect.poll(() => page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('keyval-store')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const keys = await new Promise<IDBValidKey[]>((res, rej) => {
        const r = db.transaction('keyval').objectStore('keyval').getAllKeys()
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      db.close()
      return keys.map(String)
    }), { timeout: 10_000 }).toContainEqual(expect.stringMatching(/^life-dashboard-query-cache:.+/))

    // Persist is throttled; give it a beat beyond the key first appearing.
    await page.waitForTimeout(1500)

    await page.reload()

    // Still nothing server-side: the write is only in the restored outbox.
    const whileBlocked = await admin
      .from('metric_entries').select('id')
      .eq('user_id', user.userId).eq('metric_id', user.creatineMetricId)
    expect(whileBlocked.data).toEqual([])

    await page.unroute(`${SUPABASE_URL}/**`, blockBackend)

    await expect.poll(async () => {
      const { data } = await admin
        .from('metric_entries').select('value_bool')
        .eq('user_id', user!.userId).eq('metric_id', user!.creatineMetricId)
      return data?.map((r) => r.value_bool) ?? []
    }, { timeout: 30_000 }).toEqual([true])
  })
})
