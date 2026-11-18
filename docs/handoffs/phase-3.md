# Phase 3 — implementation handoff

## Status and resumption

| Field | Record |
|---|---|
| Phase / scope / objective IDs | Phase 3 — private claims, contact disclosure, notifications and confirmed return (O4, O5) |
| Status | In progress. Local checkpoint covers claim submission and private claimant/finder history. |
| Updated | 2026-11-19 |
| Next phase allowed? | No. The remaining lifecycle and Phase 3 exit checks are pending. |
| First task for the next agent | Implement finder acceptance and rejection in a new migration. Serialize with the Phase 2 owner advisory lock and found-report row lock. Then wire the actions into My claims. |

Working tree started clean on `main` at `abd2fa7`. Phase 3 source and migration are uncommitted and local. The hosted site and database still run Phase 2.

## Implemented behavior and decisions

A signed-in member can open the claim form from a found result, enter private identifying details and optionally attach one of their own lost reports. The browser opens My claims after a successful submission. My claims lists outgoing and incoming claims with the found title, opaque claim reference, status and expandable evidence. A linked lost title is shown only to the claimant. The finder gets a durable submission notification in the database. Recipient reads, bell and polling are pending. If the finder withdraws the open found report, any pending claims become rejected with the reason “report withdrawn,” and their claimants receive durable outcome notifications. This rule is recorded in the [product constitution](../../constitution/objective.md).

Evidence is text only and accepts 1–2,000 characters after trimming. Links can target an existing lost report owned by the claimant, including reports already closed. The future return transaction must resolve only an open linked lost report. Both parties receive the same anonymous UUID reference. Neither account's identity nor contact information is included in these APIs.

## File and component map

| Path | Responsibility |
|---|---|
| [20261119000100_claim_submission.sql](../../supabase/migrations/20261119000100_claim_submission.sql) | Claim, event and notification tables plus submit/history RPCs. |
| [Claims.tsx](../../src/Claims.tsx) | Claim form, retry key and private history. |
| [App.tsx](../../src/App.tsx) and [App.css](../../src/App.css) | Found-card action, My claims navigation, native modal and dashboard styling. |
| [database.test.mjs](../../tests/database.test.mjs) | Local PostgreSQL fixture and database tests. |

## Data, API, and security contracts

- `private.claims` holds `id`, `found_report_id`, `claimant_id`, `lost_report_id` and `request_id` as UUIDs, plus `evidence text`, `status public.claim_status` and `created_at timestamptz`. The enum includes all six planned statuses. Submission creates `pending`; report withdrawal can change it to `rejected`. Partial unique indexes constrain one active claim per claimant/item and one accepted claim per item. History indexes cover found-report and claimant lookups. The found and claimant foreign keys cascade deletes, and deletion of the linked lost report clears the link. Phase 2 has no member-facing hard deletes.
- `private.claim_events` holds UUID `id`, UUID `claim_id`, claim `status`, nullable `reason text` for rejections, and `created_at timestamptz`, unique per claim and status. `private.notifications` holds UUID `id`, UUID `event_id`, UUID `recipient_id`, `created_at timestamptz` and nullable `read_at timestamptz`, unique per event and recipient and indexed by recipient and creation time. Neither table stores evidence or contact details.
- `submit_claim(p_found_report_id uuid, p_request_id uuid, p_evidence text, p_lost_report_id uuid default null) → uuid` takes a found-report row lock, rejects self-claims, unavailable reports, invalid lost links and duplicate active claims, and inserts the claim, submission event and finder notification in one transaction. Identical replays under the same claimant/request key return the existing claim UUID without another write. The transaction does not change report status or quota counts. The browser retains the request key while an unchanged form is retried.
- The existing `close_report(p_report_id uuid) → void` still accepts only an owned open report and takes the owner advisory lock before updating the report row. On found withdrawal, it rejects pending claims with `report withdrawn` and writes a corresponding event and notification per claimant in the same transaction. On lost resolution it updates only the lost report.
- `list_my_claims() → jsonb` yields `id`, `role`, `found_title`, `section`, `status`, `evidence`, `created_at` nullable `outcome_reason` and nullable `lost_title`, newest first. The claimant and the found-report owner are the only eligible readers. A finder receives a null `lost_title`. An unrelated eligible member sees only their own records.
- The public RPCs are granted to `authenticated`, use `SECURITY DEFINER` with an empty search path, and require `public.is_ashoka_member()`. The private tables enable RLS and revoke direct access for browser roles. The history and form use component memory. Storage buckets and photo authorization are unchanged.

