import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isProtectedPath } from '@/lib/supabase/guard'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
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

  const protectedPath = isProtectedPath(request.nextUrl.pathname)

  try {
    // Refreshes the token and writes the rotated cookies onto `response`.
    const { data: { user } } = await supabase.auth.getUser()

    if (!user && protectedPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  } catch (err) {
    // Fail closed on protected paths (e.g. Supabase unreachable, rate
    // limited, or misconfigured env vars) rather than trusting a thrown
    // error to fall through to an authenticated state. Never redirect an
    // already-open path (like /login itself) here, or an outage becomes an
    // infinite redirect loop.
    console.error(
      '[middleware] auth check failed:',
      err instanceof Error ? err.message : 'unknown error',
    )

    if (protectedPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
