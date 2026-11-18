# Lost & Found — technical constitution

Updated: 2026-11-18. Status: Phase 2 reporting is complete. See [the completed Phase 2 implementation handoff](docs/handoffs/phase-2.md).

Read with [objective.md](objective.md) and [roadmap.md](roadmap.md). Product requirements govern technical decisions. Do not substitute a paid dependency or weaken access controls to bypass an integration problem.

## Selected stack

| Layer | Choice | Purpose |
|---|---|---|
| Frontend | React + TypeScript + Vite; React Router | Static single-page application with dashboard, directory, reports, claims, and notifications. |
| UI and data | Tailwind CSS; accessible native controls; TanStack Query; Zod | Responsive styling, cached server state/polling, shared input validation. |
| Backend | Supabase Free: PostgreSQL, Auth, private Storage, Edge Functions | Persistent records, Google login, controlled uploads, server-side workflows. |
| Search | PostgreSQL full-text search + pgvector; built-in Edge Runtime gte-small embeddings | Indexed normalized string matching for ID cards/keys; keyword fallback and semantic retrieval for general items without a paid AI API. |
| Delivery and validation | Vercel Hobby; GitHub Actions; npm; Node test runner + PGlite/pgvector; Deno tests | Static hosting, reproducible installs, SQL authorization checks, Edge handler and image tests. Add Testing Library/Playwright when interactive workflows are implemented. |

Use a supported Node.js LTS and mutually compatible stable packages when scaffolding. Pin resolved dependencies in package-lock.json and record the Node version. Avoid prescribing unverified package versions in this document.

Foundation tooling verified locally: Node 22.16.0; `.nvmrc` and CI select Node 22 LTS. npm locks Deno and Supabase CLI versions; `supabase/functions/deno.lock` locks Edge dependencies. Ordinary Deno can check/test the handler and image code; native `Supabase.ai.Session` requires the Supabase Edge Runtime.

No Next.js server, separate Node/Django API server, microservices, Redis, or external vector database is needed for this architecture.

## Deployment boundaries

Browser → Vercel-hosted React application.
Browser → Supabase Auth for login/session management.
Authenticated browser → RLS-protected PostgreSQL APIs and private Storage.
Authenticated browser → Edge Functions for embeddings; functions enforce the database membership check.
PostgreSQL functions → atomic report quotas, claim/return transitions, restricted finder-email lookup, and notifications.

Configure SPA route fallback in `vercel.json`. Host the initial site on its provided subdomain with HTTPS. Production and preview OAuth redirect URLs must be explicitly registered. The owner selected Vercel on 2026-11-18; the Phase 2 test URL is `https://foundry-ashoka.vercel.app`.

The browser receives only the Supabase URL and publishable key. Service-role keys, OAuth secrets, and database credentials remain in provider secret stores/local ignored environment files. Commit a names-only .env.example. Do not log tokens or private claim bodies.

## Authentication and authorization contract

1. Enable Google as the only end-user authentication provider; disable email/password, email OTP, phone, anonymous login, and other social providers. Request basic identity scopes only; no Gmail, Drive, or contacts access.
2. Use Supabase's Google OAuth flow with PKCE. Supabase handles the provider exchange and session issuance. Eligibility is a confirmed email ending exactly in `@ashoka.edu.in` (case-insensitive), with a corresponding Google identity. This is the user's explicit email-suffix choice; no Google hosted-domain (`hd`) requirement or separate membership-grant service is needed.
3. Reject new users from other domains/providers with a Before User Created PostgreSQL hook. The hook does not require email confirmation before OAuth signup has completed. Disable alternate authentication providers in both local and hosted configuration.
4. Enforce ongoing access with `public.is_ashoka_member()`: resolve `auth.uid()` against current protected `auth.users` and `auth.identities` records; require `email_confirmed_at`, Google provider metadata, and a Google identity whose email matches the account's current eligible email. Do not use user-editable metadata. The function returns only a boolean for the caller and accepts no user ID.
5. Require this helper in every data/storage policy and sensitive function. The browser calls it before showing the dashboard; that call is a user-experience check, while database policies remain mandatory. Signup hooks do not govern existing users and cannot replace these policies.

