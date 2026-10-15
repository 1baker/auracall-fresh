# Plan 0425 — utility owned request authority

State: CLOSED
Parent: Plan0424 / Plan0420 / Plan0415 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: 1b34e251c5b6f4eb80536649c36aa6593dd5ee00
Owner: primary, serial

## Current State

Source packet complete; issue165 remains OPEN. Initial actual utility/owned-CDP
fixture was red because annotation installed no Fetch handler. Configured clients
and utility now share ownedBackendRequestAuthority for account-wide request
reservation/start/settlement and conservative effect reconciliation. Caller supplies
exact lease ownership assertion; module never acquires/closes a lease. Utility
retains its existing lease, operation governor and lifecycle. Explicit optional
programmatic backendRequestLimit enables the utility hook; all production callers
still omit it. No config/default ceiling or activation selected.

Both caller orders prove one shared fixture permit: configured client then utility,
and utility then another runtime's configured client. Denial occurs before send;
only one utility-target lease exists. Unknown dispatch and warning during dispatch
leave even a read-only utility idle/outcome-unknown, with429 persisted. Lost lease
blocks before request reservation/send. Disabled hook stays absent; invalid ceiling
fails before browser resolution. Request permits remain separate operation units.

Reconciliation failure initially returned only the operation error (red). Utility
settlement now retains all failures and returns the original operation plus
settlement causes together. Failed reconciliation marks unknown before lease
settlement rather than downgrading custody. Actual persisted lease/effect and
request ledger outcomes are asserted through their public interfaces. Provider/CDP
are simulated; stores, shared account resolution, custody, annotation and cleanup
are real. This is not full public adapter/native request acceptance.

Serial primary review against1b34e251c: Standards uses AGENTS, architecture,
testing and validation policies plus the code-review baseline; no remaining
violation. Codebase-design informed the small shared request module rather than
copying the admission implementation into utility. Spec uses this plan under
Plan0415/0411/0386. Accepted blocking lost-reconciliation-cause finding repaired
and closed-world verified; no remaining source-packet blocker. No broad drift
discovery or delegation; goal review/resource controls remain inherited.

Focused144tests/9files pass: owned request/configured authority/utility selection47,
plus collector/traffic plan/route/refresh lifetime/proof selection97. Typecheck,
scoped Biome and diff checks pass. Original red/green command:
`pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'utility request
admission shares'`. Reconciliation red/green: same file `-t reconcile-failure`.
One attempted test insertion failed before editing and selected no cases; it is
not regression evidence. Final owned fixture includes7caller/failure modes plus
invalid-limit case. No retries/flakes/live tests; no build, install, provider,
scheduler or warning-clearance effect. Progress classification: progress.

Remaining: complete public adapter composition with request events during first
navigation, other caller/bootstrap paths, retained/background targets, compatible
participants, production ceiling and full Plan0386 materialization acceptance.
Changed-B locator and ceiling questions remain pending; no values or live authority
inferred. Source checkpoint only; parent plans remain open.

## Acceptance and bounds

Share request admission and conservative effect reconciliation between configured
clients and utility callers. Utility supplies its already-held exact lease and
ownership assertion; do not acquire a second serialized lease or borrow another
operation's governor. Explicit programmatic fixture limit enables the hook; no
production caller/config/default numeric policy is activated here. Validate limits
before utility effects. Aggregate account permits across caller/runtime families,
deduplicate and persist warnings as before; keep six operation units separate.
Known denial must not erase completed effects; unknown/unfinished request outcomes
must remain fenced even for nominally read-only utility work. No automatic retry.

Write surface: shared owned-request module, configured factory, utility and owned
request fixture plus supporting docs. Vertical TDD, serial Standards/Spec review
against the base; closed-world accepted findings only. Provider/CDP output simulated
but stores/custody/admission/annotation/cleanup real. Terminal: source checkpoint.
Other caller/bootstrap/retained/background/compatible-participant coverage and full
Plan0386 materialization remain open. No provider probe, install, production ceiling
choice, scheduler mutation or warning clearance. Resource/review controls inherited.
