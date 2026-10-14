# Plan 0417 — owned backend response warning delivery

State: OPEN
Parent: Plan0415 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: 3711d41a8ce52988bfeb829a6e730ee60852ba78

## Current State

New active goal: solve issue165 using Ask Matt, stop/checkpoint before2million
tokens or6hours. Historical paused meter is superseded by the user-created fresh
active goal. Primary serial execution; preserve root dirty work and existing
provider/scheduler holds. Meter checked at19851tokens/274seconds. Backstop: each
validated slice and at least every30minutes; begin final checkpoint no later than
1.5million tokens or5hours, preserving required work as open if unfinished.

First unit: native backend429s on an owned connection must persist the provider-
account warning before another caller is admitted. Previous source had no listener
at the real connection annotation path, so another runtime's next action succeeded.
Red command:
`pnpm vitest run tests/browser/configuredProviderTrafficAuthority.test.ts -t 'owned backend response'`.
Actual configured authority, client annotation, lease registry, file-backed ledger
and warning classifier are real; only external CDP transport is synthetic.

Source now pins post-lease governors to target IDs and subscribes at that connection
annotation. Native warning probes revalidate the lease. ChatGPT backend429s on
approved origins classify without DOM probing, payload bodies, headers or stored
query strings. Foreign/static429s do not freeze the account. Response observer
cleanup drains pending persistence; setup failure closes its transport/authority.
No provider probes, warning clearing, installation or account-state changes have
occurred in this goal packet. Serial source review/remediation is complete; source
is checkpointed but not integrated or installed.

Checkpoint:69focused tests/10files, typecheck and build passed. Serial Standards
and Spec review found cleanup-error aggregation and partial metadata replacement
on a mismatched target as remediation items. Those are repaired; affected observer
and cross-process checks pass. No guard/budget change or native proof follows.
Scoped Biome and diff checks pass. Final source checkpoint precedes separate
request-count/admission implementation.

Two separate OS processes using the actual factory/annotation and shared isolated
stores prove a response seen by one process denies another. Tests also cover
foreign/static responses, repeated warnings and setup-failure retirement. The
final-warning transport fixture now publishes its acquired lease before probing;
this preserves rather than bypasses the new ownership requirement.

Current goal checkpoint:89465tokens/1093seconds. Validated source f60b82617
pushed on the owned-backend-request-admission branch. Progress classification:
blocker_reduction. Issue165 completion remains unproved. Next: separate request
identity/deduplication and admission fixture, without choosing a production quota.

## Scope, acceptance and next unit

Owned response delivery/cleanup only in this source slice. Acceptance: production
annotation regression red/green, cross-process warning denial, exact target/custody,
safe listener retirement, appropriate affected validation, serial Standards/Spec
review and truthful integration/runtime evidence. At most two work-unit attempts
and one consolidated review/remediation pass before reframing. No delegation.

Remaining Plan0415 units: actual backend-request identity/deduplication, separate
account-wide request admission at a pre-send seam, coverage before initial page
navigation, and configuration/installed qualification. Keep6browser operations/min
separate from backend requests. User approved separate units; numeric request
ceiling is still undecided and was requested asynchronously. Fixture limits do not
choose a production ceiling. Response observation cannot prevent that same request.

Non-goals: native provider retry, broad account refresh, warning bypass, foreign or
human tab interception, fabricated changed-B assets, scheduler/job resumption, or
claiming issue165 complete from source tests. Full GateD/parent acceptance remains
Plan0386/0411. Original issue body and historical cycle-bound comments are retained
authorities; a fresh resource window does not erase provider hard stops.
