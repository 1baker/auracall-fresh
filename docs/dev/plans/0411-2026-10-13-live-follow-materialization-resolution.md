# Plan 0411 — live-follow/materialization resolution

State: OPEN
Parent: Plan 0386 / issue 165
Branch: fix/issue165-governed-refresh
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

## Checkpoint 3 — outcome_progress / warning containment

PR307 merged88448ddbf and installed with581-file parity; API65142. Diagnostic1
reached the historical messages-not-found surface, proving route access repaired.
Its observer missed attachment because Chromium exposes a collapsed argv string;
the native census claim is explicitly corrected in the installed-rate-stop note.
Diagnostic2 attached only to the exact owned target and stopped immediately on
native `/backend-api/conversations` HTTP429. Existing guard/ledger warning was
recorded; scheduler/all17 completions stayed paused. Native helper subsequently
proves absence; exit actor unknown and no explicit browser close ran. API
maintenance released both diagnostic leases. Historical journey counters were
not reset; this new goal has two diagnostic journeys, no automatic acceptance
journey yet. No provider traffic after the429 stop.

## Checkpoint 4 — blocker_reduction

New local late-native429/empty-messages replay on the public seam goes red as
messages-not-found (5.25s); the minimal successor checks the existing governor
before identity and each message poll. It goes green as rate-limit (about0.7s),
persists the warning, and blocks a following read without another payload fetch.
Nine files67tests and typecheck pass. Detailed source/live separation and the
native-census correction are in
`../notes/2026-10-13-plan0411-installed-route-and-rate-stop.md`.
Goal meter at this checkpoint:228844tokens/2620seconds; full objective OPEN.
Next: serial review, integrate/install successor, then paced normal automatic
acceptance with stronger exact response-path and Retry-After observation.

Primary serial review: `../notes/2026-10-13-plan0411-rate-review.md`, zero
accepted Standards/Spec blockers for this slice.67focused plus362broader tests
pass; typecheck, scoped lint and build pass. No further provider journey while
reviewing. Provider recovery remains unproved despite elapsed finite cooldown.

## Checkpoint 1 — blocker_reduction

Goal is active; source worktree isolated on current installed code line. Prior
turn changed next action with a failed single installed read and cleanup proof,
so it counts as progress. Existing four single-visit and one retry-classification
test do not prove the original symptom. Current action: build the route loop.

## Checkpoint 5 — outcome progress, unresolved original row

PR308 merged d5765f234 and installed with581compiled-file parity; API87064.
Two normal unscoped passes advanced the retained parent13→15. The first copied
a two-message chat and skipped its asset-free child. The second automatically
materialized one real JSON artifact21186bytes, with checksum
42530045a480aed4c7a2391fc09779754434422980ad0f74cb24a7f30b3b76f6
and matching readable cache/archive bytes. Child
hmj_25f5b6e91b0643eaa655afb6ab4e5c92 succeeded1materialized/0failed/0skipped;
provider identity verdict MATCH. This row's index fingerprint did not change,
so positive retained-missing capture is proved, independent changed-B is not.
The second pass observer followed metadata and child on the same target, with
75samples,627observedresponses and no warning/errors. Response counts include
UI/static/cache traffic and are not a count of explicit provider operations.

Original row still has no local context. Its nested context read failed while
the overall refresh reported completed; preserve that distinction. A subsequent
paced diagnostic observed an empty/loading page and exact conversation404 with
conversation_inaccessible/can_retry=false, without429. The same backend error
was also observed on the first pass's readable chat: API denial alone cannot
justify terminal deletion or unavailable classification. No selector cause is
proved when the real page contains no messages.

A passive observed project-Chats lookup returned16rows, eight IDs absent from
the frozen349-row catalog. Original row was absent from this one project only;
this is not global absence proof. SDK result completed, but its process retained
a connection and was interrupted at the140second controller deadline. Its raw
receipt labels the operation direct_diagnostic_read, although the operation was
project listing; this correction leaves the raw receipt intact.

All17completions and scheduler remain paused after terminal observations. Six
new-goal journeys total: four diagnostic, two automatic. Full changed/quiet,
composed guard/reload and bounded scheduler acceptance remain OPEN. Next: verify
discovery/detail scheduling and nested-failure semantics through the normal
production seam before choosing a source change or another governed live pass.

## Checkpoint 6 — blocker reduction, standalone discovery custody

One bounded explicit project-discovery refresh stopped at identity before physical
connect: provider traffic governor required. No observed attachment or provider
response; diagnostic trace identifies the guard refusal. Journey7 charged as an
attempt; no automatic retry. Resolved runtime refresh setup gated the configured
affinity factory on liveFollowOperationId, which the public refresh API does not
accept. Ranked predictions after the red loop: (1) absent acquisition causes
missing governor, (2) an acquired governor is lost at collector forwarding,
(3) UI transport loses carried authority. Live-follow passes, standalone fails
in the same public refresh/real governor/traffic-plan/UI guard fixture, and the
factory is absent for standalone: this discriminates prediction1.

Smallest repair acquires configured affinity for a resolved runtime and falls
back to the generated refresh ID for operation custody. Existing factory returns
null for non-ChatGPT/non-affinity mode; profile dispatcher remains its fallback.
Loop: pnpm vitest run tests/accountMirror/refreshService.test.ts -t 'governs refresh'.
Red: one passed/one failed, ProviderTrafficGovernorRequiredError before physical
navigation. Green: two passed, one simulated navigation each. Acquisition and
collector result are injected; browser-service UI guard, governor, traffic-plan
wrapper and refresh service are real.120focused/82broader checks and typecheck
pass. Installed replay awaits review/integration/build/promotion. Full goal OPEN.
