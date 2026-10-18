# Plan0411 shared backend admission repair

State: source repair; production activation and live acceptance pending.
Base: f88e8f468 on fix/plan0411-follow-discovery, draft PR333. Primary serial.

## Defect and scope

The shared ledger already aggregated backend request permits by provider/account,
including independent process instances. Live-follow did not supply backend
admission to its traffic governor. Utility and provider-client authorities accepted
only an explicit internal limit; service configuration could not enable them.
Browser-operation admission and reactive shared warnings did not establish a
shared backend request budget. The earlier125-request measurement covered one
owned target, not aggregate account traffic; concurrent work prevents assigning
the observed429 to live-follow alone.

Added services.chatgpt.maxBackendRequestsPerMinute and the runtime binding override
runtimeProfiles.<name>.services.chatgpt.maxBackendRequestsPerMinute. The explicit
positive-safe-integer setting is consumed by all three configured authority paths.
No default or chosen production ceiling. Caller-supplied utility/factory limits
retain their existing precedence. Existing ledger scope, request identity,
interception and warning behavior are reused. Live-follow validates exact current
lease custody on request dispatch and reconciles request effects before settlement;
unknown request effects cannot report successful completion.

Coverage is owned intercepted ChatGPT /backend-api/ traffic, including bootstrap
before navigation. It is not browser-wide observation of manual tabs, unobserved
workers, bypassing clients or every HTTP path. Exhaustion follows existing bounded
yield/stop behavior; no automatic wait/retry or warning dismissal was introduced.

## Feedback loops and verification

- Public configured live-follow boundary: two tasks, independent file-backed
  ledger instances, same account, fixture ceiling1. Before wiring both lack the
  admission hook; after wiring exactly one request dispatch succeeds, the other
  receives ProviderBackendRequestBudgetExceededError. Initial fixture setup failure
  was corrected before retaining the red-capable run.
- Existing owned-transport and public utility bootstrap tests now enable admission
  through service config rather than explicit limit arguments. All18selected cases
  failed before utility/factory wiring and passed afterward (22.10seconds).
- Unknown-outcome regression: temporarily removing the final success guard makes
  the public completion incorrectly resolve; restoring it rejects completion.
  Mutation was restored in a finally block. No mutation remains in source.
- Resolver cases cover opt-in, global fallback, runtime precedence and malformed
  explicit ceilings. No numeric fixture value is a production recommendation.

Commands: pnpm vitest run tests/accountMirror/configuredLiveFollowAffinity.test.ts
-t 'two owned tasks' (original red/green test name); pnpm vitest run
 tests/browser/backendRequestAdmission.test.ts -t 'owned backend denial|public utility bootstrap'.
The final follow test is named 'owned follow request admission preserves %s'.

Affected provider-free selection:9files236tests pass in54.16seconds, including
refresh service, actual metadata collector, utility, transport, ledger, governor
and tenant configuration. Final changed boundary rerun:2files23tests pass.
Final typecheck and touched-source/test lint pass. No full-suite, build, installed
runtime, browser-wide coverage or native acceptance claim.

Receipts in /tmp: plan0411-shared-backend-red.log,
plan0411-shared-backend-green.log, plan0411-shared-config-red.log,
plan0411-shared-config-green.log, plan0411-shared-backend-unknown-red.log,
plan0411-shared-backend-final-tests.log, plan0411-shared-backend-final-boundary.log,
plan0411-shared-backend-final-typecheck.log, plan0411-shared-backend-final-lint.log.
These local logs are locators; retained source tests and this result summary are
the repository evidence. No private provider payloads were added.

## Review and remaining acceptance

Standards reviewed serially against f88e8f468 and current repository conventions:
reuse existing owned authority and ledger; no new parallel budget store or aliases.
Spec reviewed separately against the authorized shared-task regression and repair:
shared admission is enabled consistently by explicit configuration; known denial
blocks dispatch, unknown outcome cannot report success. No accepted blocking
findings. Live acceptance remains incomplete; the previous retained429stop is not
cleared by passing provider-free tests. Choose a measured ceiling, stage the full
runtime and establish shared participating-task evidence before claiming it active.
Issue165 remains closed; Plan0411/P92 remains open. No scheduler, launcher,
service, live warning or other browser-task state was changed in this repair.

Memory disposition: forbidden; no explicit user authorization to update memory.


## Operator-authorized concurrent retry preparation (2026-10-18)

The operator requested LitScout tabs16/36 retry concurrently with live-follow.
Both exact threads acknowledged through native Wake delivery and wrote readiness
receipts under /tmp/plan0411-peer-retry-20261018. Mailbox sends were rejected
store_unavailable with no admission; native intents were admitted once, not blind
retries of uncertain effects. Both use fresh installed CLI apps list on runtime
wsl-chrome-3; no new prompt budget is inferred or consumed. Runtime release is
owned by this lane.

