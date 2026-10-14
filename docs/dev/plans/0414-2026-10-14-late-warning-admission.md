# Plan 0414 — owned warning check before pacing

State: OPEN
Parent: Plan0411 / issue165
Branch: fix/issue165-late-warning-admission
Target: main
Base: 55bd402a996c1bb7fa49bb3f4e5bdc6a54e48ac0

## Current State

PR318 is MERGED at236f46b68c28a1004090b36934a91f351d2cfdc4; reviewed source
fadb5ba4f3de605beab7c8e478b31ce46b653852 is installed in
`~/.auracall/user-runtime-issue165-shared-governor`. All581compiled JavaScript
files match. The same two-process regression also passes against those installed
compiled modules using an isolated temporary ledger. API PID62879 is healthy;
/desktops200, scheduler paused, all17active completions paused, selected runs0,
active interactions0, background drain idle. One foreign lease/browser process
was preserved. Initial post-restart validation reported busy; subsequent fresh
readback is recorded separately, rather than erasing that first failure.

This source/runtime repair is implemented. Full native acceptance remains OPEN,
and native retry clearance is still withheld. Provider journeys in this packet:0.
Private receipts: shared-governor-stage-parity.json,
shared-governor-installed-regression.log, shared-governor-promotion/receipt.json
under ~/.auracall/diagnostics/plan0411.

User resumed on 2026-10-14 with the additional requirement that concurrent
AuraCall activity share provider-account controls. Current packet is provider-free;
the native retry hold remains. Comparison base is
55bd402a996c1bb7fa49bb3f4e5bdc6a54e48ac0, retaining checkpoint cd5eaceaab.

Two real OS processes against the file-backed ledger reproduced two defects:
another caller's warning did not interrupt local pacing (2-second deadline),
and a caller with cap3 could exceed another caller's cap1 on the same account.
The ledger now retains each admitted caller's minute ceiling and applies the
strictest still-recent contribution. Contributions expire with their own
interaction; the effective ceiling is not propagated indefinitely. Old records
without the optional ceiling remain readable. The shared governor checks warnings
before pacing and once per second while pacing, aborting its local wait on failure;
atomic reserve/start remain the final admission authority.

Exact red/green command:
`pnpm vitest run tests/browser-service/concurrentInteractionGovernor.test.ts`.
First red: warning did not interrupt pacing. Second red: admitted instead of
minute-interaction-limit. Green proves cross-process, cross-runtime-profile budget
and warning sharing using synthetic account identity and no provider traffic.
The expiry regression separately protects against permanent accidental tightening.

Final focused validation:37 tests/six files pass; typecheck and full build pass.
Scoped Biome checks pass for its two included test files; browser-service source
files are excluded by repository Biome configuration. `git diff --check` passes.

Serial review axes: Standards found no blocking boundary or scope violations;
Spec confirms shared admission and warning interruption at the durable governor
seam. Remaining evidence limits: uninstrumented browser-generated requests,
account-identity disagreement between independently configured callers, and native
live-follow acceptance are not proved by this replay. No warning clearing,
account-key rewrite, budget increase, browser restart or provider probe is included.

The stopped window below remains historical evidence, not current authority.

## Prior stopped window (historical)

Execution window STOPPED under the user's2million-token checkpoint boundary.
Primary missed the advance boundary: last read2057689tokens, paused meter
2058553tokens/7207seconds. Full goal remains incomplete. No further provider
journey, review, integration or promotion is authorized by this checkpoint.
Explicit resumption and a fresh resource window are required.

Installed PR315/sourcea5cea19b0 has581compiled-file parity; CLI/MCP prefix is
user-runtime-issue165-budget-yield, API70947 at promotion. Context successors are
accepted: original command exits0 in30.98seconds with10unchanged messages.

Fifth new-window journey observed native conversation-list429 at12:16:55.088Z.
Project discovery stage completed at12:16:55.201Z; conversation-context began
at12:16:55.203Z, then collector reached240second timeout/API500. Warning was not
automatically persisted; primary recorded the actual observed signal using the
installed guard and ledger, with finite cooldown12:34:52.117Z. No guard clearing,
resubmission or further provider probe occurred. Elapsed cooldown is not clearance.
One fresh API-owned ephemeral lease was observed; terminal request-id equality
was unavailable because the request returned an API error rather than a result.
Raw failed receipts remain private. Wider discovery acceptance remains unproved.

## Prior local feedback loop and unreviewed checkpoint (historical)

`pnpm vitest run tests/accountMirror/lateWarningAdmission.test.ts`.
Public configured affinity, actual file-backed registry/ledger/governor and real
warning expression operate with synthetic external Chrome transport. After one
read, a native ResourceTiming429 precedes the next admission. Before repair it
remains pending behind120second cooldown; after repair it stops within the short
virtual bound and persists rate-limit without another admitted read.

Source wraps existing pacing with owned warning checks before and after it,
reusing the final-warning ownership gate. Exact lease/owner/target/revision are
validated before attaching only its current transport. A10second warning deadline
closes the probe transport on failure; no budget or cooldown is weakened.

12tests/three files, typecheck and full build passed before the budget stop.
Touched Biome formatting was run; no final post-comment check/review is claimed.
Source is UNREVIEWED, UNINTEGRATED and NOT installed. Remaining: final Standards
and Spec assessment, affected validation if review changes code, then integration
and parity promotion under fresh authority. No native replay is pre-authorized.

## Remaining parent acceptance

Independent changed-B/newly-missing asset against frozen complete A; quiet repeat
with zero extra visits/snapshots/resolutions/downloads and stable hashes; composed
guard/reload/deferred continuation; dependent bounded scheduler acceptance; scoped
resource/account cleanup. No qualifying changed-B candidate was supplied yet.

Memory disposition: forbidden at the explicit budget-stop boundary; no Graphiti
or Codex memory write. Do not backfill this checkpoint without new qualification.
