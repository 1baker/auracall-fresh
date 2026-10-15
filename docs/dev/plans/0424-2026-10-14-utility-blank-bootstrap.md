# Plan 0424 — utility blank bootstrap before provider custody

State: CLOSED
Parent: Plan0415 / Plan0420 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: 9ad8a6324b8d02aab99cd32cf6b432029d9e85da
Owner: primary, serial

## Current State

Source packet complete; issue165 remains OPEN. The public service/utility/
coordinator/adapter cold case initially opened the provider conversation URL before
lease/annotation. Utility startup now requests about:blank; new target creation
uses blank and records its real initial fingerprint. Only an owned, still-unloaded
target can bypass the default preservation posture when caller navigation policy
permits. Live target inspection stays inside the settlement try/catch so a read
failure cannot strand an active claim.

First provider navigation occurs with an active exact lease and preceding mutation
start audit. Denied admission leaves blank; a fresh explicit pass reuses it rather
than opening another target. The coordinator accepts only a process-bound ephemeral
lease with blank fingerprint, observed blank URL and known effect (none/settled).
Unknown effects and changed URLs reject; no close or second target is performed.
Existing-target requirements remain stricter and do not adopt arbitrary blanks.

Serial primary review against9ad8a6324: Standards uses AGENTS, architecture,
testing and validation policies plus the code-review baseline; no remaining
violation. Spec uses this plan under Plan0415/0411/0386. Accepted blockers: owned
blank resumption (red incompatible-route error), preservation only while observed
blank, observation failure settlement, and utility-only reuse scope. Repaired and
closed-world verified. No broad discovery pass or delegation; goal controls carry.

Focused50tests/6files pass: route fixture12, coordinator24, configured utility10,
refresh lifetime2 and proof session2. Typecheck and scoped Biome pass; final
utility-only scope restriction passes all24coordinator cases; diff checks pass.
Original red/green: `pnpm vitest run tests/browser/chatgptContextAffinityRoute.test.ts
-t cold`. Initial overescaped selector skipped all tests and is not red evidence;
corrected selector reproduces eager provider creation. Resume red/green uses
`-t cold-denied`. Fixture expectation updates count one newly governed initial
navigation. The120s payload-recovery cooldown now paces both initial and single
fallback visits (180virtual ticks, no third retry navigation). Follow-up route-
custody tests inject a no-op base pacer while retaining real shared ledger/lease/
audit admission; attempted clock-only adjustments did not eliminate base pacing
and were removed. These deterministic fixture failures were not flaky retries.
Canonical project fixtures continue to seed their observed route and qualify
ready-route reuse, not cold slug bootstrap.

Progress classification: progress. Source only, no build/install/provider probe,
scheduler mutation or guard clearance. Remaining: request-hook composition in the
utility governor (it currently builds its own), other bootstrap callers, retained/
background targets, compatible participants, ceiling selection and full native
materialization acceptance. Pending changed-B locator/production ceiling questions
remain unanswered; no default or live authority inferred.

## Acceptance and bounds

Utility browser startup and new target creation must use about:blank. Preserve the
actual blank URL in lease evidence. After exact custody and annotation, allow the
normal governed provider route only if caller navigation policy permits it. Keep
existing-target preservation and route reuse; do not manufacture fingerprint proof.
Use existing public route fixture; prove operation admission precedes provider
navigation and denied admission leaves blank without provider load. Existing tests
for reuse, warning and denied recovery must remain meaningful under the new order.

Source-only blank-bootstrap packet: this removes one pre-attachment provider load,
not proof that every retained/background/browser startup path is covered. Other
caller composition, production request ceiling and full native materialization
remain open. No live probe, promotion, scheduler change or guard clearance.
Write surface: utility affinity, affected tests and supporting docs. Vertical TDD,
serial Standards/Spec review, closed-world accepted finding checks. Inherited goal
resource/review controls and original effect boundaries remain; no delegation.