Immediate budget denial would safely stop these tests rather than complete them.
Added explicit backendRequestBudgetWaitMs (default0), reusing atomic shared
permits after capacity returns. Waiting sends no provider requests, checks
warnings/lease/cancellation each second, and is bounded. It computes the next
rolling-window release instead of repeatedly creating rejected ledger entries.
App inventory deadlines include configured waiting; injected short deadlines
remain unchanged. Three caller regression fails before the change and passes
across successive minute windows afterward. Warning, cancellation and timeout
cases retain hard stops. Affected138tests/6files pass; typecheck/lint pass.
Full rebuilt installation and live three-workload acceptance are pending.

Fresh passive readiness at00:04UTC verified native browser identity, complete DOM,
no visible blocking surface, and an expired legacy cooldown. The retained shared
warning dates22:02UTC; warning history/frozen records are preserved. Any qualified
operator retry release will be recorded with exact scope and reason. Trial
ceiling30backend requests/minute and bounded600000ms capacity waiting are proposed
for this authorized measured run, not a claim about provider capacity.


## Installed-boundary correction before release

Staged520125ff2 matched584JavaScript files and built successfully, but actual
resolveConfig stripped both new service fields: caller tests injected typed
objects and missed the schema boundary. Activation stopped before warning release
or launcher promotion; the proposed config fields had been written but were
ineffective in that old schema. Original config backup remains private and intact.
Added both fields to ChatgptServiceConfigSchema. A real-resolver regression fails
with an empty service object before the fix and passes with global values and
runtime binding precedence afterward. Affected schema/config selection42tests
passes. Replacement full build/install and exact resolved config verification are
required before releasing either LitScout peer.


## Native trial result and rollback — 2026-10-18

Source d3abdada9 was fully built/installed,584compiled JavaScript files matched,
and actual resolved configuration confirmed30backend requests/minute with600000ms
bounded waiting. CLI/MCP wrappers selected it for this trial. Main API94853 and
its paused scheduler were not restarted or resumed. The previous22:02rate warning
was explicitly released after the qualified expired-cooldown/native-DOM readback;
its history and all frozen records were retained.

The two prepared peers each acknowledged the release, verified installed identity
and ran exactly one fresh installed apps list on wsl-chrome-3. Both returned their
file-only results, which the coordinator read. Neither sent a prompt, restarted
a browser, cleared a warning or retried. Each failed with
OwnedBackendRequestCleanupError: owned backend request client cleanup timed out
during getProviderSessionProof/readState. Tab16 ran00:09:38–00:10:07UTC; tab36 ran
00:10:25–00:11:02UTC. This is failed inventory acceptance, not download evidence.

The one installed private proof-server follow attempt failed00:09:04UTC after
about4.45seconds at desktop admission: Desktop control is busy; automation or
another human owns the display. It sent0backend requests and completed0passes.
Fresh later gate-owner readback was empty; no permanent owner or causal attribution
is inferred. No follow lease remained in the exact parent readback. No owned CLI
or proof-server process remained after the terminal results; shared browser20905
was retained. No blanket tab cleanup, custody reset or process signal occurred.

Aggregate ledger meter00:08:55–00:11:44UTC observed34new owned backend permits,
31started, peak29started admissions per rolling minute,7settled and1explicitly
unknown effect; other started records remained unresolved and were not rewritten.
Two distinct utility operations participated. There were0new active shared
provider warnings. This is account-wide owned-permit evidence, not full HTTP
coverage or proof of no429 anywhere. The selected ceiling was not exhausted,
so native waiting behavior is not qualified by this run. The three attempts did
not overlap after asynchronous dispatch and early failure; simultaneous three-way
acceptance remains untested. Provider-free waiting/atomic-budget regressions do
not substitute for that native evidence.

Acceptance failed. At00:12:02UTC, exact unchanged-current config/wrapper checks
qualified rollback to the original config bytes and prior issue331 launcher
selection. d3abdada9 remains staged only. No shared budget is claimed globally
active after rollback. No warning history was erased or reintroduced, and no
frozen/uncertain records were settled manually. Operational end notices were scheduled for both peers; scheduling admission does
not prove receipt. The notices prohibit another automatic attempt. Original provider prompt/call
budgets remain unchanged. No provider retry after uncertain cleanup.

Private receipts: ~/.auracall/diagnostics/plan0411/shared-trial-activation/
(receipt.json, warning-release.json, config-before.json, rollback.json),
shared-retry-readiness.json, and
measured-shared-follow-2026-10-18T00-08-56-935Z.json.
Peer/meter receipts: /tmp/plan0411-peer-retry-20261018/{tab16-result.json,
tab36-result.json,aggregate-latest.json,checkpoint.json}. Request and terminal
native Wake receipts are in the same private coordination directory.

Remaining blocker: reproduce actual native desktop-command/transport hold and
owned-request cleanup composition with provider-free fixtures before another
installed provider attempt. Do not weaken ownership, cleanup or rate guards.
Plan0411/P92 stays OPEN; issue165 stays closed. Memory disposition remains forbidden.
