# Phase 2 — implementation handoff

## Status and resumption

| Field | Record |
|---|---|
| Phase / scope / objective IDs | Phase 2 — listings and personalized discovery; O1, O2, report portions of O3 |
| Status | Complete, accepted by the project owner |
| Updated / completed date | 2026-11-18 / 2026-11-18 |
| Next phase allowed? | Yes. Phase 3 is next. |
| First task for the next agent | Create `phase-3.md` from the template and implement claim submission with private evidence access and duplicate and self-claim rejection. |

The Phase 1 migration-history reconciliation is complete. Versions `20261114000100` and `20261114000200` were verified against hosted objects and marked applied in history without replaying their SQL. Migrations `20261114000300`–`20261114000700` are applied to `Uni Lost-Found` (`jdaertuqzbgfdnnpranl`, production/main environment). The Phase 1 probe function, RPCs, private counter, and browser runner are retired. Real Auth helper/hook and shared image sanitizer remain. The reporting and photo flows are deployed. On 2026-11-18, after the photo upload fix, the owner confirmed the Phase 2 exit checks passed and requested closure. The owner provided an overall result. Individual walkthrough results and concurrency logs were unavailable.

## Implemented behavior and decisions

- Signed-in eligible members can post, edit, close, search, and browse lost/found reports across General Items, ID Cards, and Room Keys. My Listings shows historical rows and active lost/found counts out of three.
- Report type and section cannot be changed after creation. Editing and closing are restricted to an owned open report. Closing a lost report marks it `resolved`; closing a found report marks it `withdrawn`. Both free a slot and disappear from default directory results.
- The database validates section-specific fields. General reports require title, category, public description, campus location, and event date. A found general report requires confirmation that one distinguishing detail was withheld. General reports permit only specified text/date fields; there is no stored answer key. ID cards require roll or ID number and allow optional cardholder name. Room keys require room number and holder name. Specialized report data cannot include descriptions, photos, dates, or general fields. Titles are generated for ID cards and keys.
- The browser directory uses `ILIKE` keyword matching; ID-card and key search reads only their respective fields. Each directory RPC returns up to 100 open results, excludes the caller's own reports, and omits reporter account identity. This is not the Phase 4 matching feature.
- General reports accept up to three JPEG/PNG uploads per listing. `report-photo` checks the JWT and current Ashoka membership, streams at most 5 MiB into the sanitizer, removes source metadata, resizes/re-encodes to JPEG (maximum 500 KB), stores in a private bucket, and records metadata. Signed image URLs are requested on demand and expire after 60 seconds. Owners can remove photos from open reports. Object paths contain report ID and random object ID only; migration 007 removed reporter UUIDs from paths before any production photos existed.
- Per-user mutations take the same transaction advisory lock derived from caller UUID. This serializes create/edit/close/photo registration/removal paths. Claims that reserve found reports in Phase 3 must use this lock before changing statuses.
- Product-visible identity remains private. Base report/photo tables are inaccessible to anon/authenticated direct selects. Directory and owner functions return explicit JSON projections; neither includes owner UUID, account email, or Auth identity. ID/key fields are the deliberate campus-visible exception.

## File and component map

