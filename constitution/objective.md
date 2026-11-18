# Lost & Found — product constitution

Updated: 2026-11-19. Status: Phase 3 in progress. See the [Phase 3 checkpoint](../docs/handoffs/phase-3.md).

## Authority and maintenance

This file, [techstack.md](techstack.md), and [roadmap.md](roadmap.md) are the project's source of truth. Read all three before implementation.
- This file owns product behavior, privacy, scope, and acceptance requirements.
- techstack.md owns architecture, services, and engineering constraints.
- roadmap.md owns sequencing, dependencies, validation, and progress.
- Explicit new user decisions override these documents. Update affected documents before implementing a changed decision; do not silently change scope to fit code.
- Resolve contradictions against the product requirements here, then align the other files. Mark unverified assumptions explicitly.

## Phase completion and handoff requirement

Before moving from any phase to the next, document the completed implementation in `docs/handoffs/phase-N.md`, using [the handoff template](../docs/handoffs/TEMPLATE.md). This is a required deliverable for every phase, including the final release phase. A phase is complete only when its observable exit checks pass and its implementation handoff is accurate and complete.

Each handoff must make the next session independent of chat history: explain actual behavior, decisions, files/components, database/API/security contracts, local and deployed configuration, exact run/verification commands, evidence, known limitations, and the next concrete task. Clearly distinguish implemented, tested, deployed, planned, and unverified work. Include names and nonsecret identifiers only; never credentials or private user data.

When work stops mid-phase or changes agents, update the same phase document as an in-progress checkpoint without claiming completion. Reconcile the handoff, roadmap status, and affected constitution requirements before proceeding. Handoffs are implementation/evidence records subordinate to these three constitution files; they do not silently redefine product behavior or add an approval requirement.

New sessions must read the constitution and [handoff index](../docs/handoffs/README.md), then the latest completed phase and any current checkpoint. The latest completed implementation is recorded in the [Phase 2 handoff](../docs/handoffs/phase-2.md).

## Purpose and success

Help the Ashoka University community report lost and found belongings, discover likely matches, and return items through private, finder-reviewed claims.

The MVP succeeds when two eligible users can complete this journey: publish a found item → discover it from a lost report or directory → submit private evidence → finder accepts → arrange collection → confirm return. A third user must be unable to read their claim evidence or the finder email disclosed for handoff. Dedicated ID-card/key listing fields are an explicit campus-visible exception described below.

## Stakeholder decisions preserved

1. The main interface is a personalized dashboard with My Listings, My Claims, and a browsable lost/found directory.
2. General belongings use backend textual semantic matching. Dedicated ID Cards and Room Keys sections use structured fields and basic string matching only; both matching paths are MVP requirements.
3. The finder decides who receives the item. Algorithms and platform operators do not decide ownership.
4. Personal account details stay private except that accepting a validated claim reveals the finder's verified university email to that claimant for independent handoff coordination. Listed card/key identifiers are also explicit exceptions; they identify the item holder, not the reporter's account.
5. Finders validate claims using private evidence; general-item reports prompt them to withhold a distinguishing detail. Each member may keep at most three active lost and three active found reports across all sections.

## Audience and access

- Require Google sign-in with a Supabase-confirmed email ending exactly in `@ashoka.edu.in` (case-insensitive). Google is the only enabled sign-in provider. No separate email OTP or confirmation link. The Google hosted-domain (`hd`) value is not an eligibility requirement.
- Listings, photos, search, and dashboard require eligible sign-in. The unauthenticated page only explains the portal and offers login.
- The same member can be a lost-item reporter, finder, and claimant on different items.
- Membership checks the Google-authenticated, confirmed email address. It does not establish Workspace management, current student enrollment, or item ownership.
- Working assumption: all eligible domain accounts may participate, including staff or alumni who retain those accounts. A student-only policy needs an additional authoritative eligibility source.

## MVP requirements

| ID | Requirement | Observable result |
|---|---|---|
| O1 | University access | Google users with confirmed @ashoka.edu.in email enter; other domains, unconfirmed emails, non-Google identities, and invalid sessions cannot access app data. |
| O2 | Dashboard and directory | Members see their listings, claims, and unread notifications; browse General Items, ID Cards, and Room Keys with appropriate search/filter controls and separate lost/found views. |
| O3 | Limited reports and category-specific discovery | Members have at most three active lost and three active found reports in total; general items use semantic matching, ID cards/keys use string matching. |
| O4 | Private claims and finder decisions | Claimants submit evidence privately; only the claimant and relevant finder access it; only the finder accepts/rejects. |
| O5 | Contact disclosure and closure | Acceptance reveals finder email only to the accepted claimant; parties coordinate outside the app, finder records return, and in-app notifications track claim changes. |

