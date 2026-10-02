import type { SupabaseClient } from '@supabase/supabase-js'
import { isAuthSessionMissingError } from '@supabase/supabase-js'

/**
 * Who owns the persisted outbox. Three outcomes, deliberately distinct:
 *   string     a user
 *   null       CONFIRMED signed out
 *   undefined  unknown: the lookup failed for a reason that says nothing about
 *              whether anyone is signed in (network, auth server hiccup)
 *
 * Treating unknown as signed-out would swap the persister for a no-op and drop
 * the in-memory queue. When getUser() cannot be verified, the user id in the
 * session cookie is still good enough to pick the right storage key (it is a
 * key, not an authorisation; RLS still decides what a write may do).
 */
export async function resolveUserId(
  supabase: { auth: Pick<SupabaseClient['auth'], 'getUser' | 'getSession'> },
): Promise<string | null | undefined> {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (data.user) return data.user.id
    if (!error || isAuthSessionMissingError(error)) return null

    const { data: session } = await supabase.auth.getSession()
    return session.session?.user.id
  } catch {
    return undefined
  }
}
