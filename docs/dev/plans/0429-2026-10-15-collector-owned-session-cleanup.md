# Plan 0429 — collector owned-session cleanup

State: CLOSED (bounded source packet; issue165 remains OPEN)
Parent: Plan0428 / Plan0411 / issue165
Base: 4937217cb3ca8e3a01ec71de5e25cea0ec016408
Branch: fix/issue165-owned-backend-request-admission
Owner: primary, serial

## Current State

Utility-scoped sessions close before settlement. Collector final-chunk cleanup
still suppresses every session-close rejection; configured authority uncertainty
can be erased before the collector reports a detail row complete.

## Acceptance and bounds

An owned request-aware collector must preserve session cleanup failure and stop
before later detail work; a final chunk cannot report completion after unknown
close. Preserve primary read and cleanup failures together. Confirmed typed
pre-send budget denial retains normal cursor/yield semantics. Legacy no-hook
cleanup remains compatible. Use actual collector/configured authority/guarded
CDP/stores with synthetic provider rows. First red, minimal fix, serial primary
Standards/Spec then accepted-findings-only verification. No delegation.
Scope collector retained-session close seam and existing fixtures/supporting docs.
Other chunk lifetime, background, bootstrap and native Plan0386 gates remain open;
no activation/provider probes/install/scheduler/clearance or allowance renewal.


## Diagnosis, review and validation

Actual collector/configured authority/guarded transport red returned a successful
collection object after retained SDK close failed. Repair propagates owned typed
cleanup uncertainty independently of caller snapshot state. Generic close failure
is tagged only when request admission is active; untagged legacy cleanup remains
compatible. Read-path cleanup preserves both primary and close failures. Session
reference is removed before close, so error handling does not close twice.

Three retained source cases pass: final read with failed close, mixed read/close,
and factory-owned request hook without caller governor field. They stop before
project_2 and retain idle/outcome-unknown configured lease. SDK transport/provider
rows are synthetic; collector/annotation/factory/guard/registry/ledger are real.
Test-only DesktopControlGate holds release after assertions is fixture teardown.
The initial fixture-edit script failed before writing, so its attempted selection
skipped all tests; that is not red evidence. The subsequent populated fixture
produced the qualified successful-result red above. No flaky retry claim.

Serial primary Standards review against base4937217cb: no accepted structural
blockers. Spec review accepted swallowed close and lost primary-error findings;
factory-only marker propagation is required to close the same failure, not a new
broad discovery pass. Closed-world verification passes all accepted findings.
Inherited goal/review controls unchanged; no delegation or live probe.

Primary focused validation137tests/4files passed: backendRequestAdmission51,
chatgptMetadataCollector68, providerTrafficPlan13, configured authority5. Typecheck,
scoped Biome and diffcheck pass. No whole-suite or installed/native claim.
Logs /tmp/issue165-collector-session-validation.log and -typecheck.log; reproducer
`pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t detail-retained`.
Existing budget and chunk continuation cases pass in the same selection.

Remaining: partial-chunk session lifetime across top-level collection boundaries,
other exact-tab/bootstrap/background callers, compatible participants, production
ceiling and full Plan0386 native acceptance. Genuine changed-B and production
ceiling questions remain unanswered. Next bounded source step is partial-chunk
cleanup at the top-level collector boundary while retaining serialized cursor
continuation. No production activation/provider/install/scheduler/clearance effect.
Progress classification: progress. Memory disposition forbidden by session
developer instruction; no memory write.
