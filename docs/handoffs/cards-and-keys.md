# Cards and keys MVP handoff

## Status and resumption

This is the active handoff for `mvp/cards-and-keys`, branched from the Phase 3 checkpoint `8804a2c` on 2026-11-19. GitHub main was verified at that commit. Earlier phase handoffs describe the broader product on main. Local implementation and hosted acceptance are tracked separately in the [roadmap](../../constitution/roadmap.md).

## Implemented behavior and decisions

Members browse lost and found ID cards and room keys. Each poster chooses email or WhatsApp for a listing and authorizes disclosure to other signed-in Ashoka members. The contact belongs to the person posting. The parties use their own email or WhatsApp clients to verify ownership and arrange collection. Members can manage their own listings after handoff.

Email uses the currently verified Ashoka account. The optional WhatsApp number is saved once for reuse. Updating that number updates the contact on open listings that use WhatsApp. Changing the contact method on one listing only changes that listing. Older listings start without consent and need their owner to choose a contact before they appear in discovery. General items are upcoming.

## File and component map

- [App.tsx](../../src/App.tsx) implements the signed-in directory, contact choices and owner actions. [AuthRoot.tsx](../../src/AuthRoot.tsx) continues to own session and membership checks.
- [The MVP migration](../../supabase/migrations/20261119000200_specialized_mvp_contact.sql) follows the Phase 3 migration and adds the manual-contact database contract. [Database tests](../../tests/database.test.mjs) cover historical behavior before testing the MVP migration.
- [Supabase configuration](../../supabase/config.toml) disables the legacy photo function for this branch. Historical Edge tests and source remain available.
- See the [product](../../constitution/objective.md) and [technical](../../constitution/techstack.md) constitutions for the branch’s privacy and architecture rules.

## Data, API and authorization

The migration adds nullable `contact_method public.report_contact_method` to `public.reports` and a protected `private.whatsapp_contacts(user_id uuid primary key, phone_number text)` table. A private lookup resolves the contact for the chosen method. The create/edit entry points call the earlier report validators in the private schema and reuse the per-owner advisory lock. The migration revokes browser roles’ access to private claim and photo RPCs and removes the general-photo storage policies. The browser uses the report RPCs without access to Auth or base report tables. New or edited ID/key reports carry a per-report `contact_method` of `email` or `whatsapp`. The owner can read their stored number through `get_my_whatsapp()` and save or update it through `set_my_whatsapp(p_number text)`. These operations take the identity from the session. Removing a saved number requires switching or closing open listings that depend on it.

The directory returns one selected `contact_method` and `contact_value` per eligible open listing. Source values come from protected server records. A saved number is not a campus-wide phonebook entry. The owner’s history remains accessible through `list_my_reports()`. `close_report(p_report_id uuid)` handles withdrawal or resolution. `mark_report_returned(p_report_id uuid)` lets the finder record manual return. Local tests exercise direct calls to the backend, including calls that bypass the UI.

## Environment and deployment

Use Node 22, `npm ci`, and the two public variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Preserve the ignored `.env.local`. Use the branch’s complete migration sequence in the intended Supabase environment before running `npm run dev` against it. For a fresh local Supabase instance, configure the Google provider and signup hook per [config.toml](../../supabase/config.toml). Historical authenticated testing instructions are in the [Phase 2 handoff](phase-2.md).

On 2026-11-19, `npx supabase migration list --remote=jdaertuqzbgfdnnpranl` showed only the seven Phase 2 and earlier migrations applied to the shared hosted database. Git branch creation and publication do not apply database migrations. The existing live app is https://foundry-ashoka.vercel.app.

## Verification and evidence

The local PostgreSQL fixture runs the complete migration chain. `npm run test:db` exercises 11 historical cases plus five tests of the final branch state, including legacy consent, email verification, profile reuse and replacement, revocation of unselected contact methods, denial to outsiders and owner-only return. The database tests use synthetic accounts.

| Check on 2026-11-19 | Evidence |
|---|---|
| Database and Edge suite | `npm test` passed all 16 database and eight Edge tests. `npm run check:edge` passed. |
| Browser, desktop | In isolated Chrome with synthetic Auth and mocked RPC responses, posted an email ID-card listing with a leading zero, changed its contact to WhatsApp, and posted a lost room key using the saved number. Updating that number populated the next edit form. Switching one listing to email left the other on WhatsApp. A synthetic peer saw only the selected value and link on each listing. Posting without a selected contact and saving a malformed number were blocked. |
| Browser, desktop and mobile | At 1280 px and 360 px, checked ID/key search, lost/found filters, the General items upcoming screen, keyboard dialog dismissal and focus return, legacy listing visibility, return and withdrawal, owner history, quota release and horizontal overflow. No real messages were sent. |
| Source and build | `npm run lint`, `npm run build` and `git diff --check` ran locally. |

## Known limitations and next task

The hosted environment still needs branch selection and deployment. For hosted acceptance, use two eligible test accounts and synthetic item/contact data. Publish one report using each channel, confirm member-only visibility, change a contact choice, close both reports, then confirm discovery no longer exposes them. A live OAuth session, a real WhatsApp message, and a physical exchange are separate from automated verification.

Legacy open general items continue to count toward the existing quota until their owners close them from My listings.

Previously viewed contact details can be retained by a member. Changing a contact or closing a report controls subsequent directory reads. WhatsApp numbers are member-supplied and do not undergo phone verification.
