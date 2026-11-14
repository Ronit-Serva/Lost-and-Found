# Session and agent handoff

Updated: 2026-11-14. Phases 0 and 1 are complete; Phase 2 is in progress.

## Start a new session

1. Read [objective.md](../../objective.md), [techstack.md](../../techstack.md), and [roadmap.md](../../roadmap.md).
2. Read the latest completed handoff: [Phase 1](phase-1.md). If the next phase has an in-progress handoff, read that checkpoint too.
3. Inspect `git status`, existing configuration, and deployment/migration state before making changes. Preserve all current work.
4. Follow the next action below. Update the current phase handoff as work progresses and finish it before advancing phases.

## Handoff index

| Phase | Status | Implementation record |
|---|---|---|
| 0 — Constitution | Complete | [Phase 0 handoff](phase-0.md) |
| 1 — Foundation and feasibility | Complete | [Phase 1 handoff](phase-1.md), [hosted evidence](../evidence/phase1-runtime-2026-11-14.json) |
| 2 — Reporting and discovery | In progress | [Phase 2 checkpoint](phase-2.md); completion requires live user walkthroughs, quota concurrency and responsive/accessibility evidence. |
| 3 — Claims and return | Not started | Create `phase-3.md` when work begins. |
| 4 — Matching | Not started | Create `phase-4.md` when work begins. |
| 5 — Release and pilot | Not started | Create `phase-5.md` when work begins; final operational handoff is required before MVP completion. |

These records support the constitution. A future phase's proposed design must not be presented as implemented behavior.

## Next concrete action

Continue Phase 2 from [the active implementation handoff](phase-2.md). Migration history is reconciled; report and photo migrations are deployed and the probe is retired. Next, run live authorized/unauthorized report and Storage checks, prove quota behavior under two concurrent requests, and complete the mobile/keyboard review before closing the phase.

## Prompt to resume with another agent

```text
Continue the Lost-and-Found project at Phase 2. Read AGENTS.md, the three
constitution files, docs/handoffs/README.md, and docs/handoffs/phase-1.md first.
Inspect current code, git status, provider access, and applied migration history.
Follow the documented next action; keep requirements and verified behavior intact.
Create/update the Phase 2 handoff and complete it before starting Phase 3.
Ask me and pause if missing input blocks the work. Do not require prior chat history.
```
