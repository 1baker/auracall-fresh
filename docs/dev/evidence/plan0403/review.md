# Plan0403 source review

Fixed point: 813651d951c6560b3d0c74cb370a45db618239bd.
Comparison: git diff 813651d951c6560b3d0c74cb370a45db618239bd...HEAD.
Spec: Plan0403 and operator-agreed runtime > browser profile > configured global
launch-field defaults. Standards: AGENTS.md, CONTEXT.md and architecture/testing/
documentation/validation policies. Primary performs both axes serially; no delegation.

## Standards

Launch-field policy is in the existing immutable plan owner. Stored execution has
one local projection used for actual options and affinity; no wrapper moves an
independent precedence chain. Aliases are normalized per layer, blanks skipped,
false cookie override retained. Plan inputs are cloned, authorization stays mutable
outside the plan, no dependency cycle is added, and production metadata/recovery/
artifact/model logic is untouched. Literal public-seam tests replace historical
expectations only where the operator approved the new contract. Accepted findings:
none; no blocking smell or documented-standard violation.

## Spec

Runtime/browser/global policy, explicit selected browser, source/managed identity,
canonical/legacy aliases and blank fallback are covered. Explicit runtime/service
directories are retained, stale provider directory removed. Runtime false disables
derived cookie bootstrap; explicit bootstrap requests remain supported. Stored
options and affinity use the same values; legacy source alias now supplies
consistent authorization identity. No unrelated lease/provider rewrite, installation
or live work. Accepted finding A1 (blocking, resolved): default manual-login injection masked an explicit provider-binding false preference. The public regression in browserLaunchPlan.test.ts reproduced it; default resolution now defers to runtime/global provider preferences before applying the default. See manual-login-red.txt and final acceptance output.

Historical Plan0402 receipts are preserved. New semantics intentionally change
launch-plan defaults and managed-root-derived directories when runtime conflicts
with browser settings; deployments must review configured paths before adoption.
CLI execution's explicit session-config plan remains unchanged. No universal
provider/browser lifetime acceptance is claimed.

Intermediate full executor checks found two service-directory regressions; corrected
by applying the existing manual-login default before service binding. Retained
failure output is executor-green.txt (an attempted green run, not a pass receipt).
Type errors in the first compile attempt were corrected; final pass is recorded
separately. No retries or hidden failures are treated as successful runs.

Standards: 0 accepted findings. Spec: 1 accepted blocking finding, resolved; no unresolved blockers. Highest accepted severity: provider manual-login preference regression (resolved).
Memory disposition: forbidden; no explicit durable-memory update request.
