# Plan 0411 — live-follow/materialization resolution

State: OPEN
Parent: Plan 0386 / issue 165
Branch: fix/issue165-context-affinity-route
Target: main

## Current State

The user renewed the full resolution objective on 2026-10-13, authorizing paced
provider journeys as needed. Historical exhausted and expired windows stay
recorded. The October 13 direct installed context read fails before messages:
its exact owned target is at ChatGPT root rather than the conversation route.
Original missing-message causality and full automatic acceptance remain open.
Base is current origin/main c89504d36 (PR305), the installed code line.

## Authority and control

Primary owns serial diagnosis, repairs, review, integration and acceptance.
No delegation. Use Matt's diagnosing-bugs, TDD and separate Standards/Spec
review. Local feedback loops precede causal fixes. Browser inspection must use
the exact AuraCall-owned target and obey custody, identity, pacing and warning
guards. Stop provider traffic on HTTP429, too-many-requests, CAPTCHA,
verification, identity drift or ambiguous custody; honor cooldowns without
automatic repeated retries. Never click Answer now. Preserve unrelated pauses
and dirty work. No prompts/uploads are needed for current diagnosis.

Goal started at epoch 1791896816. Checkpoint and stop this execution window
before six hours (epoch 1791918416) or two million tokens, whichever comes first;
use five hours forty-five minutes / 1.9 million tokens as advance checkpoints.
Read the goal meter at material boundaries. Keep the goal active until full
acceptance, an operator pause, or a qualified blocked audit. Local loops have
two attempts per hypothesis before reassessment; reassessment can change tactics
under standing authority. Checkpoint each repair/integration or acceptance
transition and at least every 30 minutes. No reset of historical counters.

## Scope and acceptance

1. Reproduce and resolve the actual public context-read route-handoff blocker
   without weakening navigation/custody policy.
2. Diagnose historical missing messages with real response/DOM evidence and a
   red-capable offline loop when a source defect is present. Provider absence
   and rate limiting must not become empty/successful inventory.
3. Verify normal automatic completion-to-materializer behavior on the installed
   reviewed source with readable artifact bytes, hash/manifest/cache/archive
   agreement and local chat copies.
4. Retain Plan0386's independently changed B / complete baseline A and normal
   quiet-repeat matrix, composed warning/reload recovery, and dependent bounded
   scheduler acceptance. Require unchanged complete items to avoid unnecessary
   navigation, reload and downloads; missing assets remain actionable. Do not
   substitute a direct read or direct download for automatic acceptance.
5. Prove paced operation, warning containment and cleanup on the exact browser
   profile wsl-chrome-3 and AuraCall runtime profile wsl-chrome-3. Preserve
   operator-paused unrelated targets and raw historical failures.

## First packet

Public seam: ChatgptService.getConversationContext through production utility
affinity, process-tab coordinator, exact-target adapter and isolated browser
transport. Reproduce the installed root-versus-conversation refusal offline,
show ranked hypotheses, change one variable, retain red/green receipts. Review
and integrate the smallest proven repair before another live diagnostic read.

## Checkpoint 2 — blocker_reduction

Public route loop command:
`pnpm vitest run tests/browser/chatgptContextAffinityRoute.test.ts`.
Red cold read: exact target at root, expected conversation; the corrected
endpoint fixture includes a process ID and account observation. Supplying only
the acquisition route fixes cold read, then the second-conversation case goes
red with the first conversation route. Carrying caller navigation policy fixes
warm reuse. Four cases now pass, including preserved and caller-exact refusal.
Seven affected test files pass 50 tests; typecheck, full build and touched Biome
pass. Initial broader run retained three unrelated CDP.Close proxy-invariant
failures, independently reproduced on unchanged source at78aed4ee7 (PR305 code
line). No production adapter/navigation guard was relaxed. Installed unchanged.

Review seam qualification: the browser-process endpoint resolver is a transport
double, and Chrome/CDP is simulated; service, utility/coordinator, lease registry,
traffic governor and reader are real. Fixture messages are synthetic and only
prove route handoff. They must not be cited as original message-reader diagnosis.

Primary serial Standards/Spec review is in
`../notes/2026-10-13-plan0411-route-review.md`, with zero accepted blockers for
this slice. Planning audit has33existing findings and zero added findings,
compared with unchanged baseline. Origin/main advanced to72280ead1 with only
issue253 acceptance docs; preserve those records during integration. No new
provider journey has run under this goal yet. Next: integrate, install with
parity, then one paced diagnostic read with passive warning/response observation.

## Checkpoint 1 — blocker_reduction

Goal is active; source worktree isolated on current installed code line. Prior
turn changed next action with a failed single installed read and cleanup proof,
so it counts as progress. Existing four single-visit and one retry-classification
test do not prove the original symptom. Current action: build the route loop.