### Report content and lifecycle

For General Items: require lost/found type, title, category, public description, approximate campus location, and date lost/found (an approximate-date option is allowed). Optional: up to three item photos. Dedicated ID-card/key forms use the minimal fields below instead.

Public here means visible to authenticated eligible members, not the internet. General-item listings must omit email, phone number, legal name, student ID, room number, and full serial numbers. Dedicated sections intentionally display only their specified name/identifier fields to eligible members. Never automatically copy Google account identity into a listing. Explain visibility when posting; do not claim automatic redaction.

For general found reports, prompt the finder to withhold one distinguishing feature and confirm that the public photos/text do not reveal it. The finder retains this detail; the MVP does not store an answer key. For ID cards/keys, listed name/number values are searchable and cannot alone prove ownership; the finder must evaluate additional private evidence or verify ownership before acceptance.

| Record | Allowed lifecycle |
|---|---|
| Found report | Open → reserved when a claim is accepted → returned after handoff. Reservation may be cancelled back to open. Owner may withdraw an unreserved report. |
| Lost report | Open → resolved by its author, or withdrawn. If linked to a completed claim, resolve it in the return transaction. |
| Claim | Pending → accepted or rejected by finder; pending/accepted → withdrawn by claimant; accepted → cancelled by finder or completed on return. |

Resolved/returned/withdrawn reports stay in owners' history and disappear from default discovery. Withdrawal is a status change, not destructive deletion. Reopening, disputed ownership, and permanent deletion UX are deferred.

When a finder withdraws an open found report, reject its pending claims with reason "report withdrawn" and notify those claimants in the same transaction.

### Active-report limits

Each member has two independent quotas: **three active lost reports** and **three active found reports**, shared across General Items, ID Cards, and Room Keys. This permits six active reports total, not six per section.

- Lost reports count while open; found reports count while open or reserved. Pending/accepted claims do not release slots.
- Resolved lost reports, returned found reports, and withdrawn reports do not count. Withdrawal closes a mistaken/no-longer-relevant listing; it does not assert successful return.
- Block a fourth active report of the same type in the backend, including simultaneous requests. Show “Lost: 3/3” and “Found: 2/3” with a link to manage existing reports; never auto-resolve a report to make room.
- Closing a report releases its slot immediately. Cancelling acceptance returns reserved → open and still uses the same found slot.
- Report type and section are fixed after creation in the MVP. Any future reopening/import/type-change path must enforce the same quotas.

### Dedicated ID Cards and Room Keys sections

| Section | User-entered report information | Matching |
|---|---|---|
| ID Cards | Cardholder name, roll number, ID number; at least one roll/ID number required, with name when known. Unknown values remain empty, never invented. | Exact normalized roll/ID values; shared conflicting identifiers exclude the candidate. Name is a supplementary exact-match signal, never proof of ownership. |
| Room Keys | Room number and holder name, both required. Room number retains its full building/block-qualified code when known. | Exact normalized room number plus name; duplicate names or room numbers may produce several candidates. |

The user selects lost/found and section. No description, photos, manual title, location, or event-date fields are required or accepted for these specialized reports. Creation time/status are system metadata; titles are generated from the fields. A key with unknown holder/room can be reported as a general item using a non-sensitive description.

Provide separate navigation sections with lost/found views and field-specific search. Both sections contribute to My Listings and the shared quotas. ID/key fields are campus-visible but must not enter semantic embeddings, AI calls, or analytics/log payloads. Do not use a general semantic query to search these sections.

Normalize case and whitespace for comparison while preserving the original values and leading zeros. Do not merge different room/block codes or guess aliases. Matches are candidate reports only; there is no automatic claim or acceptance.

### Claims and email handoff

