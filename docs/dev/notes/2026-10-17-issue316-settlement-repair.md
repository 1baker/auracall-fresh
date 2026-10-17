# Issue316 bounded settlement repair

Source commit65843f1941ae1bac5b93b4602d39554cdf9361d4, based on canonical7912118c4.
PR329 owns this bounded successor to PR328. The original installed attempt
remains unconfirmed/exit1 and is retained in installed-first-attempt.json.
Its native cause is not inferred from the synthetic cases.

Three independent public-adapter cases failed before the repair: temporarily
disabled refresh controls before/after activation and account data still loading.
All now pass with exactly one activation. The reader waits for semantic readiness
under an eight-second read deadline, preserving exact account/app/endpoint/link,
identity/connection/permission checks, human gates and the90second outer bound.
Future failure messages distinguish before/after phase and invariant reason;
activation alone is not represented as an observed catalog response.

108 affected tests/four files, typecheck, compilation and changed-file lint pass.
A bounded normal compiled CLI run returned completed/exit0 with21 tools and
verified preservation. Fingerprints are in ../evidence/issue316/settlement-source.json.
Closed-world Standards/Spec review checked the bounded read-only polling, one
activation, no weakening of predicates, and retained genuine-change/foreign-link/
human-approval failures. No new broad review pass was opened.

The broader full-suite failures recorded in the parent presubmit remain outside
this changed helper; no full-suite or hosted-CI success is claimed. A read-only
reconciliation attempt stalled and only its diagnostic process was cancelled;
no inferred account/browser failure or mutation retry follows from that timeout.
Remaining: canonical PR merge, fresh isolated install and installed acceptance.
