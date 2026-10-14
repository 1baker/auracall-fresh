# Plan 0414 — owned warning check before pacing

State: OPEN
Parent: Plan0411 / issue165
Branch: fix/issue165-late-warning-admission
Target: main
Base: 55bd402a996c1bb7fa49bb3f4e5bdc6a54e48ac0

## Current State

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

## Local feedback loop and unreviewed checkpoint

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
