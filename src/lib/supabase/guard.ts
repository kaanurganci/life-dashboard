const OPEN_PREFIXES = [
  '/login',
  '/auth',
  '/_next',
  '/icons',
  '/manifest.webmanifest',
  '/sw.js',
  '/favicon.ico',
  // Vercel's cron invoker sends a bearer token, never a browser session
  // cookie, so this must bypass the session guard or the cron would always
  // be redirected to /login before it even runs. The route authorizes
  // itself (CRON_SECRET, timing-safe compare) -- see
  // src/app/api/keep-warm/route.ts. Deliberately listed by exact path, not
  // a blanket `/api` prefix, so a future authenticated API route doesn't
  // silently inherit this exemption.
  '/api/keep-warm',
]

export function isProtectedPath(pathname: string): boolean {
  return !OPEN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}
