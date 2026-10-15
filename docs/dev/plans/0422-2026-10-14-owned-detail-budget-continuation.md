# Plan 0422 — owned detail budget continuation

State: CLOSED
Parent: Plan0421 / Plan0420 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: 30b5bba004df57f0c142d29a8e26b90b06cd06a4
Owner: primary, serial execution

## Current State

Source packet complete; full issue165 remains OPEN. The public collector/owned-
client regression initially returned nextConversationIndex0/yielded=false after a
second context read's pre-send denial. The tolerant context reader now propagates
qualified request failures. The owning loop yields only for an all-typed budget
error and final exhausted state, preserving finished artifacts and the unfinished
conversation/chunk cursor. Unread conversation IDs never gain detail completion.

Serialized evidence resumes only the interrupted conversation under fresh owned
authority at virtual +61s. An existing chunk retains conversation ID and offset24;
its index normalizes to0 within the selected continuation rows. That chunk case
also passes through the actual detail-plan controller (one selected read); the
two-row accumulation fixture uses the phase governor without that one-read cap.
Warning-after-denial, uncertain sends and unsettled physical work reject. A
persisted warning from another owner is checked before yielding; it cannot be
hidden by a local budget snapshot.

Serial primary review against30b5bba00: Standards uses AGENTS, architecture,
testing and validation policies plus the code-review baseline; no accepted
violation. Spec uses this packet under Plan0411/0386. Accepted blocking findings:
persisted-warning priority and one-read controller coverage. Both verified in
closed-world checks. Removing the exact catch guard check makes the external-
warning test incorrectly return normal evidence (red); restoring it is green.
An initial mutation removed the separate non-coalesced check and remained green;
that was not the target hunk and provides no sensitivity evidence. No broad
fresh-context discovery or delegation was used; goal controls remain inherited.

Focused selection99tests/4files passed, final scoped Biome and diff checks pass,
and typecheck passed. Final controller-only fixture adjustment was checked with
its one targeted case. No retry/flaky result; the chunk test's initial index1
expectation was corrected to the selected row's normalized index0, retaining
stable-ID/offset assertions and verifying actual resume. Source only: no build,
install, provider probe, scheduler effect or clearance performed in this packet.

Progress classification: progress. Next source risk: project-file and account-
library tolerant reads still need their own interrupted-request qualification.
Bootstrap, retained/background targets, other callers, compatible participants,
production ceiling selection and full native acceptance remain open.

Commands: `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t
'mode=detail-budget'` (original red/green). Final focused selection is that file
plus `tests/accountMirror/chatgptMetadataCollector.test.ts`,
`tests/accountMirror/providerTrafficPlan.test.ts`,
`tests/browser/configuredProviderTrafficAuthority.test.ts`. Guard mutation check:
`-t 'mode=detail-persisted-warning'`; controller chunk: `-t 'mode=detail-chunk'`.

## Scope and acceptance

Retain artifacts and completion evidence from finished reads. Known pre-send
budget denial inside an unfinished context read must preserve that row's cursor,
including an existing chunk cursor, and yield without marking it complete. A fresh
authorized pass must resume only unfinished work after evidence serialization.
Warnings, uncertain sends and mixed cleanup failures remain hard stops. Do not
infer completion or downgrade failures from error-message text. Keep request and
browser-operation budgets separate. Reuse existing scaffolding and vertical TDD.

Expected write surface: collector, owned-request fixture, this plan and supporting
journal/fix/testing docs. Serial Standards/Spec review against the base above;
verify accepted blockers only. Stop at a tested source checkpoint. Project-file
and library continuation may require later vertical cases; do not claim them from
a context-only regression. Bootstrap/background/other caller/production ceiling
and full Plan0386 native materialization acceptance remain outside this packet.
No provider probes, promotion, scheduler changes or clearance. Resource window and
goal-level review controls carry forward without reset.
