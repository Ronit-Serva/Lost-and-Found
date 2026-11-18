# Lost & Found — implementation roadmap

Updated: 2026-11-18. Phases 0–2 are complete. Phase 3 is next. The live test app is https://foundry-ashoka.vercel.app. Resume from the [handoff index](docs/handoffs/README.md) and [completed Phase 2 handoff](docs/handoffs/phase-2.md).

Read [objective.md](objective.md) for requirements and [techstack.md](techstack.md) for architecture. A phase is complete only when its exit checks pass and evidence is recorded here. Never mark mock-only behavior as a working integration.

## Phase overview

| Phase | Outcome | Status | Effort estimate |
|---|---|---|---|
| 0 | Product, technical, and delivery constitution | Complete | Documentation task completed |
| 1 | Foundation and integration feasibility | Complete | 2–3 developer days |
| 2 | Private campus reporting and dashboard | Complete | 3–4 developer days |
| 3 | Claims, email disclosure, notifications, and return | Not started | 4–6 developer days |
| 4 | Category-specific matching | Not started | 2–4 developer days |
| 5 | Release validation and campus pilot | Not started | 2–3 developer days |

Estimate: 13–20 focused developer days, assuming stack familiarity and available credentials. Account setup and any university OAuth restrictions can add calendar time. Estimates are planning ranges, not release promises. Phases run in order; the semantic feasibility spike belongs in Phase 1 even though the full feature arrives in Phase 4.

## Phase 0 — document the contract

Completed deliverables: refined objective.md, selected techstack.md, and this phased roadmap. Implementation record: [Phase 0 handoff](docs/handoffs/phase-0.md).

Exit check: stakeholder decisions preserved, implementation defaults distinguished from assumptions, General Items semantic matching and specialized string matching remain MVP scope, and each requirement maps to validation below.

Evidence: original stakeholder notes reviewed; documents created and cross-checked on 2026-11-14. Three-report quotas, specialized sections, and post-acceptance finder email disclosure were incorporated on 2026-11-14. No application functionality is claimed complete.

## Phase 1 — foundation and feasibility

Complete on 2026-11-14. Required implementation record: [Phase 1 handoff](docs/handoffs/phase-1.md).

Progress (2026-11-14): React/TypeScript/Vite scaffold, responsive dashboard preview, Google PKCE login, membership helper/signup migration, environment configuration, and Git repository are in place. Report/claim/notification behavior remains a preview; no listing persistence is claimed.

| Foundation check | Evidence / status |
|---|---|
| Real Google access | Project owner confirms Ashoka login, sign-out, account switching, personal-account rejection, and persistence after reload. Exact outsider error and alternate-provider configuration have not been independently inspected. |
| Reproducible local checks | Node 22 LTS (`.nvmrc`; local 22.16.0), locked npm/Deno dependencies, Supabase CLI 3.1.0. Local lint, Edge type checks, tests, and production build pass. |
| CI | GitHub Actions workflow implements locked installation and those checks. First GitHub-hosted run awaits a repository push; none has been performed by the agent. |
| Embeddings and pgvector | New probe migration and authenticated Edge Function are ready. pgvector 0.8.2 is installed in the hosted extensions schema and the probe is deployed. Project owner supplied a passing hosted run: three native 384-dimensional gte-small embeddings in 361 ms, pgvector ranking in 58 ms; related candidate ranked first. |
| Images and session checks | JPEG/PNG byte/dimension validation, resize/re-encoding, metadata removal, and transparency flattening pass locally in Deno. Hosted synthetic image processing passed in 57 ms with metadata removal and invalid-file rejection. Forced session refresh passed; anonymous invocation returned 401. This Phase 1 check used a small synthetic image. |

Validation (2026-11-14): six database regression tests pass using temporary PGlite/pgvector with synthetic Auth fixtures. Ten Deno tests pass for authorization gates, payload rejection before model work, budget handling, error sanitization, embedding validation, invalid/oversized image rejection, resizing, metadata removal, and transparent-image flattening. Native gte-small is not available in ordinary Deno; mocked handler dependencies do not establish a live model pass.

