# Plan 0411 — live-follow/materialization resolution

## 2026-10-16 | Issue165 scoped archive reads retain verification hashes

A real archive-service/public-job regression proved the mocked checksum case was
insufficient: full archive refresh recomputed the selected file checksum before
reuse compared it, allowing a changed file to pass. Scoped reuse now requires an
availability-only read that retains checksum evidence, then independently hashes
the selected file. A legacy adapter without that read leaves assets eligible for
recovery. Real valid/tampered and missing/foreign/force/legacy cases pass.

The archive list request now supports an internal providerConversationId filter
before metadata refresh. Reconciliation batches only the selected conversations.
The real service regression went red by returning and inspecting an unrelated
conversation, then passed with no unrelated filesystem inspection. Default reads
without the optional filter retain their behavior; no new HTTP/CLI alias was added.

A synthetic65file local read benchmark used16804994bytes/66reads/72ms before versus
13889bytes/1read/1ms after, with the same selected hash and no provider requests.
The fixture was removed. The actual selected-conversation archive read and file
verification took1046ms and returned the expected13889byte/hash A. These are local
cost observations, not end-to-end acceptance. Last complete automatic proof is
still97851ms/66requests, above its63091.6ms ceiling; full goal remains ACTIVE.

The attempted timing probe failed before provider access on the native desktop
receipt guard. Its14303ms setup/1791ms operational result observed no requests and
has incomplete coverage. Its useful local trace records3history reads totaling
114276579bytes and a2915ms archive-availability call; overlapping sums are not
exclusive wall time. Temporary compiled CDP timing instrumentation was restored.
Read-only revalidation at22:27:17 found browser12187 without a verified matching
receipt. Browser27467 from the earlier census had exited; no origin was inferred.
Both processes are separate from the retired benchmark controller. No browser was
closed, adopted or re-registered by this slice. Owner clarification is pending;
no further provider attempt is justified until runtime ownership is verified.

213affected tests/4files pass with a15000ms runner deadline; typecheck and compiled
TypeScript have explicit exit0. Legacy-style archive files pass lint, and previously
formatted files pass Biome checks. Two default5000ms filesystem-fixture timeouts
are retained, including an852ms isolated pass. Product1.3performance limits are
unchanged. See issue165-scrape-benchmark-2026-10-16.json and its private validation,
read-cost, guard-failure and restoration receipts. Next resume full provider/CDP/
governor profiling and fresh multi-file automatic comparison after verified native
runtime readiness; local read savings do not close issue165.


## 2026-10-16 | Issue165 full startup capture and prior artifact outcomes

Automatic completion now returns attributable prior terminal-unavailability entries
alongside verified archive reuse. Each skipped entry retains the original failure
reason and priorEvidenceJobId. Qualification requires explicit non-retryable
provider-unavailable evidence, one conversation, matching current asset family and
one consistent account identity from the request or recorded attempt target.
Foreign, conflicting/unattributed, ambiguous, active, retryable, unmatched and force
cases cannot qualify. Nine public-job cases pass. The actual older B job recorded
identity in its attempt, not request; that native omission drove the attribution
regression. Qualified family signatures also prevent another transfer.

The source crawler still created its provider tab before observation, separately
from the already repaired utility path. Cold configured-caller regressions went
red. Crawler acquisition now creates about:blank; only a newly acquired blank or
an explicitly opted-in, observed process-owned blank with known effects can grant
initial governed navigation. Other retained pages keep preservation semantics.
Blank acquisition uses generic pacing while real provider navigation retains its
renavigation cooldown. A real governor/coordinator regression proves1000ms ordinary
spacing instead of charging the120000ms provider cooldown. Required audit omission
in its first fixture was corrected; that fixture error is not product red evidence.

The private harness now attaches Network before blank target creation returns to
the product, follows exact ownership, retains context readbacks, and binds compiled
module hashes. Periodic broad /status reads were removed after measured5-30second
observer overhead. GET timeouts re-poll the same operation; DOM observation failure
cannot imply work completion. Capture setup failure returns the original created
target to the product and makes coverage incomplete rather than inventing a failed
target creation. The final proof uses the complete compiled worktree, not a mixed
older installed package with partial deltas. Two isolated installed deltas remain
receipted; no full installed promotion or main API restart occurred.

Failed setup/measurement attempts remain in the ledger:10s initial read timeout;
mixed-runtime116609ms/at least66requests with later status timeout; mixed-runtime
24609ms/0observed requests with observer WebSocket close while startup resumed a
previous child; complete-source65953ms/at least68requests with incomplete startup
coverage and omitted B. The queued/running child left by the observer failures was
reconciled only after both controller PIDs were proven absent. Running cancellation
returned409 without mutation; production interrupted recovery, restricted to that
exact job, marked it failed and issued no provider commands. Raw evidence retained.

The new full-capture automatic proof finished97851ms (89613ms operational),66backend
requests, exact6trimmed texts, A13889bytes with the expected SHA256 and existing asset
link, plus B's original typed terminal failure and prior job pointer. All outputs
match the actual clean agentic case; request ratio0.9167passes. Time ratio2.0162
FAILS1.3. Goal remains ACTIVE; issue165OPEN. A fresh multi-file automatic comparison
and an automatic elapsed-time pass remain required. Next profile provider/governor,
archive and history reads; do not shrink acceptance to cached service results.

Final506tests/8files pass; the separate current context-route suite13tests passes.
Final typecheck and compiled TypeScript have explicit exit0; scoped Biome and diff
checks pass. Correction: the previous b9536b93a checkpoint prematurely claimed a
passing typecheck; findLast was unsupported by this TypeScript target. The test now
uses a reversed copy with find, and the actual prior failure remains in the ledger.

Main API83768 is unchanged:17subscriptions paused, scheduler paused, queued/running0,
warnings0. Exact test target and controllers are absent. A fresh OS census found a
different matching-profile browser started after cleanup (22:02:35 versus22:02:21);
it is unattributed to this proof and preserved. No blanket browser PID signal was
issued. Evidence: issue165-scrape-benchmark-2026-10-16.json and its private locators.


## 2026-10-16 | Issue165 verified reuse and canonical project routes

Scoped reconciliation now returns existing same-account/current-family archive
files as duplicate entries with actual bytes/hash and archive/asset links, after
regular-file, checksum and stable-stat verification. Missing, tampered, foreign
and forced cases remain eligible for transfer. Five real public-job regression
cases pass. Native automatic profile39195ms/at least70requests returned verified
A as duplicate, but omitted prior terminal B and lacked full startup coverage;
this is not automatic acceptance.32admitted CDP commands spent9847ms summed in
admission and3650ms summed on wire (overlapping sums, not wall-time components).
Observer GET failures now re-poll the same handle; heartbeat revisions alone do
not change custody; broad status polling reduced to15seconds. Temporary timing
instrumentation was restored. Aborted observer/fenced resume and preflight404
failures remain in the ledger; exact benchmark target retirement was qualified.

