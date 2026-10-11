# Plan0396 serial source review

Comparison: f3a14376864496cd7848da3b4bdd9cb439039133 to working patch
on fix/issue226-premium-slider. Spec: Plan0396; observed UI receipts in
../evidence/issue226-premium-power-20261010. Primary owns both axes; no delegation.

Standards: provider-specific behavior remains in browser actions. Stable semantic
selector and general thinking-time schema unchanged. Shared downgrade rule used
by both local/remote browser runs and workbench. Direct click confined to observed
model-view toggle. No provider submission in qualification. Lint passes.
No blocking findings.

Spec: old standalone6 Pro selection remains first path; fallback only select
strategy, absent row and observed exact GPT-6 option. Exact model classified,
Power4 requires matching Pro announcement; unavailable slot fails closed.
Current strategy does not enter premium fallback. Verified composite prevents
ordinary effort downgrade across three callers. Live source proof passed and
restored Medium after initial failed navigation/classification probes.
No blocking source findings.

Nonblocking limitation: fallback first consumes the existing20s scan before
trying GPT-6; retained rather than speculative pre-detection. Queued native
continuation does not prove provider work, and idle-browser disappearance still
has no established actor. Installed API adoption and active chat beyond actual
idleExpiresAt are independent gates.

Final validation:131 passed,1 skip; typecheck/build/lint/diff hygiene pass.
Planning audit32 pre-existing missing-policy references, no slice finding.
