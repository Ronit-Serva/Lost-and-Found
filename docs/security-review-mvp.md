# Foundry MVP security review

Reviewed on 2026-11-19. Source branch `mvp/cards-and-keys`, commit `9fe51c94faee97dc220b40f4f8d3e2543eda28ec`, based on Phase 3 checkpoint `8804a2c`. Production is [Foundry on Vercel](https://foundry-ashoka.vercel.app), with Supabase project `jdaertuqzbgfdnnpranl`. The worktree already contained deployment updates in the roadmap and MVP handoff.

Foundry serves signed-in Ashoka members reporting lost or found ID cards and room keys. Members may see the campus item identifiers and the poster’s explicitly selected contact on open listings. Ownership UUIDs, saved contact preferences, and historical claim evidence are private. General items, uploads, and in-app claims are outside the MVP. [Product constitution](../constitution/objective.md) · [Technical constitution](../constitution/techstack.md) · [Roadmap](../constitution/roadmap.md) · [MVP handoff](handoffs/cards-and-keys.md) · [Phase 3 checkpoint](handoffs/phase-3.md)

## Remediation status

SEC-01, SEC-03, SEC-04, SEC-07, SEC-10 and SEC-11 have patches. SEC-05 was resolved in production and verified in the function inventory. The owner chose to skip SEC-02, SEC-06 and SEC-08 and put SEC-09 on hold. For SEC-01, the owner chose to retain the reusable profile number and per-listing channel choice. The fix guidance below records the original review. [Release checkpoint](handoffs/cards-and-keys.md#security-and-ui-update-checkpoint)

## Triage

| ID | Priority | Finding | Evidence |
|---|---|---|---|
| SEC-01 | Medium | Posting with WhatsApp changes the saved profile before the listing commits | Source and requirements |
| SEC-02 | Medium | WhatsApp disclosure can differ from the number previewed at submission | Source and transaction ordering |
| SEC-03 | Medium | Unfiltered discovery returns contact details in bulk and has no application-level abuse controls | Source |
| SEC-04 | Medium | Report fields and history permit unbounded storage or response growth | Source |
| SEC-05 | Medium | Retired photo-processing function is still active in production | Hosted function inventory and source |
| SEC-06 | Medium | Membership helper omits bans and has no institutional offboarding signal | Source. Hosted revocation behavior requires verification |
| SEC-07 | Low | Open browser views retain contacts after closure or replacement | Source |
| SEC-08 | Low | Saved numbers have no removal control in the application | Source |
| SEC-09 | Low | A supplied WhatsApp number is presented as a route to the reporter without proof of control | Source and documented limitation |
| SEC-10 | Low | Production HTML lacks browser isolation headers | Live response and hosting config |
| SEC-11 | Low | CI has gaps in dependency monitoring and workflow action pinning | Source and npm audit |

## Findings and fixes

### SEC-01 · Posting changes the saved WhatsApp profile before the listing commits

The listing form calls `phone.save()` before `create_report` or `edit_report`. The hook persists a new number with `set_my_whatsapp`, and the directory resolves the current saved number for every open WhatsApp listing. Consequently, a rejected listing save can still replace the contact visible on the poster’s other open listings. The listing form discloses that changing the number affects other listings, but supplies no choice to publish a one-off number or decline saving it. The constitution makes saving optional and scopes disclosure to each listing. [Listing save](../src/App.tsx#L341-L374) · [Form disclosure](../src/App.tsx#L410-L435) · [Profile hook](../src/lib/reportContact.ts#L48-L55) · [Contact migration](../supabase/migrations/20261119000200_specialized_mvp_contact.sql#L20-L41)

**Fix and acceptance.** Store a WhatsApp value authorized for each report separately from the reusable profile, with access restricted to the report RPCs. Accept the listing’s number and the optional save-for-reuse choice in one database transaction. Keep an explicit contact choice and preserve existing records through a forward migration. Confirm that a failed listing write changes neither the saved number nor another listing, a one-off number can be published without creating a saved profile, and a settings-only write stays private. Decide how to migrate already published numbers without silently expanding the audience or changing the contact.

### SEC-02 · A concurrent profile change can change the contact a listing publishes

The UI previews a number loaded earlier and skips the profile update when the input matches that locally cached value. The listing RPC accepts the method and checks whichever number is stored when its transaction runs. The per-owner lock makes each individual RPC consistent, but the preview, profile write, and listing write span separate operations. A concurrent update in another tab or device can cause the completed listing to show a different number from the one the author confirmed. [Profile hook](../src/lib/reportContact.ts#L26-L55) · [Listing save](../src/App.tsx#L355-L374) · [Create and edit RPCs](../supabase/migrations/20261119000200_specialized_mvp_contact.sql#L108-L155)

**Fix and acceptance.** Include the confirmed number in the listing transaction, or require the expected profile revision and reject a stale preview before publishing. Verify with two synthetic sessions for one owner that a concurrent change either preserves the explicitly confirmed number on the new listing or requires fresh confirmation. Cover both create and edit.

### SEC-03 · Discovery discloses contacts in bulk and lacks application-level abuse controls

The directory accepts an empty search and returns up to 100 full records with the selected contact in each section and lost/found view. Any eligible member can load these results. The limit applies per response, with no application-level request budget or distinct contact-access control in the checked-in implementation. This makes it easy for an eligible account to collect campus identifiers and contact details at a scale beyond individual returns. The client also requests a new directory result on each search edit. Aborting a browser request does not guarantee that PostgreSQL stops the work. [Directory RPC](../supabase/migrations/20261119000200_specialized_mvp_contact.sql#L187-L239) · [Client query](../src/App.tsx#L37-L60) · [Search input](../src/App.tsx#L202-L211)

**Fix and acceptance.** Preserve member browse/search and direct contact while limiting bulk disclosure. Consider a paginated item summary and an authenticated per-listing contact lookup on user action, with a durable budget keyed to the member and optional infrastructure-level protections. Recheck open status, consent, and eligibility at contact lookup time. Enforce the budget at the actual API boundary, including direct RPC access, and debounce UI search. Use counts and opaque identifiers for abuse monitoring while excluding item values, contacts and query text. Confirm that normal browsing and both contact methods still work and that requests beyond the intended budget are limited.

### SEC-04 · Report writes and owner history allow unbounded growth

The browser limits roll and ID numbers to 80 characters each. The database stores both as `text` without an equivalent bound. The inherited validators check field names and use `->>` text coercion, which accepts non-string JSON values for these fields. The active quota only counts open and reserved reports, and `list_my_reports` aggregates the entire owner history. Together, these gaps can retain large values and make reads or directory search expensive. The directory normalizes query text before enforcing the normalized length. Provider request limits and timeouts were outside this verification. [Schema and validators](../supabase/migrations/20261114000400_reports.sql#L8-L160) · [Input bounds](../src/App.tsx#L396-L407) · [History and directory RPCs](../supabase/migrations/20261119000200_specialized_mvp_contact.sql#L158-L237)

**Fix and acceptance.** Validate JSON types and raw input bounds on the server, enforce appropriate field limits in the database, and inventory existing rows before validating new constraints. Preserve leading zeros and building codes. Paginate owner history, bound creation frequency independently of the active quota, and adopt a retention policy for closed records. Verify field boundary values, valid legacy records, history pagination, and unchanged per-owner quota enforcement.

### SEC-05 · Production still runs the retired photo-processing function

On 2026-11-19, `supabase functions list` reported `report-photo` as `ACTIVE`, version 5, with JWT verification enabled. The MVP config disables deployment locally, and the hosted MVP migration history includes the migration revoking photo RPC access and dropping the three storage policies. Those database changes do not remove the hosted function. The checked-in handler verifies origin and membership, then reads and decodes the image before attempting storage. If the hosted handler follows that path, it still exposes image decoding and runtime cost even when current database permissions reject writes. Hosted function source and authenticated invocation were outside this verification. [MVP function config](../supabase/config.toml#L35-L39) · [Revocations](../supabase/migrations/20261119000200_specialized_mvp_contact.sql#L288-L294) · [Handler ordering](../supabase/functions/report-photo/handler.ts#L49-L89) · [Earlier deployment](handoffs/phase-2.md#verification-and-evidence)

**Fix and acceptance.** Confirm production consumers and retire the hosted function through the deployment process. Keep the private storage ACLs closed, check for separately granted legacy access, and verify the function inventory and release procedure reflect retirement. Keep rollback and data retention decisions separate from disabling the endpoint.

### SEC-06 · Membership checks omit application bans and institutional offboarding

`is_ashoka_member()` checks the current Auth email, confirmation, provider, and linked Google email. It omits the Supabase user ban field and has no signal for an account disabled only in Google Workspace. A still-valid Supabase JWT could retain data access where hosted API handling leaves revocation to database policy. The WhatsApp contact lookup also does not re-evaluate the poster’s eligibility, so a previously offered contact can remain visible if the poster’s Auth record loses eligibility without deleting the user row. Email has its own eligibility checks. [Membership helper](../supabase/migrations/20261114000100_ashoka_auth.sql#L28-L58) · [Contact resolution](../supabase/migrations/20261119000200_specialized_mvp_contact.sql#L18-L41) · [Session configuration](../src/lib/supabase.ts#L8-L15)

**Fix and acceptance.** Enforce the current ban state in the database path and use a consistent private eligibility check for published contacts. Define how the maintainer revokes a departed or suspended member’s access, including any institutional signal available to the project. In an isolated environment, verify read, write, and contact visibility after revocation while a prior session token is still valid. Preserve the original sign-in and required Google identity checks.

### SEC-07 · Loaded directory views retain expired contacts

Directory state refreshes on query changes and local reloads. There is no refresh on window focus, contact activation, or a short lifetime. When another member closes a report or changes its method, the existing view can continue rendering the old address or number and its link. New directory reads filter closed reports. [Client query lifetime](../src/App.tsx#L37-L60) · [Contact rendering](../src/App.tsx#L483-L508) · [Directory filter](../supabase/migrations/20261119000200_specialized_mvp_contact.sql#L213-L220)

**Fix and acceptance.** Refresh or clear stale contact state on refocus and apply a short lifetime. If introducing per-listing contact retrieval, check current authorization at the point of action. Use two synthetic clients to verify an already open view removes or refreshes a contact within the chosen interval after a close or switch. People can still retain a copy of information they previously saw.

### SEC-08 · The app cannot remove a saved WhatsApp number

The database supports removing a saved number if no open WhatsApp report depends on it. The settings form requires a valid number and offers only Save number. A member who has finished using WhatsApp therefore has no supported UI to erase their saved number. [Settings form](../src/App.tsx#L442-L471) · [Required phone input](../src/ReportContact.tsx#L14-L26) · [Removal RPC](../supabase/migrations/20261119000200_specialized_mvp_contact.sql#L53-L78)

**Fix and acceptance.** Add a removal control and actionable guidance when open listings currently depend on that value. Confirm deletion and the empty state after reload. When fixing SEC-01, define separately how a member withdraws a published number and deletes a private saved preference.

### SEC-09 · WhatsApp contact ownership is unverified

The project deliberately accepts member-supplied numbers. Format validation cannot establish who controls the number, and the directory presents the WhatsApp action without indicating that difference from verified Ashoka email. A typo or deliberate false entry can direct peers to an uninvolved recipient. [Product contract](../constitution/objective.md#access-and-disclosure) · [Phone validation](../supabase/migrations/20261119000200_specialized_mvp_contact.sql#L53-L75) · [Contact action](../src/App.tsx#L503-L508) · [Known limitation](handoffs/cards-and-keys.md#known-limitations-and-next-task)

**Fix and acceptance.** Label WhatsApp numbers as supplied by the reporter and confirm the number at publication. Provide a maintainer process for disabling an incorrect or abusive listing. Treat proof of control as a product decision if abuse warrants it. Continue to support email without a phone number.

### SEC-10 · Production HTML lacks browser isolation headers

The production homepage returned HSTS but no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or explicit `Referrer-Policy`. Vercel declares no custom response headers. The app has authenticated actions and keeps Supabase sessions in browser storage, increasing the potential impact of future same-origin script injection. The reviewed report rendering uses React text and validated contact links. The header observation establishes a missing browser control. [Vercel config](../vercel.json) · [Session persistence](../src/lib/supabase.ts#L8-L16) · [Contact link construction](../src/lib/reportContact.ts#L6-L13) · [Hosted homepage](https://foundry-ashoka.vercel.app/)

**Fix and acceptance.** Set a restrictive CSP with `frame-ancestors 'none'`, an explicit `Referrer-Policy`, and `X-Content-Type-Options: nosniff`. Include only the script, font, style and connection origins the production build needs. Test the built site, Google PKCE callback, token refresh, directory requests, styling, and external contact links. Check the headers on the live HTML routes after rollout.

### SEC-11 · CI lacks a dependency advisory gate and uses mutable action tags

CI uses `npm ci` and a frozen Deno lock during Edge checks, but the workflow contains no dependency advisory check and references the checkout and Node setup actions by version tag. A tag can move, and a new advisory against a locked dependency can go unnoticed. The npm audit run for this review reported zero known advisories at that time. It does not cover the Deno-only dependency graph. [CI workflow](../.github/workflows/checks.yml#L7-L24) · [Package scripts](../package.json#L6-L13) · [Edge lockfile](../supabase/functions/deno.lock)

**Fix and acceptance.** Pin GitHub Actions to reviewed commit SHAs with an update mechanism. Add advisory monitoring for the npm lockfile and the Edge dependency graph where supported, with a maintenance owner. Keep production runtime and development-only dependency findings scoped to their actual exposure.

## Verification and coverage

- `npm run test:db` passed 16 tests on the full historical migration sequence. `npm run lint`, `npm run build`, `npm run check:edge`, and all eight Edge tests passed. The fixture uses synthetic accounts and already covers base-table restrictions, peer projection, legacy consent, owner-only return, and revoked claim/photo RPCs.
- `npm audit --json` reported zero advisories. A targeted scan of tracked files found no common secret-key prefixes or private-key markers. The hosted JavaScript contained the expected Supabase publishable key class and no recognized service-role or secret-key class. These are bounded checks.
- The public homepage and JavaScript returned HTTP 200. The JavaScript contained the MVP directory, WhatsApp and return RPC references. Its asset hash differed from the local build, so source attribution relies on the deployment handoff and the bundle feature check. Hosted migration history matched all nine local migration versions, ending at `20261119000200`. Hosted function inventory confirmed SEC-05.
- Live checks were public reads and provider inventory queries. Two-account hosted acceptance, provider Auth and log settings, backup retention, and authenticated Edge behavior remain unverified. The next hosted acceptance should cover ineligible and eligible sessions, owner-only changes, both contact methods, contact changes, and closed-listing visibility using synthetic item and contact data.