| Path | Responsibility / main entry points | Integration with existing code |
|---|---|---|
| `supabase/migrations/20261114000100_ashoka_auth.sql` | Signup hook and caller-only membership helper | Already applied; preserve. |
| `supabase/migrations/20261114000200_phase1_probe.sql` | Historical Phase 1 extension/probe migration | Already applied and recorded; do not replay. Probe objects removed by 00300; pgvector extension remains. |
| `supabase/migrations/20261114000300_retire_phase1_probe.sql` | Drops probe RPCs and private daily usage table | Applied remotely. |
| `supabase/migrations/20261114000400_reports.sql` | Report enums/table, constraints/indexes, restricted mutation and safe list/search RPCs | Applied remotely. |
| `supabase/migrations/20261114000500_report_photos.sql` | Private bucket, photo metadata table, Storage access policies, add/list RPCs | Applied remotely. |
| `supabase/migrations/20261114000600_remove_report_photo.sql` | Owner photo metadata removal RPC | Applied remotely. |
| `supabase/migrations/20261114000700_hide_photo_owner_uuid.sql` | Removes owner UUID from photo paths and updates Storage authorization | Applied remotely before any photo objects existed. |
| `supabase/functions/report-photo/handler.ts` | Origin/JWT/member gates, bounded body reader, sanitizer, upload and metadata registration | Used by deployed Edge function; no caller text is accepted. |
| `supabase/functions/report-photo/index.ts` | Supabase client wiring with caller JWT | Deployed as `report-photo`, JWT verification enabled. |
| `supabase/functions/_shared/image.ts` | JPEG/PNG byte/dimension validation, metadata removal, resize and JPEG conversion | Reused by photo endpoint. |
| `supabase/functions/tests/image_test.ts`, `report_photo_test.ts` | Synthetic sanitizer and Edge handler tests | Run through `npm run test:edge`. |
| `tests/database.test.mjs` | PGlite/pgvector tests with synthetic Auth and Storage fixtures | Runs migrations 00100–00700 and tests denial, projections, quotas, section rules, and photo limit. |
| `src/App.tsx`, `src/App.css` | Dashboard, directory, general/specialized forms, owner actions, temporary photo viewing | Uses Supabase RPCs and Storage signed URL API. |
| `src/AuthRoot.tsx`, `src/lib/supabase.ts` | PKCE session and membership gate; browser Supabase client | Existing Phase 1 foundation. |

## Data, API, and security contracts

### Reports

`public.reports`: `id uuid`, `owner_id uuid`, `kind report_kind ('lost'|'found')`, `section report_section ('general'|'id_card'|'room_key')`, `status report_status ('open'|'reserved'|'resolved'|'returned'|'withdrawn')`, `title`, general fields (`category`, `description`, `location`, `occurred_on`, `approximate_date`, `withheld_detail_confirmed`), specialized fields (`cardholder_name`, `roll_number`, `id_number`, `room_number`, `holder_name`), and `created_at`/`updated_at`. Constraints enforce shape and lifecycle-compatible statuses; index `(section,kind,status,created_at desc)` supports discovery and `(owner_id,created_at desc)` supports owner history. Database table has RLS and no `anon`/`authenticated` privileges.

RPCs (all require `is_ashoka_member()`, `SECURITY DEFINER`, empty `search_path`, and authenticated-only execution):

- `create_report(p_data jsonb) returns uuid`: validates allowed keys by section, locks caller quota, checks active report count, creates a report. Fourth active report of the same kind fails with `P0001`; lost and found have separate counts across sections. `open` lost and `open`/`reserved` found count active.
- `edit_report(p_report_id uuid,p_data jsonb) returns void`: owner-only, open-only, uses caller lock; rejects changes to kind/section and disallowed fields; constraints revalidate final row.
- `close_report(p_report_id uuid) returns void`: owner-only, open-only; lost → `resolved`, found → `withdrawn`; uses caller lock.
- `list_my_reports() returns jsonb`: current member's records and only safe listing fields; caller's own status/history included.
- `directory_reports(p_section report_section,p_kind report_kind,p_query text default '') returns jsonb`: up to 100 open results, excludes caller's own rows, specialized fields searched separately; report owner is never included.

`public.report_title(jsonb,report_section)` generates specialized display titles; it does not expose identity.

### Photos and Storage

`public.report_photos`: `id`, `report_id`, `owner_id`, `object_path`, `width`, `height`, `bytes`, `created_at`; width/height max 1600, bytes max 500000. Base table inaccessible to clients. `report-photos` bucket is private and restricts object size to 500000 bytes and MIME to `image/jpeg`. Current object path is `{report_uuid}/{random_uuid}.jpg`; it does not contain account IDs.

