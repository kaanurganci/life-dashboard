import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isProtectedPath } from '@/lib/supabase/guard'

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Evaluated before the guarded region below so the fail-closed decision
  // never itself depends on anything that might have failed.
  const protectedPath = isProtectedPath(request.nextUrl.pathname)

  let supabase: ReturnType<typeof createServerClient>

  try {
    // Throws synchronously (not inside getUser()) when
    // NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing or
    // malformed -- e.g. a forgotten env var in Vercel. That's a deployment
    // misconfiguration, not a runtime blip, so it gets its own log message
    // distinct from the getUser() failure below.
    supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (toSet) => {
            toSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request })
            toSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options))
          },
        },
      },
    )
  } catch (err) {
    console.error(
      'auth middleware could not initialise: configuration error',
      err instanceof Error ? err.message : 'unknown error',
    )
    // Fail closed on protected paths; open paths (including /login itself)
    // render as-is so an outage doesn't become an infinite redirect loop or
    // a hard 500 on every static asset. The sign-in form will simply fail
    // on submit until the env vars are fixed -- that's the intended trade.
    return protectedPath ? redirectToLogin(request) : response
  }

  try {
    // Refreshes the token and writes the rotated cookies onto `response`.
    const { data: { user } } = await supabase.auth.getUser()

    if (!user && protectedPath) {
      return redirectToLogin(request)
    }
  } catch (err) {
    // Fail closed on protected paths (e.g. Supabase unreachable, rate
    // limited, a cookie-parse/token-decode error) rather than trusting a
    // thrown error to fall through to an authenticated state. Never
    // redirect an already-open path (like /login itself) here, or an
    // outage becomes an infinite redirect loop.
    console.error(
      'auth check failed:',
      err instanceof Error ? err.message : 'unknown error',
    )

    if (protectedPath) return redirectToLogin(request)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
