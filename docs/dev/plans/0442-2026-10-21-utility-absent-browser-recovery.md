# Plan0442 — Utility absent-browser recovery

State: OPEN
Issue: https://github.com/ecochran76/auracall/issues/245
Branch: fix/issue245-startup-leases
Owner: primary agent

## Current State

Public utility fixture reproduces exact startup tab-leases-active refusal despite
native absence proof. Initial mock wiring failed and was corrected; valid RED is
1failed/1passed in16ms. Two-line source wiring passes both in10ms. Baseline51tests
pass. Source/build checks, review and PR integration remain.

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