Storage policies call member-checked helpers: eligible members may read photos for open reports; owner may read their reports' photos after close; only owners may upload/delete photos on open General Items reports. The Edge endpoint also verifies the Ashoka membership helper before work.

- `POST /functions/v1/report-photo`: JWT required; `Origin` must equal `PHASE2_ALLOWED_ORIGIN` or default `http://localhost:5173`; `x-report-id` must be UUID; raw JPEG/PNG bytes only, capped while streaming at 5 MiB. The handler uses caller JWT (no service-role key), sanitizes and uploads with MIME `image/jpeg`, then calls `add_report_photo`. Failed registration attempts object cleanup. Response 201 contains `{path,width,height}`; errors are sanitized (400 invalid image, 401 session, 403 origin/member, 409 report/limit, 413 input, 500 storage).
- `add_report_photo(p_report_id,p_object_path,p_width,p_height,p_bytes) returns uuid`: caller lock, open owned General Items check, path binding, maximum three metadata rows.
- `list_report_photos(p_report_id) returns jsonb`: eligible owner or member for open report receives paths and dimensions only. The client uses Storage `createSignedUrls(...,60)` on demand.
- `remove_report_photo(p_report_id,p_object_path) returns boolean`: owner/open-report only; removes metadata. The UI first removes Storage object then metadata. A failure between these calls can leave a stale metadata row or orphaned object; retry/reload handles ordinary cases, but a reconciliation cleanup job does not exist.

### Deployment configuration

`supabase/config.toml` targets PostgreSQL 17, disables Email signup, retains Google and the Auth hook, and enables `report-photo` with JWT verification. On 2026-11-18, hosted `PHASE2_ALLOWED_ORIGIN` was set to `https://foundry-ashoka.vercel.app`. The endpoint now accepts browser photo requests from that live origin. Its source default remains localhost, but the hosted override means local photo requests need the variable changed or a local Edge runtime. Supabase supplies `SUPABASE_URL`/`SUPABASE_ANON_KEY`; no privileged key is configured in the frontend or function.

Hosted Auth `site_url` is `https://foundry-ashoka.vercel.app`; redirects allow that exact origin and `http://localhost:5173/**`. Apply URL-only updates through `deploy/phase2-auth/supabase/config.toml` using `supabase config diff/push --remote=jdaertuqzbgfdnnpranl --workdir deploy/phase2-auth`. Only the two declared URL fields were pushed; Google provider secrets and the real signup hook were preserved. The main config retains its localhost Site URL for local-stack use and includes the Vercel origin in its redirect list.

## Local setup and deployment state

| Resource | Local / remote state | How to reproduce or inspect safely |
|---|---|---|
| Local path/branch | `/Users/ronit/Lost-and-Found`, `main`, base commit `c3aef95971494f585536323592f4a243dd2ec949`; GitHub remote `https://github.com/Ronit-Serva/Lost-and-Found.git`. Hosting, photo upload, configuration, and documentation changes from 2026-11-18 are uncommitted. | `git status --short --branch` |
| Node/dependencies | Node 22 selected by `.nvmrc`; npm lock; Supabase CLI 3.1.0; Deno lock in `supabase/functions/deno.lock`. | `npm ci`; `npm run build` |
| Environment | `.env.local` names: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; values omitted. Edge platform vars are managed by Supabase. | Never print `.env.local`; use only the public values in browser config. |
| Migration history | Remote versions `20261114000100` through `20261114000700` are applied. First two were repaired as applied after remote SQL inspection; no migration SQL was replayed for them. | `npx supabase migration list --remote=jdaertuqzbgfdnnpranl` |
| Hosted DB | `Uni Lost-Found`, ref `jdaertuqzbgfdnnpranl`, ap-south-1, PostgreSQL 17.11. Report/photo tables and private bucket exist. Probe table and RPCs are absent. The initial deployment inventory found zero reports and photos on 2026-11-14. | Use `npx supabase db query --remote=jdaertuqzbgfdnnpranl --read-only "..."` for read-only inventory. |
| Edge functions | `report-photo` active, version 5, JWT verification enabled. `phase1-check` deleted. Anonymous invocation returned HTTP 401. | `npx supabase functions list --remote=jdaertuqzbgfdnnpranl` |
| Frontend/hosting/CI | Vercel Hobby project `foundry-ashoka`, id `prj_uy7fiRxzkyHmsAuKKWKM8fSNaiEG`, team `no-sl-op`; live https://foundry-ashoka.vercel.app. Node 22 selected; Vite build, `dist`, SPA fallback in `vercel.json`. CLI deployment; automatic GitHub linking failed because the Vercel account needs a GitHub Login Connection. GitHub CI status was not checked in this session. | `vercel deploy --prod`; `.vercel/project.json` is ignored; preserve `.env.local`. |