A second actual agentic case read4texts and downloaded2valid files in49510ms/68
backend requests. Deterministic service initially timed out after canonical root
conversation navigation redirected into its project URL:49650ms/62requests,
no files. A real caller regression went red on route settling. Conversation route
settling now accepts that same conversation under its canonical project; explicit
project/origin constraints remain. Ready same-route surfaces are reused. With an
isolated two-function installed delta and fresh cache, the same public service
completed41859ms/70requests. All4trimmed texts and both files (A6172B, B21186B)
match exactly, including SHA256. Ratios0.8455time and1.0294requests pass the1.3
ceiling for this public-service comparison. One nonfatal net::ERR_ABORTED was
recorded; both artifact downloads completed. Full automatic acceptance remains
OPEN: complete startup counts and complete selected-artifact outcome accounting
still required. No prompt, Answer now, or force transfer was used.

Final selected403tests/6files, typecheck, compiled TypeScript and scoped Biome
pass. Failed runs are retained: archive fixture timeout under concurrent build,
three call-sequence mocks, and a fake-timer leak in the new route fixture that
caused the subsequent rate-limit test to time out. The timer cleanup is fixed;
full affected suites now pass. Public costs and private receipt locators are in
issue165-scrape-benchmark-2026-10-16.json. Runtime changes are isolated compiled
deltas, not a full branch promotion or main API restart. Goal ACTIVE; issue165OPEN.


State: OPEN
Parent: Plan 0386 / issue 165
Branch: fix/issue165-project-index-budget-yield
Target: main

## Current State

### 2026-10-16 command-admission and recovery overlay repair

False target timeout reproduced at the identity caller:desktop admission consumed
its five-second wire-response deadline. Response timing now begins after mandatory
admission; cancellation and actual wire stall limits remain.307selected tests pass.
Native inventory54932ms/at least70requests completed without a child. Full planner
replay then proved518unmatched historical archive rows erased current backlog.
Exact current catalog-item matching/dedup restores2retrievable artifacts on the
real recovery endpoint. Native automatic proof132904ms/at least72requests now
creates a child. Its only entry reports404; verified existing13889byte/hash asset
was excluded but not surfaced in the child result. No performance acceptance.
Next profile remaining latency and account for verified reuse; complete startup
request coverage and successful multi-file parity remain required. Benchmark
ledger retains all failed/diagnostic runs. Goal ACTIVE, issue165OPEN.


### 2026-10-16 scoped initial-route checkpoint

Source regression confirms detail refresh unnecessarily opened home. Carrying
the first explicit detail conversation through acquisition and identity options
passes focused tests. Native isolated proof44394ms/at least59requests failed
CDP target enablement before context/child creation; no acceptance. Experimental
three-module runtime route delta rolled back. Full receipt/action record is in
issue165-scrape-benchmark-2026-10-16.json. Next isolate target readiness, then
qualify automatic harvesting and successful multi-file parity. Goal stays ACTIVE.


### 2026-10-16 measured automatic workflow

User directed agentic measurement and clarified that prior coarse pacing numbers
were guesses; backend communication and avoidable navigation are the primary
optimization targets. Primary serial, one installed normal automatic pass only,
ten-minute observation bound, no retry on429/verification/identity/custody error.
Global scheduler and unrelated jobs remain paused; no prompts or forced downloads,
runtime promotion or governance repair. Existing parent pass15, maxItems1/forcefalse
is the baseline; observe request IDs/timestamps/categories, route changes and
parent/child result. Do not substitute response counts for requests, or call
post-attachment observation complete startup capture. Current API PID47409 differs
from the prior62047 receipt; verify exact runtime identity before execution.
Measurement controller /tmp/issue165-measure-automatic.mjs passed syntax and
read-only preflight. Checkpoint after this one measured pass before any further
native action. Numeric30requests/min remains unapproved tuning, not a new rule.

### 2026-10-15 acceptance reassessment and source validation

Base71421809f, owner primary serial. User authorized reassessment after focused
capability repair. One missing GateB provider-free selection and one local build;
15-minute checkpoint backstop, no implementation loop. Reuse unchanged prior
185-test/typecheck/lint receipts. Refresh plan-audit failures and canonical lane
registration evidence; do not repair inherited governance or claim full GateB
from partial checks. Only local build outputs and existing execution/reconciliation
docs may change. No install, merge, native/provider journey, warning clearance or
scheduler effect. Terminal condition: concrete validation result and next gate.
State: CLOSED source-validation slice. Source71421809f: missing surface selection
324tests/8files and automatic-materialization99tests/1file pass; local production
build passes. Full GateB remains failed: audit33 exactly matches the prior receipt,
and canonical main lane catalog lacks this repair branch. No code repair or
integration/install/native effect. Existing reconciliation note records next gates.

### 2026-10-15 bounded caller-capability fix

User authorized the focused fix after the two-execution factory-only cancellation
diagnostic at 9a74cd5d9. Owner primary, serial; review base 9a74cd5d9. One coherent
fix, at most two red/green attempts and one consolidated Standards/Spec review;
30-minute checkpoint backstop, inherited goal ceiling unchanged. Write scope:
existing authority factory contract, collector option resolution/cancellation,
owned-client and legacy controls, and these supporting docs. Resolve configured
options through buildListOptions; report capability without borrowing a governor
or acquiring a lease. Cancellation must drain owned cleanup and preserve failure;
late sessions close once; omitted/no-hook authority keeps legacy behavior.
Terminal condition: targeted tests, typecheck and affected lint/diff pass, serial
review adjudicated, recoverable source checkpoint. No production ceiling selection,
activation, provider probe, installation, merge or scheduler effect. Full issue165
materialization acceptance remains open. State: source slice CLOSED. The commit
containing this closeout carries the implementation and tests; the source-window
reconciliation records red/green and serial review evidence. Classification:
blocker_reduction for reproduced cancellation and cached-success defects. No
installed/native acceptance gate closed.

Provider-free source checkpoint bf2a9bf2d (draft PR323) qualifies additional owned
request/cursor/session/cancellation seams through Plans0420–0432. It is unmerged
and uninstalled; the latest focused148tests are not full GateB or native proof.
Current acceptance/caller reconciliation:
[2026-10-15 source-window audit](../notes/2026-10-15-issue165-source-window-reconciliation.md).
Production callers still omit the optional backend ceiling. Remaining native and
participant gates stand; runtime receipts below are historical, not fresh readback.