This policy checks the confirmed Google email, not proof of Workspace management or current enrollment. The OAuth `hd` parameter may remain a sign-in hint. Invalid or expired access tokens are rejected by Supabase; logout clears the client session. Already issued access tokens may remain valid until expiry, so do not promise immediate global token revocation on logout.

Phase 1 must demonstrate eligible login, refresh/logout, server rejection of outsiders and forged user metadata, and database denial for existing ineligible users. Migration SQL and frontend checks are not evidence that hosted configuration has been applied.

All tables exposed to the client require Row Level Security. Keep ownership IDs, identity mappings, and internal events in restricted tables; provide safe listing projections without peer identity IDs. Views must preserve authorization. Database functions with elevated privileges need explicit caller checks, fixed search_path, and narrow grants.

## Logical data model

| Group | Records and access |
|---|---|
| Identity | Protected Supabase Auth users/Google identities and private profiles; shared membership helper for policies. Verified finder email is exposed through a narrow accepted-claim lookup only; no broad peer profile access. |
| Listings | Common type/section/status/ownership metadata; general-item text/photos or typed ID-card/key fields with normalized indexed values. Campus-visible projections follow the explicit field exceptions in objective.md. |
| Claims | Found-report reference, claimant mapping, optional lost-report link, evidence, status, timestamps. Only involved parties; no claimant identity in finder-facing projections. |
| Contact access | No collection-proposal table. An authorized function returns only the finder email for the current accepted claimant; claim status governs access. |
| Operations | Recipient notifications; private lifecycle events; embedding records and retry jobs with content versions. |

IDs are opaque; do not treat unguessability as authorization. Use UTC timestamps and show Asia/Kolkata dates/times. For general reports, store approximate event dates separately from creation timestamps. ID-card/key reports only need the system creation timestamp.

Enforce lifecycle rules from objective.md in PostgreSQL transactions. Lock the affected found report on acceptance; add a database uniqueness constraint for one accepted claim per found item and one active claim per claimant/item. Derive notification recipients server-side.

Use request/event uniqueness keys so retried writes do not duplicate notifications. Persist action, lifecycle event, and notification together. A failed notification insert must roll back the action rather than silently losing the notification.

## Report limits and structured fields

Enforce a maximum of three active lost and three active found reports per user across all sections. Active = open lost; open/reserved found. Closed/withdrawn records are excluded. Lock a stable per-user quota/ownership row inside each create transaction, count active reports of the requested type, then insert or reject. Locking existing listing rows alone is insufficient when there are no rows yet.

All mutations that affect quota counts must use the same locking discipline; prevent direct client inserts/updates from bypassing it. Report type/section are immutable in the MVP. A failed create has no report, photo, job, or notification side effects. Client counters are informative; the database is authoritative. Keep per-hour rate limits separate from these active-report quotas.

Use discriminated schemas in client and backend validation: General Items retain their rich fields; ID Cards accept name/roll number/ID number with at least one identifier; Room Keys require room number/name. Reject extra general-item fields for specialized reports. Apply corresponding database constraints. Preserve identifiers as text, including leading zeros; normalize case/whitespace only, without collapsing meaningful punctuation or building codes.

## Finder email disclosure

Expose a restricted server/database function taking claim ID. Require eligible session, caller = claim claimant, and current status = accepted. Resolve the finder from the found report, retrieve their provider-verified Ashoka email from backend-controlled identity data, and return only that address. Never trust editable profile metadata or caller-supplied owner IDs/emails.

Read current status on every request, with no shared cache or persistent client storage of the email. Clear the UI/query cache on logout and status changes. Rejected, pending, withdrawn, cancelled, completed, and unrelated claims receive no email. Previously copied email cannot be revoked. Do not place it in notifications, listing projections, analytics, URLs to our app, or logs. A user-initiated mailto link opens their own email client; the app requires no SMTP service or Gmail scope.

