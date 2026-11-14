# Phase N — implementation handoff

Replace every placeholder with facts. Use “not implemented,” “not deployed,” or “not verified” where appropriate. Remove instructions when creating the phase document; never mark this template itself complete.

## Status and resumption

| Field | Record |
|---|---|
| Phase / scope / objective IDs | ... |
| Status | Not started / In progress / Complete |
| Updated / completed date | ... |
| Next phase allowed? | No until exit evidence and this handoff are complete. |
| First task for the next agent | Concrete action, relevant files, expected result. |

State the exact stopping point. If incomplete, list finished work, work in progress, and the blocker separately. Update this checkpoint before a session ends or changes agents.

## Implemented behavior and decisions

Describe the actual user journey and backend workflow in order. Map behavior to constitution requirements and explain material decisions. Identify mocks, placeholders, fallbacks, and unavailable features. Link any constitution changes and their reason; do not introduce new requirements here.

## File and component map

| Path | Responsibility / main entry points | Integration with existing code |
|---|---|---|
| ... | ... | ... |

Explain where the next agent should edit each capability and what should be reused.

## Data, API, and security contracts

Record exact implemented table/schema names, fields/types, constraints, indexes, ownership mappings, and lifecycle transitions. Include RPC/endpoint names and signatures, request/response shape, side effects, error cases, transaction/locking discipline, retry/idempotency behavior, and limits. Use “none” for groups that do not exist.

Document caller eligibility, RLS/grants, privileged-function checks, storage rules, safe projections, cache invalidation, and which private fields can be returned to which role. Explain how unauthorized requests are rejected and link the relevant tests.

## Local setup and deployment state

| Resource | Local / remote state | How to reproduce or inspect safely |
|---|---|---|
| Tool versions / dependencies | ... | ... |
| Environment names | Names and where configured; no values/secrets. | ... |
| Database migrations | Files, order, actually applied versions, history reconciliation. | ... |
| Functions / buckets / schedules | Deployed vs local-only, nonsecret identifiers. | ... |
| Frontend / CI / source control | URLs, branch/commit, uncommitted/untracked work, CI state. | ... |

Give exact working-directory-relative commands to run and check the app. Distinguish a new-project setup from an existing-project resume; flag non-idempotent commands. State any credentials or user action required without including the credentials.

## Verification and evidence

| Check / requirement | Exact command or manual procedure | Result / date / evidence |
|---|---|---|
| ... | ... | ... |

Distinguish agent-run local tests, hosted checks, user-reported results, and pending checks. Link sanitized raw evidence/fixtures where relevant. Record fixture size, runtime/context, timing boundaries, and confidence limits. Do not infer general performance or privacy from a small smoke check.

## Known limitations, recovery, and maintenance

Describe reproducible failures and their fixes, unresolved issues, temporary infrastructure, cleanup, migration/rollback considerations, compatibility warnings, and external dependencies. State whether each blocks completion or belongs to a named future phase. Do not hide a failed required exit check as future work.

## Next agent: start here

Give an ordered, bounded starting sequence covering repository/provider inspection, the first implementation task, dependencies, and the check that proves that task is done. Record remaining questions and the specific user input needed, or say “none.”

## Phase completion gate

- [ ] Roadmap exit checks are met with evidence; remaining nonblocking limitations have explicit owners/phases.
- [ ] Implemented behavior, file map, contracts, security, setup/deployment, and recovery are documented accurately.
- [ ] Working tree/commit and deployed migration/resource state are recorded; local-only work is identified.
- [ ] Constitution, roadmap, handoff index, and this record agree on current status and next action.
- [ ] The next agent can resume using repository files without access to earlier conversation history.
