# Plan 0419 — custody scope for owned request admission

State: OPEN
Parent: Plan0415 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: 694435163

## Current State

Provider-free prerequisite for pre-send admission. Every generated CDP command
already crosses guardedCdp admission. DesktopControlRuntime acquires automation
custody separately for each command; a long-lived request interceptor cannot infer
continuous custody from those short holds. Simply enclosing setup and cleanup in
withAutomation deadlocks its nested CDP commands. The real guarded transport test
went red on Fetch.enable with desktop busy after the bounded acquisition retries.

The existing withAutomation interface now carries exact-owner async context.
Nested commands for the same lock and binding revalidate the published automation
owner token and PID before effects. Another binding is rejected, human takeover
remains excluded throughout the outer scope, and inherited callbacks after release
cannot revive the old scope. Separate gate instances for one display share context.
No production interceptor is enabled by this change.

## Scope and acceptance

Keep ownership semantics local to DesktopControlGate, using its existing public
interface and real guardedCdp fixture. No native probes, installation, warning
clearance, human-session interruption or new production quota. Preserve invalid
ownership handling, atomic publication and command-level human exclusion.

Red command:
`pnpm vitest run tests/browser/desktopControlGate.test.ts -t 'automation scope'`
Failed on nested Fetch.enable with desktop busy. Green selection:
`pnpm vitest run tests/browser/desktopControlGate.test.ts tests/browser/desktopControlObservation.test.ts`
Seven tests pass before the supplemental stale inherited-callback assertion.
Seven tests also pass with the stale inherited-callback assertion; typecheck
passes. Serial primary review of the patch against694435163: Standards (AGENTS,
architecture/testing/validation policies and smell baseline) has no accepted
blocking finding; the change preserves the existing interface and ownership store.
Spec (Plan0415 and this packet) has no accepted blocking finding for scoped
custody reuse. Existing human exclusion, invalid record/publication and actual
observation fixtures pass. Full request admission and issue acceptance remain
incomplete. Full build and diff checks pass before the source commit.

Next connect this hold to the real owned-client request lifecycle. Event listeners
must explicitly bind the owner's async context: event emission alone does not
guarantee subscription-time context. Revalidate target lease plus browser/desktop
generation at actual admission; cleanup Fetch before ending the custody scope.
Bootstrap, retained targets and safe cancellation remain unproved. Do not claim
this prerequisite proves complete request enforcement or full Plan0386 acceptance.