## Image handling

General Items only; specialized reports reject image attachments. Private bucket; authenticated upload ownership checks and temporary signed reads for eligible members. Validate actual image content and size server-side, re-encode accepted images to remove metadata, and reject unsupported formats.

Initial application limits: three photos per report, 5 MB maximum incoming image, resize to at most 1600 px longest edge, aim for 250 KB stored image and cap at 500 KB. If this cannot be met, ask for a smaller image. Use a maintained image-processing library compatible with the chosen runtime; validate this in Phase 1.

Initial accepted formats are JPEG and PNG, verified from file bytes rather than browser MIME labels. ImageScript performs decoding and JPEG re-encoding without native binaries. Check input dimensions before decoding, with a 12-million-pixel processing cap; copy pixels into a fresh image, flatten transparency onto white, resize, and omit source metadata. Try bounded JPEG quality levels and reject outputs above 500 KB. The Phase 1 synthetic fixture and Phase 2 local image-handler tests verify these operations. The hosted Phase 2 photo endpoint is deployed; the owner confirmed Phase 2 acceptance. Detailed storage access results and measurements for full-sized photos are unavailable.

On edit/withdrawal, remove obsolete objects safely and prevent orphan accumulation. Photo content is visible to eligible members; private ownership evidence is text-only in this MVP.

## Deterministic ID-card and key matching

Route by report section before creating jobs or executing a search. ID Cards and Room Keys use indexed PostgreSQL string comparisons and never invoke embedding/model endpoints, including retries or edits. General queries exclude these specialized records.

For ID Cards, require an exact normalized match on a shared roll or ID number; reject pairs with any conflicting shared identifier. An exact name can order candidates with matching identifiers, but never substitute for the required identifier match. For Room Keys, require exact normalized room number and holder name. Return eligible, opposite-type, available records in the same section; exclude own reports. Order ties deterministically by creation time and ID; return up to five candidates. Field-specific browsing/search may show partial text results but must not label them exact matches or verified owners.

## Backend semantic pipeline — General Items only

- Store a versioned search document containing title, category, public description, and approximate location. Date/type/availability are structured filters, not ownership evidence.
- Generate normalized 384-dimensional vectors using Supabase Edge Runtime gte-small. Run embeddings only on the backend; no external paid model key. Hosted native generation passed the Phase 1 probe (three 384-dimensional embeddings in 361 ms). The project owner confirmed Supabase Free with no credit card required on 2026-11-14.
- A General Items report write commits a pending embedding job with its content version. The function processes it after commit; a scheduled bounded retry catches failures. Only store a result if its version still matches; delete/ignore stale jobs for withdrawn records.
- Search using a restricted PostgreSQL function with cosine similarity and eligibility filters. Exact vector scans are sufficient for the pilot; add an index only if measured performance requires it.
- Return up to five candidates. Tune ranking/thresholds against the fixed benchmark in roadmap.md; similarities are not probabilities. Exclude private fields and all ID-card/key fields from semantic indexing and responses.

Authenticate and rate-limit generation/query endpoints; deduplicate work for unchanged reports. Proposed pilot limits: 10 report writes per user/hour and 30 semantic queries per user/minute, enforced server-side and adjustable after measurement. Track queued, failed, and completed embeddings without logging private content. Reject requests to embed specialized report IDs; specialized search must not call the model even during failure recovery.

## Notification implementation

Use durable PostgreSQL rows, TanStack Query refresh on focus/open, and a 60-second visible-tab polling interval. RLS permits recipients to read their own notifications and mark their own read_at only; creation and recipient changes are backend-only. Notification text contains neutral event summaries and authorized deep links.

Do not add Realtime subscriptions initially. Polling is adequate for the agreed MVP, and missed refreshes recover from stored records.

## Free-service and operations constraints

