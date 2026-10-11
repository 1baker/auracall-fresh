# Serial Matt review | inventory/submission handoff

Pinned comparison: working-tree patch against102056878; `git diff 102056878 -- src/cli/chatgptDeveloperAppsCommand.ts tests/cli/chatgptDeveloperAppsCommand.test.ts CONTEXT.md docs/configuration.md docs/dev/plans/0405-2026-10-11-developer-app-affinity-config.md`. Source spec: Issue253, Plan0405 native original acceptance revision and public red13ms regression. Primary runs separate review axes; no independent reviewer claimed.

## Standards

AGENTS terminology, architecture guardrails, existing CLI validation and typed adapter/utility contracts govern. Shared validation is extracted into a private state-aware implementation, not duplicated or exposed as a bypass. Inventory and submission adapters close in finally; awaited utility settlement preserves custody before transfer. Process ownership and provider-side guards unchanged. Tool-enforced type/lint checks tracked separately. No accepted blocking standards finding.

## Spec

Repair addresses the exact original pre_effect/process-owned gate via real CLI/utility/provisioner fixture, retaining full selected config and once-only evidence semantics. Confirmation/account/inventory/exact-app/prompt checks remain in existing implementation; shared lifecycle rechecks live identity before Send. Failed inventory settlement never calls submit. A potential cached-state concern is rejected as blocking: one same-command inventory observation is the existing behavior, and fresh live Send checks remain mandatory. No provider retry added. Source fixtures qualify handoff; original native completed submission still unproven, so Issue253 remains open.

Accepted findings: Standards0, Spec0. Native acceptance remains an explicit unfulfilled gate.