Probe implementation (historical): migration `20261114000200_phase1_probe.sql` enabled pgvector and added guarded RPCs plus a private three-attempt-per-day budget. It was removed in Phase 2 by migration `20261114000300_retire_phase1_probe.sql`; the deployed `phase1-check` function and local runner were deleted. The pgvector extension, Auth helper, and shared image sanitizer remain.

Hosted deployment evidence (2026-11-14): CLI authentication succeeded. The configured project was matched to `Uni Lost-Found` (`jdaertuqzbgfdnnpranl`, ap-south-1; hosted PostgreSQL 17). The agent applied migration `20261114000200_phase1_probe.sql` using the Management API SQL command and deployed `phase1-check` with server-side bundling. Read-only verification confirms pgvector 0.8.2 in `extensions`, the private usage table and budget RPC, and no anonymous execute grant on the budget RPC. Anonymous HTTP invocation returned 401 with correct localhost CORS. The local developer page returns HTTP 200. The later eligible-account run passed as recorded below; the anonymous checks did not consume a probe budget. SQL Editor/Management API applications still need migration-history reconciliation before using `db push`.

Probe fix (2026-11-14): the first signed-in browser run reached the request guard but was rejected because the hosted transport represented an empty POST as a non-null body stream. The guard now checks for actual bytes, permits empty streams, and cancels/rejects nonempty streams before budget allocation/model work. Added two regression tests; all ten Edge tests, Edge type checks, and lint pass. The rejected empty request did not consume a daily probe attempt. The subsequent authenticated native-model/image run passed.

Hosted runtime evidence (2026-11-14, project-owner-supplied browser JSON): [saved result](docs/evidence/phase1-runtime-2026-11-14.json) has `ok`, `session_refresh_passed`, and `anonymous_rejected` all true. Native gte-small produced three normalized 384-dimensional embeddings in 361 ms. pgvector query took 58 ms, ranking the related flask at 0.918357923324481 above the umbrella at 0.838503847211372. These cosine similarities are not ownership probabilities and the two-candidate smoke check does not satisfy the Phase 4 benchmark. Image processing took 57 ms, resized the 303-byte synthetic PNG to a 1600×38 JPEG (894 bytes), removed the metadata marker, and rejected the invalid fixture. Handler work after authorization/budget took 480 ms total; this excludes browser/network and authorization overhead. Cold/warm classification is unknown. This demonstrates runtime feasibility for the small fixture, not full-sized photo throughput or a measured memory bound.

Completion evidence (2026-11-14): project owner confirms Supabase Free with no credit card required. Combined with the saved hosted runtime results, account checks, local verification, and completed implementation handoff, Phase 1 is complete. CI is implemented with locally passing checks; its first GitHub-hosted run awaits a repository push. Migration history was reconciled and the temporary probe retired during Phase 2.

Goal: establish a runnable application and prove the risky integrations before building workflows. Covers O1 and prerequisites for O3.

1. Initialize repository/app structure, TypeScript, styling, routing, validation, lint/test/build scripts, environment template, and CI. Keep these constitution files at the project root.
2. Set up isolated Supabase development resources and migrations. Confirm no-card/free activation, deployment path, local development prerequisites, and current quotas.
3. Implement and test Google identity → verified Ashoka membership → protected data access. Apply the signup hook and membership helper; verify confirmed email suffix plus Google identity, returning login, refresh, logout, and denial for existing ineligible users. Require the helper in all subsequent data/storage policies.
4. Run native gte-small generation and a pgvector query on representative public descriptions; record invocation success, vector dimension, latency, and quota implications. Also validate server-side image validation/re-encoding in the selected runtime.
5. Build the responsive dashboard shell and a small synthetic fixture set for listings and user roles. Mock mode must be visibly separate from real authentication.

Exit: app runs and builds; valid Ashoka Google login works with a real test account; outsiders and forged metadata fail; native embeddings and image processing work on the selected free infrastructure. Record any university consent restriction or unverified capability as a blocker.

If real credentials are unavailable, scaffold and local tests may proceed; Phase 1 remains incomplete and no real-auth claim may be made.

## Phase 2 — listings and personalized discovery

