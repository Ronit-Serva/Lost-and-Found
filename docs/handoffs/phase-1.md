# Phase 1 — foundation and feasibility handoff

This is a historical completion snapshot. Phase 2 retired the probe resources and local runner documented below. For current migration, endpoint, and application state, read [the Phase 2 handoff](phase-2.md).

## Status and resumption

| Field | Record |
|---|---|
| Status / date | Complete, 2026-11-14. Final Free/no-card confirmation supplied by project owner. |
| Scope | Foundation for O1 and feasibility prerequisites for O3; dashboard shell only for O2. |
| Next phase | Phase 2 — private campus reporting and dashboard; not started. |
| First task | Inspect and reconcile manually applied SQL with remote migration history before introducing Phase 2 migrations. Preserve current Auth setup. |
| Repository at handoff | `/Users/ronit/Lost-and-Found`, branch `main`; no HEAD commit and no Git remote configured. Project files are untracked. Recheck `git status` before editing or preparing a source-control checkpoint. |

The app has real Google authentication and backend eligibility checks. The dashboard is a preview: report posting/search, My Listings, claims, notifications, storage uploads, and production matching are not implemented. A successful sign-in does not mean those workflows exist.

## Implemented flow and decisions

1. Vite loads the React app. Missing public Supabase environment values produce a configuration message rather than a client.
2. `src/AuthRoot.tsx` restores the Supabase session and subscribes to auth changes. Login uses Google OAuth with PKCE, redirecting to `window.location.origin` and explicitly passing `prompt=select_account` so users can switch Google accounts.
3. The Google signup hook rejects new accounts whose provider is not Google or whose email does not exactly match the case-insensitive Ashoka domain rule. Confirmation is checked after signup, at access time.
4. For each new access token, the client calls `public.is_ashoka_member()` outside the Auth callback. The dashboard mounts only after `true`. Errors/ineligibility show retry and sign-out controls. Stale asynchronous responses are ignored, and checks are keyed to the token.
5. Sign-out clears the portal session; it does not sign the browser out of Google. Refresh/logout/account switching work in the owner's real browser. Supabase handles token verification/exchange; browser metadata is not an authorization source.

The user explicitly selected confirmed-email-suffix eligibility instead of mandatory Workspace `hd` membership. Keep this decision. Request no Gmail/Drive permissions or separate verification email. This does not establish current enrollment or item ownership. Every future data/storage policy and sensitive function must additionally enforce the membership helper and its own ownership/recipient rules.

## File and component map

| Path | Implemented responsibility |
|---|---|
| `src/main.tsx` | React root and StrictMode entry. |
| `src/AuthRoot.tsx` | Session bootstrap/subscription, login/logout, token-scoped membership gating, retry/error screen. |
| `src/lib/supabase.ts` | Nullable client from Vite environment; PKCE, URL-session detection, persistence and automatic refresh. |
| `src/App.tsx` | `SignInScreen` and responsive dashboard preview; category and lost/found tabs use local state. Other controls/counts remain placeholders. |
| `src/App.css`, `src/index.css` | Existing visual styling. Reuse instead of introducing a new UI system during Phase 2. |
| `public/_redirects` | Cloudflare Pages SPA fallback. No Pages deployment yet. |
| `supabase/config.toml` | Local Auth/API/function configuration; does not synchronize hosted Auth settings. |
| `supabase/migrations/20261114000100_ashoka_auth.sql` | Signup hook and ongoing caller-only membership helper/grants. |
| `supabase/migrations/20261114000200_phase1_probe.sql` | pgvector, private daily probe counter, budget and synthetic vector-query RPCs. |
| `supabase/functions/phase1-check/index.ts` | Hosted Deno entry; validates bearer using `auth.getUser`, uses caller-scoped Supabase client, lazily creates native gte-small session. |
| `supabase/functions/phase1-check/handler.ts` | CORS/method/auth/member/body/budget gates; fixed-text embeddings, vector validation, RPC ranking, image probe, sanitized results/errors. |
| `supabase/functions/_shared/image.ts` | Actual byte/dimension validation and JPEG sanitizer, limits, synthetic runtime image probe. Reuse sanitizer for later uploads. |
| `supabase/functions/deno.json`, `deno.lock` | Pinned Edge imports, strict type checking, dependency integrity lock. |
| `tools/phase1.html`, `tools/phase1.ts` | Local developer runner: forces session refresh, invokes probe, tests anonymous request, prints metrics without tokens. Excluded from `dist`. |
| `tests/database.test.mjs` | Six Node tests using real PGlite/pgvector and minimal synthetic Auth tables/roles. No hosted database connection. |
| `supabase/functions/tests/probe_test.ts` | Ten Deno tests for gates, stream handling, budget/errors/vectors, and actual image processing. Model/Auth dependencies are synthetic. |
| `.github/workflows/checks.yml` | npm install/check/test/build workflow on push/PR; configured, not observed on GitHub yet. |
| `.nvmrc`, `package.json`, `package-lock.json` | Node LTS choice, scripts, locked frontend/dev dependencies. |
| `docs/phase1-checks.md` | Probe setup/troubleshooting details; existing project setup is already complete. |
| `docs/evidence/phase1-runtime-2026-11-14.json` | Exact successful hosted JSON supplied by the project owner. |