Latest source/runtime packet: Plan0416 CLOSED, PR321/source ddea20ec7 integrated
at a3d143e4a and installed with582compiled-file parity. API62047 healthy, scheduler
and all17active completions paused; foreign browser process preserved. This removes
one reproduced redundant project navigation, not a measured share of discovery5
requests. Plan0415 remains OPEN for separate request admission/ceiling; no native
probe or retry clearance. Prior checkpoint/window evidence below is retained.

PR318 shared governor repair is integrated and installed: sourcefadb5ba4f,
merge236f46b68,581compiled parity, installed two-process regression green; API62879
healthy with scheduler/all17jobs paused. No native replay or retry clearance.

User resumed provider-free repair on 2026-10-14. Plan0414 now also covers shared
provider-account admission across OS processes: interrupted warning pacing and
strictest recent contributed cap. Native retry hold and remaining parent gates
stand. The budget-stop window below is preserved historical evidence.

Execution STOPPED at the renewed token boundary; primary missed the advance
checkpoint. Latest meter2057689, paused2058553tokens/7207seconds. PR315 is installed
with581parity. Discovery5 observed native429 and ended collector timeout/API500;
warning was persisted through installed guard/ledger, not automatically. Source
late-warning-before-pacing repair is unreviewed/unintegrated/uninstalled on
fix/issue165-late-warning-admission; Plan0414 is the bounded restart authority.
Original context/terminal acceptance stands; full parent acceptance remains OPEN.
No further provider probe, review or promotion in this stopped window.

Latest checkpoint11: original context command passes on installed PR314,
exit0 in30.98seconds with all10messages. Extraction and terminal-boundary fixes
are integrated; independent discovery-budget yield is being reconciled/reviewed.
API13018 and /desktops200; scheduler/all17active completions remain paused with
no active work or provider warnings. The temporary restart-unverified lease state
was preserved; later scoped OS readback proves browser/PID absence and the lease
released/already-missing. No exit actor or completed physical close is inferred.
Full changed-B/quiet/guard/scheduler gates
remain OPEN; four new-window journeys are preserved alongside prior history.

### Restart authority and initial readback | 2026-10-14

2026-10-14 restart: user renewed resources and explicitly set the goal to
complete the live-follow repairs using Ask Matt, stopping and checkpointing
before two million tokens or six hours. New window starts at epoch1791974597;
advance checkpoint at1791995297 (5h45m), hard stop before1791996197.
Read the goal meter at every material boundary; historical counters below do
not reset. Prior checkpoint9 remains preserved. Extraction is the first packet:
capture minimal representative markup from one governed installed read, reproduce
the populated-page failure at the public context seam, then repair causally.
The independent project-budget-yield source checkpoint remains separate.

Fresh readback: repair branch clean at eadaf2448 before this control update;
installed wrapper resolves bounded-refresh prefix and compiled ChatGPT adapter
matches this checkpoint. API23537 active; scheduler paused, all17active completion
jobs paused, queued/running0, warnings0. All454selected registry leases released;
installed native managed-profile census finds no browser. Historical process
exit actors remain unknown. Graphiti healthy but no relevant Plan0411 recall;
repair worktree unindexed, native code-discovery fallback applies.

### Historical starting state | 2026-10-13

The user renewed the full resolution objective on2026-10-13, authorizing paced
provider journeys as needed. Historical windows/counters stay recorded. PR307
route handoff, PR308late-rate read stop and PR309governed standalone refresh are
merged and installed. A normal automatic child captured21186readable JSON bytes
with exact cache/manifest/archive hash agreement. Original chat remains empty
and uncached; no historical cause or terminal absence is proved. Pending installation combines passive project discovery (native0reported while
DOM had8project-ID rows) with bounded standalone affinity lifetime. Original
chat and full changed/quiet/guard/scheduler acceptance remain OPEN.
Initial source base was PR305/c89504d36; checkpoints preserve each successor.

## Authority and control

Primary owns serial diagnosis, repairs, review, integration and acceptance.
No delegation. Use Matt's diagnosing-bugs, TDD and separate Standards/Spec
review. Local feedback loops precede causal fixes. Browser inspection must use
the exact AuraCall-owned target and obey custody, identity, pacing and warning
guards. Stop provider traffic on HTTP429, too-many-requests, CAPTCHA,
verification, identity drift or ambiguous custody; honor cooldowns without
automatic repeated retries. Never click Answer now. Preserve unrelated pauses
and dirty work. No prompts/uploads are needed for current diagnosis.

Historical first window started at epoch 1791896816. Its checkpoint/stop was
before six hours (epoch 1791918416) or two million tokens, whichever comes first;
that window is closed. Renewed restart bounds above govern current execution.
Use five hours forty-five minutes / 1.9 million tokens as advance checkpoints.
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

## Checkpoint 7 — passive project-index repair

PR309 merged c7572ecab and installed with581compiled-file parity, API35646.
Discovery2 stopped before observed provider traffic on a native desktop ownership
lock; no lock was retained at later inspection. Periodic pool maintenance uses
the same lock, but that receipt does not identify the holder. Normal failure
backoff/minimum interval+jitter honored until15:39:16.723Z. Discovery3 completed
request acctmirror_bad3ee3c-7146-465c-a39c-20af81499267 at15:39:34.836Z; one exact
attachment,3samples,179observedresponses, no observed429/warning/error. It reported
projects0 and an empty provider-index epoch while preserving349cached conversations
and prior assets. Cache totals are not fresh discovery proof. Nine goal journeys
total: four diagnostic, two automatic, three discovery attempts.

A passive screenshot/DOM capture qualified the exact retained idle lease by
lease ID, request workload, scope and unchanged revision before/after. Idle
clears active owner-process fields; the initial owner-PID-only checker wrongly
refused this retained lease. It was corrected without claiming/closing/navigating
the tab. DOM contains8data-app-action-sidebar-project-id rows, zero project
anchors. Account mirror disables click fallback; passive scraper only checked
anchors. Original conversation cause remains separate from this source defect.

Red public service/production-affinity/adapter+actual expression replay returns
[] with the recorded attribute shape and synthetic ID/name. Ranked predictions:
(1) ignored passive row markers cause omission, (2) sidebar collapsed/unhydrated
causes omission, (3) collector truncation discards adapter rows. Fixture begins
with loaded row markers and fails directly at public listProjects before collector
merging; adding only passive row extraction makes it green. This proves1for the
qualified markup, not initial-load timing. No clicks, extra route visits or new
provider API are added. Existing normalization and deduplication retain legacy
links; mixed replay excludes invalid IDs/duplicates.181relevant checks, typecheck,
full build, test Biome and adapter lint pass. Next: serial review/integration,
installed parity/paced discovery, then normal automatic acceptance. Full goal OPEN.