Vercel Hobby and Supabase Free are the deployment baseline; GitHub student offers are optional tools, not runtime dependencies. Vercel's API reported the selected team's plan as `hobby` on 2026-11-18. No email delivery service is required for Google-only login, in-app notifications, or finder email disclosure; users send handoff emails themselves.

Supabase's published Free allowances checked during planning include 500 MB database, 1 GB file storage, and inactivity pausing after one week; other compute, bandwidth, and function quotas also apply. Verify the current terms and account activation before deployment. Do not imply campus-scale uptime or unlimited photo traffic.

Phase 1 must demonstrate no-card activation and native embeddings within Free allowances. If unavailable, keep development local and revise these documents with an explicit alternative; do not replace General Items semantic search with keyword-only search and call the MVP complete. Specialized reports intentionally use string matching.

Keep SQL migrations and seed data in source control. Before pilot, demonstrate a manual export and restore covering database records and image objects; managed automatic backups are not assumed. Keep exports out of the repository and restrict them to the maintainer.

Use sanitized error reporting and provider metrics initially. Check storage, bandwidth, function use, and failed jobs during the pilot. Publication and real university account access depend on available accounts and university OAuth policy.

## Verification

Focus tests on domain/session rejection, object/evidence/email isolation, concurrent three-report quota enforcement, slot release, valid/invalid transitions, concurrent acceptance, idempotency, general-item semantic relevance, specialized exact matching with zero model calls, and the report-to-return browser journey.

Run type checking, lint, tests, and production build in CI. Use local Supabase where Docker is available; otherwise an isolated test project. Never run destructive integration tests against pilot data. Use synthetic identities and items in fixtures; real university OAuth gets a separately documented manual check.

Phase 1's developer-only `phase1-check` function, runner, RPCs, and private counter were removed in Phase 2 after the evidence was recorded. The Auth helper and shared image sanitizer remain. Hosted feasibility evidence for 384-dimensional generation, pgvector ranking, image processing, session refresh, and anonymous rejection is at `docs/evidence/phase1-runtime-2026-11-14.json`. The temporary probe was never the Phase 4 relevance benchmark or production matching endpoint.

## Required implementation handoff at every phase boundary

Follow the phase-transition rule in objective.md and roadmap.md. Before advancing, complete `docs/handoffs/phase-N.md` with [the shared template](docs/handoffs/TEMPLATE.md), cross-check it against the code and actual deployment state, and link it from the [handoff index](docs/handoffs/README.md). Latest completed handoff: [Phase 2 implementation](docs/handoffs/phase-2.md).

| Area | Technical detail the handoff must preserve |
|---|---|
| Behavior and code | Actual workflows, decisions, reusable components/functions, paths and entry points; explicit mocks/unimplemented features. |
| Data and authorization | Exact schemas, fields/constraints/indexes, RPC/endpoint signatures, lifecycle/locking/idempotency, RLS/grants, private-field exposure, storage and cache rules. |
| Reproduction and deployment | Tool versions/locks, environment names and configuration locations, run commands, migrations applied vs recorded in history, local-only vs deployed resources, provider identifiers, frontend/CI state, commit/working-tree state. |
| Verification and operations | Exact checks/results/dates, sanitized evidence, who observed each result, fixture/performance limits, known failures/fixes, recovery, cleanup, external dependencies. |
| Resumption | Ordered next tasks, dependencies/blockers, expected proof of success, and remaining user input. Save partial progress before ending an unfinished session. |

Do not include credentials, tokens, personal records, or private evidence. Do not mark speculative future schema/API names as implemented. Keep subsequent fixes reflected in the active handoff and current constitution; completed phase records remain dated snapshots with explicit corrections when needed.

## Official references

Provider documentation checked 2026-11-14; quotas and capabilities must be rechecked at integration.

- [Google ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Supabase Google authentication](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- [Supabase Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Supabase authorization policies](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase native embeddings and semantic search](https://supabase.com/docs/guides/functions/examples/semantic-search)
- [Supabase pricing](https://supabase.com/pricing) and [Vercel Hobby](https://vercel.com/docs/plans/hobby)
