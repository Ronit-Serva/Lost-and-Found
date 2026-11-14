# Foundry · Ashoka Lost & Found

Campus lost-and-found portal MVP. Product and implementation decisions live in [objective.md](objective.md), [techstack.md](techstack.md), and [roadmap.md](roadmap.md).

## Resume implementation in a new session

Read the three constitution files, then [the handoff index](docs/handoffs/README.md), [Phase 1 implementation details](docs/handoffs/phase-1.md), and the active [Phase 2 handoff](docs/handoffs/phase-2.md). Phase 2 is in progress. Every phase requires a detailed implementation handoff before advancing. `AGENTS.md` gives incoming agents the same entry point.

## Local development

1. Install Node.js 22 LTS and npm (`.nvmrc` selects Node 22).
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local` when a Supabase project is ready.
4. Run `npm run dev`.

Google PKCE login, session handling, and a server membership check are wired into the app. The hosted Phase 2 database currently supports report create/edit/close, directory and owner listing, shared quotas, and private photos. Claims and notifications remain Phase 3 work. See the active handoff for deployed state and remaining verification.

## Supabase setup

1. For a new Supabase project, configure Google OAuth, the Before User Created Postgres hook (`public.allow_ashoka_google_signup`), and local redirect `http://localhost:5173` as described below. Keep Google as the only provider and disable Email, Phone, and anonymous sign-in.
2. Apply the versioned migrations with the Supabase CLI: `npx supabase db push --remote=YOUR_PROJECT_REF`. Review `--dry-run` first. The migration sequence includes the historical Phase 1 probe and its cleanup; do not run the Phase 1 probe SQL separately. The configured `Uni Lost-Found` project already has versions `20261114000100`–`20261114000700` applied; inspect `docs/handoffs/phase-2.md` before changing it.
3. Keep the Google OAuth client's callback set to the Supabase callback URL shown by the provider settings. If Google uses External testing mode, each test account must be added as an OAuth app test user.
4. Copy `.env.example` to `.env.local` and set the two public Supabase values. Then run `npm run dev`, open `http://localhost:5173`, and sign in with an eligible Ashoka Google account.

No database password, service-role key, or Google client secret belongs in `.env.local` for the browser app. Both public Supabase environment values must already be set; restart Vite after changing them.

## Manual authentication checks

| Check | Expected result |
|---|---|
| Confirmed Ashoka Google account | Dashboard appears after `is_ashoka_member` returns true. |
| Reload / refreshed session | University access is checked again; eligible account remains signed in. |
| Sign out | Login screen appears; dashboard is no longer mounted. |
| Google account from another domain | New signup is rejected by the hook. In External testing mode, add this account as an OAuth test user first so the request reaches Supabase. |
| Existing ineligible Supabase user | Membership helper returns false and dashboard remains blocked. |

The project owner has confirmed eligible Ashoka sign-in/dashboard access, reload persistence, sign-out, account switching, and personal-account rejection. Forced session refresh also passed in the Phase 1 hosted probe. Phase 2 report policies and storage functions have local synthetic coverage, but real-account report and photo isolation still need a browser walkthrough.

## Database access rule for subsequent features

Every future app data/storage policy and sensitive database function must require `public.is_ashoka_member()`, alongside its ownership/recipient checks. The helper reads protected Auth records for the authenticated caller, checks confirmation/domain/Google identity, and returns only a boolean. The signup hook and frontend alone do not secure data.

The selected policy checks a confirmed Google email ending exactly in `@ashoka.edu.in`; it does not require the Google `hd` claim. Sign-in requests `prompt=select_account` and omits the hosted-domain hint so users can choose another Google account. The server still enforces eligibility. Signing out of the portal does not sign the user out of Google. No separate verification email is sent by the app.

## Hosting and deployment workflow

Frontend: **GitHub → Cloudflare Pages**. Backend: **Supabase**. Initial hosting uses the free Cloudflare subdomain.

1. Push the reviewed repository to GitHub and connect it to Cloudflare Pages. Use `npm run build` as the build command and `dist` as the output directory.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Pages build environment. The Vite bundle includes these public values; never add privileged secrets.
3. Apply versioned database migrations and deploy Supabase Edge Functions separately before releasing frontend code that depends on them. Configure the hosted Auth hook/provider settings separately. Set the Edge Function variable `PHASE2_ALLOWED_ORIGIN` to the production Pages origin before enabling photo upload there. This repository has no automated backend deployment.
4. Set the Supabase Site URL to the production HTTPS address and register exact local/production redirect URLs. Only allow trusted preview URLs when needed. The Google callback remains the Supabase Auth callback.
5. Validate the real-account login and application access checks before the campus pilot. Subsequent frontend pushes deploy through Pages; backend migrations remain an explicit release step. Hosting has not been provisioned by this repository.

Vite's `public/_redirects` supplies the SPA route fallback for Pages.

## Local checks and Phase 1 evidence

Run `npm run lint`, `npm run check:edge`, `npm test`, and `npm run build`. CI runs these checks on pushes/pull requests. The database tests run in temporary PGlite/pgvector, and Edge tests run with Deno; no Docker or provider credentials are needed for local tests.

The hosted embedding/image/session probe passed before Phase 2 and was retired by migration `20261114000300`; [the browser result is saved](docs/evidence/phase1-runtime-2026-11-14.json). The owner confirmed Free/no-card setup, completing Phase 1. No further probe run is needed.

## Configuration

Only the Supabase project URL and publishable/anon key belong in browser environment variables. Never put service-role keys, Google client secrets, or database credentials in `VITE_*` variables.

See the constitution files before adding product behavior or database policies.