## Checkpoint 8 — correct standalone lifetime before promotion

PR310 merged f38c8cbf0; staged project-reader runtime matches581compiled files,
but is not promoted yet. Cleanup exposed a defect in our PR309: selecting the
live-follow factory for a standalone refresh grants indefinite retention. The
retained discovery3 root has live-follow retention, so its displayed idle deadline
is TTL-exempt. This is not a missing maintenance loop.

Public refresh+actual configured affinity/coordinator/file registry/ledger replay
goes red: standalone retention live-follow instead of ttl; completion case passes.
Ranked predictions: (1) acquisition chooses the persistent workload, (2) registry
ignores ephemeral lifetime, (3) activity guard prevents retirement. Choosing the
existing ephemeral acquisition only for standalone resolves1; the real registry
then expires it and guarded simulated close runs once. Completion and a standalone
borrow of its retained process remain TTL-exempt. Browser transport, activity
observation and collector result are simulated; no provider/browser launched.
72focused+90broader checks, typecheck/build/scoped Biome pass. First warm-borrow
fixture used insufficient policy time, correctly refused minimum interval; its
clock now advances30minutes without bypass. No live provider retry during repair.

Corrective retirement of the one completed discovery lease passed native process,
root/no-draft, inactivity and desktop-control guards, and recorded a close intent
by77734at16:08:26.534Z. Private helper lost class prototype methods through object
spread and failed at finishRetirement; no physical close retry ran. Fresh readback
finds that target absent; API35646 reconciles lease released/revision6 with an
already-missing audit at16:09:14.277Z. Failed helper did not retain close ack;
do not invent completed-close attribution. A different process19366has a separate
conversation lease in the same native browser78525; that target is preserved.
Global native absence is not a correct promotion gate when unrelated custody
shares the browser. Require API no-active-work and own-scope cleanup, preserve
foreign leases/targets across software promotion, and recheck OS/registry after.
Full changed/quiet, original-chat cause, composed guard/reload and scheduler
acceptance remain OPEN; nine provider journeys/attempts remain the goal total.

## Checkpoint 9 — operator budget stop, unintegrated budget-yield repair

Goal meter2254565tokens/14503seconds at the final readback exceeds the user's
2million-token stop boundary. Primary missed that boundary; stop execution now.
No further provider journey or integration in this window. Goal is paused under
the explicit budget-stop instruction; full objective remains OPEN.

Installed source PR312/a761df02c,581compiled-file parity, API95510. CLI/MCP/API
use the bounded-refresh runtime. PR310passive project reader is included.
Discovery4 (tenth goal journey/attempt) reached the actual project surface, then
failed index/page_navigate budget1. One observer attachment64samples403observed
responses, no observed429/warning. Native project payloads and retained DOM
qualify actual project rows; original ID absent from the captured two-project/
sidebar subsets, not global absence proof. The one-off lease is ephemeral/TTL.
Scheduler and all17active completions remained paused during execution.

Unintegrated source fix on this branch: collector yields when its frozen index
navigation budget is exhausted, preserving gathered rows and next-project cursor
instead of attempting another unplanned route visit. Public collector plus actual
governor/plan replay fails on the second of two simulated project reads before
fix; after fix it yields after one and a fresh cycle resumes the second from
serialized evidence. The one-navigation budget remains1.196relevant tests,
typecheck and touched Biome pass. Build log is retained privately; read terminal
status on restart. No Standards/Spec review, PR, installation or live replay for
this repair yet. Native attribution to this exact loop awaits installed replay.

Restart from this checkpoint, not earlier route branches. Verify current refs,
installed identity, own/foreign custody, operation states, warning ledger and
normal eligibility before effects. Review/validate the budget-yield source slice,
then integrate/promote and run one paced discovery replay. Keep original chat
access, independent changed-B/quiet, composed guard/reload and bounded scheduler
gates open. Never click Answer now, reset old journey counters, seed live changes
or weaken guards. Raw evidence remains private under the Plan0411 diagnostics
directory. Memory disposition: forbidden at operator budget stop; no new durable
memory is queued in this execution window.

## Checkpoint 10 — renewed window / extraction outcome progress

User resumed the full goal with renewed2million-token/6hour bounds. Two new
paced installed diagnostics reproduce60second populated-page timeout. Qualified
representative markup has10role-marked message roots. Actual-expression DOM
replay reads them correctly; native telemetry reaches message extraction then
admits a second payload route fallback after direct404 and a missed exact
fallback response. A public-service/production-affinity loop at unchanged
120second navigation cooldown discriminates carried allowNavigation=true from
ineffective preserveActiveTab=true on the settled payload retry.

PR313 integrated58d9615f7 / source42921787e sets only that retry's
allowNavigation=false.237source checks across8files, typecheck, scoped lint and
build pass; primary serial Standards/Spec review has no open blockers. Review
retains one new public-service transport case in the existing route harness;
temporary real-DOM dependency and duplicate harness are excluded from source.
581compiled files match the staged runtime; only ChatGPT adapter differs from
the prior installation. CLI/MCP wrappers promoted, API76449, /desktops200,
KillModeprocess. Prior17completion/scheduler pauses remain, active work0.

Third new-window journey returns complete context with5user/5assistant messages
before the60second read deadline. CLI does not exit afterward; controller sends
SIGINT at90seconds. This is extraction evidence, NOT successful CLI acceptance.
Plan0413 begins a public-command terminal-boundary replay; no additional live
read while diagnosing it. Fresh readback has one idle retained selected lease
and native browser87105/CDP45015, no active work/warnings. Preserve it under
normal bounded retirement; no browser close/exit attribution is invented.

Historical10goal journeys remain; new window3journeys so far. The separate
post-budget authorized check remains outside those counters. Independent
project-budget-yield checkpointeadaf2448 remains unintegrated/uninstalled, with
122relevant checks freshly passing on unchanged source. Full changed/quiet,
composed guard/reload and bounded scheduler acceptance remain OPEN.

## Checkpoint 11 — original context command outcome progress

