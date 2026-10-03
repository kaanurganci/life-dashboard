import type { SupabaseClient } from '@supabase/supabase-js'
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js'
import { ENTRY_CONFLICT_TARGET } from '@/lib/entries'
import type { Database } from '@/types/database'
import type { MetricEntry } from '@/lib/schemas'

/** Code on the error thrown when the session is dead and cannot be refreshed. */
export const SIGNED_OUT_CODE = 'APP_SIGNED_OUT'

function isSessionOver(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true
  return isAuthApiError(error) && [400, 401, 403].includes(error.status)
}

function isExpiredToken(error: { code?: string }, status: number): boolean {
  return error.code === 'PGRST301' || status === 401
}

/**
 * Upserts one entry. An expired JWT is expected after a long offline stretch:
 * the write is not bad, the credential is stale. So refresh the session and
 * retry once, rather than either deleting the write (permanent) or spinning on
 * a token that will never become valid (transient).
 *
 *  - refresh succeeds           -> retry the write once with the fresh token
 *  - refresh says session over  -> (AuthSessionMissing, or AuthApiError
 *                                  400/401/403) permanent
 *  - any other refresh failure  -> thrown WITHOUT a code, so it is retried
 *  - still rejected after it    -> thrown with its own code (PGRST301 is
 *                                  permanent), so a bad token cannot spin
 */
export async function writeEntry(
  supabase: SupabaseClient<Database>,
  payload: MetricEntry,
): Promise<void> {
  const upsert = () => supabase
    .from('metric_entries')
    .upsert(payload, { onConflict: ENTRY_CONFLICT_TARGET })

  const first = await upsert()
  const { status } = first
  let { error } = first

  if (error && isExpiredToken(error, status)) {
    const { data, error: refreshError } = await supabase.auth.refreshSession()

    // Only "this session is over" is permanent. Anything else (429 when many
    // slots refresh at once after a long offline stretch, 5xx, fetch failures,
    // unknown shapes) is recoverable, so it is thrown WITHOUT a code and retried.
    if (refreshError) {
      if (isSessionOver(refreshError)) {
        throw Object.assign(new Error('signed out: session cannot be refreshed'), {
          code: SIGNED_OUT_CODE,
        })
      }
      throw new TypeError('could not refresh the session; will retry')
    }
    if (!data.session) {
      throw Object.assign(new Error('signed out: no session after refresh'), {
        code: SIGNED_OUT_CODE,
      })
    }

    ;({ error } = await upsert())
  }

  if (error) throw error
}