The owner explicitly selected Vercel on 2026-11-18, replacing the original Cloudflare Pages choice. The Vercel project has no extra deployment-authentication gate so testers reach the Ashoka login directly. Only the public Supabase URL/key are configured as Vite build variables. `.vercelignore` excludes `.env*`, backend source, local dependencies and output, test files, and docs from frontend uploads. Vercel CLI link added an ignored `VERCEL_OIDC_TOKEN` to `.env.local`; the existing public Supabase values remain present and no token was printed or committed.

See [live testing instructions](../phase2-live-testing.md) and [sanitized deployment evidence](../evidence/phase2-deployment-2026-11-18.json). The owner subsequently accepted Phase 2. The MVP release gate remains ahead.

Current production deployment: `dpl_HGfZP2TpSJYdVnRhCJSjZ2GgLJ6A`, state `READY`, Node `22.x`. Use `https://foundry-ashoka.vercel.app`. The initial deployment verified a Google authorize redirect and zero declared Auth URL config changes. The photo upload fix on 2026-11-18 adds `apikey` and `x-client-info` to the allowed browser request headers and supplies the active session's bearer token explicitly. A live preflight with all five request headers returned 204 for the exact Vercel origin, and an anonymous upload POST returned 401. Eight local Edge tests pass, including the new preflight regression test. Owner acceptance followed this fix. The agent verified the live preflight and anonymous denial. Owners can retry a failed upload through My Listings → Edit on the saved report.

Existing configured remote already has Auth provider/hook setup per Phase 1. Do not reapply 00100/00200 or use `db reset` on the shared project. New migration changes use `npx supabase db push --remote=jdaertuqzbgfdnnpranl`. Review `--dry-run` first.

Commands run successfully on 2026-11-14:

```sh
npm run test:db
npm run check:edge
npm run test:edge
npm run lint
npm run build
npx supabase db push --remote=jdaertuqzbgfdnnpranl --dry-run
npx supabase migration list --remote=jdaertuqzbgfdnnpranl
```

## Verification and evidence

