# Plan 0433.2 — bounded app refresh settings settlement

State: OPEN
Lane: issue316
Branch: fix/issue316-refresh-settlement
Target: main
Base:7912118c4663d7425a1501427f2491ca9e32fbfa
Parent:0433-2026-10-17-app-tool-refresh.md

## Current State

PR328 source is canonical and installed in an isolated prefix. The first installed
acceptance returned unconfirmed/exit1 after an attributable refresh response,
because final preservation could not be verified. That failure remains retained
in private issue316 diagnostics. It is not accepted as success. Native cause is
not retroactively assigned: the old generic message lacks an invariant reason.

Three public-adapter synthetic cases reproduce a settlement gap: briefly disabled
Refresh tools before/after activation and a not-yet-populated connected-account
section. All three fail on7912118c4. Wait for semantic UI readiness with a finite
read deadline, rather than comparing loading UI as if it were final state. Keep
one mutation, exact link/account/app/endpoint qualification and preserved identity,
connection and permission checks. Include a non-sensitive verification reason
when stable state truly differs.

## Bounds and acceptance

Same user goal and budgets; no reset. No new broad review pass. At most two
attempts for this settlement unit before reframe. Closed-world checks cover the
three observed-red cases and existing refresh invariants. No arbitrary sleep,
mutation retry, prompt, consent, reconnect, browser reset or service restart.

- Three settlement cases pass through the public adapter with one activation.
- Genuine identity/connection changes, foreign links and human approval still
  fail closed. Existing105 affected checks remain green.
- Types, lint, build and bounded native source acceptance pass.
- Merge via PR, install a fresh canonical prefix, then prove installed success
  and close issue316 with attributable receipts.

## Checkpoint 1

Progress:outcome_progress. Installed uncertainty exposed missing readiness
qualification, not success. Native read-only reconciliation is pending and does
not authorize an inferred cause. Red output is retained privately. Next: bounded
readiness repair, affected checks and native qualification before integration.

## Checkpoint 2 — source accepted

Progress:outcome_progress. Commit65843f194 and PR329 publish the bounded repair.
108 affected tests, explicit successful typecheck/compile and changed-file lint
pass. Normal compiled CLI native acceptance returned completed/exit0 with21 tools
and verified identity/connection preservation. No prompt, consent, reconnect or
mutation retry occurred. Read-only reconciliation was cancelled after stalling;
its timeout does not qualify native cause. Closed-world review passed; see
`docs/dev/notes/2026-10-17-issue316-settlement-repair.md`.
Remaining: canonical integration and fresh installed proof. Original goal budget
and hard stop still apply; no reset or new broad review cycle.
