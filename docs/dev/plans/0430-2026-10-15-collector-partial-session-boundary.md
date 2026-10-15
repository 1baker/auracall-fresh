# Plan 0430 — collector partial-session boundary

State: CLOSED
Scope: bounded source packet; issue165 remains OPEN
Parent: Plan0429 / Plan0411 / issue165
Base: b657b10677c71ef0dd812b3d803fd5f107b94277
Branch: fix/issue165-owned-backend-request-admission
Owner: primary, serial

## Current State

Final-chunk cleanup uncertainty now propagates. Partial context chunks retain a
session in detail options, but top-level collect has no session cleanup boundary.
Qualify actual collector return and serialized continuation with configured owned
client authority. Preserve direct inventory helper's intra-operation session reuse.

## Acceptance and bounds

Top-level request-aware collect drains its retained session before returning or
throwing. Partial chunk cursor/evidence remains resumable in a fresh explicit
pass with fresh owned request authority; no automatic retry, duplicate overflow
or false completion. Unknown cleanup fences custody and preserves primary error.
Session handback must survive any existing per-surface option copy. Keep no-hook cleanup-failure
compatibility and direct helper intra-operation session reuse. Scope collector boundary and known tests/docs.
Vertical TDD, serial primary Standards/Spec and accepted-findings-only verification.
No subagents, activation, provider probes, install, scheduler/clearance or new
journey allowance. Wider bootstrap/background/compatible/native gates stay open.
Goal resource/review controls inherited without renewal.


## Diagnosis and review

Partial-session source red left Fetch handler installed after actual collect
returned cursor24. Boundary cleanup fixed that seam. Test then read an additional
queued row, outside its intended one-row packet; add explicit detailReadCap1.
Reducing previous conversation input alone was insufficient because provider
inventory also contributed a row. That fixture-scope correction does not claim
a product defect. Per-surface attribution independently stayed red with the same
live handler: copied options lost session handback. Finally handback repairs it.

Four focused cases qualify normal and per-surface return, rejected close and
combined diagnostic/close failure. Cursor24 and completed artifact survive first
return; JSON evidence resumes at24 in a new explicit authority/client, two distinct
request permits. Confirmed close releases settled lease; uncertainty retains idle
unknown lease. Cleanup runs before completion progress. Direct helper chunk reuse
is preserved by placing the boundary only in top-level collect. Untagged no-hook
cleanup-failure tolerance remains; top-level sessions now close per pass.

Serial primary Standards/Spec review against baseb657b1067; no delegation, fresh
broad drift review or new review allowance. Accepted blocking findings: missing
pass cleanup and scoped session handback, both closed-world verified. Mixed-error
preservation and known/unknown custody controls verified. Outer collector timeout
can race service abort teardown; disposition needs_evidence in next bounded unit,
not qualified by these observed-session return/diagnostic cases. Existing adapter
close bound applies; no arbitrary new retained-session close interface introduced.

Remaining: collector cancellation/late teardown, other exact-tab/bootstrap/
background callers, compatible participants, production ceiling and full Plan0386
native acceptance. Changed-B locator and ceiling answers still missing; production
hook remains omitted. No live provider/build/install/scheduler/clearance effect.
Memory disposition forbidden by session developer instruction, zero writes.


Primary validation141focused tests/4files pass (backendRequestAdmission55,
metadataCollector68, trafficPlan13, configured authority5), including direct
helper chunk reuse and existing cursor/budget semantics. Typecheck exit0, scoped
Biome and diffcheck pass. Logs /tmp/issue165-partial-validation.log and
/tmp/issue165-partial-last-typecheck.log. Reproduce partial selection with
`pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t detail-partial`.
No full-suite or native claim. Progress classification: progress.
