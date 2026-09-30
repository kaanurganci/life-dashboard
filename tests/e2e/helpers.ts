import { createClient, type Session } from '@supabase/supabase-js'
import { createChunks, stringToBase64URL } from '@supabase/ssr'
import { randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import type { BrowserContext, Page } from '@playwright/test'

// Each Playwright worker is its own Node process; make sure this module has
// the env vars regardless of whether playwright.config.ts's own load has
// propagated to it. dotenv does not override already-set vars.
config({ path: '.env.local' })

const url = process.env.SUPABASE_TEST_URL!
const anonKey = process.env.SUPABASE_TEST_ANON_KEY!
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'e2e tests need SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY and ' +
      'SUPABASE_TEST_SERVICE_ROLE_KEY in .env.local',
  )
}

// @supabase/ssr's default storage key is `sb-<project-ref>-auth-token`, where
// the project ref is the first label of the project's hostname -- NOT
// `sb-access-token` / `sb-refresh-token`, which is what an older version of
// this test's brief assumed. See supabase-js's SupabaseClient constructor
// (`defaultStorageKey = \`sb-${baseUrl.hostname.split('.')[0]}-auth-token\``).
const projectRef = new URL(url).hostname.split('.')[0]
export const AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`

export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export type FreshUser = {
  userId: string
  sleepMetricId: string
  creatineMetricId: string
  cleanup: () => Promise<void>
}

/**
 * Creates a brand-new auth user + two metrics (a scale and a boolean, the
 * same shapes the morning card renders), signs in with a password (no email
 * round-trip), and writes the resulting session into the browser context as
 * real Supabase cookies -- built the same way `@supabase/ssr`'s browser
 * storage adapter builds them (see `documentCookieSetAll` /
 * `createStorageFromOptions` in `@supabase/ssr/dist/module/cookies.js`):
 * JSON.stringify the session, base64url-encode it with a `base64-` prefix
 * (the default `cookieEncoding: 'base64url'`), then split into
 * `<key>`/`<key>.0`/`<key>.1`... chunks via the same `createChunks` the
 * library exports and uses internally. This is what makes the cookie
 * readable both by the server (`src/proxy.ts`, `src/lib/supabase/server.ts`)
 * and by the browser bundle's own `createBrowserSupabase()` client.
 */
export async function signInAsFreshUser(
  page: Page,
  context: BrowserContext,
): Promise<FreshUser> {
  const email = `e2e-${randomUUID()}@example.com`
  const password = randomUUID()

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (createErr || !created.user) {
    throw new Error(`failed to create e2e test user: ${createErr?.message}`)
  }
  const userId = created.user.id

  const cleanup = async () => {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) throw error
  }

  try {
    const { data: metrics, error: metricsErr } = await admin.from('metrics').insert([
      {
        user_id: userId, slug: 'sleep_quality', label: 'Sleep Quality',
        kind: 'scale', category: 'wellbeing', scale_min: 1, scale_max: 10,
        sort_order: 1,
      },
      {
        user_id: userId, slug: 'creatine', label: 'Creatine', kind: 'boolean',
        category: 'supplement', sort_order: 10,
      },
    ]).select('id, slug')
    if (metricsErr || !metrics) {
      throw new Error(`failed to seed e2e metrics: ${metricsErr?.message}`)
    }

    const sleepMetricId = metrics.find((m) => m.slug === 'sleep_quality')!.id
    const creatineMetricId = metrics.find((m) => m.slug === 'creatine')!.id

    const anon = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data: signIn, error: signInErr } =
      await anon.auth.signInWithPassword({ email, password })
    if (signInErr || !signIn.session) {
      throw new Error(`failed to sign in e2e test user: ${signInErr?.message}`)
    }

    await injectSession(context, signIn.session)

    return { userId, sleepMetricId, creatineMetricId, cleanup }
  } catch (err) {
    await cleanup().catch(() => {})
    throw err
  }
}

/**
 * Writes a real Supabase session into the browser context's cookie jar in
 * the exact wire format `@supabase/ssr` produces, so the app's proxy guard
 * and both the server and browser Supabase clients accept it as a normal
 * signed-in session -- no UI login, no magic-link email round-trip.
 */
async function injectSession(
  context: BrowserContext,
  session: Session,
): Promise<void> {
  const serialized = JSON.stringify(session)
  const encoded = 'base64-' + stringToBase64URL(serialized)
  const chunks = createChunks(AUTH_STORAGE_KEY, encoded)

  await context.addCookies(
    chunks.map(({ name, value }) => ({
      name,
      // Cookies set via CDP (context.addCookies) land in the browser's cookie
      // jar verbatim -- there is no `cookie`-package serialize() step to
      // percent-encode the value the way a real Set-Cookie response would.
      // @supabase/ssr's browser storage reads cookies via `cookie`'s parse(),
      // which decodeURIComponent()s every value by default, so the value must
      // be pre-encoded here to round-trip correctly.
      value: encodeURIComponent(value),
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax' as const,
      expires: Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60,
    })),
  )
}
