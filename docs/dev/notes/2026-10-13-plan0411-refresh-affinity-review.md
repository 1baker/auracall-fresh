# Plan0411 standalone refresh affinity review

Fixed point:68089e603 (checkpoint5, source identical to merged PR308).
Originating scope: Plan0411 / issue165, paced discovery and normal automatic
materialization acceptance. Primary serial reviews, no delegation.

## Standards

The diff removes a completion-only gate around the existing configured affinity
factory and supplies the refresh request ID when no completion ID exists. No
new schema, aliases, provider heuristics or guard exemptions. Factory fallback
for other providers/concurrency modes is unchanged; completion custody remains
its existing ID. Standalone tab-affinity now uses existing idle-lease maintenance
instead of generic profile-browser cleanup; README records the operator contract.
Public refresh replay replaces one existing mocked-output case with two input
cases and actual traffic-plan/governor/UI physical guard. Only CDP transport,
acquisition and collector output are simulated. No accepted blockers.

## Spec

Installed discovery1 stops at identity with required-governor refusal, before
physical connect. The minimized local command fails standalone with the same
error class before simulated navigation while the completion case succeeds.
The request-ID fallback makes both public calls succeed with one governed
simulated navigation each. Guard remains mandatory. This proves the acquisition
contract, not a live index, changed-B, quiet-repeat, original-chat causality or
scheduler acceptance. Those remain OPEN; no issue closure or retry bypass.
No accepted blockers.

## Validation

120focused tests (refresh, completion, configured affinity) plus82broader tests
(collector, traffic plan, provider governor) pass. Typecheck/build and touched
Biome pass. Planning audit33existing findings matches unchanged PR305 baseline
exactly; zero new findings. Native installed replay is the next separate gate.

Accepted findings: Standards0 / Spec0; no accepted severity.
