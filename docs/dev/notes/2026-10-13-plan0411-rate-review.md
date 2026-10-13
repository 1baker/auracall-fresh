# Plan0411 rate-limit reader repair — primary serial review

Fixed base:88448ddbf / PR307. Requirements: classify an observed native
conversation-list429 as a hard read stop, preserve pacing and custody, avoid
additional payload requests after warning, retain full automatic acceptance.

## Standards

Zero accepted blocking findings. The production diff adds passive calls to the
existing provider governor before identity work and at the message-read loop;
it uses the existing warning probe/persistence and introduces no new detector,
budget, bypass, navigation or prompt behavior. Optional absence of a governor
preserves existing non-governed behavior. The tests keep the public service and
real affinity/coordinator/registry/ledger/adapter; isolated process/CDP transport
models only the external boundary. The actual warning expression executes in
a VM with the recorded ResourceTiming429 path, not a mocked classifier result.

Full adapter import-order/format errors match unchanged baseline. Scoped lint,
typecheck and full build pass. No unrelated adapter reformatting is warranted.

## Spec

Zero accepted blocking findings for the current warning-classification slice.
Original source emits messages-not-found after5.25s with late native429 and an
empty message DOM. Repaired source reports a persisted rate-limit stop in about
0.7s; a following public read makes no additional payload fetch. Navigation and
target inventory remain unchanged. Native warning containment is scoped to the
configured provider/browser context; no observed account identity is inferred
from the warning itself. Separate installed identity proof remains required.

The October8 root cause, independent changed/quiet matrix, local transcript/
artifact parity and dependent scheduler proof remain OPEN. The observed200
detail-metadata payload is supplementary, not a main conversation body. Do not
claim original message-parser diagnosis from empty synthetic messages.

## Validation

Primary:67focused tests/nine files pass;362broader adapter/collector/materializer/
product replay tests/four files pass (429 total). Typecheck, scoped lint, full
build and diff hygiene pass. Original three lifecycle CDP.Close proxy failures
and33planning-audit findings remain baseline evidence; not silently repaired.

Standards:0accepted blockers. Spec:0accepted blockers for this slice; full goal
is unproved and remains active.
