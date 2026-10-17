# Plan 0420 — owned Fetch pre-send admission

State: OPEN
Parent: Plan0415 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: f45152147

## Current State

Provider-free vertical slice through configured authority, actual client annotation,
guarded CDP transport and isolated real desktop/ledger stores. The first regression
failed because no Fetch request handler existed. An explicit fixture ceiling1 now
allows one owned paused backend request, ignores its duplicate observation, and
blocks another runtime's request before Fetch.continueRequest. Static-resource
events pass without charging the backend ledger. No production ceiling selected.

The configured factory exposes backend admission only when passed an explicit
positive integer request limit. No production caller passes that argument yet.
The governor checks warning/lease state, then file-backed admission/start and lease
revalidation precede continuation. Failed dispatch is conservatively outcome-unknown;
unknown backend request mutability is conservatively provider-mutating. Permits
are send admissions, not completed HTTP responses. Context wrappers preserve the
backend admission hook.

Owned client annotation acquires continuous desktop custody before enabling narrow
ChatGPT backend Fetch patterns. Each request callback uses the retained hold, and
repeated Fetch request IDs share one task. Hashed keys include attachment namespace,
target, lease and Fetch request ID; URLs/query/body/headers are not ledger inputs.
This qualifies duplicate events during an attachment, not cross-attachment identity
of a request whose browser evidence is absent. Different attachments have distinct
namespaces to avoid colliding reused protocol IDs.

Cleanup stops admission, fails newly paused requests during draining, disables
Fetch and removes the listener. Custody stays held until transport disconnect,
including disable failure. Budget denial is latched as command failure and does
not become a warning-clearance or automatic retry path. Existing owned response
warning persistence remains active alongside this admission hook.

## Evidence and bounds

Red/green command: `pnpm vitest run tests/browser/backendRequestAdmission.test.ts`.
Red: expected owned Fetch handler, got undefined. Green: first request sent once,
second client denied before send; supplemental fixture assertions cover static
events, query redaction, listener cleanup and released desktop custody.
Cleanup assertion exposed an additional defect: tab lease settlement failure
masked the original budget denial. Client close now preserves both in an aggregate
error, without clearing an unknown-outcome tab lease. A typed pre-send budget error
now distinguishes that denial from dispatch/transport/warning failures. Close
releases known custody only after checking the owner's ledger: unfinished actions
or unknown request outcomes remain fenced, and earlier settled effects retain
their classification. Continuous desktop custody releases after disconnect.

Further regressions: account-mirror phase wrapper dropped the request hook (red
missing hook, green forwarding it); a last-error baseline erased an earlier
uncertain continuation when a later request hit the budget (red missing original
cause, green preserving all failures). Warning-during-dispatch freezes the request
and rejects settlement; close cannot reclassify that frozen uncertainty as settled.
Its initial fixture used an incorrect literal tenant key; it was corrected to the
actual public request scope before qualifying the close-release baseline red.
Shutdown also removed the warning observer during an in-flight callback: red
observer absent during drain, green sequential request drain then warning cleanup
with the synthetic CDP429 persisted. All are provider-free fixtures.

Latest affected selection31tests/5files, typecheck and full build pass. Scoped Biome
and diff checks pass. Serial primary review against f45152147: Standards sources
are AGENTS, architecture/testing/validation policy and the code-review smell
baseline; Spec sources are Plan0415 and this packet under Plan0411/0386. Accepted
blocking findings about error masking, known-denial classification, wrapper
composition, lost earlier failures, ignored settlement rejection and warning
observer shutdown are remediated with the stated checks. No unresolved blocker
for this source checkpoint. Complete collector cursor/yield composition and
native acceptance remain unproved integration gates; this packet is not a full
issue Spec pass or authorization to enable production interception.

No provider traffic, installation, scheduler mutation or guard clearance. Native
qualification cannot start yet: initial bootstrap before owned attachment,
retained/background targets after disconnect, fail/yield behavior within collector
deadlines, mixed-version participants and production numeric ceiling remain open.
The current production affinity governors also need the request policy composed
through their own ownership seam. Do not claim all concurrent AuraCall requests
are governed from this selected client/factory fixture. Full Plan0386 acceptance
remains unchanged, including independent changed-B materialization evidence.