Required handoff: `docs/handoffs/phase-2.md`. Create it from [the template](docs/handoffs/TEMPLATE.md) when starting this phase, maintain in-progress checkpoints, and complete it with the phase-specific implementation/evidence below before advancing.

Goal: eligible members can report and browse belongings privately. Covers O2 and report portions of O3.

1. Create typed report/ownership/photo schema and policies; implement create/edit/close actions and transaction-safe limits of three active lost and three active found reports across all sections.
2. Build My Listings with separate lost/found quota counters, a general directory, and dedicated ID Cards/Room Keys sections. Use minimal specialized forms and field-specific search; retain rich general forms and filters.
3. Add general-item image limits, private storage, metadata removal, temporary authorized reads, and cleanup. Reject photos/descriptions and other general fields for specialized reports.
4. Add general-item withheld-detail prompts and specialized ownership-evidence guidance; show only permitted name/identifier fields in specialized listings, never reporter account identity. Build quota-reached and other empty/loading/error states.
5. Validate owner/non-owner/outsider behavior, quota concurrency, slot release, section-specific schema enforcement, and mobile/keyboard use.

Exit: a member can publish and edit lost/found reports; another eligible member can discover them but cannot edit them or retrieve the owner's identity. Outsiders cannot retrieve listing data or images. Withdrawn/closed reports leave default discovery. Fourth lost/found reports are blocked independently across mixed sections; reserved found reports still count. Concurrent creation at two active reports permits exactly one additional report. Closing one frees exactly one slot.

Implementation checkpoint (2026-11-14): reconciled hosted migration history for versions `20261114000100` and `20261114000200`, then applied migrations `20261114000300`–`20261114000700`. A privacy review removed reporter UUIDs from photo object paths before any real photos were stored. The hosted database has typed reports, private report/photo metadata tables, server-enforced per-owner quota locks, safe JSONB listing RPCs, section-specific constraints, a private `report-photos` bucket, and three Storage policies. Deployed authenticated `report-photo` Edge Function and wired create/edit/close, directory, quotas, photo upload/read/remove in the app. Local PGlite report/photo checks (8) and Deno image/handler checks (7) pass; TypeScript production build passes. Remote inventory confirms migration versions 00100–00700, report/photo/storage-object counts are zero, private bucket, three Storage policies, no direct table SELECT grants, and no Phase 1 probe table/RPC/function. An anonymous Edge invocation returned 401.

Completion (2026-11-18): the project owner confirmed that the Phase 2 exit checks passed after the Vercel and Supabase photo upload fix. The [Phase 2 handoff](docs/handoffs/phase-2.md) records the owner confirmation and the available automated and hosted checks. Detailed walkthrough and concurrency results were not supplied.

Evidence to record: migration names, relevant test commands/results, and a short report/create/edit/filter walkthrough.

## Phase 3 — claims through confirmed return

Required handoff: `docs/handoffs/phase-3.md`. Create it from [the template](docs/handoffs/TEMPLATE.md) when starting this phase, maintain in-progress checkpoints, and complete it with the phase-specific implementation/evidence below before advancing.

Goal: two members can complete the core return journey. Covers O4 and O5.

1. Implement private claim submission, anonymous references, evidence access, duplicate/self-claim rejection, and claimant history.
2. Add finder accept/reject actions with row locking and uniqueness constraints; implement cancellation/withdrawal and re-opening rules.
3. Build acceptance disclosure notice and an accepted-claim-only finder email lookup with copy/open-mail actions. Parties arrange handoff independently; implement finder-confirmed return without an in-app collection scheduler.
4. Create notifications in the same transactions as their actions; add bell, read states, recipient isolation, deep links, and visible-tab polling.
5. Test lifecycle, concurrent acceptance, retries, third-user access, and email visibility: absent before acceptance, present only for the accepted claimant, absent after cancellation/withdrawal/completion. Claimant email is never automatically shared.

Exit: two users complete report → claim → acceptance → finder email disclosure → independently arranged handoff → return; linked lost report closes; other pending claims receive the correct outcome. Two concurrent accepts yield exactly one winner. Replayed requests create no duplicate events/notifications.

Evidence to record: integration and browser test results, notification transaction rollback test, and access-matrix results.

## Phase 4 — category-specific matching