Plan0413 public registered-command subprocess reproducesETIMEDOUT at1500ms
even for a one-byte settled result. Reusing the existing flushed terminal
boundary after service settlement fixes it; minimal/200KB success, provider
failure and existing app cases pass8tests, typecheck and build. Entry point is
excluded by Biome; new test is clean and source hunks reviewed serially on
Standards/Spec with no open blockers. PR314 integratedb02159225 /
sourcef6e134401, promoted with581compiled-file parity; only bin differs from
the previous runtime. API13018 /desktops200, KillModeprocess.

Fourth new-window journey runs the same original command at60seconds/0retries:
exit0 in30.98seconds,10messages (5user/5assistant), exact equality with prior
extracted message array, one owned observer attachment, no hard stop, no prompts.
The earlier90second/SIGINT receipt remains failed CLI evidence. Source extraction
and terminal command gates are now met. Fresh registry/OS readback is idle with
one finite-TTL selected lease/browser18608 retained; no active work or warnings.
Unrelated17completion and scheduler pauses remain. Normal resource retirement
is still to be observed; no browser kill/close is issued by this packet.

Goal readback before this checkpoint:556822tokens/2647seconds; renewed window
remains below advance bounds. Historical10journeys plus4new-window journeys,
with the separate post-budget check preserved outside these counters. Full
independent changed-B/quiet, composed guard/reload and bounded scheduler gates
remain OPEN. Next: reconcile/review/integrate the independent discovery-yield
checkpoint, then one paced discovery replay, preserving current idle custody.

Resource follow-up: the lease briefly became lost/restart-unverified while the
browser was present. Later native helper finds no selected browser and /proc
proves the original PID absent; registry is released/already-missing. Earlier
retirement audit says preserved, not closed. Exit actor remains unproven. The
context/terminal successor plans are CLOSED on this bounded evidence; parent
acceptance remains OPEN.

## 2026-10-16 | Issue165 measured retained-inventory freshness failure

One bounded automatic pass observed 195 distinct backend requests (peak 66 per
rolling minute), two document navigations and four route changes. Coverage starts
after target attachment, so these are lower bounds. The pass took 571.5 seconds,
including about 295 seconds before attachment under existing failure backoff.
Its child waited 111.8 seconds for provider eligibility, then settled in 21.3
seconds: one artifact skipped, zero download attempts and zero bytes. No observed
429 or verification warning. A separate exact context read took 20.9 seconds,
observed 137 backend requests, and returned six messages, two artifacts and two
files. Its fresh artifact identifiers did not include the retained selected ID.

The automatic collector read zero detail conversations but passed 20 retained
inventory IDs as reusable snapshots. Completion now keeps retained IDs in the
materialization frontier while granting snapshot reuse only to actual detail reads
from this pass. A skipped retained attempt can therefore enter the existing fresh
snapshot fallback; successful retained transfers and fresh collector reads still
avoid redundant refreshes. No title-only control matching or production request
ceiling is introduced. Regression first failed in three completion modes; mixed
and retained-only frontier cases cover eligibility separately from freshness.

Private receipts remain under ~/.auracall/diagnostics/plan0411, notably
measured-automatic-2026-10-16T15-20-06-088Z.json and
measured-selected-context-2026-10-16T15-35-10-213Z-receipt.json. Earlier empty-lock
failure and qualified reversible quarantine are preserved separately. This source
fix is not installed or native acceptance; issue165 remains open. Global scheduler
and completion subscriptions remain paused. Final process readback finds the direct
read's Chrome PID84086 present with lease lost/owner null; no foreign cleanup was
attempted and resource retirement is not established.

## 2026-10-16 | Issue165 native freshness replay and resource-row download control

Installed only the compiled completionService.js freshness delta from5ab59efa2,
with private byte-for-byte rollback copy and SHA256 receipt. Existing runtime
otherwise remains the project-route-reuse build; this is not full branch promotion.
Restarted API PID73829 while all17subscriptions and scheduler were paused.
One ordinary automatic pass16→17 selected the same conversation as the previous
failure. It took456632ms, observed179backend requests (peak70/rolling minute),
2document navigations/4route changes, no429/verification warning. Startup coverage
is incomplete; request totals are lower bounds. Child refreshed successfully in
11252ms (6messages,2artifacts,2files), then clicked one control and attempted one
download, which failed; zero bytes saved. This verifies the freshness repair and
preserves the failed acceptance result. Child provider eligibility separately
waited111306ms after start. All17subscriptions and global scheduler stayed paused.

Two bounded diagnostic reads captured the actual current resource-row DOM; the
first captured the loading shell, corrected capture sampled until command exit.
They took24410/21744ms and observed138/137requests, no warning. These275requests
are additional diagnostic traffic, excluded from the179automatic total. Raw DOM
and content remain private under ~/.auracall/diagnostics/plan0411. Current row has
separate Open preview and Download file controls. The product replay went red on
preview input and now resolves the artifact identity before selecting the unique,
enabled Download file control inside that exact resource row. Multiple row
controls fail closed; legacy controls retain their existing path. No title-only
matching or global download search is added.11replay/viewer tests pass; typecheck,
scoped Biome and compiled build checked. Standards and Spec reviewed serially:
provider-specific row handling stays in the adapter, and turn/message/button
identity resolution remains authoritative before choosing a row subcontrol.
Live proof of the resource-row repair remains pending.

## 2026-10-16 | Issue165 resource-row candidate rejected by live acceptance

One second bounded automatic pass17→18 ran with the isolated resource-row hunk.
Receipt measured-automatic-2026-10-16T19-06-28-438Z.json records445833ms,
215observed backend requests (peak71/rolling minute),2document navigations and
6same-document route changes. Child hmj_32d3c38107ff4e53b1fe6c76b6eaa9b4
refreshed the same6message/2artifact/2file conversation, clicked a control,
attempted one download and saved zero bytes. Terminal outcome remains skipped.
Five backend404responses were observed; the current privacy-bounded trace does
not prove they caused the failed download. No429or verification warning observed.
The source replay is green but this candidate has NOT fixed native acceptance.

Restored the adapter byte-for-byte from its private pre-candidate backup and
restarted the API after confirming no queued/running completion work. Keep the
verified freshness delta installed. Candidate8ced2e9ac remains reviewable on draft
PR323, explicitly unqualified for deployment. All17subscriptions and the global
scheduler remain paused. No automatic provider retry follows this result.

This turn's observed provider traffic:179+215automatic requests plus275diagnostic
requests =669observed requests, excluding unobserved startup traffic. Diagnostic
instrumentation's early loading-shell capture was preserved as a limitation.
Next feedback-loop requirement: record the exact resolved click target,
elementsFromPoint/hit-test identity after scroll/hover, and correlated download
request/response or Browser.downloadWillBegin/downloadProgress. Existing telemetry
only proves input dispatch plus failed wait, so choosing among hit-test failure,
preview handling and failed remote content is not yet justified. Do not claim a
speedup from the two timings: scheduler waits and refresh paths differ. Original
artifact bytes/hash/manifest/archive/local-copy acceptance remains OPEN.