## Local setup and deployment state

| Resource | State and reproduction |
|---|---|
| Tools | Node 22.16.0. Dependencies and runner versions use the existing lockfiles. Run `npm ci` when needed. |
| Environment | Existing ignored `.env.local` uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. This slice introduces no provider settings or variables. Use an isolated Supabase environment with the new migration for a local end-to-end run. |
| Supabase | Project `jdaertuqzbgfdnnpranl` had migrations `20261114000100`–`20261114000700` applied on 2026-11-19. `npx supabase migration list --remote=jdaertuqzbgfdnnpranl` verified the baseline. Migration `20261119000100` is local. |
| Vercel / CI / source | `https://foundry-ashoka.vercel.app` returned HTTP 200 on 2026-11-19. The Phase 3 working-tree changes have no deployment or hosted CI run. |

Run `npm run dev` for the frontend, `npm run test:db` for the isolated PGlite SQL suite, and `npm run lint`, `npm run build`, `npm run check:edge`, and `npm run test:edge` for repository checks. See the [Phase 2 handoff](phase-2.md) for the existing Auth and photo configuration.

## Verification and evidence

| Check | Procedure | Result |
|---|---|---|
| Frontend build and lint | `npm run build`, `npm run lint` | Local pass on 2026-11-19. |
| Hosted baseline | Migration list and HTTPS fetch above | Phase 2 migrations confirmed and app HTTP 200. |
| Synthetic access, replay, withdrawal and rollback | `npm run test:db` | All 11 tests passed on 2026-11-19. Added three claims tests covering claimant/finder/third member/outsider/anonymous access, optional link ownership, self-claim and active-duplicate blockers, replays, notification recipients and rollback of claim/event/request ID on notification insert failure. |
| Existing Edge/image regression checks | `npm run check:edge && npm run test:edge` | Type check and all eight tests passed. |
| Browser checks | Isolated Chrome with synthetic session and RPC responses, 360 px and 1280 px | Passed on 2026-11-19. From Discover → Found, open Claim this item by keyboard, link a lost report, submit multiline evidence, retry a simulated 503 with the same payload and key, and inspect the pending item in My claims. Verified dialog focus trapping and Escape restoration, focus after navigation, finder view with the linked title hidden, and no horizontal overflow. Browser verification used mocks and made no hosted requests. |

## Known limitations, recovery, and maintenance

- Finder decisions, withdrawals, cancellation, confirmed return, accepted-only email and recipient-facing notifications still need implementation. The database stores the submission event and notification so the later notification feed can include submissions.
- Actual hosted accounts, independent handoff and two-connection contention remain Phase 3 exit checks. PGlite synthetic tests do not establish multi-session locking behavior.

## Next agent: start here

1. Inspect the working tree and hosted migration state. Keep the Phase 3 migration and UI together in any eventual deployment.
2. Implement finder acceptance and rejection against the existing partial unique index and the Phase 2 locking contract. Acquire the report owner's quota advisory lock before the found-report row lock and recheck claim status after locking. For return with a linked lost report, acquire both quota advisory keys in deterministic order before taking report or claim row locks. Commit the claim update, report reservation where applicable, event and notification atomically.
3. Add cancellation/withdrawal, accepted-only email, return and notification workflow. Run the lifecycle, two-connection race, rollback, access-matrix and browser exit checks. Record any missing eligible accounts or hosting access when those checks are reached.

## Phase completion gate

- [ ] Roadmap exit checks pass and limitations have owners.
- [x] Implemented checkpoint behavior, file map, contracts, security and setup are recorded.
- [x] Working tree and hosted baseline are identified.
- [x] Constitution, roadmap and handoff index show Phase 3 in progress.
- [x] The next task can be resumed from the repository.