Required handoff: `docs/handoffs/phase-4.md`. Create it from [the template](docs/handoffs/TEMPLATE.md) when starting this phase, maintain in-progress checkpoints, and complete it with the phase-specific implementation/evidence below before advancing.

Goal: useful backend suggestions connect lost and found reports within their section. Completes O3 with semantic General Items matching and deterministic ID-card/key matching.

1. Implement section routing: General Items use versioned public-text embedding jobs, authenticated processing, bounded retries, and rate limits; ID Cards/Room Keys use normalized indexed strings only.
2. Add opposite-type and availability filters, top-five retrieval, and suggestions on report details/dashboard.
3. Handle edits, stale embeddings, withdrawal, reservations, and model failure without blocking report saving.
4. Evaluate a fixed General Items English benchmark and specialized exact-match fixtures. Preserve keyword search as the general fallback; never use semantic fallback for ID cards/keys.
5. Test that evidence, finder email, and ID-card/key fields never enter semantic inputs/logs/responses. Assert zero model calls/jobs for specialized create, edit, search, and retries.

General Items benchmark acceptance: define at least 20 lost/found example pairs with differing wording and at least 10 distractors before tuning. Test both directions; the relevant counterpart must appear in the top five for at least 80% of eligible queries. Include ambiguous categories and differing campus locations. Record dataset and results; this is a pilot quality target, not a general accuracy claim.

Specialized acceptance: fixtures cover case/whitespace normalization, preserved leading zeros, missing optional ID-card fields, conflicting identifiers, same-name different-ID records, same-room different-name records, different blocks, and multiple identical candidates. All deterministic expected results must pass. Verify section isolation, both directions, availability filters, and zero model invocations even on failures.

Exit: both benchmarks pass, unavailable/own reports are excluded, general embedding failures recover, stale versions cannot overwrite newer embeddings, and specialized reports never reach the semantic pipeline. Keyword-only General Items search does not pass this phase.

## Phase 5 — release validation and pilot

Required handoff: `docs/handoffs/phase-5.md`. Create it from [the template](docs/handoffs/TEMPLATE.md) when starting this phase, maintain in-progress checkpoints, and complete it with the phase-specific implementation/evidence below before advancing or declaring the MVP complete.

Goal: release a usable MVP with demonstrated access boundaries and operations. Covers all O1–O5.

1. Run the complete journey for general items, ID cards, and room keys with at least two eligible accounts; verify quota enforcement and accepted-only email access, plus outsider/third-member denial checks. Resolve critical failures.
2. Check 360 px mobile and desktop layouts, keyboard navigation, form errors, slow/network-failure states, and notification persistence across sessions.
3. Measure search/list performance and resource use with 1,000 synthetic reports; target first-page and search responses within 3 seconds after warm-up on a normal connection. Record cold starts separately and optimize before claiming the target.
4. Configure production redirects/secrets, demonstrate database-and-image export/restore, document recovery from inactivity/quotas, and remove synthetic data from production.
5. Prepare a reviewable deployment and release checklist here, publish when authorized, and collect pilot feedback from 3–5 participants.

Exit: all objective.md acceptance criteria pass, no unresolved critical privacy/lifecycle defects remain, and production works within verified free/no-card constraints. Record deployment URL, commit, test summary, known limitations, and feedback before marking complete.

Pilot feedback tasks are planned, not authorization to contact participants. Ask the project owner to supply or authorize outreach when needed.

## Dependencies and open checks

| Check | Owner / action | Required by |
|---|---|---|
| Supabase and hosting access | Supabase access confirmed; Vercel Hobby test app deployed at https://foundry-ashoka.vercel.app on 2026-11-18; Phase 2 exit accepted by owner | Phase 5 release validation |
| Google OAuth credentials and university policy | Real login/session/outsider checks passed; inspect publishing/redirect restrictions when preparing the campus pilot | Phase 5 release |
| Eligible audience | Default is all Google-authenticated users with a confirmed @ashoka.edu.in email; owner may narrow with a reliable student source | Before pilot |
| Free embeddings and image processing | Hosted Phase 1 smoke checks and Free/no-card setup passed; report-photo endpoint is deployed; full-sized photo performance and detailed Storage evidence remain release validation items | Phase 5 operations |
| Location choices and email-disclosure wording | Verify with project owner/pilot participants | Before pilot |

