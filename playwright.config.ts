import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

// Playwright runs as its own Node process (not through Next), so it needs
// its own .env.local load -- Next's dev server loading .env.local doesn't
// reach this process or the test files below.
config({ path: '.env.local' })

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['iPhone 14'],
    // The iPhone 14 device preset defaults to WebKit (real iPhones run
    // Safari), but only Chromium is installed/verified for this task per
    // the brief ("npx playwright install chromium"). Force Chromium while
    // keeping the rest of the iPhone 14 emulation (viewport, UA, touch).
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    // NEVER reuse a server someone else started: a dev server launched by hand
    // is pointed at the LIVE project by .env.local, and reusing it would run
    // the e2e suite -- which creates and deletes auth users -- against real data.
    reuseExistingServer: false,
    // Shell env beats .env.local in Next, so this forces the app under test onto
    // the empty test project regardless of what .env.local says.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_TEST_URL!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_TEST_ANON_KEY!,
    },
    timeout: 120_000,
  },
})
