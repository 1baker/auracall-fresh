# Plan0411 route repair — primary serial review

Fixed source base: c89504d36 (PR305). Goal: resolve issue165 / Plan0386, preserving
provider efficiency and warning/custody limits. This slice repairs the proven
standalone diagnostic access blocker, not full automatic acceptance.

## Standards

No accepted blocking finding. The patch reuses the provider's existing route
resolver and navigation policy; it adds no aliases, fallback navigation,
traffic-limit exception or adapter guard relaxation. Exact caller targets and
cache-only/non-affinity paths retain their existing ownership. Docs, journal
and fixes log describe the bounded behavior and limitations.

Fixture qualification: supported injection provides an isolated browser-process
endpoint and CDP transport. The injected utility function forwards directly to
the production utility wrapper with real coordinator, registry and ledger;
the public service and real adapter run. Synthetic successful messages validate
route handoff, never historical missing-message causality. No private messages
or provider responses are included. This external-process seam is sufficient
for the observed route refusal; live identity and normal automatic behavior
remain separately required.

## Spec

No accepted blocking finding for this slice. Before repair, the offline public
read reproduces the exact installed root-versus-conversation refusal. Passing
cases prove requested-route cold acquisition, one physical tab on warm reads,
one warm route navigation, and refusal when caller preservation/exact-target
policy forbids navigation. Existing provider traffic and session authorization
remain enforced. Plan0411 and Plan0386 stay OPEN because message-read diagnosis,
automatic asset/cache/archive, changed/quiet matrix and scheduler acceptance
are not proved by these tests.

## Validation and dispositions

Primary execution: 50 tests / seven relevant files pass; typecheck, complete
build, touched Biome and diff hygiene pass. Three lifecycle CDP.Close proxy
failures also occur independently on unchanged78aed4ee7 (same PR305 code line).
Disposition: nonblocking_backlog for this bounded source repair, retained as
baseline; no passing lifecycle cleanup claim. Planning audit returns the same
33 pre-existing missing-policy-reference findings as the unchanged baseline,
with zero added findings. Do not silently repair those unrelated policy links.

Standards: zero accepted blocking findings. Spec: zero accepted blocking
findings for the route slice; full goal acceptance remains unverified.