## 2026-10-16 | Issue165 measured agentic comparison and rendered fallback repair

Current goal: deterministic elapsed time AND backend requests must each be at
most1.3times the agentic cost for equivalent conversation/artifact results. Stop
and checkpoint before2million tokens or6hours; goal remains ACTIVE. Prior status
turn was no progress; this packet supplies new live evidence and a source fix.
The canonical sanitized action/cost ledger is
`docs/dev/issue165-scrape-benchmark-2026-10-16.json`. Private receipts include
per-command timestamps, request counts before/after, click hit tests, page network
requests/responses and Browser download begin/progress/completion. Page Network is
enabled on the owned blank target before provider navigation. Browser-wide worker
and unrelated-tab traffic is not claimed. Both paths use wsl-chrome-3 and the same
unchanged conversation. No prompt or scheduler/subscription resume was issued.

Agent-driven read plus two artifact attempts took79964ms/71backend requests. It
saved13889bytes with SHA256
fd1720c0e3df3579ea567679c642e895a7993a3b558b8743fa47495a201e87ca.
The second exact hit-tested download returned404 from the interpreter endpoint;
its sandbox_path names that artifact. This explains why the earlier capped
automatic attempts on that artifact saved zero bytes. It does not establish that
all prior failures had the same cause. Earlier37288ms/70request agentic receipt
incorrectly marked its own complete flag; separate qualification explicitly
rejects it because only1of2files saved. Raw receipt preserved.

Normal deterministic materialization then timed out after121805ms/68requests
while six messages were rendered. One traced45000mscontext deadline yielded
47149ms/66requests and located the stall in forced payload-route fallback after
API failure. A minimized actual payload-reader test went red on unnecessary
navigation. After failed API reads, matching project/conversation plus nonempty
rendered turn content now returns to DOM extraction without reacquiring the route.
Wrong route/project and empty content retain the original fallback. A composed
service fixture now proves one navigation instead of two.222focused tests pass,
typecheck, compiled TypeScript build, scoped Biome and diff checks pass. Serial
Standards review keeps provider behavior in the adapter and preserves guards;
Spec review preserves exact route/project qualification and legacy empty-surface
recovery. This checkpoint does not infer full issue acceptance from source tests.

Live public-service replay after isolated compiled-hunk installation completed
in67700ms/71requests, one document navigation, two artifacts discovered and one
file saved with the SAME13889bytes/hash as the agentic file. Raw ratios versus
the79964msdiagnostic agentic run:time0.84663, requests1.0. These are NOT acceptance:
the agentic timing includes failed-asset diagnosis, neither saved both files,
and deterministic still records the unavailable asset as generic skipped.
Five messages match after whitespace removal; the sixth additionally contains
two Open file UI labels in deterministic extraction. Full equality is not claimed.
Agentic and deterministic private contexts and immutable file hashes are retained.

Installed adapter currently contains only reviewed resource-row and rendered-
payload reuse hunks atop the prior runtime, plus the earlier completion freshness
delta. Rollback copies/hashes live in the private diagnostics directory. This is
an isolated runtime delta, not promotion of the entire branch. The normal service
now proves working-resource-row download; previous capped native failures only
selected the404asset and did not qualify a successful resource-row transfer.
All17subscriptions/global scheduler remain paused, queued/running0, warnings0.
Final lease readback found the terminal helper's lease lost/owner null; process
custody and retirement remain an explicit pending check.

Next bounded work: correlate exact artifact download404/410events and report
provider_unavailable immediately, avoiding the30second generic failed-download
wait; preserve warning/unknown-effect stops. Then obtain a clean equivalent-output
baseline and deterministic comparison, including successful multi-artifact and
automatic follow behavior. No raw content, URLs, account identity or artifact
filenames are copied into the public ledger. Goal remains unachieved.

## 2026-10-16 | Issue165 matched download failures and clean service comparison

A click-correlated interpreter download404/410 now ends promptly as
provider_unavailable/retryable=false, rather than waiting30seconds and becoming
generic skipped. Observation is scoped to requests initiated during the selected
click, the exact conversation, sandbox filename and message ID when available.
Listeners are disposed on success/failure. Neighbour-file/conversation404s cannot
terminate the selected transfer. Artifact manifests carry the classification
through history projection to unavailable/terminally_unavailable. Provider-free
replay first timed out on this defect; projection first lost terminal semantics.
367focused tests passed across5files, then12replay cases passed after adding the
neighbour-conversation case. Typecheck, compiled TypeScript build, Biome/diff clean.
Serial Standards review preserved provider-local matching and public manifest
semantics; Spec review retained other HTTP failures and existing identity/guard
behavior. Isolated compiled deltas/rollback SHA receipts remain private.

Clean same-conversation agentic run:48532ms/72backend requests; deterministic
public-service run with a fresh cache and force=false:43666ms/72requests. Ratio
0.899736time/1.0requests is within1.3for BOTH metrics. Six messages match exactly
after outer trim. Both account for two artifacts:one13889byte file with matching
SHA256 and one observed HTTP404unavailable artifact. This is successful retrieval
of available content plus explicit source-unavailable evidence, not two saved
files. Full action/request/response/download-event receipts and immutable hashes
are referenced in docs/dev/issue165-scrape-benchmark-2026-10-16.json. Raw contents,
URLs, filenames and account identity stay private. The earlier partial/failed
measurements and rejected complete flag remain preserved separately.

Goal stays ACTIVE: this clean service case passes the30percent gate; automatic
completion-to-materializer cost and successful multi-artifact harvesting remain
unproven. Next address unconditional completion-to-child quiet time and measure
one exact-conversation automatic pass under the same output/cost contract, without
resuming the global scheduler or unrelated subscriptions.

## 2026-10-16 | Issue165 automatic admission failure isolated from passing service case

One exact-conversation automatic proof ran through createResponsesHttpServer with
its built-in accountMirrorProofScope: fresh cache, scheduler/background execution
and loaded-operation resume disabled. Primary scheduler/17subscriptions untouched.
It took173430msincluding setup (167217msoperational), observed at least127backend
requests, and collected6messages/2artifacts/2files. Coverage starts after lease
publication, so startup traffic is missing. It completed WITHOUT a materialization
child or saved bytes. This is a failed30percent automatic comparison, not acceptance.
Receipt:measured-automatic-scoped-2026-10-16T20-01-59-109Z.json in the private
plan0411diagnostics root. The proof server closed, but its Node process49749
retained background timers; after verifying the terminal receipt and exact command,
only that owned controller received SIGTERM. No browser process was signalled.

