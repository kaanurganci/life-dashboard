import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const origin = request.nextUrl.origin

  if (!code) {
    // Supabase redirects back with its own `error`/`error_description` when
    // the link is expired, already used, or denied — most commonly after the
    // ~1 hour OTP expiry. Map to our own fixed vocabulary and never echo
    // Supabase's error_description into the redirect URL.
    const supabaseError = request.nextUrl.searchParams.get('error')
    const supabaseErrorCode = request.nextUrl.searchParams.get('error_code')

    if (supabaseError === 'access_denied' || supabaseErrorCode === 'otp_expired') {
      return NextResponse.redirect(`${origin}/login?error=link_expired`)
    }

    if (supabaseError) {
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }

    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  return NextResponse.redirect(origin)
}
