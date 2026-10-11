<!-- gentle-ai:agent-routing -->
## Implementation Routing

Route work with the smallest useful topology: direct inline, delegated direct, or optional SDD.

- **Direct inline:** decide or verify from 1–3 files; use only for a mechanical, understood change.
- **Delegated direct:** delegate one narrow exploration when understanding needs 4+ files; delegate one writer for 2+ non-trivial files.
- **Optional SDD:** propose it only when durable proposal/spec/design/tasks would reduce substantial ambiguity and the user accepts it.
- File count or perceived risk alone never selects SDD. Direct/delegated work does not create SDD artifacts.

### Receipt-driven development is user-owned

The user controls the switch with `gentle-ai review mode enable|disable|status`.

- `status` is read-only.
- If the user asks to stop it, run `disable` and do not restart or work around it.
- While disabled, implement normally and report `disabled/unmanaged`.
- Never enable it without an explicit request.
<!-- /gentle-ai:agent-routing -->

# AGENTS.md — Context router

## Start here

For every task, read only:

1. `docs/PROJECT.md`
2. `docs/RULES.md`
3. the relevant feature document
4. the relevant code and tests

Read `docs/ARCHITECTURE.md`, `docs/DOMAIN.md` or `docs/DECISIONS.md` only when the task touches those areas. Do not read `docs/archive/` by default.

## Active plan: structural cleanup

A multi-phase cleanup is in progress. While `.dev/PLAN.md` exists:

- `.dev/PLAN.md` is the source of truth for the target structure, naming conventions, dependency rules, comment policy and phases. `.dev/TASK.md` is its checklist; the current phase is written at its top.
- Work on one phase at a time, in order. Mark `[x]` in `.dev/TASK.md` as each task is done and update the phase status table in `.dev/PLAN.md` when a phase closes.
- Cleanup phases never change behavior: only move (`git mv`), rename, split or comment. Do not change visible texts, endpoints, HTTP contracts, IndexedDB schemas or applied SQL. Record any bug or improvement found under "Hallazgos" in `.dev/TASK.md` instead of fixing it.
- Organization is **by type**, not by feature (field-app: `domain/`, `ports/`, `use-cases/`, `adapters/`, `state/`, `bootstrap/`, `services/`, `screens/`, `components/`, `components/common/`, `utils/`, `styles/`; backend: `http/`, `controllers/`, `services/`, `repositories/`, `mappers/`, `shared/`, `logging/`). New code follows the target structure of `.dev/PLAN.md` even before its phase runs.
- A phase is done only when its **Validación** block passes.
- A feature or bugfix requested during the plan does not replace `.dev/TASK.md`: add it as a separate section at the end of that file and remove the section when done.
- When every phase is done, follow "Cierre del plan" in `.dev/TASK.md`, which removes this section.

## Development workflow

For each feature or bugfix, replace `.dev/TASK.md` with the current task before editing (while a plan is active, see the section above). Use it as temporary working memory only; do not create feature plans, debug notes, changelogs or other temporary Markdown files. The only exception is `.dev/PLAN.md` for a user-approved multi-phase plan.

1. Read this router, `docs/PROJECT.md`, `docs/RULES.md`, then relevant code/docs.
2. Record goal, current/expected behavior, constraints, files, plan, findings and validation in `.dev/TASK.md`.
3. Implement the smallest valid change; update the task file only when useful.
4. Run relevant tests and verify final behavior.
5. Move only durable knowledge to an existing `docs/` source of truth; keep implementation notes temporary.
6. Finish by replacing `.dev/TASK.md` with the following (skip this while `.dev/PLAN.md` exists; only remove your own section):

```yaml
# Current Task

No active task.
```

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
| Structural cleanup, folder layout, naming or code comments | `.dev/PLAN.md` + `.dev/TASK.md` |

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

## Verification and delivery

- Use integer minor units or controlled decimals for money; never store secrets or plaintext passwords in frontend/docs.
- Show actionable errors and distinguish local save, pending sync, synced, failed and uncertain review.
- Test the changed behavior, including relevant offline/restart/retry/duplicate/conflict/permission paths.
- Update one active source of truth only; link to it instead of copying the same rule elsewhere.
- Done means: confirmed requirement, correct domain and authorization, durable persistence, sync behavior where needed, recoverable errors, tests and coherent active docs.
