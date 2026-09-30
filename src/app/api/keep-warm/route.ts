import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` to cron routes whenever
 * a `CRON_SECRET` env var is set on the project -- no extra platform wiring
 * needed. Comparing raw strings (`===` or a plain equality check) leaks
 * timing information proportional to how many leading bytes match, so both
 * sides are hashed to a fixed-length digest first and compared with
 * `timingSafeEqual`, which also sidesteps `timingSafeEqual`'s own
 * length-mismatch throw (unequal-length inputs would otherwise crash instead
 * of just failing the check).
 *
 * IMPORTANT: `CRON_SECRET` must be set in the Vercel project's environment
 * variables for this route to ever authorize a request. If the cron starts
 * 401ing, check that first -- do not delete this guard to "fix" it; the
 * fix is to set the secret.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // unconfigured secret fails closed, never open

  const header = request.headers.get('authorization') ?? ''
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest()
  const actual = createHash('sha256').update(header).digest()

  return timingSafeEqual(expected, actual)
}

// Free-tier Supabase projects pause after ~7 days idle. One weekly query
// guarantees the project stays awake even during a week away. Uses the
// publishable anon key, not the service-role key: this route is reachable
// by anyone who finds the URL, and there is no reason for it to hold an
// RLS-bypassing credential just to keep a project warm.
//
// The anon role holds no GRANT on any app table in this schema (every
// migration deliberately grants only `authenticated` and `service_role` --
// "anon deliberately receives nothing"), so this query does not return
// rows filtered down by RLS as one might expect; it fails at the privilege
// check with Postgres error 42501 (`permission denied for table metrics`),
// confirmed empirically while wiring this up. That check still requires a
// live round trip to Postgres (it evaluates the request against
// pg_catalog), which is exactly what keeping the project warm needs, so
// 42501 from this specific query is treated as the expected, healthy
// outcome rather than a failure. Any other error (unreachable project,
// network failure, schema changed underneath this) is a genuine failure.
const EXPECTED_ANON_ERROR_CODE = '42501'

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
  const { error } = await supabase.from('metrics').select('id').limit(1)
  const reachedDatabase = !error || error.code === EXPECTED_ANON_ERROR_CODE

  return NextResponse.json({ ok: reachedDatabase }, { status: reachedDatabase ? 200 : 500 })
}
