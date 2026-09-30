// Matches the path itself AND everything beneath it (`p` and `${p}/...`).
// Only for prefixes where the whole subtree is genuinely meant to be open.
const OPEN_PREFIXES = [
  '/login',
  '/auth',
  '/_next',
  '/icons',
]

// Matches the path itself and NOTHING beneath it. For routes that must stay
// open but whose subtree should not automatically inherit that exemption.
const OPEN_EXACT_PATHS = [
  '/manifest.webmanifest',
  '/sw.js',
  '/favicon.ico',
  // Vercel's cron invoker sends a bearer token, never a browser session
  // cookie, so this must bypass the session guard or the cron would always
  // be redirected to /login before it even runs. The route authorizes
  // itself (CRON_SECRET, timing-safe compare) -- see
  // src/app/api/keep-warm/route.ts. Listed here (exact match only), not in
  // OPEN_PREFIXES and not as a blanket `/api` prefix, so a future route
  // nested under this path -- e.g. /api/keep-warm/status -- does NOT
  // silently inherit the exemption; it stays protected by default.
  '/api/keep-warm',
]

export function isProtectedPath(pathname: string): boolean {
  const isOpen =
    OPEN_EXACT_PATHS.includes(pathname) ||
    OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  return !isOpen
}
