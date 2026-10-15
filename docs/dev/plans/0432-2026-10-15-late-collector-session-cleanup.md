# Plan 0432 — late collector session cleanup

State: CLOSED
Scope: bounded source packet; issue165 remains OPEN
Parent: Plan0431 / Plan0411 / issue165
Base: 129619b62745fdddabc02261349032f9d222f86d
Branch: fix/issue165-owned-backend-request-admission
Owner: primary, serial

## Current State

Cancellation expiry preserves unknown outcome and active custody, but a provider
may first return a retained session after the collector has already stopped.
Qualify eventual cleanup using controlled provider completion and explicit session
close signals through existing actual collector/configured authority fixture.

## Acceptance and bounds

Late request-aware provider settlement closes its returned session without
changing the already-returned cancellation outcome, accepting data, restarting work
or retrying. Failed late cleanup keeps custody unknown and has observed rejection.
Preserve no-hook and noncancelled partial-chunk behavior. Reuse existing owned
session boundary. Scope context completion callback, known tests and supporting
docs. Vertical TDD, serial primary Standards/Spec and closed-world accepted findings;
no delegation, activation, native/provider/build/install/scheduler/clearance effect.
Full issue/native/participants/ceiling gates remain. Goal resources inherited;
finish this bounded packet before conservative1MM implementation stop.


## Diagnosis and review

Late provider hands back a retained session only after five-second drain expiry.
Actual collector/owned authority red observed stranded instead of close-started.
Observe aborted context settlement on both resolve and reject, reuse existing
withCollectorSessionBoundary and preserve the original returned cancellation.
No extra authority, client, retry, request permit or data acceptance is created.

Three controlled late cases pass: context returned, SDK close fails, provider
rejects after session handback. Explicit provider/close start/finish signals prove
one close. Original timeout still contains expiry uncertainty after late cleanup;
confirmed disconnect releases settled lease, failed close leaves idle unknown.
Late promise rejection has the existing timeout promise's rejection observers;
Vitest reports no unhandled rejection. SDK/provider controlled, actual collector,
annotation/factory/guard/ledger/registry. No public native composition claim.

Serial primary Standards/Spec review against base129619b62, no delegation or fresh
broad drift review. Accepted blocking finding was orphaned late handback; resolve/
reject and close-failure controls verify it. Existing boundary preserves read and
cleanup failures inside the observed late promise; no mutation of old public
failure or automatic resumption. No blocking finding remains within this packet.
No-hook timing and normal partial retention use the prior path.

Remaining: whole collector/public-service/native composition, caller request-
capability propagation (including factory-only cancellation without exposed hook),
bootstrap/background/compatible participants, production ceiling and full Plan0386
native acceptance. Genuine changed-B locator and ceiling answers still missing.
No activation, provider probe, build/install, scheduler/clearance or journey reset.
Inherited resource/review bounds unchanged; finish checkpoint before next unit.
Memory disposition forbidden by session developer instruction; zero writes.


Primary final validation148focused tests/4files passed: backendRequestAdmission62,
metadataCollector68, trafficPlan13, configured authority5. Typecheck exit0, scoped
Biome/diffcheck pass. Four real expiry cases take about20s, selection37.17s; no
retries or unhandled failures. Logs /tmp/issue165-late-validation.log and
/tmp/issue165-late-typecheck.log. Reproducer `pnpm vitest run
tests/browser/backendRequestAdmission.test.ts -t detail-cancel-late`.
Progress classification: progress. Current issue readback OPEN preserves
provider-free diagnosis only; Plan0386 GateB full build/lint/audit, canonical
integration/install and native/wider acceptance are not established by this packet.
Checkpoint before next implementation unit near conservative1MM control; no reset.
