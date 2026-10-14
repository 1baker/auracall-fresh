# Plan 0412 — populated context direct-only retry

State: OPEN
Parent: Plan0411 / issue165
Branch: fix/issue165-populated-context
Target: main
Base: a761df02c8a161c824a52a045d791e61bd6c5e4e
Integration: reviewed short-lived branch

## Current State

PR313 is integrated58d9615f7 and installed with581compiled-file parity. The
paced original read emits all10messages before its60second read deadline, but
CLI exit remains pending until the90second controller sends SIGINT. Preserve
that failed terminal result; Plan0413 owns the successor terminal-boundary repair.
Plan0412 remains OPEN until full original-command acceptance and resource readback.

User resumed the full live-follow repair goal with Ask Matt and renewed a
two-million-token/six-hour window. Parent control starts epoch1791974597;
checkpoint before1791996197, with advance checkpoint1791995297/1.9million tokens.
Primary owns serial execution, with no delegation. Historical counters persist.
The independent project-index budget-yield branch remains unintegrated.

Two paced installed diagnostics reproduced the populated-page60second timeout.
Owned-target capture qualified ten current message roots and explicit role
markers. Raw evidence remains private outside Git. Current source reads those
markers successfully in an isolated real-DOM replay. Native telemetry reaches
message extraction, then a second payload route fallback; direct payload reads
return404 while the page remains readable. This is not deletion evidence.

Public ChatgptService with production utility affinity, coordinator, registry,
ledger, traffic/navigation guards and context reader is the regression seam.
External endpoint/CDP, identity/payload responses and message-page transport are
simulated. A separate temporary real-DOM replay qualified actual message
extraction on recorded structure with synthetic IDs/text; review retained only
the regression needed for the navigation repair in the existing route harness.
Denied payload plus no exact fallback response and120second navigation cooldown
fails bounded completion. Existing successful route cases are controls.
Setting only settled retry allowNavigation=false makes the failing case pass.
Existing preserveActiveTab=true was ineffective because explicit
allowNavigation=true takes precedence. No selector change is needed.

## Scope and acceptance

- Preserve first governed fallback and all identity/route/custody/warning guards.
- Make the settled payload retry direct fetch only, even if caller permits
  navigation. Return existing role-qualified DOM messages without another visit.
- Keep refresh/cache semantics and payload-unavailable classification unchanged.
- Run focused source checks, typecheck, scoped lint and build, then primary
  serial Standards and Spec review against the pinned base and parent scope.
- Integrate and promote with compiled parity and preservation of installed
  capabilities; one paced installed read must return all ten current messages.
- Verify scoped OS/lease cleanup and retain unrelated scheduler/completion pauses.

Non-goals: provider prompts/uploads/history changes, budget increases, role
inference from text, project-discovery repair, or claiming full parent acceptance.

## Evidence and next action

Loop: `pnpm vitest run tests/browser/chatgptContextAffinityRoute.test.ts -t denied-payload`.
Temporary DOM qualification started with ten messages and minimized to a
user/assistant pair. The retained public-service regression needs one synthetic
visible message. It uses virtual policy time and a bounded real-I/O yield to let
actual cache/custody filesystem operations settle. No new dependency is retained.

Focused and broader source checks, typecheck, scoped Biome and full build pass.
Primary serial Standards/Spec review has no open blockers. Integration,
installation and native proof remain pending. Parent changed/quiet/guard/scheduler
acceptance remains OPEN.