The completion handoff no longer imposes ChatGPT's blanket max-class120second
quiet time: actual observed cooldownUntil is preserved, and child concrete actions
retain their governor. Gemini/other providers keep their previous policy. Regression
first failed5cases, then76completion tests passed, including a real provider
cooldown introduced during collection. This timing fix remains source-qualified;
the native proof never reached child creation and cannot qualify the handoff.

Read-only replay using actual fresh status and historical jobs proved why no child
was created:without history4retrievable entries; with history0retrievable/4terminal.
The planner treated generic legacy failed/skipped rows as confirmed provider
unavailability. It now requires failureKind=provider_unavailable or explicit
assetAvailability=unavailable for terminal subtraction. Raw historical records stay
unchanged; typed retrieval failures and explicit terminal results retain their
classification. Two regression variants went red;10planner/76completion tests now
pass. Source-build replay of the actual same native data now reports4retrievable
with OR without historical jobs. Typecheck, compiled TypeScript build, Biome/lint
and diff pass. Serial Standards/Spec review preserves current warnings, exact
provider cooldowns, explicit terminal evidence and other-provider timing.

Both isolated compiled admission deltas have rollback hashes in private receipts;
no full branch promotion. Goal remains ACTIVE and issue165OPEN. Clean service
case43.666s/72requests versus agentic48.532s/72passes, with identical6trimmed
messages, same13889byte/hash file and explicit404for the second artifact. Automatic
still fails:identity completed20:02:23, conversation route changed20:04:19, followed
by another page-load burst. The precise pacing/identity caller responsible for that
gap is not yet attributed. Next build a tight caller-level timing/initial-route
repro, remove redundant setup and pace actual backend effects, then perform one
new automatic comparison. Successful multi-artifact harvesting remains unproven.


## 2026-10-16 | Issue165 private cold benchmark checkpoint

The HTTP server accepts an optional history-materialization factory, preserving
its production cleanup, guard observation and foreground-work callbacks. Explicit
service injection still takes precedence; the default constructor is unchanged.
A real HTTP/service/store regression proves private job creation and startup
recovery leave the default-store running fixture unchanged. Six targeted HTTP
tests pass across two files; eight private-store self-checks pass. Typecheck and
compiled TypeScript exit0; source lint exits0 with its existing Location warning;
the new test passes Biome. Whole-server Biome retains existing formatting/import
debt. Primary serial Standards and Spec review against7f3fa0b0e found no accepted
findings in this slice; full issue acceptance remains unproven.

Cold multi-artifact automatic and current guarded-agentic drivers are prepared,
not run. Private snapshots, logs and restoration manifest are under
~/.auracall/diagnostics/plan0411/cold-preparation-validation-20261016. The profiler
install/restore self-check confirms the compiled transport is restored. Read-only
preflight23:00UTC still finds PID12187 without a matching native ownership receipt;
zero product controls/provider commands issued. Do not adopt or signal that browser.
Frozen complete automatic97.851s/66requests still fails the63.0916s time ceiling;
service-only passes do not satisfy automatic acceptance. Next: establish current
native ownership through the supported runtime, then execute one complete measured
automatic pass with equivalent texts/files and early Network capture. Keep the
original faster agentic baselines. Ledger: issue165-scrape-benchmark-2026-10-16.json.
Memory disposition forbidden: no explicit user memory-update authorization.


## 2026-10-17 | Renewed live measurement after browser restart

User authorized stopping the mismatched browsers and relaunching. Historical
PID27467 was absent; exact managed PID12187 and manual-login replacement53103
were stopped. Native launcher produced verified PID59717; subsequent product
lifecycle may replace it through normal cleanup/relaunch. No prompts, global
scheduler controls or full installed-source promotion. Private recovery receipt:
`native-relaunch-20261017.json`. Current compiled source base is bda5adfe2.

Fresh multi-artifact automatic pass now PASSES its frozen clean agentic baseline:
54168ms/70requests versus49510ms/68 (time1.094082, requests1.029412). Four exact
trimmed texts and both saved file byte counts/SHA256 match; archive links present;
private stores began empty, child materialized2, force=false. Page Network capture
is complete from owned blank target before provider navigation. Receipt:
`measured-automatic-scoped-2026-10-17T02-34-40-144Z.json`; independent readback:
`cold-multi-automatic-parity-20261017.json`. An earlier63468ms/at-least68run remains
unaccepted because the observer closed during parent-child custody handoff.
Harness now retains the exact-target early Network observer across the gap,
while DOM observation still requires current custody. Both parent/child attachments
retain earlyCapture=true; no provider behavior or pacing was changed.

Original existing-state automatic clean repeat still FAILS time:66178ms/66requests
versus48532ms/72, ceiling63091.6ms. Over by3086.4ms; full setup cost is retained.
Six exact trimmed texts, verified13889byte A checksum, and typed nonretryable
provider-unavailable B evidence all match. Complete page capture; no warning/429.
Receipt `measured-automatic-scoped-2026-10-17T02-37-15-742Z.json`; comparison
`original-complete-comparison-20261017.json`. Faster58457ms profile is separately
unaccepted because raw coverage reports a custody change before target creation;
do not choose the faster sample to erase the failed clean repeat. Profiler restored
with hash-checked receipt `source-cdp-profile-original-recheck-20261017.restored.json`.

Profile identifies repeated shared-store reads, including four archive list calls
from recovery search projections and large history files. Next bounded source
packet: reduce repeated archive/history planning reads through an existing public
seam with a regression, preserve live file verification/typed terminal evidence,
then repeat the original full measured automatic comparison. Do not simply replace
shared stores with empty ones for this acceptance. Main installed API readback
retains scheduler paused,17paused,0queued/running and0warnings. Goal remains ACTIVE
and issue165OPEN; no merge/release. Ledger and private renewed-measurement-20261017
snapshots preserve all attempts. Serial Standards/Spec evidence review: no accepted
findings in this documentation packet; full time criterion remains unmet.
Memory disposition forbidden: no explicit user memory-update request.


## 2026-10-17 | Installed bounded follow check passes

