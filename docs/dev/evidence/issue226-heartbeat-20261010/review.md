# Plan0397 serial primary review

Fixed comparison:23afb1012f8715f6e2782c3d7cebae7c5b597417 versus owned patch.
Spec:docs/dev/plans/0397-2026-10-10-in-flight-chat-lease-renewal.md.
Standards:AGENTS.md, CONTEXT.md, policies0008/0018/0029 and code-review smell baseline.
No delegation. Scope: executor pending prompt, legacy cancellation forwarding,
read-only documentation and provider-free tests; no installed/live claims.

Standards: PASS. Narrow owner module, no CLI aliases or shared generic cleanup
semantics changed. The enlarged executor is a possible Long Function; nonblocking
because claim and timer custody remain local and shared claim operations are
serialized. A separate lease-lifecycle module can be considered if reused.
Spec: PASS. Active claim renews during pending request, not after settlement.
Maintenance preserves it beyond original idle expiry; new claim used for provider
admission and settlement. Stop/drain handles success, provider error, cancellation,
ownership loss and absolute deadline. Deadline limits next timer and renewal;
registry also clamps expiry. Pre-close DOM guard remains independent.

Adjudicated during bounded review: legacy runner dropped internal cancellation
signal (blocking, fixed with failing seam assertion); initially cancelled request
must not dispatch provider (covered); renewal revision races (serialized and tested
with outstanding write through failure settlement); falsy cancellation reason must
not defeat stop (separate failure flag). No remaining accepted blockers.

45 focused tests PASS,1.33s. Earlier red executor expected active/received lost;
legacy signal seam red before forwarding. Typecheck, full build, final source compilation, scoped lint
and diff checks PASS; fresh installed/live acceptance remains
separate. None of this attributes the historical browser exit.
