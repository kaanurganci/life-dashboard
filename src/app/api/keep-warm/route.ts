import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Free-tier Supabase projects pause after ~7 days idle. One weekly select
// guarantees the project stays awake even during a week away.
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { error } = await supabase.from('metrics').select('id').limit(1)

  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 })
}
