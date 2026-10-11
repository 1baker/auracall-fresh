# Plan0401 | Reject delayed ChatGPT completion after absolute deadline

State: CLOSED
Baseline: bfcbbc0c3b3ef35e15f8417570eb439787862a73.
Branch fix/issue226-absolute-deadline; isolated auracall-absolute-deadline worktree.
Authority: user approved diagnosing-bugs/TDD/review/PR flow.

## Contract and scope

Public affinity executor must reject a result at or after its lease absolute
expiry even if the renewal timer callback has not executed. Both newly created
and existing conversations use the same success-boundary check. Preserve failure
settlement and outcome-unknown fences; no resubmit, installed adoption, provider
request, live TTL test, registry semantics change or architecture refactor.

## Red and green evidence

Retained diagnostic replay on current main:
pnpm vitest run tests/browser/chatgptAffinityExecutor.test.ts
  -t 'unscheduled absolute deadline'
RED1/PASS1: new conversation resolved completed after deadline; existing control
rejected. Clock jump uses vi.setSystemTime without advancing timer callbacks.
Hypotheses ranked: missing success-boundary gate, clock mismatch, registry rule
mismatch. Source confirms new bind lacks expiry gate; renewal timer alone is
insufficient. Minimal fix checks captured completion time in settleSuccessfulLease
before any new/existing success mutation, matching renewal's >= cutoff.

Initial executor GREEN20. Added exact deadline coverage;2 assertions initially
failed because existing at-deadline failure idles outcome-unknown while just-after
failure retains active claim. Corrected expectations to existing documented fence
semantics; no failure-settlement change or relaxed success assertion.
Focused final command: pnpm vitest run tests/browser/chatgptAffinityExecutor.test.ts
 tests/browser/chatgptAffinityRuntime.test.ts tests/browser/legacyChatgptAffinityRuntime.test.ts
 tests/browser-service/tabLeaseRegistry.test.ts tests/browser-service/tabLeaseRestartReconciliation.test.ts
PASS53 across5 files,2s, no retries; provider/browser calls excluded.
pnpm typecheck PASS. Targeted Biome lint of executor and regression PASS.

## Primary review

Frozen spec above, baseline bfcbbc0c3; primary serial Standards and Spec review.
Standards: existing owner module/public test seam, minimal three-line semantic gate,
no new abstraction or duplicated configuration;0 accepted findings.
Spec: both workloads at/after expiry reject, retained failure fences and success
controls covered; no installed/provider effect scope creep;0 accepted findings.
Remaining: PR integration, installation and live adoption separate from source.
Memory disposition forbidden: no explicit durable memory-update request.