## Database and API contracts

### Actual database resources

| Resource | Signature/shape and behavior |
|---|---|
| `public.allow_ashoka_google_signup(event jsonb) → jsonb` | Auth Before User Created hook. Requires `user.app_metadata.provider = google` and email matching `^[^@[:space:]]+@ashoka[.]edu[.]in$` case-insensitively. Returns `{}` to allow, or `error.http_code = 403` and message. Executes only for `supabase_auth_admin`; revoked from PUBLIC/anon/authenticated. |
| `public.is_ashoka_member() → boolean` | SECURITY DEFINER with empty `search_path`. Looks up `auth.uid()` in protected Auth tables. Requires confirmed eligible email, Google provider in server metadata, and Google identity with the same case-insensitive email. No user ID input; authenticated caller gets only a boolean. No anonymous execute grant. |
| `private.phase1_probe_usage` | `(user_id uuid FK auth.users ON DELETE CASCADE, day date, runs integer CHECK 1..3)`, primary key `(user_id, day)`. RLS enabled; no client access to table/schema. Only synthetic-probe usage is stored. |
| `public.phase1_begin_probe() → boolean` | Checks current membership; atomically inserts/increments the private counter with `ON CONFLICT ... WHERE runs < 3`. UTC date; true for an acquired slot, false once exhausted. Authenticated-only execute. |
| `public.phase1_vector_probe(query_embedding extensions.vector, matching_embedding extensions.vector, unrelated_embedding extensions.vector)` | Returns rows `(candidate text, similarity double precision)` for two ephemeral candidates. Checks membership and non-null/nonzero 384-dimensional inputs; orders cosine distance using qualified vector operator. No vectors persisted. Authenticated-only execute. |

There are no report, claim, notification, image metadata, or production embedding-job tables yet. No storage bucket, image upload endpoint, cron, or production search endpoint exists. The probe query is a feasibility utility, not the future matching API.

### Edge probe

`POST /functions/v1/phase1-check`; requires signed-in user bearer JWT and valid membership. Default allowed browser origin is exactly `http://localhost:5173`; optional server variable `PHASE1_ALLOWED_ORIGIN` can override it. OPTIONS preflight supported; responses use `Cache-Control: no-store` and `Vary: Origin`.

Processing order: origin/method → bearer presence → `auth.getUser` → membership RPC → no-payload check → daily budget → three fixed embeddings → vector-query RPC → image probe. No caller text/report ID/identifier/upload is accepted. An empty transport stream is permitted; any actual body bytes cause cancellation/rejection before allocating budget or invoking the model.

The fixed descriptions cover a lost bottle, related found flask, and unrelated found umbrella. Embeddings must contain 384 finite values and have unit norm within 0.01. Ranking must return the related candidate first with a higher finite score. Native model initialization happens only after authorization/budget. The handler returns `ok`, embedding/image subresults, and timings; the browser runner adds refresh and anonymous-request results.

Errors: 401 missing/invalid session; 403 origin/member failure; 405 wrong method; 400 nonempty body; 429 three daily slots exhausted; 500 sanitized stage failure. Raw exceptions/tokens/private content are not logged/returned. Failed work after budget acquisition consumes an attempt. Model/vector/image work does not write business data.

### Image sanitizer

`sanitizeImage(bytes)` validates JPEG/PNG bytes, enforces 5 MiB incoming size and 12-million-pixel header limit before decode, copies pixels into a fresh image, flattens alpha onto white, resizes longest edge to at most 1600 px, and encodes JPEG without forwarding source metadata/gain maps. It tries qualities 80/65/50, targets 250,000 bytes, and rejects above 500,000 bytes. Returns bytes, width, height, and `image/jpeg`; does not upload or persist anything. Decode errors reject corrupt files.

