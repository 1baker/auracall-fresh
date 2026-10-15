# Plan 0431 — collector cancellation drain

State: CLOSED (bounded source packet; issue165 remains OPEN)
Parent: Plan0430 / Plan0411 / issue165
Base: 7e1055a0c931b405eb217fdf2fff088053b5be03
Branch: fix/issue165-owned-backend-request-admission
Owner: primary, serial

## Current State

Observed retained sessions close at collection boundaries. Outer provider timeout
still aborts and rejects immediately; a provider may finish owned cleanup later.
Qualify the actual collector/configured client boundary with explicit abort and
provider-completion signals before changing it.

## Acceptance and bounds

Request-aware detail timeout/cancellation must not report normal collection success
or proceed to another row while provider teardown is unresolved. Drain boundedly,
preserve original timeout/abort and cleanup uncertainty, fence unfinished custody.
Keep no-hook deadlines compatible and do not add retries. Actual collector,
configured authority/guard/stores with synthetic provider promise/SDK transport.
Scope context timeout seam, existing tests and supporting docs. Vertical TDD,
serial primary Standards/Spec and closed-world accepted findings only. No delegation,
activation, provider probes, install, scheduler, clearance or new journey allowance.
Other bootstrap/background/participants/ceiling/full Plan0386 native gates remain.
Goal resource and review controls inherited without renewal.


## Diagnosis and review

Controlled provider promise closes the real configured/guarded client only after
explicit cleanup release. Timeout red returned a successful collection object,
losing the delayed failed close. Bound fixture to one detail read so later rows
cannot obscure early return. Request-aware context timeout now drains its provider
promise up to five seconds, carries timeout/parent reason plus provider cause,
and rethrows cancellation even after confirmed close. Parent abort is observed
explicitly on this opt-in path; no-hook calls keep existing timeout semantics.

Four cases cover delayed failed close, confirmed close, parent abort and unfinished
provider. Unknown close retains idle unknown configured lease; unfinished provider
keeps active lease until explicit fixture-only completion, which is not native
cleanup proof. Provider promise/SDK are controlled, collector/authority/guard/
ledger/registry are real. Existing public service abort-drain tests are separate
contract evidence; no full collector/public-service/native composition claim.

Serial primary Standards/Spec review against base7e1055a0c, no delegation or broad
fresh drift review. Accepted finding: outer timeout erases late cleanup and permits
normal success/next work. Verified terminal cancellation, cause preservation,
bounded expiry and no-hook compatibility. A provider that resolves with a newly
retained session after drain expiry still needs separate late-session cleanup
qualification; disposition needs_evidence, not solved by active-lease fencing.
No expanded native/provider authority or goal/review allowance reset.

Fixture economics: default5s runner timeout cannot observe actual5s drain plus
setup; this table now allows10s, with only stalled case intentionally taking5s.
A subsequent10s fixture timeout came from missing abort already delivered during
ledger await. Add already-aborted check before event registration and rerun fresh
validation; do not erase first failures or label unchanged retry clean. Complete
source red/green and fixture corrections are recorded separately.


Primary final validation145focused tests/4files passed after fixture corrections:
backendRequestAdmission59, metadataCollector68, trafficPlan13, configured
provider authority5. Final typecheck exit0, scoped Biome/diffcheck pass. No full-suite
or native claim. Final logs /tmp/issue165-cancel-final-validation.log and
/tmp/issue165-cancel-final2-typecheck.log. Reproducer `pnpm vitest run
tests/browser/backendRequestAdmission.test.ts -t detail-cancel` has four cases.
Progress classification: progress. Memory disposition forbidden by session
developer instruction; zero writes.
