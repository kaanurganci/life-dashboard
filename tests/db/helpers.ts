import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.SUPABASE_TEST_URL
const anonKey = process.env.SUPABASE_TEST_ANON_KEY
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceKey) {
  throw new Error('DB tests need SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY and ' +
    'SUPABASE_TEST_SERVICE_ROLE_KEY in .env.local')
}

export const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export type TestUser = { id: string; email: string; accessToken: string }

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${randomUUID()}@example.com`
  const password = randomUUID()

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error) throw error

  try {
    const signIn = await createClient(url!, anonKey!, {
      auth: { persistSession: false },
    }).auth.signInWithPassword({ email, password })
    if (signIn.error) throw signIn.error

    return {
      id: created.user!.id,
      email,
      accessToken: signIn.data.session!.access_token,
    }
  } catch (err) {
    // Sign-in failed after the auth user was created: delete it so it
    // doesn't orphan, then let the original error propagate. A failure
    // during this cleanup attempt must not mask the original error.
    await deleteTestUser({ id: created.user!.id, email, accessToken: '' })
      .catch(() => {})
    throw err
  }
}

/** A client that acts as `user`, so RLS applies exactly as it does in the app. */
export function clientFor(user: TestUser): SupabaseClient {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.accessToken}` } },
  })
}

/**
 * Cascades through profiles and every user_id foreign key.
 * Tolerates an undefined/null user (e.g. a fixture that never finished
 * initialising) so callers in `afterAll` can clean up unconditionally.
 */
export async function deleteTestUser(user: TestUser | undefined | null): Promise<void> {
  if (!user) return
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) throw error
}

/**
 * Deletes each user independently (one failure doesn't stop the others).
 * If any deletion genuinely failed, throws after attempting all of them
 * so a real cleanup problem is still visible rather than silently swallowed.
 */
export async function deleteTestUsers(...users: (TestUser | undefined | null)[]): Promise<void> {
  const results = await Promise.allSettled(users.map((user) => deleteTestUser(user)))
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failures.length > 0) {
    throw new Error(
      `deleteTestUsers: ${failures.length}/${users.length} deletion(s) failed: ` +
        failures.map((f) => String(f.reason)).join('; '),
    )
  }
}
