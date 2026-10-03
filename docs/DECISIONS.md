# Decisions and known issues

Written during the Phase 1 build (2026-09-24 → 2026-10-03). Every entry is a
decision taken against what the spec said, or a defect we know about and chose
not to fix. If something here looks wrong, it probably is — these were judgement
calls, and the reasoning is recorded so you can overturn them rather than
rediscover them.

The spec is `docs/superpowers/specs/2026-09-24-life-dashboard-design.md`.
Where this file and the spec disagree, **this file is what shipped**.

---

## Decisions that reversed the spec

**Views use `security_invoker = on`.** The spec called for definer-rights views
so a future MCP role could read them. But the app queries `v_daily_summary` as
`authenticated`, and a definer-rights view bypasses RLS on its base tables — so
the app's main read path would have had no row-level protection at all.
Invisible with one user, a leak with two. MCP access moves to Phase 5 as
separate wrapper views granted only to a read-only role.
*Cost if wrong:* Phase 5 must create those wrapper views before MCP works.

**Every table-creating migration carries explicit GRANTs.** The spec specified
RLS everywhere and never mentioned grants. Postgres checks privileges *before*
policies, so without them every query failed `42501` before RLS was consulted.
`authenticated` gets select/insert/update/delete, `service_role` gets all,
`anon` gets nothing.

**Next 16, not 15.** `create-next-app@latest` yields 16, and every App Router API
in use is unchanged. Consequences: `next lint` was removed (the script is plain
`eslint`); `middleware.ts` is now `proxy.ts`; Serwist does not build under
Turbopack, so there is no offline app shell.

**Sliders read `occurrence = 1` only.** `v_daily_summary` originally used
`max(value_num)`, which returned the *largest* same-day value rather than the
current one — log 8, correct to 5, and it kept reporting 8. The unique
constraint guarantees at most one row per occurrence, and the app always writes
occurrence 1.
*Cost if wrong:* a reading logged only at occurrence 2 shows as blank. The fix is
one expression: `(array_agg(value_num order by occurrence) filter (...))[1]`.

**Habits count distinct metrics, sliders pin to occurrence 1.** These are
deliberately inconsistent. A habit true at *any* occurrence counts as done —
you cannot un-take a supplement — whereas a slider is a judgement with one
canonical value.
*Cost if wrong:* a "correction to false" cannot bring `habits_done` back down.

**Mutation `scope` was rejected for the rollback race, then adopted for
ordering.** They are different problems. TanStack evaluates `scope` at mutation
*definition* time, so a single hook cannot vary it per call; the rollback fix is
instead an identity check that leaves a superseded slot alone. Ordering needed
per-slot scopes built imperatively via the mutation cache.

---

## Known issues we are shipping with

Ordered by how much they could cost you.

1. **No offline app shell.** Serwist breaks the Next 16 build under Turbopack.
   Writes made offline still queue and drain — that machinery is IndexedDB inside
   the app and does not depend on a service worker — but opening the app *cold*
   with no connection shows the browser's offline page. Treat it as "open before
   the gym", not "cold-start in a basement".

2. **Persist loss in a narrow window.** Persistence is throttled to about a
   second, so an app killed immediately after a write can lose it, and in the
   worst case replay an older value over a newer one. Needs a client timestamp
   plus server-side last-write-wins.

3. **Two tabs share one IndexedDB key.** Both restore the same outbox and can
   overwrite each other's. Same fix as above.

4. **A cold load where the user cannot be resolved** (both `getUser` and the
   cookie fallback fail — an auth outage) runs under the anonymous key with no
   persister, so a write made in that window is memory-only. Earlier sessions'
   data is untouched.

5. **Sign-out discards unsynced writes**, by design: clearing the cache is what
   stops a second account inheriting the first's data.

6. **`v_daily_summary` history drifts.** `habits_total` counts *currently* active
   habits, so retiring a supplement changes the denominator of every past day.
   Fine for the dashboard, actively misleading to an AI reading history.
   **Fix this before Phase 5.**

7. **`logged_at` is server time.** An entry made offline is stamped when it
   syncs, not when you tapped. Nothing records the client event time.

8. **No test coverage** for `kind='text'` or `kind='duration'`, or for a scale
   metric with exactly one bound set. All three are correct by inspection and
   unreachable from the current UI.

9. **Three seeded metrics have no UI**: `bodyweight_kg`, `resting_hr`, `hrv_ms`
   are `numeric`, and the morning card renders only `scale` and `boolean`. They
   sit in the registry, unloggable, awaiting either a numeric input or the
   Phase 5 Apple Health webhook.

10. **`v_daily_summary` is granted to `authenticated` only**, not `service_role`.
    A server-side read of the view returns `42501`. Deliberate: MCP gets its own
    role, and `service_role` is the key we agreed never to hand an agent.

---

## Things that bit us, so they don't bite you

Each of these was invisible on paper and obvious within seconds of real
execution. They are recorded because the same mistake is easy to repeat.

- **`middleware.ts` at the repo root is silently ignored** when a project uses
  `src/`. No error, no warning — the auth guard simply never runs and every
  protected route serves to anyone. It must be `src/proxy.ts`.

- **A `BEFORE` trigger fires before `CHECK` constraints.** Our validation trigger
  raised its own error before `exactly_one_value` could produce its code, so the
  trigger now only inspects rows that already have exactly one value.

- **PostgREST derives an array insert's column list from the first object.** Any
  key missing there is inserted as `NULL` rather than taking the column default.
  This is why `buildEntryPayload` returns every value column explicitly — do not
  "tidy" that away.

- **`NaN` passes every `typeof` guard**, and every comparison with it is `false`,
  so range checks silently do not fire. It then serialises to JSON `null`.
  `Number.isFinite` is the guard.

- **TanStack persists queries as well as mutations.** A query inside its
  `staleTime` is restored and treated as fresh, so a registry change stayed
  invisible for an hour and survived a hard refresh. Hence
  `refetchOnMount: 'always'`.

- **Retry classification must be an allowlist of transient errors**, not a
  blocklist of permanent ones. The blocklist version retried unknown errors
  forever and blocked a slot permanently; an over-strict allowlist deleted
  writes on an expired token. Both are data loss in opposite directions.

- **Three comments in this codebase once claimed more than the code did** — a
  `try` that started after the throwing line, an exemption described as exact
  that matched a subtree, and "the client recomputes on mount" where nothing
  recomputed. All three are fixed. A wrong comment is worse than none, because
  it tells the next reader not to check.