The hosted fixture is deliberately small (303-byte PNG, 1700×40 before resize). Full-sized photo CPU/memory testing and controlled storage integration belong to Phase 2; do not infer performance at the maximum input size from this smoke check.

## Local setup and deployment state

| Resource | Actual state at completion |
|---|---|
| Local path/branch | `/Users/ronit/Lost-and-Found`, `main`; no commit/remote yet. Preserve untracked work. |
| Runtime | Node 22.16.0 verified; `.nvmrc`/CI select Node 22. npm pins Deno 2.9.6 and Supabase CLI 3.1.0. Edge imports pin Supabase JS 2.119.0 and ImageScript 3.20.3. |
| Browser environment | `.env.local` exists locally; names are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. New machines need these public values configured. Existing files should not be overwritten. |
| Google secrets | Managed in provider settings; never in `VITE_*`. Local Supabase config refers to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for a future local stack. |
| Hosted project | `Uni Lost-Found`, reference `jdaertuqzbgfdnnpranl`, region `ap-south-1`. CLI calls it the project's production/main environment; it is the current development project, not a separate staging database. |
| Hosted database | PostgreSQL 17, pgvector 0.8.2 installed in `extensions`. Auth helper/hook and probe SQL exist. |
| SQL application/history | Auth migration applied manually by owner; probe migration applied by agent through `supabase db query`. Versions may be absent from migration history. Reconcile before `db push`; do not reapply table-creating probe SQL. |
| Auth settings | Owner configured Google OAuth and Postgres Before User Created hook; observed eligible/outsider behavior passes. Individual hosted provider toggles/scopes were not independently exported or audited. Exact Google External/Internal publishing state is not recorded; inspect if relevant. |
| Remote function | `phase1-check` deployed with API bundling and JWT verification configured. Platform Supabase URL/anon key are used; no paid model key/service-role key. Temporary probe remains deployed. |
| Credentials | Owner completed CLI login on this computer. Credentials are not in source/handoff; verify current access in a new session. |
| Free constraint | Owner explicitly confirms Supabase Free, no credit card, on 2026-11-14. No paid add-on was required for the passing probe. |
| Frontend/CI | Local Vite app at `http://localhost:5173`; Cloudflare Pages is planned, not provisioned. GitHub workflow exists but no remote push or hosted CI run is recorded. |

Start from the existing directory:

```sh
npm ci
npm run dev
```

Use Node 22; `nvm use` is optional if nvm is installed. On an existing checkout, retain `.env.local`. A fresh machine must configure the public environment and log into CLI if remote changes are needed. Current login refresh/browser persistence and provider configuration are not transferred by copying these documents. Docker is not installed/required for the existing test/probe workflow; a full local Supabase stack has not been exercised.

Already completed deployment commands, recorded for reference only:

```sh
npx supabase db query --remote=jdaertuqzbgfdnnpranl --file supabase/migrations/20261114000200_phase1_probe.sql --yes
npx supabase functions deploy phase1-check --remote=jdaertuqzbgfdnnpranl --use-api --yes
```

The SQL command is non-idempotent once its private table exists. Do not rerun it on this project. Explicit `--remote` was used; a local linked-project record is not assumed. See `npx supabase ... --help` for the pinned CLI v3 syntax; older `--project-ref` instructions may differ.

## Verification and evidence

| Check | Recorded evidence |
|---|---|
| `npm ci` | Passed on existing lockfile. |
| `npm run test:db` | Six tests passed with synthetic Auth/roles and real PGlite/pgvector. Tests cover exact-domain/provider rejection, protected data/grants, current membership, daily budget, and vector validation/ranking. |
| `npm run test:edge` | Ten tests passed after the empty-stream fix; includes actual local image processing. Native model/Auth dependencies are mocked for handler tests. |
| `npm run check:edge`, `npm run lint` | Passed after latest handler fix. |
| `npm run build` | TypeScript/Vite production build passed; latest subsequent code fix was Edge-only and passed its separate type/tests/lint checks. |
| Real browser account checks | Owner confirms Ashoka login, rejected personal Google account, sign-out, explicit account chooser, reload persistence. Exact outsider rejection text was not supplied. |
| Agent-run remote checks | Probe migration/function deployment succeeded; read-only SQL confirmed vector schema/version, private counter/budget function, and no anonymous budget execute grant. Anonymous HTTP call returned 401 and expected localhost CORS. |
| Owner-run hosted probe | Saved raw JSON below confirms native model/vector/image success, forced session refresh, and anonymous 401. |
| Provider plan | Owner confirms Free/no-card. |

