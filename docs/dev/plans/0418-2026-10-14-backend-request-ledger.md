# Plan 0418 — separate backend-request permits and identity

State: OPEN
Parent: Plan0415 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: bcb5bc535c0074f2233564941804b91fa83eb7cd

## Current State

Provider-free ledger foundation following the owned response warning checkpoint.
Real file-backed ledger tests first go red because the operation-minute cap blocks
a backend-request permit, then because a third request exceeds a fixture limit2
without denial. Separate request admission repairs both while leaving browser
operation counters unchanged. A restart/deduplication case goes red until stable
hashed identity is persisted and reused. Shared warnings are checked before any
duplicate reuse; a key bound to another lease/profile is rejected. Another red
showed backend permits appearing as active chats; request work is now excluded
from that legacy chat/operation summary and has its own usage summary.

Commands:
`pnpm vitest run tests/browser-service/interactionLedger.test.ts -t 'backend request'`
`pnpm vitest run tests/browser-service/interactionLedger.test.ts tests/browser-service/ledgerInteractionGovernor.test.ts tests/browser-service/concurrentInteractionGovernor.test.ts`
Warning-evidence regression also went red: one settled backend request was reported
as one browser interaction. It now reports interactions0/backendRequests1, while
legacy evidence without requests preserves its existing shape.
Latest focused26tests/5files pass, including both existing OS-process governor and
owned-warning fixtures. Typecheck, full build, scoped test Biome and diff checks
pass. A supplemental simultaneous three-caller test passes: exactly one admission
at fixture ceiling1; duplicate observations return that one reservation. The ledger
file now has16passing tests, with typecheck passing after the addition.

## Serial source review checkpoint

Fixed comparison: working-tree patch against bcb5bc535c0074f2233564941804b91fa83eb7cd.
Standards sources: AGENTS.md, architecture/testing/validation policies and the
code-review smell baseline. No accepted blocking Standards finding in this patch:
the implementation stays in the existing ledger transaction and public seam;
isolated file-backed fixtures preserve history and avoid provider effects.
Spec sources: Plan0415 and this packet's contract, subordinate to Plan0411/0386.
No accepted blocking finding against the accounting foundation. Separate counters,
shared cap contributions, duplicate identity and warning-first fencing are covered.
Full issue acceptance is incomplete: production pre-send enforcement, ownership
generation, bootstrap/retained-target coverage and native materialization acceptance
are expressly outstanding. This is a source checkpoint, not an integration gate
or a claim that the full issue passes Spec.
No product connection calls the backend permit path yet, and no numeric production
ceiling is selected. Source is unintegrated/uninstalled; no provider journey.

## Contract and scope

Backend requests use a distinct ledger class and minute ceiling. The strictest
recent admitted contribution is shared by provider/account across runtime profiles;
each record retains its own contribution rather than prolonging an old ceiling.
The existing operation ceiling and counters keep their units. Backend permits
require a leased target association and a sha256 identity, not raw URLs, headers,
query strings or bodies. Deduplication happens inside the existing filesystem-lock
transaction and survives reload. Abandoned/frozen request identities stay fenced.
Old records without the optional fields remain readable by the new code.

Library compatibility is not mixed-version enforcement: old running consumers do
not implement the new request class. Native qualification must establish upgraded
caller/owner identity and compatible participation before enabling request permits.
Do not claim all concurrent clients are governed from a selected library test.

## Acceptance and remaining gates

This packet proves the shared accounting foundation through the public ledger
interface. Next wire the actual pre-send owned-client path: scoped request identity,
deduplication, warning fencing, safe transport lifecycle and shared admission under
synthetic CDP. Observe-only response hooks cannot prevent the current request.
Coverage must include bootstrap before initial navigation, retained/idle targets,
and takeover/revocation: an active lease alone must not authorize interception of
human or foreign traffic. Do not install an unconditional browser-wide interceptor.

User approved a separate request cap while retaining6browser operations/minute;
the production request ceiling remains undecided. Fixture limits are test data.
Keep full Plan0386/0411 acceptance unchanged and native retry hold intact. Serial
primary execution, bounded vertical TDD, one consolidated Standards/Spec review
and affected validation per source slice. Goal token/time limits remain inherited
from Plan0417, with early checkpoint backstops; no resource-window reset here.
