# Session and agent handoff

Updated: 2026-11-18. Phases 0–2 are complete. Phase 3 is next. Live test app: https://foundry-ashoka.vercel.app.

## Start a new session

1. Read [objective.md](../../objective.md), [techstack.md](../../techstack.md), and [roadmap.md](../../roadmap.md).
2. Read the latest completed handoff: [Phase 2](phase-2.md). If the next phase has an in-progress handoff, read that checkpoint too.
3. Inspect `git status`, existing configuration, and deployment/migration state before making changes. Preserve all current work.
4. Follow the next action below. Update the current phase handoff as work progresses and finish it before advancing phases.

## Handoff index

| Phase | Status | Implementation record |
|---|---|---|
| 0 — Constitution | Complete | [Phase 0 handoff](phase-0.md) |
| 1 — Foundation and feasibility | Complete | [Phase 1 handoff](phase-1.md), [hosted evidence](../evidence/phase1-runtime-2026-11-14.json) |
| 2 — Reporting and discovery | Complete | [Phase 2 handoff](phase-2.md), including owner confirmation and verification evidence. |
| 3 — Claims and return | Not started | Create `phase-3.md` when work begins. |
| 4 — Matching | Not started | Create `phase-4.md` when work begins. |
| 5 — Release and pilot | Not started | Create `phase-5.md` when work begins; final operational handoff is required before MVP completion. |

These records support the constitution. A future phase's proposed design must not be presented as implemented behavior.

## Next concrete action

When starting Phase 3, read the [Phase 2 handoff](phase-2.md), inspect the working tree and hosted state, and create `phase-3.md` from the shared template. Start with claim submission and evidence access for the claimant and finder.

## Prompt to resume with another agent

```text
Continue the Lost-and-Found project at Phase 3. Read AGENTS.md, the three
constitution files, docs/handoffs/README.md, and docs/handoffs/phase-2.md first.
Inspect current code, git status, provider access, and applied migration history.
Follow the documented next action; keep requirements and verified behavior intact.
Create the Phase 3 handoff and complete it before starting Phase 4.
Ask me and pause if missing input blocks the work. Do not require prior chat history.
```