Actual installed first pass omitted typed unavailable B and had incomplete startup
capture. Installed five rollback-backed tested deltas;245tests/5files pass. Repeat
46995ms/68requests vs agentic48532ms/72 passes strict1.3limits, all6texts equal,
A file/hash verified, explicit typed unavailable B retained. Child duplicate1/skip1
settles, parent one pass then paused. No new transfer. Reloaded idle main API;
scheduler/all17subscriptions remain paused,0queued/running/warnings. Details:
docs/dev/notes/2026-10-17-installed-follow-acceptance.md. Gate C canonical integration
and required fresh installed transfer evidence remain open; PR323 remains draft,
issue165OPEN. Memory disposition forbidden.


## 2026-10-17 | Issue165 canonical acceptance

PR323 integrated23969f469; complete canonical runtime595compiled files match and
main API now selects it.743affected tests, production build/lint/typecheck pass.
Original case43332ms/67; fresh two-file case58636ms/69; both strict1.3limits pass
with equivalent texts and verified files, manifest/archive parity and typed
unavailability. Fresh child materializes2; original child duplicate1/skips1. Raw
cleanup-disconnect flags remain with explicit post-provider-work qualification.
Canonical acceptance note closes scoped Plan0386; issue165closure follows the
acceptance PR. Wider P92/Plan0411 changed-frontier and scheduler continuation stay
open; scheduler/all17subscriptions paused,0queued/running/warnings. Memory
disposition forbidden.


## 2026-10-17 | Bounded frontier acceptance resumed

User authorized the proposed changed/unchanged check after issue165 closure.
Canonical installed runtime remains selected; scheduler/all17subscriptions paused,
0queued/running/warnings at initial readback. At most two single-pass automatic
completions, maxItems1/forcefalse, each ten-minute observation bound. Current
account cache retained. Starting detail cursor remains unfinished; backlog
continuation must not be graded as quiet-complete acceptance. Twelve focused
frontier tests pass. Execution/evidence: ../notes/2026-10-17-plan0411-frontier-acceptance.md.
No scheduler resume, prompts, installation or source change.

Bounded result: one normal pass150292ms/129observed backend requests,0new downloads;
existing detail cursor2→3. Automatic child verified1duplicate/skipped1/failed0.
No independently changed index or quiet-complete fixture, so second pass withheld
rather than grading backlog continuation as quiet acceptance. Original issue165
artifact hash unchanged. Exact controller/browser absent and0owned active leases;
main scheduler/all17subscriptions paused,0queued/running/warnings. Raw Network
cleanup-disconnect flag preserved; details/private locators in the acceptance note.
Recently changed conversation URL requested; no prompt or scheduler resume needed.


## 2026-10-17 | New-chat follow discovery FAIL

User supplied a real new IM Receipts chat; primary located its saved proof/history
without another prompt. One normal unscoped completion with current cache and
metadata_only (no artifacts in fixture, shared browser preserved) took148897ms/
136backend requests with complete exact-page Network coverage. New candidate is
absent before/after. Persisted detail backlog selected an older chat; its context
read failed messages-not-found, yet coarse parent completed/errornull. No new
capture, child or quiet-repeat acceptance. Exact probe tab closed; other current
tabs preserved, main scheduler/17subscriptions paused,0queued/running/warnings.
This is failed acceptance, not a completed follow repair. The bounded/live_follow
persisted phase decision shares the same installed path; replay and live details
are in ../notes/2026-10-17-plan0411-newchat-follow.md. Next reproduce discovery
fairness with pending detail and parent error visibility before source repair.


## 2026-10-17 | Source repair packet

State: OPEN source slice. Primary serial; base3767060b7, branch
fix/plan0411-follow-discovery. User authorized diagnosis/TDD/review/live recheck.
First reproduce failed detail → completed parent at the public completion seam,
then reproduce due index discovery with pending retained detail. Keep configured
cadence and guards, old cursor/cache, unrelated browser tabs and scheduler pauses.
No new prompt, cookie reseed, numeric backend ceiling or broad browser cleanup.
One red/green slice per failure, followed by affected validation and serial review.
Acceptance remains actual new-chat discovery/capture then a bounded quiet repeat;
source tests do not close live acceptance. Existing failed receipts remain immutable.

Sourceb8f1d229f merged current maind03d89e38 atb41fd3765.197focused/751broader
affected checks, typecheck, lint and production build pass.584packaged JavaScript
files match staged installation. Two0provider-request precollection warning-check
timeouts retained. Exact reversible stale desktop transition recovery restores
the public probe631ms/guardnull; new bounded installed follow proof is running.
No global scheduler resume, prompts or launcher/API activation. Repair/evidence:
../notes/2026-10-17-plan0411-follow-repair.md. Full acceptance remains OPEN.

Final installed run133412ms/125backend requests received conversation-list429 at
22:02:41.695UTC; exact parent immediately paused/passCount0, no capture/child or
quiet repeat. Shared warning ledger active1/indefinite. Exact probe tab retired,
other current targets and native browser preserved. Scheduler/17subscriptions
paused,0queued/running. PR333 is draft with validated source/staged parity; no
main merge or global activation, and no further provider retry/warning clearance
in this stopped packet. Plan remains OPEN. See follow-repair note for raw locators.


## 2026-10-17 — Shared backend request admission source repair

The configured live-follow authority omitted backend request admission; configured
utility/provider-client factories had no service config enablement path. Added
explicit services.chatgpt.maxBackendRequestsPerMinute and runtime binding override,
reusing shared account ledger and owned interception. No default ceiling or live
activation. Independent-ledger follow regression and existing actual transport
fixtures prove shared admission and pre-navigation interception; unknown dispatch
cannot report successful completion. See
../notes/2026-10-17-plan0411-shared-backend-admission.md for red/green and validation.
Plan remains OPEN: measured production ceiling, staged activation, changed capture
and unchanged repeat remain unaccepted; previous429warning is retained.


## 2026-10-18 — Operator-requested shared-task native trial

Built/staged d3abdada9;584JS parity and real resolved config30/min,600000ms waiting.
Two LitScout exact threads each ran one installed read-only apps list and returned
owned backend request cleanup timeouts. Follow failed desktop admission with0
backend requests. Shared owned-permit meter34admitted/31started,peak29/min,0new
shared warnings; full HTTP and simultaneous three-way acceptance are unproven.
Actual CLI attempts did not overlap after asynchronous release and early failures.
The trial did not exhaust the ceiling, so native waiting is also unqualified.
Failed activation rolled back config/wrappers to previous issue331 selection;
unknown/frozen records and browser processes preserved. No automatic retry after
uncertain cleanup. Source remains draft PR333; plan OPEN. Next exact boundary is
provider-free native desktop-hold/request-cleanup composition, then a qualified
installed retry. Full receipt summary in
../notes/2026-10-17-plan0411-shared-backend-admission.md.
