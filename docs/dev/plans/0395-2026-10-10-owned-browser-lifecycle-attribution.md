# Owned-browser lifecycle attribution | 0395

State: CLOSED
Owner: primary
Work item: #226
Branch: fix/issue226-lifecycle-attribution
Target: main
Source base: f9c5d675466df7c46b367c576f5ccefe9680d0bd

## Current State

Plan 0392 active-chat retirement protection is merged. LitScout's latest
three-minute run completed with browser present, then browser absence was found
after completion. Exit time/actor remain unknown. Latest native wake delivered
after resolving CLI/scheduler version mismatch. Direct handoff is retained at
/tmp/litscout-issue226-evidence-readout.md; private source receipts remain at
the operator's research-notes locations. No raw research data is copied here.

## Bounded slice

Persist generation-bound owned-browser launch, shutdown request/return and child
exit observations at the existing browser-service lifecycle seam. Record owner
PID, browser PID, observed process start ticks (or null), port, generation time,
hashed profile identity and exit code/signal. No provider contents or credentials.
Journal is adjacent to the configured registry. Keep existing lifecycle behavior;
diagnostic persistence failure is visible but must not interrupt cleanup.

One deterministic public launcher regression must fail before the correction and
pass afterwards. Then run lifecycle ownership/regression checks and typecheck.
Review standards and scope once. Update operator docs/journal/fixes in the slice.

## Limits and acceptance

Source-only instrumentation; no install, restart, browser launch, prompt or wake.
No claim of incident root cause. Adopted browsers have no owned child exit event:
record requested owned shutdown, but never fabricate an exit code or observed
death from a returned kill operation. Pre-readiness failures, unrelated external
process deaths, direct CDP Browser.close and per-target retirement remain separate
instrumentation seams. This slice does not promise universal lifecycle coverage.

Done when generation-linked requested shutdown and actual owned-child exit are
durably readable, focused validation passes, and limitations are explicit.

## Source qualification

Owned launcher regression observed red (missing journal) then green. Final focused lifecycle/ownership/manual-login selection passes 31 checks
across three files; typecheck and full build pass. Scoped lint passes. Scoped lint has two existing mock naming warnings. Serial
Standards/Spec review is in docs/dev/reviews/0395-owned-browser-lifecycle-attribution.md.
Source instrumentation slice is complete; runtime adoption, broader close seams
and causal attribution remain open under Issue226. No installed acceptance claim.

Planning audit:392 candidates;32 errors, all pre-existing AGENTS.md references
to absent policy targets0035–0066. No Plan0395 finding. Audit is not globally
clean; this slice does not rewrite the unrelated policy rollout.
