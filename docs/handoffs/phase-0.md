# Phase 0 — constitution handoff

Status: Complete. Documentation baseline established 2026-11-14; this retrospective implementation record was added on the same date. Phase 1 is complete and its [handoff](phase-1.md) is the current technical resumption record.

## Delivered records

| File | Responsibility |
|---|---|
| [objective.md](../../objective.md) | User journeys, access/privacy, report fields, quotas, category-specific discovery, claim and return lifecycle, acceptance criteria. |
| [techstack.md](../../techstack.md) | React/Vite frontend, Supabase backend, deterministic vs semantic matching, atomic mutations, deployment and no-card constraints. |
| [roadmap.md](../../roadmap.md) | Phases 0–5, dependencies, implementation order, exit checks, evidence, and decision log. |

## Product decisions carried forward

- Personalized dashboard, university Google login, directory, and finder-controlled private claims.
- Three active lost and three active found reports total per user across all sections; reserved found reports count.
- General Items use backend semantics; separate ID Cards and Room Keys use minimal structured fields and normalized string matching with zero model calls.
- Finder email becomes available only to the currently accepted claimant after validation; users coordinate handoff independently. The finder confirms return.
- Durable in-app notifications; free services requiring no payment card. Account/claim privacy follows the explicit listing-field and accepted-finder-email exceptions.

The later user-selected authentication clarification is now reflected in the constitution: Google sign-in plus confirmed exact `@ashoka.edu.in` email suffix; no hosted-domain requirement. See Phase 1 for actual enforcement.

## Verification, deployment, and limits

Phase 0 was a documentation task. Its evidence was review against stakeholder feedback and agreement across the three constitution files; no application tests or deployment are attributed to this phase. It created no database tables, endpoints, storage, provider configuration, or environment values. The files have subsequently evolved with explicit user decisions and implementation evidence; the current constitution governs.

No original stakeholder `objective.md` snapshot or phase commit hash is available in the current repository. Do not invent prior versions. Current git/remote state is recorded in Phase 1 and must be rechecked before resuming.

## Transition and future documentation rule

Phase 1 implemented the foundation selected here and is documented separately. All future phases require a complete implementation handoff before transition. Current next work is Phase 2, using the handoff index and Phase 1's actual code/deployment details. This retrospective record introduces no product scope changes.
