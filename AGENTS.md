# AGENTS.md — Context router

## Start here

For every task, read only:

1. `docs/PROJECT.md`
2. `docs/RULES.md`
3. the relevant feature document
4. the relevant code and tests

Read `docs/ARCHITECTURE.md`, `docs/DOMAIN.md` or `docs/DECISIONS.md` only when the task touches those areas. Do not read `docs/archive/` by default.

## Development workflow

For each feature or bugfix, replace `.dev/TASK.md` with the current task before editing. Use it as temporary working memory only; do not create feature plans, debug notes, changelogs or other temporary Markdown files. The only exception is `.dev/PLAN.md` for a user-approved multi-phase plan, while that plan is active.

1. Read this router, `docs/PROJECT.md`, `docs/RULES.md`, then relevant code/docs.
2. Record goal, current/expected behavior, constraints, files, plan, findings and validation in `.dev/TASK.md`.
3. Implement the smallest valid change; update the task file only when useful.
4. Run relevant tests and verify final behavior.
5. Move only durable knowledge to an existing `docs/` source of truth; keep implementation notes temporary.
6. Finish by replacing `.dev/TASK.md` with the following:

```yaml
# Current Task

No active task.
```

7. Commit the task as described in "Commits per task".

## Commits per task

The user authorizes committing every finished task on `main`. Commit at the end of each task without asking again. Do not push, and do not create branches or tags unless the user asks.

- Before committing: run the validation that fits the task, reset `.dev/TASK.md` to "No active task.", and review `git status`.
- One commit per task. Unrelated changes inside one task go in separate commits. If a file mixes two topics, the message names both.
- Stage only the task's files. Changes the user left uncommitted (for example `.claude/skills/redesign-existing-projects/SKILL.md`) stay out of the commit and are mentioned in the final answer.
- Message format: `type(scope): summary`, written in Spanish like the repository history. The body says what changed and why, and cites the affected decisions (`D0XX`). End with the attribution lines the session environment provides.
- New decisions go to `docs/DECISIONS.md` in the same commit.

## Context routing

| Task | Read |
|---|---|
| General project context | `docs/PROJECT.md` |
| Backend, frontend, persistence, API or sync | `docs/ARCHITECTURE.md` |
| Entities, statuses, relationships or field meaning | `docs/DOMAIN.md` |
| Business/security/offline rules | `docs/RULES.md` |
| A decision or architecture change | `docs/DECISIONS.md` + `docs/ARCHITECTURE.md` |
| Order creation and assignment | `docs/features/assignments.md` |
| Cut, visit, GPS, photo or field capture | `docs/features/cuts.md` + `docs/features/readings.md` |
| Offline queue or retry | `docs/features/synchronization.md` |
| Folder layout, naming or code comments | `docs/ARCHITECTURE.md` (Mapa del código) |
| Open findings from the structural cleanup | `docs/archive/limpieza-estructural/TASK.md` (Hallazgos section) |
| Open pending items and conflicts from the SEPSA delivery | `docs/archive/entrega-sepsa/TASK.md` (Pendientes and Hallazgos sections) |
| SEPSA delivery (copy of the active sources, dated; index and pending items) | `docs/entrega-sepsa/README.md`; pending items in `docs/entrega-sepsa/14-pendientes-sepsa.md` |
| SEPSA answers and decisions of 2026-10-13 (SC08 scope, eligibility, final reading, inconclusive lookup, evidence) | `docs/DECISIONS.md` (D027–D030) and the active feature documents they cite |
| SEPSA pending items for code (seeds, other-device data, lookup retry coverage) | `docs/entrega-sepsa/14-pendientes-sepsa.md` (section C) |
| Word copy of the SEPSA delivery | Generated outside the repo from `docs/entrega-sepsa/`; see D030 |

## Before editing

- Existing implementation is the primary evidence of current behavior; documentation records intent and constraints.
- If code and active documentation conflict, identify whether the code is wrong, the documentation is stale, or the decision is pending. Do not silently reconcile a critical conflict.
- Make the smallest valid change. Reuse existing ports, use cases, repositories and components. Avoid unrelated refactors, parallel implementations and unneeded dependencies.
- Before changing behavior, identify affected entities, permissions, offline persistence, sync, errors, tests and future API compatibility.
- Put critical rules in domain/application code, not only in UI.

## Non-negotiable product rules

- Roles are `ADMIN` and `TECHNICIAN`; a technician operates only assigned orders, with authorisation enforced by the authoritative layer.
- Validate and persist locally before confirming an offline-capable operation; keep it in the durable queue until valid sync confirmation.
- No physical cut without online, conclusive, current, single-use authorisation immediately before execution. Offline, timeout, unknown, or conflict never authorise.
- A cut capture requires a real final meter reading, GPS and photo, or only the documented controlled exception with an auditable reason. Never invent data.
- Preserve unique operation IDs, versions, audit trail and conflicts. Do not use last-write-wins for assignments, cancellations, authorisations or physical results.
- Excel, mocks and the current backend are provisional; mark unknown semantics `TODO: VALIDAR CON SEPSA`.

## SEPSA delivery

- `docs/entrega-sepsa/` is a dated copy of the active sources (D021). When a source changes, update the delivery in the same task.
- Keep the delivery short: about 36 pages at A4 and 10 pt (D030). Add content only when a point of the SEPSA letter requires it.
- No internal `.md` links inside the delivery. Cite a source path only when it is needed to verify a fact.
- Items that SEPSA decides (infrastructure, retention, personal data, SC08 destination) are reported as information, not designed by the project.
- SC08 fields out of scope (D027) are stated as out of scope and are not documented further.

## Verification and delivery

- Use integer minor units or controlled decimals for money; never store secrets or plaintext passwords in frontend/docs.
- Show actionable errors and distinguish local save, pending sync, synced, failed and uncertain review.
- Test the changed behavior, including relevant offline/restart/retry/duplicate/conflict/permission paths.
- Update one active source of truth only; link to it instead of copying the same rule elsewhere.
- Done means: confirmed requirement, correct domain and authorization, durable persistence, sync behavior where needed, recoverable errors, tests and coherent active docs, and the task committed (see "Commits per task").