| Check / requirement | Exact command or procedure | Result / evidence |
|---|---|---|
| Migration reconciliation | `npx supabase migration list --remote=jdaertuqzbgfdnnpranl`; read-only object query | Before repair: no history table/rows, Auth/probe objects present, PostgreSQL 17.11. Versions 00100/00200 repaired as applied. |
| Probe retirement and report deployment | `npx supabase db push --remote=jdaertuqzbgfdnnpranl --yes`; `npx supabase functions delete phase1-check --remote=jdaertuqzbgfdnnpranl --yes` | Applied 00300/00400; deleted probe function. |
| Photo storage deployment | `npx supabase db push --remote=jdaertuqzbgfdnnpranl --yes`; `npx supabase functions deploy report-photo --remote=jdaertuqzbgfdnnpranl --use-api --yes` | Applied 00500/00600; deployed `report-photo` version 1 with JWT enabled. |
| Photo path privacy correction | `npx supabase db push --remote=jdaertuqzbgfdnnpranl --yes`; redeploy `report-photo` | Applied 00700 and deployed version 2 before any photos existed; path no longer includes reporter UUID. |
| Remote inventory | `npx supabase migration list`, `functions list`, read-only grants/bucket/policy query | Initial 2026-11-14 inventory showed versions through 00700 applied, report/photo tables present with zero rows, bucket private; three Storage policies; no direct table SELECT grants; no probe table/RPC. |
| Database/auth/security synthetic tests | `npm run test:db` | Eight tests pass in PGlite/pgvector with synthetic identities. Includes exact domain/provider gates, table/API isolation, mixed-section lost quota and close slot release, safe directory projection, immutable/specialized shape, photo quota. Not a real hosted identity or two-connection race test. |
| Edge/image tests | `npm run check:edge && npm run test:edge` | Deno type-check passes. Eight tests cover image constraints, metadata removal, authorization, upload, cleanup, and the browser preflight regression. Storage and Auth SDK dependencies are mocked. |
| Frontend compile/build | `npm run build` | TypeScript and Vite production build pass. |
| Lint | `npm run lint` | Passed with no warnings after adjusting the initial remote-data effect. |
| Live deployment | Vercel production deployment; anonymous HTTPS fetch; Google authorize redirect; photo OPTIONS and anonymous POST | 2026-11-18: HTTPS app page HTTP 200, Google authorize HTTP 302 to accounts.google.com, photo preflight HTTP 204 with exact live origin, anonymous photo POST HTTP 401. See deployment evidence JSON. These HTTP checks cover the initial redirect and anonymous requests. |
| Phase 2 exit acceptance | Owner confirmation in the conversation on 2026-11-18 after the photo upload fix | Owner reported that the exit checks passed. Individual browser, access, concurrency, and mobile/keyboard results were unavailable. |

The agent inserted no photos or reports during deployment and verification. Phase 1 hosted evidence remains [here](../evidence/phase1-runtime-2026-11-14.json).

## Known limitations, recovery, and maintenance

- General keyword search currently supports text search only. Results are capped at 100 rows. Additional filters and pagination remain possible improvements.
- Current hosted Edge origin is `https://foundry-ashoka.vercel.app`. Use the stable production URL for testing; unique Vercel deployment/preview URLs are deliberately absent from Auth redirects and photo CORS. Localhost login still works, but hosted photo requests from localhost are rejected while this override is active.
- A photo upload is an Edge call after report save. If an upload fails, the report remains saved and the UI invites retry by editing. Photo remove performs Storage deletion followed by metadata deletion; a split failure needs manual cleanup/reload.
- Detailed measurements for full-size photos, signed URL expiry, and direct Storage access with live sessions are unavailable. A downloaded image cannot be recalled.
- Report quotas are enforced in the create RPC with a per-user advisory lock. Phase 3 status changes that move found reports to/from `reserved` must acquire the same lock so reserved reports continue to count.
- Specialized string matching normalization and exact matching belong to Phase 4; current directory search is substring `ILIKE`, not that matching feature.

## Next agent: start here

1. Read the constitution and this handoff. Inspect the working tree and hosted migration history, preserving the existing work and local environment.
2. Create the Phase 3 handoff from the shared template. Start with claim submission, anonymous references, and access to private evidence for the claimant and finder. Reject duplicate claims and self-claims.
3. Reuse the report ownership rules and per-user advisory lock when implementing found-item reservation. Keep release validation in the Phase 5 roadmap.

## Phase completion gate

- [x] Project owner confirmed the roadmap exit checks passed.
- [x] Implementation, deployment, and verification sources are recorded.
- [x] The constitution, roadmap, and handoff index record Phase 2 as complete and identify the Phase 3 starting point.
