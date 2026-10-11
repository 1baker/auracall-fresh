# Plan 0395 source review

Pinned base: f9c5d675466df7c46b367c576f5ccefe9680d0bd.
Candidate: working-tree patch on fix/issue226-lifecycle-attribution.
Serial primary review; no delegated review. Spec: Plan 0395. Standards:
AGENTS.md and architecture/testing/documentation policies.

## Standards

No accepted blocking findings. Instrumentation stays at the existing shared
browser-service lifecycle seam. Bounded event fields exclude provider payloads,
credentials and raw profile paths. The existing registry location owns the
journal. No interface aliases or alternate browser supervisor introduced.

## Spec

No accepted source-blocking findings against this bounded slice. Request and
return observations do not claim death; only child exit supplies exit code/signal.
Unavailable Linux start identity remains null. Persistence failure is visible
and leaves cleanup working, demonstrated through the public launcher mock seam.

Needs evidence: runtime adoption and installed observation are not exercised.
Those block installed acceptance, not qualification of source instrumentation.
External exits of adopted browsers, pre-readiness shutdown, direct CDP browser
close, and per-target retirement remain explicitly outside this slice.

Nonblocking backlog: journal rotation/retention should be defined before long
running fleet use. Launch/exit rate is low and raw payloads are excluded here.

Accepted findings: Standards zero blocking; Spec zero source blocking and one
installed acceptance gate. Browser-loss causality remains unresolved.
