# Working on this repository

Read these files before implementation, in order:

1. `constitution/objective.md` — product requirements and privacy rules.
2. `constitution/techstack.md` — architecture and engineering constraints.
3. `constitution/roadmap.md` — phase status, exit checks, and next action.
4. `docs/handoffs/README.md` and the latest completed phase handoff — actual implementation and resumption instructions.

The three constitution files govern decisions. Handoffs document implementation and evidence; resolve conflicts in the constitution before changing behavior.

Before completing a phase or starting the next one, write/update `docs/handoffs/phase-N.md` using `docs/handoffs/TEMPLATE.md`. Record actual files, database/API contracts, authorization, environment and deployment state, verification evidence, limitations, and the next agent's first concrete task. Link the handoff from the roadmap and index. Documentation is a required phase deliverable, not optional follow-up work.

For interrupted work, save an in-progress checkpoint in the same phase handoff before ending the session. Keep completed and planned behavior distinct. Do not advance the phase until its exit checks and handoff are complete.

Check the working tree and provider state before resuming: local files, deployed resources, and migration history may differ. Do not overwrite ignored local configuration. Handoffs contain variable names and nonsecret resource identifiers only, never credentials, tokens, private evidence, or real identity data.

Current resumption instructions live in the handoff index; do not rely on previous chat history.
