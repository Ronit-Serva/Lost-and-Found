# Technical constitution for the cards and keys MVP

Retain the React, TypeScript and Vite frontend, Supabase Auth and PostgreSQL backend, and existing Vercel hosting configuration. Use the Node 22 lockfile and PGlite fixture for local verification. The browser needs only the public Supabase URL and publishable key.

## Authorization and personal data

Require the existing `public.is_ashoka_member()` helper for data access. It checks the caller’s current protected Auth record, Google identity and confirmed Ashoka address. Keep ownership, WhatsApp numbers and historical claims in restricted tables. Use RLS, narrow grants, owner checks and a fixed search path on elevated functions. Never expose Auth records or owner UUIDs in public-facing projections.

Resolve a report’s email from the verified account on the server. Read WhatsApp from the poster’s private saved number. Persist an explicit contact choice on the report. Return only its selected channel to an eligible viewer of an open listing. Keep listing search limited to the item fields. Store consent independently of saving a profile number. Contact information belongs outside logs, telemetry, public assets and notification previews.

## Reporting

Reuse Phase 2’s report schema, type and section validation, quotas and per-owner transaction locks. Preserve existing records on upgrade. General posts and historical private claims are unavailable through the active MVP directory and claims APIs. Restrict access at the database boundary as well as in the browser. Continue to support owner management of existing reports.

Use a new forward migration after the Phase 3 commit. The set of migrations on main and this branch diverge after that commit. Apply the MVP stack to its intended target before serving this frontend. Review the target project and migration history before a release.

## Verification

Run the database suite against the historical migration sequence and the final MVP schema. Verify UI compilation, lint, authentication and Edge regressions, and exercise both contact choices, access boundaries and manual closure. See the active [branch handoff](../docs/handoffs/cards-and-keys.md) for the implemented API contract and release state.
