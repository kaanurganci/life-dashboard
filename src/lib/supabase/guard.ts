const OPEN_PREFIXES = [
  '/login',
  '/auth',
  '/_next',
  '/icons',
  '/manifest.webmanifest',
  '/sw.js',
  '/favicon.ico',
]

export function isProtectedPath(pathname: string): boolean {
  return !OPEN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}
