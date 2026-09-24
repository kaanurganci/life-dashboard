# Life Dashboard

Mobile-first daily metrics dashboard on Next.js + Supabase. The database is the
source of truth and is exposed to Claude over MCP as a read-only role.

Design spec: `docs/superpowers/specs/2026-09-24-life-dashboard-design.md`

## Setup
1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in both Supabase projects.
3. `npx supabase link --project-ref <dev-ref>` then `npx supabase db push`
4. `npm run types`
5. `npm run dev`

## Tests
- `npm test` — unit and component tests
- `npm run test:db` — runs against the **dev** Supabase project
- `npm run test:e2e` — Playwright