The Phase 1 account/runtime/free-plan checks are complete as recorded above. Production hosting, campus input, and later workflow validation retain their phase-specific requirements. During implementation, record any concrete blocker in the active phase handoff.

## Progress and change discipline

- Update phase status only against exit evidence. Keep one primary phase in progress.
- A complete implementation handoff is mandatory before marking any phase complete or starting its successor. Record it at `docs/handoffs/phase-N.md`, link it from that phase and the handoff index, and update the constitution where decisions changed.
- Change product behavior in objective.md first, architecture in techstack.md, then reconcile affected phases here.
- Record material decisions below with their reason and affected requirements; do not silently defer semantic matching or privacy.
- Later features require an explicit scope revision rather than expanding the MVP during implementation.

## Mandatory transition and session handoff gate

1. Meet the phase's exit checks and record actual implementation, file map, data/API/security contracts, environment/deployment/migration state, verification evidence, limitations/recovery, and next tasks in its handoff. Use [the template](docs/handoffs/TEMPLATE.md); a brief progress summary alone is insufficient.
2. Cross-check paths/commands and deployed-vs-local state. Record the branch/commit or uncommitted/untracked status. Label owner-reported, agent-verified, synthetic, and pending evidence explicitly; include no secrets or private records.
3. Reconcile objective.md, techstack.md, roadmap.md, and [the handoff index](docs/handoffs/README.md). Only then mark the phase complete and permit the next phase. No new user approval is implied by this documentation gate.
4. For a pause or session/agent change before completion, save an in-progress handoff with the exact stopping point, pending work, blocker/input if any, and first action on resume. Keep the phase in progress.
5. The incoming agent reads the constitution, latest completed handoff, and any active checkpoint before changing code. Final Phase 5 completion also requires an operational handoff, even with no subsequent phase.

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-11-14 | Detailed implementation handoff required at every phase/session boundary | Explicit user request: another agent must be able to resume without prior chat history; applies before each next phase and final release. |
| 2026-11-14 | Dashboard, finder-controlled claims, private identities, withheld distinguishing details | Preserved stakeholder requirements. |
| 2026-11-14 | Google-only confirmed Ashoka email access and in-app notifications | Uses university identity and avoids an email delivery dependency. |
| 2026-11-14 | React/Vite + Cloudflare Pages + Supabase | Small deployable architecture under the no-card/free constraint. |
| 2026-11-18 | Owner selected Vercel instead of Cloudflare Pages; publish the existing app for two-device Phase 2 tests | Explicit owner hosting choice. Vercel Hobby project `foundry-ashoka`; Supabase backend and Ashoka-only data access continue. |
| 2026-11-14 | Native gte-small + pgvector for General Items; indexed strings for ID Cards/Room Keys | Preserves semantic matching where useful while avoiding model compute for structured identifiers. |
| 2026-11-14 | Finder email disclosed only after validated acceptance; parties coordinate independently | User feedback replaces the earlier structured collection proposal design; no SMTP or in-app scheduler needed. |
| 2026-11-14 | Node/PGlite and Deno tests plus a guarded hosted feasibility probe | SQL and Edge checks run without Docker; native model/runtime evidence stays a separate completion gate. |
| 2026-11-14 | Eligibility uses Google login plus confirmed @ashoka.edu.in email suffix; no hosted-domain requirement | Explicit user choice (option 1); enforce with signup hook and ongoing database membership helper. |

### Feedback incorporated on 2026-11-14

- Three active lost and three active found reports per member, across every section; reserved found reports count until closed.
- Dedicated minimal ID Cards and Room Keys forms with normalized string matching and no semantic computation.
- Finder email disclosure only to the accepted claimant; private evidence and other account information retain their access restrictions.

## Next implementation action

Phase 3 is next. When starting it, create its handoff from the shared template and implement claim submission, private evidence access, and duplicate and self-claim rejection. Follow the existing report lock contract. See the [Phase 2 handoff](docs/handoffs/phase-2.md).
