# Plan 0426 — public utility bootstrap request proof

State: CLOSED
Parent: Plan0425 / Plan0424 / Plan0415 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: 3cd7bc529c35433e2fe022d0a662994dab172886
Owner: primary, serial

## Current State

Source packet complete; issue165 remains OPEN. Actual public service/utility/
adapter/annotation/guarded-CDP now run against the existing external SDK fixture.
Page.navigate raises backend request events through the owned Fetch handler; Runtime
payload fetches do likewise. First provider navigation requires the handler already
installed. Blank target precedes exact custody. Positive context reads send exactly
one bootstrap and one payload request under fixture limit2 and close once.

Clean budget regression returned normal context after overflow was blocked. The
bounded cleanup helper swallowed owned client close failure. Request-aware normal
cleanup now propagates failure; known pre-send budget errors retain their typed
leaves for collector yield. A mixed read+budget regression lost the read cause;
read and cleanup outcomes are now combined after guaranteed cleanup, without
throwing from finally. Provider warnings, uncertain sends and budget denial reject
without an overflow send or second provider navigation.

Transport-close rejection and bounded-close timeout were separately red: the former
idled the utility as settled, the latter returned success after unconfirmed close.
OwnedBackendRequestCleanupError carries cleanup uncertainty through aggregate
errors into request effect reconciliation; these leases now idle/outcome-unknown.
Desktop custody stays held when disconnect fails or is unconfirmed. The fixture
explicitly releases only its synthetic hold after assertions, not as proof of a
native disconnect. Warning during payload dispatch persists429 and leaves unknown
request custody. Seven public modes cover success, budget, uncertain send, mixed
read+budget, transport rejection, close timeout and warning.

Serial primary review against3cd7bc529: Standards uses AGENTS, architecture,
testing and validation policies plus code-review baseline; no remaining blocker.
Biome's unsafe-finally finding was repaired by moving throw decisions after cleanup.
Spec uses this plan under Plan0415/0411/0386. Diagnosed blocking findings: swallowed
close error, lost primary read error, false settled classification after rejected
close, and false success after cleanup timeout. All repaired and closed-world
verified. No broad fresh-context drift discovery or delegation; inherited controls
remain. Formatter normalized touched adapter code; no new operator activation.

Focused88tests/7files pass: final request/utility/route/lifecycle selection79,
plus9selected adapter close/abort tests (185other adapter cases excluded).
Typecheck and scoped Biome/diff checks pass;2existing informational computed-key
notices remain in the lifecycle fixture. That fixture used a non-configurable,
non-writable SDK Close stub; installed SDK descriptor is configurable/writable/
enumerable. Correcting the fixture descriptor restored all13lifecycle cases.
An initial incomplete loadingFinished fixture produced an unhandled error; it was
corrected before the clean budget red was qualified. These are fixture failures,
not flaky retries or native proof.

Commands: `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'public
utility bootstrap'`; red controls `-t read-and-budget`, `-t transport-failure`,
`-t transport-timeout`. Final focused selection also includes configured authority,
both configured utility test files, context-affinity routes and tab lifecycle.
Adapter selection: `pnpm vitest run tests/browser/chatgptAdapter.test.ts -t
'close|abort'`. Source/fixtures only, no build/install/provider/scheduler/clearance
effect. Progress classification: progress.

Remaining: request-aware abort-triggered cleanup, retained/background sessions,
other bootstrap/caller paths, compatible participants, production ceiling selection
and full Plan0386 native materialization. Abort cleanup still uses the separate
bounded-close path and is not qualified by normal-completion cases. Pending
changed-B locator and production ceiling questions remain unanswered. Parent plans
stay open; production callers still omit the optional request ceiling.

## Acceptance and bounds

Blank target creation precedes exact custody. First provider navigation must have
owned Fetch admission installed, permitting requests only within an explicit fixture
ceiling. A positive context read must succeed and release client custody; exhausted
request flow must stop the public operation without a second provider navigation
or an overflow send. Keep failure/uncertainty evidence through close and lease
settlement. Use existing fixture; establish a red-capable control before any fix.
If baseline already satisfies this contract, record qualified source proof rather
than invent a production defect. Verify test sensitivity with one bounded mutation
only where needed. Serial Standards/Spec review against the base; no delegation.

No production caller/config activation, numeric ceiling choice, provider probe,
install, scheduler change or warning clearance. Other bootstrap/caller paths,
retained/background targets, compatible participants and complete Plan0386 native
materialization remain open. Scope: bounded public bootstrap proof/fix, supporting
tests/docs and source checkpoint. Goal resources/review bounds are inherited.