1. A member claims an open found report, optionally linking their own lost report, and provides a private description of identifying details. Self-claims and multiple active claims by the same member on one item are blocked.
2. The finder sees an anonymous claim reference and evidence. They accept or reject it; no automated ownership score is shown.
3. Accepting one claim reserves the item. Enforce at most one accepted claim per item even under simultaneous requests. Other pending claims remain pending and cannot be accepted while reserved.
4. Acceptance means the finder has validated the claim. Reveal the finder's verified Ashoka email only in the accepted claimant's private claim detail, with copy/open-mail actions. Tell the finder before acceptance that this shares their email. The claimant coordinates the handoff using their own email client; the app does not schedule collection, send email, or disclose the claimant's email automatically.
5. Finder marks the item returned after physical handoff. Complete the accepted claim, resolve its linked lost report, and close other pending claims as rejected with reason "item returned." If acceptance is cancelled/withdrawn before handoff, reopen the found report and allow pending claims to proceed.

Finder email is available only while the claim is accepted. Hide it again after rejection, withdrawal, cancellation, or completion; retain the claim outcome. Previously viewed/copied emails cannot be recalled. Notification previews and general listing/search responses must never contain this email.

### Matching rules

Use semantic matching only for General Items. Generate embeddings from their public report text only; never embed ID-card/key fields, claim evidence, or account identity. English is the initial supported language.

For a lost report, return available found candidates; for a found report, return open lost candidates. Exclude own reports, withdrawn/closed reports, and reserved found items. Show up to five candidates within the same section. Never cross-match General Items, ID Cards, and Room Keys. A result is a suggestion; claiming always targets a found report.

If generation fails, save the listing, show matching as pending/unavailable, and retain keyword search and filters. Retry safely. Keyword search alone does not satisfy semantic acceptance for General Items. ID Cards and Room Keys must always use their deterministic string-matching path, without embedding generation or semantic fallback.

### Notifications

Create recipient-specific notifications for claim submission, claim decision, accepted-claim withdrawal/cancellation, and completed return. An acceptance notification links to private claim details without including the finder email. Persist each with the underlying database change.

Provide a bell, unread count, notification list, and link to the related record. Fetch on login, bell opening, tab focus, and every 60 seconds while visible. Stop polling when signed out or hidden. Mark read only when opened or explicitly marked read.

Closed-app notifications wait until the next visit. App-sent email, push, and automatic match alerts are outside this MVP. Users may email each other independently after the authorized disclosure.

## Privacy and experience requirements

- Peers see item details and anonymous claim references. Exceptions are the specified campus-visible ID-card/key fields and finder email shown only to an accepted claimant. Google profiles, internal account identifiers, claimant email, and personal dashboards remain private.
- Private fields must be absent from unauthorized API responses, database queries, storage access, search, logs, and notification previews; hiding UI elements is insufficient.
- Use private image storage and authorized temporary access. Removing access cannot revoke a photo someone already downloaded.
- Dashboard should work at 360 px mobile width and desktop, with keyboard access, labeled forms, visible focus, text status labels, and clear empty/loading/error states.
- App operators necessarily administer infrastructure; do not promise anonymity from administrators or anonymity at a physical meeting. No moderator ownership adjudication or broad admin dashboard in the MVP.

## Scope boundaries and assumptions

Deferred: native apps, payment/rewards, image matching, chat, in-app collection scheduling, app-sent email/push, public browsing, multi-university support, staff inventory workflows, automated ownership decisions, and advanced moderation.

Working defaults to validate during implementation: eligible-domain membership; English matching; finder-managed handoff; dashboard visual styling without an official university endorsement. Campus location choices should be editable and verified before pilot; do not invent an official campus map.

No paid services, payment-card activation, or expiring credits may be necessary for the MVP. If a required capability cannot meet this constraint, record the blocker and propose a concrete alternative before changing the architecture.

## MVP release acceptance

1. Complete report → claim → validated acceptance → finder email disclosure → independently arranged handoff → confirmed return, with two eligible accounts and persistent notification history.
2. Demonstrate claim/evidence/email isolation for a third member and denial of all app data for ineligible/unauthenticated users; allow eligible members only the deliberate ID-card/key listing fields.
3. Meet the General Items semantic benchmark and ID-card/key string-matching checks in roadmap.md; specialized create/edit/search must make zero embedding calls.
4. Demonstrate both three-report quotas across all sections under concurrent creation, correct slot release, single-claim reservation, and idempotent transitions/notifications.
5. Pass mobile/keyboard checks, deploy within no-card free allowances, and document export/restore and operational limits.