Hosted result: [raw JSON](../evidence/phase1-runtime-2026-11-14.json).

| Metric | Value |
|---|---|
| gte-small embeddings | Three, normalized, 384 dimensions; generation 361 ms |
| pgvector query | 58 ms; related 0.918357923324481 > unrelated 0.838503847211372 |
| Image | Passed, metadata marker removed, invalid file rejected; output 1600×38 JPEG, 894 bytes; processing 57 ms |
| Handler work after authorization/budget | 480 ms; excludes browser/network/authorization/budget overhead |
| Session/anonymous | Forced refresh true; anonymous rejected true, HTTP 401 |

Cold/warm status is unknown. Similarity scores are not probabilities; two candidates do not establish relevance quality. The Phase 4 benchmark remains mandatory. Existing-ineligible-user behavior has synthetic SQL coverage, not a separately provisioned live outsider account. Business-data isolation cannot be tested until those resources exist.

## Known issues, recovery, and maintenance

| Issue | Status / next action |
|---|---|
| Auto-login reused Google account | Fixed using `prompt=select_account`; hosted-domain hint omitted. Sign-out does not clear Google session. |
| Empty POST wrongly rejected | Fixed/redeployed: a non-null empty body stream is allowed; nonempty streams are cancelled. Two regression tests. Rejections occurred before budget allocation. |
| Migration history | Next agent must inspect actual history and reconcile already-applied versions. Avoid blind migration reruns or `db reset` on this shared project. |
| Temporary probe | Enough evidence collected; retire function/RPCs/private counter with an explicit cleanup migration and update/remove runner/config references. Retain real Auth helper and shared sanitizer. Do this before regular Phase 2 deployment; do not silently delete it from source while leaving the hosted endpoint active. |
| Local configuration drift | `supabase/config.toml` currently says PostgreSQL 15 while hosted project is 17. Align when preparing Phase 2/local DB. CLI warns `auth.email.enable_signup` is deprecated in favor of `auth.email.enabled`; verify the pinned CLI schema when changing it. No full hosted Auth config push was performed. |
| Source-control handoff | No commit/remote yet. Another machine needs the working files plus separately configured public environment; chat/handoff text alone does not transfer code. CI/Cloudflare publication remain outstanding. |
| Privacy and full workflows | Report quotas, owner-ID isolation, Storage, claims, email lookup and notifications still need their phase-specific schema/policies/tests. Login/probe success does not satisfy those requirements. |

For missing local configuration, restore only the public environment names from `.env.example`; never put privileged keys in browser variables. For lost CLI access, the owner can run `npx supabase login`. Do not require a repeat probe run merely to resume: the result is saved, and the probe has a persistent daily limit.

## Next agent: start here

1. Read the constitution and [handoff index](README.md). Inspect `git status`/branch, retain all untracked work, and read existing migrations. Create `phase-2.md` from the template with status In progress when implementation begins.
2. Verify the configured remote matches `.env.local` without printing keys. Inspect applied objects and migration history read-only, then reconcile the two already-applied versions. Validate any history repair against the actual SQL; do not replay probe table creation.
3. Retire the temporary probe through a cleanup migration and function removal while preserving Auth and sanitizer code; align local DB/config drift. Document each actual local/remote change in Phase 2's handoff.
4. Implement Phase 2's typed report/ownership/photo schema and protected mutations. First vertical slice: persist one minimal specialized report and list it safely, with eligibility, immutable type/section, and transactional per-user quotas designed from the start. All mutation paths must share a stable per-user quota lock. Extend to general fields/images, edit/close/history, and directory as required by the Phase 2 roadmap.
5. Prove owner/non-owner/outsider isolation and quota concurrency before claiming working reporting. Fourth active lost/found reports must fail independently across sections; report closure releases a slot; reserved found still counts. Finish remaining Phase 2 exit checks and the full `phase-2.md` handoff before starting claims.

No user input is currently blocking Phase 2 startup. Existing implementation authorization continues; ask and pause only for a concrete missing decision/access requirement. Location choices and eventual production publication still need their documented later checks.

## Completion record

Phase 1's technical checks, real-account evidence, and Free/no-card setup are recorded. This implementation record and index are complete and linked from all three constitution files. Phase 2 may start; its future implementation is not claimed here. Nonblocking maintenance and unverified broader behavior are explicitly assigned above.
