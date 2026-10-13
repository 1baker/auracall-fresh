# Plan0411 standalone lifetime correction review

Fixed point:f38c8cbf0 (merged PR310). Primary serial Standards/Spec review.
Originating scope: Plan0411 / issue165, governed operation and resource cleanup.

## Standards

Reuse existing ephemeral and live-follow coordinators; no new lease kind,
retention enum, API alias or traffic exception. The factory's optional workload
kind defaults to live-follow for compatibility. Public refresh supplies ephemeral
only without a completion ID; traffic attribution follows the actual workload.
Existing registry semantics preserve a retained process tab when borrowed.
Real public refresh/factory/coordinator/file-registry/ledger/retirement test
uses isolated transport, collector output and activity observation. No private
data or browser is used. Scoped lint/format and162relevant checks pass.
No accepted blockers.

## Spec

The installed one-off request has live-follow retention and ignores its displayed
idle deadline. Actual public replay reproduces that retention (red standalone,
passing completion); selecting existing ephemeral acquisition makes cold
standalone expire/close once and preserves completion and warm borrowed lifetime.
Initial warm fixture respected refusal at insufficient interval; its synthetic
clock advances30minutes rather than bypassing policy. This corrects our PR309
resource defect. Installed promotion/replay remain separate from source proof.

Corrective native cleanup preserves the failed helper/audited intent, later
API already-missing/released observation and foreign same-browser conversation.
No physical retry, synthetic completed-close attribution or foreign close.
Node/API promotion may proceed only with no API active work and stable foreign
custody; global native absence would wrongly require closing unrelated work.
No broader lifecycle claim or goal closure. No accepted blockers.

## Validation

72focused plus90broader tests, typecheck, build and touched Biome pass.
Planning audit exactly matches33existing baseline findings, zero added.
Full changed/quiet, original-chat, composed guard/reload and scheduler gates OPEN.

Accepted findings: Standards0 / Spec0; no accepted severity.
