import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.SUPABASE_DEV_URL
const anonKey = process.env.SUPABASE_DEV_ANON_KEY
const serviceKey = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceKey) {
  throw new Error('DB tests need SUPABASE_DEV_URL, SUPABASE_DEV_ANON_KEY and ' +
    'SUPABASE_DEV_SERVICE_ROLE_KEY in .env.local')
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

  const signIn = await createClient(url!, anonKey!, {
    auth: { persistSession: false },
  }).auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error

  return {
    id: created.user!.id,
    email,
    accessToken: signIn.data.session!.access_token,
  }
}

/** A client that acts as `user`, so RLS applies exactly as it does in the app. */
export function clientFor(user: TestUser): SupabaseClient {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.accessToken}` } },
  })
}

/** Cascades through profiles and every user_id foreign key. */
export async function deleteTestUser(user: TestUser): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) throw error
}
