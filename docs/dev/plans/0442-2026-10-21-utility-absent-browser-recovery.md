# Plan0442 — Utility absent-browser recovery

State: CLOSED
Issue: https://github.com/ecochran76/auracall/issues/245
Branch: fix/issue245-startup-leases
Owner: primary agent

## Current State

Public utility fixture reproduces exact startup tab-leases-active refusal despite
native absence proof. Initial mock wiring failed and was corrected; valid RED is
1failed/1passed in16ms. Two-line source wiring passes both in10ms. Baseline51tests
pass. Source/build checks, review and PR integration are complete; installed proof below.

## Scope and acceptance

Serial bounded slice. Supply strict native absence verifier to utility ephemeral
acquisition, reusing existing coordinator reconciliation. No endpoint is not absence
proof. Preserve active/in-flight/unknown leases and profile/tenant admission. Public
utility seam must recover settled idle fixture with positive native absence, and
refuse unchanged fixture when absence cannot be proven. No live browser shutdown,
lease deletion, owner reset, provider prompt or recovery bypass. Verify affected
suites, typecheck/build/lint and source integration. Live browser-loss recreation
is excluded; installed seam proof uses fixtures only.

## Diagnosis

Ranked hypotheses: missing utility verifier; wrong scope; unsafe lease. Passing only
the existing strict verifier changes RED to GREEN, establishing missing wiring as
cause of this reproduced pattern, not original process disappearance attribution.
Configured live-follow already supplies the same verifier. No new release algorithm.

## Source validation and review

77focused tests/5suites pass in1.77s, typecheck/build and scoped Biome pass.
Primary Standards review against63712f32c: existing verifier reused, no new release
algorithm or bypass. Spec review: exact utility failure repaired; unknown-presence
control remains blocking. No accepted blocking finding. Initial mock wiring failure
is excluded from defect evidence. Installed runtime verification remains pending.

## Installed acceptance

PR358 merged555b4b9e8c9ca59e4375da12c215e188ee11f606. Exact staged597dist
files match; /desktops contract PASS. First installed source-mock copy was invalid:
external ESM bypassed that mock, so the negative expectation failed. Replacement
probe uses real native census with absent fixture directory versus existing managed
browser directory; both public utility cases pass in395ms,12unselected. No live
browser input or provider effects; fixture registry/startup only. Temporary copies
removed. CLI/MCP activated to user-runtime-issue245 after fresh idle checks.
API PID99557 resolves that runtime, HTTP200/ok:true, scheduler remains paused and
all23prior paused completion IDs remain paused. Native browser PID81391/start28446377,
assignment/window verified unchanged; rate-limit hash unchanged. Active interactions0.
Private receipts: ~/.auracall/acceptance/issue245-20261021/. Historical browser exit
actor remains unknown. Installed seam proof does not simulate live browser shutdown.
Memory forbidden: no explicit save request.
