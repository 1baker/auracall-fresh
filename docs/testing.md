## Automatic sender through frontend MCP (2026-10-26)

`tests/relay.mcpFrontend.test.ts` connects an SDK client to the existing registered
frontend tools over InMemoryTransport, using a synthetic provider and private
fixture RelayStore. It runs the existing P447 sender through Pro configuration and
independent inspection, exact-prompt once-only Send, full Unicode reply persistence
and fresh saved readback. A lost Send acknowledgment recovers only the original
answer; the Send count stays one. Protocol/route/refusal/size checks fail without
truncation, private error disclosure or automatic retry. This proves source
composition, not a signed-in browser, real Pro control, host transport or OAuth.

## Sealed admission v2 / operator composition (2026-10-26)

Focused tests use the unchanged sealed native synthetic fixture74e327bf. They
exercise the full v2 decoder, owner/grant/task/coverage and time refusals, exact
three-field versus acquired-task forwarding, one observation after reservation,
unknown accounting, hold races and integration through the opaque private input
into the existing SDK caller with an in-process fake transport. Existing lifetime,
read-budget and native runtime regressions remain applicable. No private helper,
Python operator, SDK process or real browser is executed by these tests.

## Native admission/current-guard integration (2026-10-26)

The runtime regression first demonstrates a second native call after operator
protection was revoked. The lifetime regression first demonstrates retention
past the initial observation deadline while the longer grant is still valid.
Both fail before the repairs and pass afterward. Targeted regressions also
cover nonce/receipt/producer/time mismatch, async hold and clock reversal,
Open completion after expiry, synchronous runtime hold during a pending guard
(including a failed lifetime hold hook), guarded original readback/ref-only release and
no automatic second admission or connection. All callbacks/SDK responses are
synthetic; no helper, browser, namespace or private authority is executed.

## Isolated native SDK namespace (same P266 direction, 2026-10-26)

The nativeRuntime public fixture records the supplied SDK connector descriptor.
The failing-before-fix case proves a selected p266new namespace was omitted.
The corrected case verifies exact allowlisted child environment, preserved private
home/socket and immutable selection. Invalid compiled namespaces refuse before
private reads; a private JSON namespace flag is rejected. Reuse native lifetime,
consumer, Pro and relay-preparation checks for the same caller integration.
No candidate, native browser, namespace, unit, port or private authority is invoked.
The final native observer/operator guard join remains a production requirement.

## Carried native Pro read allowance (Plan0448, 2026-10-26)

Run frontend.nativeConsumer/nativeRuntime/nativePro with the existing identity,
lifetime and Pro-preparation suites. New behavioral regressions first reproduce
fixed20 exhaustion at read21 and SDK startup despite unknown/missing carried
usage. Fixtures then qualify the exact80 cumulative amendment with18 synthetic
prior reads, including independent same-target final Pro readback. This is not
18 actual complete usage: real history remains UNKNOWN until a trusted operator
proves it. Test baseline de-duplication, full cap, failed reservations, six-control
carry and reserve, exhausted Sends, changed receipt/producer/target/expiry,
policy omission/replacement, and one SDK attempt across restarts/concurrency.
Synthetic verifier callbacks are not production admission. No tests connect a
real SDK, touch retained browser state, or authorize installation or model sends.

## Matched native AX Pro source and reference release (Plan0448)

Use frontend.nativePro plus nativeConsumer/nativeRuntime/identity/lifetime and
protected preparation regressions. Consume the pinned17-case privacy-r2 fixture,
including withheld sensitive/unknown facts. Exercise typed Pro, picker opening,
new refs, malformed/conflicting/disabled/ambiguous facts, changed target/model/
operation/custody/URL, stored evidence, incorrect ACKs, no progress after input,
read headroom before control, sticky holds and cached protected preparation.
Explicit consumer release must retain the SDK/producer and unknown operation
history; lost or mismatched results must not permit retry or fresh close ACKs.
These synthetic checks neither qualify the installed producer nor reset any live
read/control/Send allowance. Native terminal model replies/files remain separate.

## Compiled native lifetime policy (existing Plan0448 continuation)

Run frontend.nativeLifetime and frontend.nativeRuntime with native consumer,
identity and protected preparation regressions. Cover one exact attempt/client,
strict context and expiry, late admission after hold/expiry, rejected admission,
client/context drift, and permanently held acquired-task history. The public
runtime must preserve stored/mismatched original metadata semantics under the
compiled policy, with no close/release/reconnect. Default startup remains closed
before private reads; an injected fixture admission is not production authority.

## Same-session runtime readback (existing Plan0448 continuation)

Run frontend.nativeRuntime with native consumer/identity and protected preparation
regressions. Through the public runtime, metadata readback must use the retained
acquired session, preserve original-key/matching-operation validation and hold
preparation permanently. A mismatched latest operation refuses. Repeating an
attempt must not call the producer again; no reacquisition, close, release or Send.
The default foreground lifetime gate remains closed before private reads/startup.

## Pro-only preparation (existing Plan0448 continuation)

Run relay.proPreparation with existing relay/store/CLI/dispatch and HTTP/MCP
regressions. Public behavior must prove no model job/claim/Send, independent Pro
readback, immutable owner/route/target/operation binding, held crash/refusal,
concurrent target fencing and cached historical metadata without another page
call. The compiled CLI fixture's prepare-only variant moves synthetic Chrome
from Instant to Pro with fills/Sends0, then repeats with the bridge closed and
requires cached receipt with no new transport calls. Retain the dispatch variant.
These fixtures do not qualify a current real browser, page-read allowance or
installed actuator; no live Pro call is part of this source continuation.

## Owner-bound relay discovery (Plan0449)

Run relay.store and mcp.relay with relay CLI/panel/dispatch and HTTP auth/security
regressions. Public store cases cover private owner isolation, metadata-only
listing, completed exclusion, stable pagination/restart, unchanged held claims,
invalid queries and unsafe/corrupt/symlinked storage, plus the512-entry scan bound.
Actual signed-token loopback HTTP MCP tests the seventh tool, both scope/scp
permissions, wrong subject/scope refusal and the unchanged full linked reply path.
These are hermetic source checks, not a live deployment or new model Send.

## Automatic Pro preparation (Plan0448)

The foreground sender's compiled CLI fixture starts at Instant and must move the
actual synthetic slider to Pro using the production frontend/control recipe,
then preserve the two linked complete answers and cached process recovery.
The physical Chrome API/DOM and response generation remain synthetic.
Focused dispatch/store/MCP relay checks cover independent Pro readback, explicit
control refusal, URL/model drift, durable uncertain preparation across a fresh
store instance and prevention of a manual-claim bypass. Preparation never grants
another Send or frontend capability. This does not prove an installed browser
route, real Pro selection, file transfer or live automatic provider acceptance.

## Foreground relay sender (Plan0447)

Run the focused relay dispatch, dispatchProcess, CLI, store, panel and MCP relay
checks. The new dispatchProcess component-integration case has a45s budget:
compiled production CLI -> authenticated synthetic stock-Chrome HTTP boundary ->
actual frontend/controller/DOM recipes -> two linked complete saved replies,
then fresh-process cached readback with the bridge closed. Only the physical
Chrome API/DOM and response generation are synthetic; no provider is contacted.
The core seam checks claim-before-Send, route/Pro refusal, concurrent dispatch,
old claims, uncertainty/status-only restart recovery and full reply persistence.
Retain affected frontend inspect/config/message guards when changing observations.
These tests are not real browser custody, private routing or Pro acceptance.

## Native retained consumer (Plan0446)

Reviewed producer-v2 export01de61ce and identity.v1 extend the historical sealed
P266r2 envelope. Native fixtures do not mock an internal authority decoder.
The typed identity must agree in all three wire copies and remain bound to the
same principal, capability revision, process, custody, target and operation.
Run frontend.nativeIdentityV1 with the existing native consumer/identity/factory
and SDK workflow checks. Preserve its changed-principal RED and metadata-freshness
RED; malformed/mismatched tuples must refuse before the factory returns a facade.
Stored/unavailable identity readback stays metadata-only and cannot clear a hold.
These are synthetic source checks; no actual native consumer Open or grant is performed.

The earlier sealed-r2 acquisition regression remains historical evidence:
A normal public acquisition regression failed on the old extra decoder gate, then
passed using only actual wire fields. Browser validates private generation,
credentials and custody; AuraCall pins returned task/control/grant/acquisition,
session/expiry and fresh operation-bound targetObservation. Local expectations
are comparisons, never observed evidence or a new grant. Malformed identity,
metadata-only replay, non-Boolean input ACKs and unsupported aliases refuse.

Run the native consumer/identity/SDK workflow tests with native-task binding,
request persistence and frontend configuration regressions. A synthetic producer
on the real SDK in-memory transport exercises the sealed wire without private
identity fixtures: full Unicode reply persistence and fresh compiled-process
readback, protected drafts, stable text/prompt correlation and immutable counters.
These are source tests; installed Browser/real UI/private connection are NOT_READY.
The unchanged20-read cap holds the second turn pending; two guarded completions
need28 reads. Native Pro configuration and uploads remain unsupported.

## Frontend replies across process and HTTP boundaries (Plan0444)

Run `pnpm exec vitest run tests/mcp.frontendProcessReadback.test.ts`.
This source-only fixture compiles the production frontend modules into a disposable
stdio server and uses the real MCP SDK and broker HTTP client against a loopback
synthetic DOM server. It checks both confirmed input and a dropped HTTP response after the first Send.
The uncertain case restarts before status; each variant asserts exactly two
fills/Sends, two linked complete UTF-8 multiline replies and exact content hashes. A distinct process then recovers both
saved replies with the fixture HTTP server closed and the capability absent; the
HTTP/input counts remain unchanged, including a repeated Send with the same IDs.
Its45s per-variant case budget includes compilation and
two process startups; this is an explicit component-integration tier, not a live test.

TSX name-preservation helpers are not a production compilation condition for
serialized DOM functions. Use the compiled fixture, not a TSX-launched source
server or injected helper globals. Explicit BR elements preserve fixture visible
line breaks; the visible-text oracle is checked before HTTP/process startup.
No Windows helper, browser, provider, credential store or live runtime is used.
Real ChatGPT/Grok acceptance and the Browser-owned control contract remain separate.

- Backend transport handoff, native cancellation and inventory observation (provider-free, issue325):

## Grok Heavy model candidate (Plan0444)

Run `pnpm exec vitest run tests/mcp.grokHeavyControls.test.ts --maxWorkers=1`.
The public MCP fixture evaluates the production serialized DOM recipe and fakes
only browser layout/native input. It checks exact Heavy selection and closed
readback, gated/ambiguous/disabled/link choices, protected drafts/generation,
overlay/dialog/URL/model drift, uncertain input without retry, unresolved-request
protection, unchanged Fast controls, and two connected synthetic replies whose
full bounded text is returned through status. Existing provider fixtures remain
unchanged. These checks do not establish actual Grok Heavy availability or real
ChatGPT/Claude completion. See `docs/mcp.md` for the source gap table.

The complete affected set has240cases/13files:178original frontend,23Heavy,
39HTTP. It passes in a byte-verified Linux source/dependency fixture. The mounted
source's5s process-start test failed twice; keep those failures distinct from the
Linux result. An exact copied dependency tree can still leak owner paths through
pnpm .bin/NODE_PATH shims: use copied tool entry files directly with node and
NODE_PATH unset for such a comparison. The candidate does not change the CLI
entry or readiness deadline. This is a selected regression result, not a full
repository or live-provider pass.

## Claude frontend candidate (Plan0444 S5)

Run `pnpm exec vitest run tests/mcp.claudeFrontendWorkflow.test.ts --maxWorkers=1`.
The semantic DOM fixture executes the production serialized read-only recipe
and simulates native click/fill at the broker boundary. It tests explicit config,
provider-specific effort levels, exact visible-label/readback, missing capability,
strict URL and adverse frontend states, the shared target lock, two connected
synthetic replies and saved-receipt recovery after service reconstruction.
Selectors are unverified-grounding; this suite does not establish real Claude
UI compatibility or a native provider response. Retain all148 existing
frontend/MCP checks unchanged and the39HTTP checks when changing dispatch.

## Protected frontend HTTP MCP (Plan0444 S4)

Build first with `pnpm run build`, then run `pnpm exec vitest run tests/mcp.http.test.ts tests/mcp.http.config.test.ts tests/mcp.http.security.test.ts tests/mcp.http.process.test.ts --maxWorkers=1`.
These checks exercise real loopback HTTP through official SDK clients, signed
positive/negative tokens, operation scopes, route masking, bounded input,
shared target locking, linked fixture replies and persisted restart recovery.
The process fixture requires the existing `openssl` command and compiled MCP
entry point. It creates its own HTTPS signing-key server, certificate and fake
Agent Browser HTTP broker; only its child trusts the fixture certificate.
No actual provider, AS, installed service or retained browser is contacted.

Do not run a build concurrently with compiled MCP tests: build cleanup can
remove their entry/assets. Final regression uses `pnpm exec vitest run --maxWorkers=1`
with live-test opt-ins absent. Preserve and identify existing baseline failures;
fixture success does not qualify actual shared SSO or HTTP-to-provider acceptance.

  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts tests/browser/chatgptDeveloperAppInventory.test.ts tests/browser/nativeDesktopCdp.test.ts tests/browser/desktopControlGate.test.ts`.
  Reused governor probes the owning Runtime after predecessor closure. Seven
  native-cancellation controls distinguish before/after SDK send, foreign
  network/frame IDs and non-cancellation failures. Delayed installed payloads
  survive configured capacity waiting; optional linked metadata stays bounded,
  and caller abort prevents later navigation. Native process/generation gates
  and post-send unknown custody remain unchanged.

- Ledger read contention and mixed-batch durability (provider-free, issue325):
  `pnpm vitest run tests/browser-service/interactionLedger.test.ts tests/browser/backendRequestAdmission.test.ts tests/cli/chatgptDeveloperAppsCommand.test.ts`.
  Controlled slow snapshot proves same-instance readers wait instead of consuming
  the lock timeout; pure reads do not rewrite state. Mixed read/write callers
  receive no results before durable commit and reject on commit failure. Existing
  cross-instance ceilings/warnings/restart tests retain account authority.
  Developer-app ownership tests preserve AggregateError classes and nested causes.

- Developer-app inventory failure diagnostics (provider-free, issue325):
  `pnpm vitest run tests/cli/chatgptDeveloperAppsCommand.test.ts tests/cli/developerAppTerminalExit.test.ts`.
  Public operation tests distinguish identity, inventory and cleanup deadlines
  and preserve immediate refusal. Actual CLI action fixtures prove JSON/nonzero
  status, queue refusal and release before terminal exit. Provider reads and
  managed-browser cleanup remain separate acceptance.

- Late paused events during owned Fetch shutdown (provider-free, issue337):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'late paused event during owned Fetch shutdown'`.
  Actual observer/guard/authority composition proves callbacks arriving during
  shutdown issue no subsequent Fetch commands; failed disable still rejects.
  A separate disposable Chromium differential reproduced the exact protocol
  failure before the barrier and passed with only this scoped repair.

- Native replacement custody (provider-free, Plan0435):
  `pnpm vitest run tests/cli/browserLoginLaunch.test.ts tests/browser/nativeDesktopRecovery.test.ts tests/browser/manualLoginNative.test.ts tests/browser/nativeDesktopRuntime.test.ts`.
  CLI launch-policy regression plus actual Linux child-process/socket evidence and
  local Remote View assignments/windows prove explicit reconciliation and ordinary
  reuse, with unchanged receipts on qualification failures. Installed browser and
  provider acceptance are separate.

- Baseline drain/navigation/prompt/budget regression (provider-free):
  `pnpm vitest run tests/http.responsesServer.test.ts tests/browser-service/ui.test.ts tests/browser/browserMutationControlPlane.test.ts tests/browser/desktopRuntimeProfiles.test.ts tests/browser/chatgptPromptAdapter.test.ts tests/browser/llmServicePromptStructure.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers=2`.
  Drain status uses an explicit in-flight gate, and shared write budgets use a
  controlled clock with four independent service instances. Wake navigation is
  admitted at the common browser-service control point; protocol errors reject
  without fallback and existing conversations remain untouched. Plan0434 records
  the original failures, timing probes and budget sensitivity check.

- In-place developer-app tool catalog refresh (provider-free):
  `pnpm vitest run tests/browser/chatgptDeveloperAppRefreshTools.test.ts tests/cli/chatgptDeveloperAppsCommand.test.ts`.
  Protects exact account/app/endpoint qualification, trusted single activation,
  attributable tool catalog metadata, identity/connection preservation, human
  approval and uncertain failure outcomes. Three adapter cases cover temporary
  disabled controls and loading account data before/after the one activation.
  Existing replacement tests retain
  delete/recreate coverage. Native acceptance is recorded separately in Plan0433.

- Matched artifact download failures (provider-free):
  `pnpm vitest run tests/browser/chatgptMaterializationReplay.test.ts tests/runtime.historyMaterializationService.test.ts`.
  Click-correlated HTTP404/410 becomes nonretryable provider_unavailable through
  artifact manifest and history projection. Neighbour-file/conversation failures
  do not settle the selected download; listeners are released. The measured live
  comparison is recorded in `docs/dev/issue165-scrape-benchmark-2026-10-16.json`.

- Factory-only context cancellation (provider-free):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts tests/browser/llmServiceContext.test.ts -t factory-only`.
  Resolved factory capability selects bounded cleanup without exposing a governor
  or taking another lease. Covers failed close, parent abort, late handback and
  inner abort/deadline cached-success exclusion. Metadata collector tests retain
  disabled/no-factory/explicit-no-hook deadlines and prohibit provider reads after
  cancelled option resolution. Separate source fixtures; combined native
  composition and materialization remain unqualified.

- Late collector session settlement (provider-free):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t detail-cancel-late`.
  Three controlled settlements after actual five-second drain expiry cover late
  context, failed late close and late rejection with session handback. Explicit
  provider/close signals prove one close and unchanged original timeout; lease
  settles only on confirmed close, otherwise remains unknown. Same actual
  collector/configured authority/guard/stores; synthetic provider/SDK. Native and
  caller capability propagation remain separate gates.

- Collector cancellation drain (provider-free):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t detail-cancel`.
  Actual collector/configured authority/guard/stores use controlled provider
  promises and SDK output. Explicit abort/completion signals prove delayed failed
  close, confirmed close, parent abort and five-second drain expiry. Unknown close
  retains idle unknown custody; unresolved provider keeps active lease until
  fixture teardown. Ten-second test limit permits observing the five-second bound.
  This is collector/callee-contract proof, not full native service acceptance.

- Partial-chunk collection boundary (provider-free):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t detail-partial`.
  Actual collector/configured authority/guard/store composition proves incomplete
  cursor24 survives JSON serialization and fresh explicit pass, with two distinct
  request permits. Normal and per-surface attribution close each client before
  return; failed close and mixed diagnostic/close failure retain unknown custody.
  Direct inventory-helper intra-operation session reuse remains covered separately.
  Collector cancellation races and native acceptance remain separate gates.

- Collector retained-session cleanup (provider-free):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t detail-retained`.
  Actual collector/configured authority/guarded client/stores with synthetic rows
  prove final-chunk close uncertainty stops before later detail work and fences
  custody. Mixed read/close preserves both causes; factory-only request ownership
  propagates tagged cleanup failure even without a caller governor field. Partial
  chunk/pass lifetime and native acceptance remain separate gates.

- Public utility first-navigation request admission (provider-free):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'public utility bootstrap'`.
  Actual ChatgptService, utility, adapter, annotation and guarded CDP process
  synthetic SDK request events from initial Page.navigate and payload evaluation.
  Covers allowed read, budget, uncertain send, mixed read/close failure, transport
  close rejection/timeout, warning and retained-session abort (confirmed, failed,
  timed out), successful retained-session boundary/fresh explicit reuse, retained
  budget denial and combined read/close failure. Inherited sessions reject before
  browser resolution. Explicit utility completion precedes custody assertions. Unknown
  close keeps lease/desktop custody; fixture-only release is not disconnect proof.
  `tests/browser/llmServiceContext.test.ts` also covers the five-second request-aware
  abort drain, preserved abort/deadline codes and cached-success exclusion on
  uncertain cleanup. Other retained/background lifetimes, bootstrap callers and
  production activation remain unqualified.

- Utility owned request composition (provider-free):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'utility request admission'`.
  Real utility/configured stores and owned-CDP annotation share a fixture permit
  in both caller orders without acquiring another utility lease. Unknown sends,
  warnings and reconciliation failures retain fencing; lease loss blocks before
  reserve/send. Omitted ceiling leaves the hook disabled, invalid ceiling fails
  before browser resolution. Provider/CDP are simulated; activation/native coverage
  remains a separate gate.

- ChatGPT utility blank bootstrap (provider-free):
  `pnpm vitest run tests/browser/chatgptContextAffinityRoute.test.ts tests/accountMirror/liveFollowTabCoordinator.test.ts`.
  Actual service/utility/coordinator/adapter with simulated endpoint/CDP prove
  blank startup/target requests, active lease and mutation audit before first
  provider navigation, denial without load and explicit known-blank resumption.
  Unknown effects and changed routes reject. This does not prove request-hook
  composition, retained/background coverage or installed native startup behavior.

- Interrupted owned file inventory (provider-free):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'mode=(files|library)'`.
  Public collector/owned cleanup prove completed-file retention, incomplete library
  yield, serialized resume and hard stops for observed/persisted warnings, unknown
  sends and unsettled actions. The public detail-inventory case `library budget
  yield preserves` in chatgptMetadataCollector.test.ts protects a prior chunk24 and
  excludes later reads after denied library admission. Native acceptance is separate.

- Interrupted owned context continuation (provider-free):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'mode=detail'`.
  Shared configured account authority and actual owned cleanup exercise artifact
  retention, serialized conversation/chunk continuation, persisted and observed
  warning priority, uncertain sends and unsettled physical actions. The chunk
  variant uses the detail-plan controller's one-read shape. Provider context and
  CDP remain simulated; project/library and native gates are separate.

- Unfinished owned project continuation (provider-free):
  `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'unfinished owned project'`.
  Public collector, configured shared request authority, phase wrapper and owned
  CDP cleanup retain earlier completed evidence and the interrupted cursor after
  known pre-send denial. A fresh pass resumes only that project after virtual
  account time advances; warning, uncertain-send and unsettled-action variants
  reject. Provider list results and transport are simulated; this does not prove
  detail/artifact continuation, bootstrap coverage or native materialization.

- Project discovery physical-budget continuation (provider-free):
  `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts -t 'physical navigation budget'`.
  Public collector and actual governor/traffic plan hold navigation budget1:
  first project is retained with a yielded cursor, then serialized evidence
  resumes only the second project in a fresh bounded cycle. Provider transport
  is simulated; native exception attribution remains a separate replay gate.

- Context command terminal boundary (provider-free):
  `pnpm vitest run tests/cli/conversationContextTerminalExit.test.ts tests/cli/developerAppTerminalExit.test.ts`.
  Actual registered command callbacks run in subprocesses with external SDK/config
  doubles and retained timers. Context success flushes full output and exits;
  failures remain nonzero. This does not identify the native retained handle.

- Populated ChatGPT context after payload denial (provider-free):
  `pnpm vitest run tests/browser/chatgptContextAffinityRoute.test.ts -t denied-payload`.
  Public service, production utility affinity and guards use virtual policy time;
  payload denial and a synthetic visible message exercise the real reader.
  A settled payload retry cannot admit a second route fallback even
  when the caller allows navigation. External browser/network are simulated;
  installed acceptance is separate.

- Refresh affinity lifetime (provider-free):
  `pnpm vitest run tests/accountMirror/refreshAffinityLifetime.test.ts`.
  Public refresh service, configured affinity, coordinator, file-backed registry/
  ledger and retirement path operate in a temporary home. Browser transport,
  activity observation and collector output are simulated. Cold standalone
  refresh expires normally; completion and borrowed retained tabs stay retained.
  This proves lifetime/effects in the fixture, not a live browser exit.

- Passive ChatGPT project index (provider-free):
  `pnpm vitest run tests/browser/chatgptContextAffinityRoute.test.ts -t 'project-index'`.
  Public service, utility affinity and actual adapter expression read recorded
  native project-row attribute shapes with synthetic IDs/names. No project click,
  conversation payload fetch or extra route navigation occurs; legacy anchors
  remain readable and invalid/duplicate rows are excluded. This does not prove
  cold-page hydration or installed provider-index freshness.

- Standalone and live-follow refresh custody (provider-free):
  `pnpm vitest run tests/accountMirror/refreshService.test.ts -t 'governs refresh'`.
  Public refresh service forwards governed affinity into the real traffic plan,
  provider governor and UI physical-action guard against simulated CDP. Missing
  standalone acquisition fails before navigation; both entry paths navigate
  once after repair. Collector result and affinity acquisition are injected, so
  this does not prove installed discovery or provider identity acceptance.

- Context-read affinity route handoff (provider-free):
  `pnpm vitest run tests/browser/chatgptContextAffinityRoute.test.ts`.
  Public ChatgptService, production utility affinity, coordinator, registry,
  governor and adapter run against an isolated endpoint/transport fixture. Cold
  reads open the requested conversation once; subsequent reads reuse one tab
  with one navigation. Explicit preservation and exact-target restrictions
  refuse a different route. Synthetic messages prove route handoff only, not
  historical missing-message causality or installed automatic materialization.
  A late native conversation-list HTTP429 fixture also executes the actual
  ResourceTiming warning probe: the reader reports a rate-limit stop, persists
  the warning and blocks a subsequent payload fetch without reload/navigation.

- Developer-app blocker scope (provider-free): `pnpm vitest run tests/browser/chatgptDeveloperAppInventory.test.ts`. The public adapter permits app preparation when only sidebar history reports Retry, but retains main and nested-dialog errors. Native app selection and provider completion remain separate acceptance gates.

- Lease-expiry close records (provider-free): `pnpm vitest run tests/browser-service/tabLeaseRetirement.test.ts tests/browser/tabConcurrencyRuntime.test.ts tests/browser/configuredChatgptTabMaintenance.test.ts tests/browser/activeChatRetirement.test.ts`. Verifies durable intent before close, confirmed outcome afterward, no synthetic close for already-missing, pre-close audit failure preservation and activity protection. No live tab is closed.

- Desktop response observation (provider-free): `pnpm vitest run tests/browser/desktopControlObservation.test.ts`. Real response wait, guarded CDP and desktop control gate exercise coordinated polling, ordinary observation and human exclusion. Mocked transport completion is separate from native provider/CLI acceptance.

- Captured app-picker rows (provider-free): `pnpm vitest run tests/browser/chatgptAppComposer.test.ts`. Actual ensure/lookup expressions select a delayed current app row by installed name/description, reject missing metadata and duplicate rows, and exclude a same-name custom GPT. Native UI selection remains a separate check.

- Captured app composer (provider-free): `pnpm vitest run tests/browser/chatgptAppComposer.test.ts`. Real injected clear/mention expressions recognize the current rich editor without legacy ID, reject ambiguous/hidden/modal/unrelated editors and do not treat disappearing editors as cleared. Trusted-input and exact app identity remain required. Native acceptance is separate.

- Developer-app affinity admission (provider-free): `pnpm vitest run tests/browser/chatgptDeveloperAppLifecycle.test.ts`. Selected full configuration survives conflicting default identity; non-affinity remains unchanged; admission stops before transport. Installed acceptance is separate.

- Runtime browser launch precedence and stored projection (provider-free):
  `pnpm vitest run tests/runtime.configuredExecutor.test.ts tests/browser/browserLaunchPlan.test.ts tests/browser/browserLaunchPlanStructure.test.ts`.
  Runtime > browser profile > global launch-field defaults, canonical/legacy
  aliases, blanks, explicit selected browser identity, stale managed directories,
  runtime cookie opt-in and mutable authorization are exercised through public
  seams. Plan0402 preserves historical characterization; Plan0403 implements the
  agreed convergence. No browser launch or provider request.

- Captured rich ChatGPT composer readiness (provider-free):
  `pnpm vitest run tests/browser/chatgptSingleVisitContext.test.ts`.
  Executes actual readiness expression against captured editor attributes; rich
  root composer reads preserve one-visit budget, wrong projects and unrelated
  editors are rejected. Synthetic message transport does not prove live content.

- Reached-route navigation fallback (provider-free):
  `pnpm vitest run tests/browser-service/ui.test.ts`.
  Late readiness on the exact reached URL consumes one navigation admission;
  a never-ready surface fails within existing primary/fallback bounds. Different
  route fallback remains a governed mutation. This does not prove live causality.

- ChatGPT retry visibility and conversation scope (provider-free):
  `pnpm vitest run tests/browser/chatgptRetryVisibility.test.ts`.
  Executes the context reader and its real button expression: hidden and
  unrelated Retry controls permit a complete synthetic context read; late
  controls are checked after canvas extraction. Genuine visible failed-turn
  Retry remains blocking. No provider access or live-cause claim.

- ChatGPT context identity deadlines (provider-free):
  `pnpm vitest run tests/browser/chatgptContextReadDeadline.test.ts`.
  The real context reader rejects stalled auth-session and fallback identity
  evaluations after ten seconds. Responsive missing identity still fails closed.
  This transport-fault replay does not prove live slowdown causality.

- Owned-page ChatGPT account-mirror warning checks (provider-free):
  `pnpm vitest run tests/accountMirror/refreshService.test.ts tests/accountMirror/configuredLiveFollowAffinity.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts`.
  Proves exact crawler propagation, no restored-tab census, visible-warning
  cooldown, and a ten-second stalled-check deadline with transport cleanup.
  These fixtures do not establish live refresh or materialization acceptance.

- Installed ChatGPT session-custody/incremental control (opt-in, already run):
  `docs/dev/notes/2026-10-03-plan0386-renewed-wrapper-control.md` and adjacent
  JSON bind canonical PR 176 to one verified ZIP download and a cached repeat
  with zero downloads/CDP/observed requests. This direct service control does
  not establish archive publication or autonomous scheduler acceptance.

- ChatGPT product materialization replay (provider-free, synthetic bytes and CDP transport):
  `pnpm vitest run tests/browser/chatgptMaterializationReplay.test.ts`.
  Exercises recorded DOM discovery/tagging, product selection and native-file
  verification, cache/manifest writing, normal Regenerate controls, and precise
  failure for mismatched or ambiguous downloads. A real Retry must stop without
  reload, navigation, or pointer input. No provider requests or browser launch.

# Testing quickstart

- ChatGPT materialization surface and recoverability states (provider-free):
  `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/accountMirror/catalogService.test.ts tests/runtime.historyMaterializationService.test.ts`.
  This proves late asset readiness is scoped to assistant/user turns rather
  than any matching page control, and distinguishes downloadable, repair-prompt
  candidate, metadata-only, terminally unavailable, and materialized entries.
  It also proves modern search-unit roots can supply their own assistant/user
  role instead of requiring a separate descendant role node.
  It does not launch a browser, download an asset, or send a repair prompt.

- Account-mirror provider-traffic planning and phase attribution
  (provider-free):
  `pnpm vitest run tests/accountMirror/providerTrafficPlan.test.ts tests/browser-service/providerTrafficGovernor.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts`.
  This preserves the sanitized Issue #151 baseline, fails unexplained
  top-level navigation and phase-budget overages, and proves that account-
  mirror bootstrap, index, and detail adapter work inherits immutable traffic
  phase plus privacy-bounded work attribution. It also reconciles completed
  governor actions with phase-attributed CDP counters and proves budget
  exhaustion stops before underlying admission. It does not launch a browser
  or contact ChatGPT.

- Account-mirror local materialization actionability (provider-free):
  `pnpm vitest run tests/accountMirror/completionService.test.ts -t "requires positive local backlog evidence|does not queue raw missing assets"`.
  This proves that implicit steady-follow materialization requires positive
  locally retrievable missing-asset evidence; merely unknown/deferred backlog
  evidence performs no job creation or provider work. Explicit full-sweep
  requests preserve their separately requested fallback.

- Provider traffic authority in serialized and affinity modes (provider-free):
  `pnpm vitest run tests/browser/configuredProviderTrafficAuthority.test.ts tests/browser/tabConcurrencyRuntime.test.ts tests/browser-service/chromeTargetReuse.test.ts tests/browser-service/providerTrafficStructural.test.ts`.
  This proves serialized execution retains its non-affinity behavior while
  configured provider clients still acquire exact durable leases, persist
  admission before target reuse or in-page effects, and release client-owned
  authority exactly once. A required target creation with no exact lease fails
  before `CDP.New`; explicit pre-lease acquisition remains the only target-ID
  bootstrap exception. It does not launch a browser or contact a provider.

- ChatGPT inline-file prompt commitment (provider-free):
  `pnpm vitest run tests/browser/promptComposer.test.ts tests/browser/sessionRunner.test.ts`.
  This proves committed-turn extraction preserves rich-composer `<br>`
  boundaries, treats only a terminal presentation ellipsis as equivalent,
  rejects added authored text, and reports a newly committed in-conversation
  turn with a cleared composer as `effect_observed` even when text verification
  still fails. It does not submit a provider prompt or retry a terminal session.

- ChatGPT connected-app selection reliability (provider-free):
  `pnpm vitest run tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptEcosystemMention.test.ts`.
  This proves manifest-known app rows remain on the connected-app path when
  current menu markup omits legacy app markers, while drawer filtering must
  produce an exact inline `app://connector_...` object before Send. It does not
  submit a provider prompt or prove a codex-wake dispatch.

- Provider-interaction lifecycle clock ordering (provider-free):
  `pnpm vitest run tests/browser-service/ledgerInteractionGovernor.test.ts`.
  The backwards-clock regression proves one governor never emits settlement
  before its own start even if the injected wall clock regresses. Pair it with
  `tests/browser-service/interactionLedger.test.ts` to retain the ledger's
  direct rejection of genuinely out-of-order caller input. This does not run
  the installed `wsl-chrome-3` Library inventory.

- ChatGPT Library CLI lifecycle contract (provider-free):
  `pnpm vitest run tests/cli.libraryFilesCommand.test.ts tests/browser/llmServiceFiles.test.ts tests/browser/configuredChatgptUtilityAffinity.test.ts tests/browser/configuredChatgptUtilityAffinity.production.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptPromptAdapter.test.ts`.
  This proves that client creation/browser discovery and inventory share one
  54-second operation deadline; timeout and caller cancellation reach the
  provider-facing `AbortSignal`; success, provider error, timeout, and
  cancellation close command-owned resources exactly once; and JSON failures
  return stable error codes with exit 1 or cancellation exit 130.
  A fake-clock composition fixture reaches the observed 50-second boundary
  with preflight, the provider's
  30-second ceiling, three-second CDP close, and five-second affinity
  settlement and proves their named provider error wins before the later
  60-second outer watchdog. Account-file service fixtures prove the named
  timeout is already non-retryable and that this exact CLI read also disables
  retries for connection-shaped failures.
  Pending-dispose fixtures prove that client cleanup cannot replace provider
  success or a named provider-stage error. A pending-governor fixture proves
  affinity settlement is bounded, preserves that provider error, and retains
  the unresolved lease in its active fence.
  A fake-clock pending-provider-session-close fixture proves that the named
  30-second provider-stage timeout returns after the existing three-second CDP
  close bound even when session close never settles, without closing the
  retained target.
  Whole-operation fake-clock fixtures now prove that structured failures carry
  the last entered production stage plus abort/read/cleanup/affinity settlement
  timestamps. One fixture uses the real configured-affinity acquisition and
  settlement path. The timeline is capped at 32 closed-vocabulary events and
  contains no URL, target ID, account identity, managed browser profile, or
  provider content.
  The exact CLI list options also skip account-file cache persistence after the
  provider result. A pending-hook regression proves the returned inventory does
  not enter cache-context resolution or cache write, while the adjacent default
  listing fixture continues to prove general callers persist account files.
  The exact-target fixtures additionally prove adoption of an existing Library
  page through the production target-list dependency without target
  creation/closure, guaranteed lease settlement after post-acquisition setup
  failure, safe dead-owner recovery, close-on-rejection before provider
  handoff, a named 10-second provider DOM-inventory deadline that initiates
  exact-target CDP client close and bounds a nonsettling close before the
  CLI operation deadline, and natural termination of a child fixture with a
  retained handle.
  They do not launch a browser, inspect a provider account, or replace the separately
  authorized installed `wsl-chrome-3` acceptance.

- Terminal-session receipt producer contract (provider-free):
  `pnpm vitest run tests/docs.codexWakeChatgpt.test.ts tests/terminalSessionReceipts.test.ts tests/http.terminalSessionReceipts.test.ts tests/cli/sessionRunner.test.ts --maxWorkers=1`.
  This proves success/error/cancel receipts, result-before-metadata-before-receipt
  ordering, immutable atomic publication, repeated-finalization deduplication,
  restart reconciliation after the durable-result boundary, no false success
  before that boundary, privacy-bounded fields, and fail-closed schema/path/
  symlink/permission handling. It also proves that the HTTP observation keeps
  a provider-terminal session pending until its immutable receipt verifies,
  exposes verified failure/cancellation states, and terminalizes corrupted
  receipt evidence as `integrity_error` without exposing prompt/result bodies.
  It does not exercise a provider or prove live `codex-wake` dispatch. Pair it
  with a temporary-root persistent `codex-waked --no-dispatch` fixture to
  validate source selection and single-occurrence deduplication without
  resuming a real agent; stop the fixture daemon after evidence capture.

- Aggregate-status recovery contract (provider-free):
  `pnpm vitest run tests/runtime.store.test.ts tests/runtime.control.test.ts tests/runtime.claims.test.ts tests/runtime.serviceHost.test.ts tests/runtime.archiveService.test.ts tests/http.responsesServer.test.ts --maxWorkers=2`.
  Run the combined files to cover bulk-list parity, bounded availability and
  failure evidence, local-claim snapshots, HTTP hydration, and fixture isolation.
  Installed five-second acceptance remains separate under Plan 0315 / issue 9.

- Skill invocation continuity: `pnpm vitest run tests/browser/chatgptSkillRun.test.ts tests/browser/chatgptSkills.test.ts tests/browser/promptComposer.test.ts tests/cli/chatgptSkillsCommand.test.ts`. Proves same-client selection and submission, pre-send account/marker rejection, uncertain-send preservation, and unchanged non-submitting selection. Live acceptance separately requires provider evidence of actual Skill loading.

- Provider-free runtime work must bracket broad `pnpm test` runs with exact
  managed-browser process/port checks or set an isolated AuraCall home. A
  2026-08-09 broad run coincided with an unexpected launch of the configured
  `wsl-chrome-3/chatgpt` managed browser profile; the focused service suite did
  not. Treat a newly observed configured-profile process as a test-isolation
  failure and clean up only the exact AuraCall-owned process.

- Shared navigation liveness regression:
  `pnpm vitest run tests/browser-service/ui.test.ts -t "bounds an unsettled Page.navigate acknowledgement"`.
  This is provider-free and proves a lost CDP navigation acknowledgement cannot
  outlive the caller's existing settle bound.

- Shared predicate liveness regression:
  `pnpm vitest run tests/browser-service/ui.test.ts -t "bounds an unsettled predicate evaluation by the outer deadline by default"`.
  This is provider-free and proves an unacknowledged `Runtime.evaluate` cannot
  outlive the caller's outer polling budget even without a separate inner bound.

- ChatGPT sidebar timeout recovery regression:
  `pnpm vitest run tests/browser/chatgptAdapter.test.ts -t "ChatGPT sidebar readiness recovery"`.
  The named first readiness timeout enters the existing sidebar opener, while
  unrelated CDP failures remain visible; shared predicate semantics are not
  relaxed.

- Forced live-follow cleanup regression:
  `pnpm vitest run tests/accountMirror/completionService.test.ts -t "forces one live-follow pass|defaults to live follow"`.
  This proves an explicit one-pass ceiling requests managed-browser cleanup and
  ordinary indefinite live follow retains its existing ownership policy.

- Bounded managed-browser lease-retirement regression (provider-free):
  `pnpm vitest run tests/browser/configuredChatgptTabMaintenance.test.ts tests/accountMirror/refreshService.test.ts tests/runtime.historyMaterializationService.test.ts`.
  This proves successful exact ChatGPT browser shutdown retires settled idle
  crawler and materialization leases through the shared registry state machine.
  Active, in-flight, outcome-unknown, identity-ambiguous, and unrelated leases
  remain fenced; the test does not launch a browser or contact ChatGPT.

- Unit/type tests: `pnpm test` (Vitest) and `pnpm run check` (typecheck).
- Browser launch plan contract (provider-free):
  `pnpm vitest run tests/browser/browserLaunchPlan.test.ts tests/browser/browserLaunchPlanStructure.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/config.test.ts tests/configModel.test.ts`.
  This proves one immutable launch-plan seam, runtime/browser selection
  precedence, source and managed browser profile derivation, session parity,
  exact error behavior, runtime-only provider authorization exclusion, and the
  absence of the former config/profile-resolution import cycle. Provider
  authorization must remain on the live runtime config; it must not be cloned
  or frozen into the immutable launch snapshot. Add the affected caller suites
  when changing a consumer; this contract does not launch a browser or prove
  live account readiness.
- Provider prompt execution contract (provider-free):
  `pnpm vitest run tests/browser/llmServicePrompt.test.ts tests/browser/llmServicePromptStructure.test.ts tests/browser/chatgptPromptAdapter.test.ts tests/browser/chatgptService.test.ts tests/browser/geminiAdapter.test.ts tests/browser/grokAdapter.test.ts`.
  This proves one base `LlmService.runPrompt(...)` lifecycle, consistent launch
  and prompt URL precedence, exact provider-session authorization propagation,
  direct ChatGPT adapter execution, real Gemini prompt execution, Grok mode
  behavior, and fail-closed unsupported attachment handling. Pair it with
  `tests/browser/chatgptToolApproval.test.ts` whenever ChatGPT prompt actions
  change so the `Answer now` prohibition remains explicit.
- Browser list-option provenance is also provider-free: a caller may prebuild
  list options and pass them through a service method that builds again. The
  second build retains managed-profile/process provenance only when the same
  service authority and compatible DevTools endpoint are present. Run
  `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/browser/providerSessionAuthority.test.ts tests/browser/chatgptService.test.ts`.
- Browser acceptance main contract (provider-free):
  `pnpm vitest run tests/scripts.browserAcceptanceMain.test.ts
  tests/scripts.browserAcceptanceHarness.test.ts
  tests/scripts.browserAcceptanceStructure.test.ts`.
  This dynamically proves ChatGPT CLI-over-resume precedence, provider-main
  PASS/FAIL evidence and checkpoint ordering, ChatGPT full-run cleanup, and
  Grok cleanup/keep-projects policy through provider-local adapters. Importing
  the scripts is side-effect free; this command must never launch a browser or
  provider workflow.
- Agent-browser RDP managed-profile contract (provider-free):
  `pnpm vitest run tests/browser/agentBrowserRdpLauncher.test.ts tests/browser/config.test.ts tests/browser/profileConfig.test.ts tests/browser-service/platformPaths.test.ts`
  followed by `pnpm run typecheck`. This proves exact AuraCall profile-path
  retention, Chrome/stock-Chrome and chromium/stealthcdp pairing, headed
  persistence, operator-visible/build-proof gates, and exact CDP inventory
  selection. It does not launch a browser or prove installed route readiness.
- ChatGPT Chat/Work composer boundary:
  - normal browser runs default to Chat; Work requires
    `--browser-chatgpt-mode work`
  - an established conversation, or the exact `/` root after its bounded
    mode-control hydration wait, may qualify as Chat without a rendered mode
    control only when its exact visible, enabled ChatGPT prompt editor is
    present and the active current-route conversation has no exact `Work` badge
  - `[data-animated-slider-trigger=true]` is model/thinking UI, not a mode
    discriminator; ordinary Chat may expose it with text such as `High`
  - established Work requires positive proof from the visible active
    conversation link whose `href` matches `location.pathname` and whose
    descendant `span` has exact normalized text `Work`; otherwise an explicit
    Work request remains fail-closed
  - a named Work model requires `--browser-work-model` and must use Work's
    dedicated nested slider, never the Chat picker
  - run the provider-free contract suite before any authorized live canary:
    ```bash
    pnpm vitest run \
      tests/browser/chatgptComposerMode.test.ts \
      tests/browser/config.test.ts \
      tests/cli/browserConfig.test.ts \
      tests/runtime.configuredExecutor.test.ts \
      tests/schema/chatgptMode.test.ts \
      tests/schema/resolver.test.ts
    ```
  - use the repo-local
    [`auracall-chatgpt-browser` skill](../.agents/skills/auracall-chatgpt-browser/SKILL.md)
    for selector boundaries, live-effect gates, and cleanup evidence
- ChatGPT third-party tool approval policy:
  - `manual` is the fail-closed default; `allow-once` and `always-allow` are
    explicit operator choices
  - run the provider-free action and propagation gate before any live canary:
    `pnpm vitest run tests/browser/chatgptToolApproval.test.ts tests/browser/config.test.ts tests/browser/profileConfig.test.ts tests/browser/profileResolution.test.ts tests/cli/browserConfig.test.ts tests/runtime.configuredExecutor.test.ts tests/schema/chatgptMode.test.ts tests/schema/resolver.test.ts`
  - provider-free fixtures must prove exact paired actions, stable pre-click
    re-probe plus exact DOM-bound activation, zero-action changed/ambiguous handling,
    exact `tool-approval-card` fingerprinting, stable page-lifetime DOM identity,
    disappearance or distinct-card replacement verification even when the
    replacement has identical visible text, two sequential cards in one
    assistant turn, one-attempt fencing for an unchanged DOM card, and `Answer
    now` exclusion
  - ChatGPT app-security consent is a separate exact surface: require the
    `Allow ChatGPT to use <app>?` heading, visible `Suspicious Instruction`
    warning, and exactly one `Allow` action in the same dialog. Generic
    single-Allow dialogs remain unmatched; manual mode exposes the surface,
    allow-once may activate it, and always-allow fails closed rather than
    downgrading persistent consent
  - foreground ChatGPT lock lifetime must cover response wait, tool approval,
    and final answer extraction, not only prompt dispatch. Run
    `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser-service/operationDispatcher.test.ts tests/accountMirror/refreshService.test.ts tests/browser/chatgptToolApproval.test.ts`;
    it must prove a same-profile account-mirror owner is rejected while the
    foreground operation is active and admitted only after terminal release
  - prompt startup must not perform live identity or feature detection merely
    to enrich optional browser-context cache metadata; run
    `pnpm vitest run tests/browser/browserContextIdentity.test.ts tests/browser/llmServiceIdentity.test.ts`
    to prove configured identity resolves even when live probes never settle
  - the 2026-08-15 `wsl-chrome-3`/LitScout canary live-proved exact
    `allow-once`, disappearance confirmation, expected response completion,
    zero `always-allow`/`Answer now` clicks, and zero LitScout writes; see
    `docs/dev/notes/2026-08-15-plan0288-litscout-allow-once-live-proof.json`
  - Plan 0290 provider-free-proved sequential-handler readiness and fresh
    coordinates, but its sole two-call live prompt exposed only one confirmed
    approval and a singular provider trace; do not cite its expected token as
    two-call proof. See
    `docs/dev/notes/2026-08-15-plan0290-approval-settle-live-inconclusive.json`
- ChatGPT Skill lifecycle:
  - provider-free contract tests:
    `pnpm vitest run tests/browser/chatgptSkills.test.ts tests/cli/chatgptSkillsCommand.test.ts tests/cli/chatgptDeveloperAppsCommand.test.ts`
  - pair with `tests/browser/chatgptComposerTool.test.ts` and
    `tests/browser/chatgptAdapter.test.ts` when current drawer rows, selected
    composer pills, or local-upload qualification changes; current rows need
    not carry `tabindex`, and pill proof stays scoped to the composer form
  - read-only inventory smoke:
    `pnpm tsx bin/auracall.ts --profile <runtime> skills list --expected-account <email> --json`
  - bounded non-submitting selection smoke:
    `pnpm tsx bin/auracall.ts --profile <runtime> skills select <32-hex-id> --expected-account <email> --yes --json`
    requires exact-ID inventory binding plus a pill-free empty source composer,
    qualifies either the current `textarea[name="prompt-textarea"]` or legacy
    `#prompt-textarea` provider shape,
    observes either an empty selected composer or only the provider-authored
    prompt that exactly matches the decoded current `prompt` parameter, restores
    the original route, and observes that the selection and prompt are cleared
  - `skills run` is a provider-free negative contract in Chat mode: user-added
    Skills are not available there, so both exported execution paths must fail
    before inventory reads, browser launch, or Send; Work-mode testing is
    deferred
  - `list` and `show` require the exact expected account; all mutations also
    require `--yes`, a complete inventory, and an exact 32-hex ID after create
  - identity preflight merges missing fields from the exact logged-in
    `script#client-bootstrap[type="application/json"]` projection when
    `/api/auth/session` is reduced; tests must prove token-bearing bootstrap
    fields never leave that projection
  - `update` requires the exact prior `SKILL.md` SHA-256 reported by `show`;
    stale or unavailable content fails before dispatch
  - source loading accepts only a regular `SKILL.md` or directory containing
    one, rejects symbolic links, normalizes line endings, and caps content at
    1 MiB
  - an `outcome-unknown` select, create, update, or delete is a hard stop and must not
    be retried; retain the visible provider surface for operator inspection
  - do not use Skill mutation commands as routine live tests. One authorized
    canary must bind the returned ID and hashes, perform at most one create,
    one update, and one delete, and finish with fresh absence proof
- ChatGPT developer-app lifecycle:
  - provider-free contract tests:
    `pnpm vitest run tests/browser-service/devToolsConnection.test.ts tests/browser-service/browserServiceCore.test.ts tests/browser/chatgptDeveloperApps.test.ts tests/cli/chatgptDeveloperAppsCommand.test.ts`
  - read-only installed smoke:
    `auracall --profile <runtime> apps --target chatgpt list --json`
  - `apps list` has a 45-second outer deadline plus a bounded browser-client
    close; target resolution, CDP attachment, Runtime enablement, and Page
    enablement each have a 10-second bound and report a named debug stage
  - the shared attachment contract carries the caller abort signal and closes
    any CDP client that resolves after timeout/abort; a stalled identity or
    attachment stage must return control so the CLI can release its file-backed
    browser-operation lease
  - non-submitting app-selection smoke:
    `auracall --profile <runtime> apps --target chatgpt test <exact-app> --expected-account <email> --json`
  - installed/runtime/live acceptance must use the installed `auracall`
    launcher; repo-local `pnpm tsx bin/auracall.ts` is source-checkout evidence
    only and must bind an explicitly intended branch and commit
  - private developer apps use the composer `@mention` ecosystem picker and an
    exact `ecosystemMention` plugin pill. Source `apps test --submit` carries
    the accepted plugin identities into the shared prompt path and refuses a
    non-fresh or nonempty composer, a document-reference pill, or the wrong app identity
    before Send. It then uses the shared assistant-response lifecycle so tool
    and app-security approval gates are detected and exposed. Provider/live
    behavior remains unaccepted until separately authorized
  - connected apps use the open composer tool drawer, not the developer-app
    `@mention` picker: type the exact connector name into the focused composer,
    activate the filtered row once, and require the resulting non-editable
    `[app-mention-name]` object to expose an `app://connector_...` identity
    before adding prompt text or allowing Send
  - issue-6 fixtures in `tests/browser/chatgptDeveloperAppLifecycle.test.ts`
    cross the real adapter -> shared runBrowserMode -> remote response/P45
    seam with hermetic transport and fail-closed launcher mocks. They prove
    exactly one Send, terminal answer and refreshed URL/conversation identity,
    unknown/observed/pre-effect failure evidence, account/selection refusal,
    no automatic resubmit, and explicit incompatible-input refusal. The shared
    structural guard retains symmetric local/remote hooks and keeps the
    low-level adapter prompt-submitted-only
  - submitted app tests override inherited Work/tool/project/conversation
    routing with fresh-root Chat/current semantics. Manual approval is terminal
    `failed` with nonzero CLI exit, not a guaranteed human handoff; JSON/plain
    output carries answer text, identity, URL, effect state and retry safety.
    Source fixtures do not accept installed parity, approval clicks or live use
  - developer-app remote lifecycle proof is limited to attributable managed
    local/WSL Chrome exposed on loopback (including the canonical
    `windows-loopback` alias) with a live matching managed-profile
    PID. Arbitrary remote endpoints or missing process provenance fail before
    Send; a local PID file must never authorize an unrelated remote browser
  - developer-app submit tests preserve the active Chat model. Record the
    visible composer model separately from any configured/resolved `--model`
    value; the latter does not prove a UI selection
  - do not use `--submit`, `create`, `refresh`, or `uninstall` as routine live
    tests; they require exact authorization and `--yes`
  - an authorized refresh uses replacement semantics and requires a complete
    recreation input, including `--server-url`; it resolves the exact private
    development app, selects its Developer mode `Delete` action, proves the old
    identity and normalized name absent in fresh inventory, and recreates once
  - ChatGPT's developer-app `Delete` action can execute immediately without a
    second confirmation dialog; treat `--yes` as approval for that deletion and
    preserve the exact account/app gates
  - if deletion succeeds but recreation fails, verify the old app remains
    absent and resume with guarded `apps create`; rerunning `apps refresh`
    cannot resolve an already-deleted target and must not be used as recovery
  - the current ChatGPT Connection control is a Radix radio: selection uses
    exact focus plus trusted CDP Space input and must reach
    `aria-checked="true"` before the named server URL input is addressed
  - `inventoryComplete: false` is a hard mutation stop; a timed-out installed
    apps response must never be interpreted as proof that zero apps exist
  - inventory auth status is bound only by one exact app-id/connector-id match;
    same-name replacement records and ambiguous exact matches return null
  - stop immediately on a provider rate-limit, CAPTCHA, or human-verification
    surface
  - OAuth create may report `awaiting-human` only when the post-submit target
    observation contains a fresh OAuth/human-action navigation; the observer
    starts immediately after trusted submission, accumulates target URL
    transitions rather than retaining only its latest poll, and preserves a
    bounded visible provider alert or still-open Create dialog before
    navigating away; without a handoff or explicit rejection surface, fresh
    complete inventory must contain exactly one exact app or create fails
    closed
  - guarded create refuses an already-installed normalized app name so an old
    app cannot satisfy the post-submit inventory proof
  - a loaded Cloudflare `/challenge-platform/` script is not by itself a
    human-verification surface; current healthy ChatGPT composers retain that
    script, so challenge detection must require the `Just a moment...` title
    or a positive challenge UI marker
- Live-suite posture:
  - stable baseline:
    - keep small, repeatable, and operationally useful
    - prefer one-provider baselines plus the few highest-value matrix checks
  - extended matrix:
    - keep the broader mixed-provider/operator-control proofs opt-in
    - use for periodic confidence, not every routine pass
  - flaky-but-informative probes:
    - keep separately gated
    - do not promote into the stable baseline until they stop needing special
      handling
- Current live-suite tier map:
  - stable baseline:
    - `tests/live/team-grok-live.test.ts`
      - default `AURACALL_LIVE_TEST=1` cases only:
        - `auracall-solo`
        - `auracall-two-step`
        - `auracall-multi-agent`
    - `tests/live/team-chatgpt-live.test.ts`
      - `AURACALL_LIVE_TEST=1 AURACALL_CHATGPT_TEAM_LIVE_TEST=1`
      - single-provider ChatGPT baseline only
  - extended matrix:
    - `tests/live/team-gemini-live.test.ts`
      - `AURACALL_LIVE_TEST=1 AURACALL_GEMINI_TEAM_LIVE_TEST=1`
      - keep opt-in because Gemini still depends on exported-cookie preflight
        and stricter browser/session conditions on this machine
    - `tests/live/team-grok-live.test.ts`
      - `AURACALL_TOOLING_LIVE_TEST=1`
      - `AURACALL_APPROVAL_LIVE_TEST=1`
      - `AURACALL_REJECTION_LIVE_TEST=1`
      - `AURACALL_CANCELLATION_LIVE_TEST=1`
    - `tests/live/team-chatgpt-live.test.ts`
      - `AURACALL_CHATGPT_APPROVAL_LIVE_TEST=1`
      - `AURACALL_CHATGPT_CANCELLATION_LIVE_TEST=1`
    - `tests/live/team-multiservice-live.test.ts`
      - all mixed-provider happy-path and operator-control gates stay here by
        default
  - flaky-but-informative probes:
    - provider/browser cases that still need bounded reruns or stricter
      preflight, especially Gemini-resume cases that can intermittently fail
      with transient fetch/browser instability
    - do not promote those probes into the stable baseline until they stop
      needing:
        - exported-cookie or manual-auth preflight beyond the normal path
        - one bounded rerun to distinguish provider noise from product
          regressions
        - provider-specific cooldown/captcha handling
- Routine live commands:
  - stable baseline:
    - `pnpm run test:live:team:baseline`
    - current scope:
      - `tests/live/team-grok-live.test.ts` default Grok baseline cases
      - `tests/live/team-chatgpt-live.test.ts` single-provider ChatGPT
        baseline
    - the test files themselves now carry matching tier comments near the
      env-gate definitions so operators can see baseline versus matrix intent
      without leaving the suite
  - extended matrix:
    - run file-level suites with explicit opt-in gates, for example:
      - `AURACALL_LIVE_TEST=1 AURACALL_GEMINI_TEAM_LIVE_TEST=1 pnpm vitest run tests/live/team-gemini-live.test.ts`
      - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_TEAM_LIVE_TEST=1 pnpm vitest run tests/live/team-multiservice-live.test.ts`
      - `AURACALL_LIVE_TEST=1 AURACALL_APPROVAL_LIVE_TEST=1 pnpm vitest run tests/live/team-grok-live.test.ts -t "human escalation"`
  - do not use `pnpm test:live` as the routine baseline command for this phase:
    - it still sweeps a much broader live surface than the current team
      baseline
    - keep it for wider opt-in live coverage, not for the small default target
- Local `api serve` smoke:
  - terminal 1: `pnpm tsx bin/auracall.ts api serve --port 8080`
    - non-default runtime profile: `pnpm tsx bin/auracall.ts --profile auracall-gemini-pro api serve --port 8080`
    - startup logs should include `Active AuraCall runtime profile: <name>`
  - optional startup-recovery tuning:
    - disable startup recovery: `pnpm tsx bin/auracall.ts api serve --port 8080 --no-recover-runs-on-start`
    - cap startup recovery: `pnpm tsx bin/auracall.ts api serve --port 8080 --recover-runs-on-start-max 25`
    - recover only team source runs: `pnpm tsx bin/auracall.ts api serve --port 8080 --recover-runs-on-start-source team-run`
    - recover both sources: `pnpm tsx bin/auracall.ts api serve --port 8080 --recover-runs-on-start-source all`
    - tune background drain cadence: `pnpm tsx bin/auracall.ts api serve --port 8080 --background-drain-interval-ms 60000`
    - disable timer-driven background drain: `pnpm tsx bin/auracall.ts api serve --port 8080 --background-drain-interval-ms 0`
    - wrapper contract:
      - default startup recovery scope remains `direct`
      - `team-run` recovers only team runs
      - `all` recovers both direct and team runs
      - the startup cap still applies after widening scope to `all`
  - terminal 2: `curl http://127.0.0.1:8080/status`
    - current expected status includes bounded background-drain visibility:
      - `backgroundDrain.enabled`
      - `backgroundDrain.intervalMs`
      - `backgroundDrain.state`
      - `backgroundDrain.paused`
      - `backgroundDrain.lastTrigger`
    - current expected status also includes ChatGPT tenant execution limits:
      - `tenantExecutionLimits.object = tenant_execution_limits_status`
      - `tenantExecutionLimits.providers.chatgpt.defaultLimits`
      - `tenantExecutionLimits.providers.chatgpt.metrics.tenantCount`
      - `tenantExecutionLimits.providers.chatgpt.metrics.activeChats`
      - `tenantExecutionLimits.providers.chatgpt.entries[].tenantKey`
      - `tenantExecutionLimits.providers.chatgpt.entries[].runtimeProfileIds`
      - `tenantExecutionLimits.providers.chatgpt.entries[].limits`
      - default `/status` uses `usage.basis = not-requested`
      - `GET /status?tenantExecutionLimits=usage` adds usage counters:
        - `tenantExecutionLimits.providers.chatgpt.entries[].usage.activeChats`
        - `tenantExecutionLimits.providers.chatgpt.entries[].usage.chatsLastHour`
        - `tenantExecutionLimits.providers.chatgpt.entries[].usage.chatsLastDay`
      - usage readback is inspection-only and derives counts from persisted
        active leases plus `step-started` events
    - current expected status also includes the live local runner heartbeat:
      - `runner.id`
      - `runner.hostId`
      - `runner.status = active`
      - `runner.lastHeartbeatAt`
      - `runner.expiresAt`
      - `runner.lastActivityAt`
      - `runner.lastClaimedRunId`
    - current expected status also includes read-only runner topology:
      - `runnerTopology.localExecutionOwnerRunnerId`
      - `runnerTopology.generatedAt`
      - `runnerTopology.metrics.totalRunnerCount`
      - `runnerTopology.metrics.activeRunnerCount`
      - `runnerTopology.metrics.staleRunnerCount`
      - `runnerTopology.metrics.freshRunnerCount`
      - `runnerTopology.metrics.expiredRunnerCount`
      - `runnerTopology.metrics.browserCapableRunnerCount`
      - `runnerTopology.metrics.displayedRunnerCount`
      - `runnerTopology.metrics.omittedRunnerCount`
      - plain `/status` compacts `runnerTopology.runners` to the local owner
        plus fresh/active runners so long-lived dogfood environments do not
        dump stale runner history by default
      - use `GET /status?runnerTopology=full` when forensic debugging needs
        every stored runner entry
      - `runnerTopology.runners[].runnerId`
      - `runnerTopology.runners[].selectedAsLocalExecutionOwner`
      - topology readback must not select claims, acquire leases, execute
        steps, or reassign work to another runner
    - current expected status also includes read-only account mirror posture:
      - `accountMirrorStatus.object = account_mirror_status`
      - `accountMirrorStatus.metrics.total`
      - `accountMirrorStatus.metrics.eligible`
      - `accountMirrorStatus.metrics.delayed`
      - `accountMirrorStatus.metrics.blocked`
      - `accountMirrorStatus.entries[].provider`
      - `accountMirrorStatus.entries[].tenantKey`
      - `accountMirrorStatus.entries[].bindingKey`
      - `accountMirrorStatus.entries[].runtimeProfileId`
      - `accountMirrorStatus.entries[].browserProfileId`
      - `accountMirrorStatus.entries[].expectedIdentityKey`
      - `accountMirrorStatus.entries[].accountLevel`
      - `accountMirrorStatus.entries[].status = eligible|delayed|blocked`
      - `accountMirrorStatus.entries[].mirrorState.queued`
      - `accountMirrorStatus.entries[].mirrorState.running`
      - `accountMirrorStatus.entries[].mirrorState.lastDispatcherKey`
      - `accountMirrorStatus.entries[].metadataCounts`
      - `accountMirrorStatus.entries[].metadataEvidence`
      - `accountMirrorStatus.entries[].metadataEvidence.countEvidence.observedThisPass`
      - `accountMirrorStatus.entries[].metadataEvidence.countEvidence.retainedFromCache`
      - `accountMirrorStatus.entries[].metadataEvidence.countEvidence.mergedTotal`
      - `accountMirrorStatus.entries[].metadataEvidence.detailScannedThisPass`
      - `accountMirrorStatus.entries[].metadataEvidence.assetInventory.state = observed|complete|in_progress|deferred|unknown`
      - `accountMirrorStatus.entries[].metadataEvidence.conversationFreshnessFrontier.object = account_mirror_conversation_freshness_frontier`
      - `accountMirrorStatus.entries[].metadataEvidence.conversationFreshnessFrontier.rowsExamined`
      - `accountMirrorStatus.entries[].metadataEvidence.conversationFreshnessFrontier.rowsSelectedForDetail`
      - `accountMirrorStatus.entries[].metadataEvidence.conversationFreshnessFrontier.firstStoppedRow`
      - `accountMirrorStatus.entries[].metadataEvidence.conversationFreshnessFrontier.fallbackReason`
      - `accountMirrorStatus.entries[].metadataEvidence.attachmentInventory`
      - `accountMirrorStatus.entries[].mirrorCompleteness.state = none|complete|in_progress|unknown`
      - `accountMirrorStatus.entries[].mirrorCompleteness.assetInventory.state`
      - `accountMirrorStatus.entries[].mirrorCompleteness.remainingDetailSurfaces`
      - this readback may hydrate counts/evidence from the existing provider
        cache store, but it must not enqueue browser work or scrape provider
        pages
    - current expected status also includes lazy account mirror scheduler
      posture:
      - `accountMirrorScheduler.enabled`
      - `accountMirrorScheduler.dryRun`
      - `accountMirrorScheduler.intervalMs`
      - `accountMirrorScheduler.state = disabled|idle|scheduled|running|paused`
      - `accountMirrorScheduler.paused`
      - `accountMirrorScheduler.lastWakeReason = startup-cadence|cadence|operator-run-once|operator-foreground-pressure-proof|operator-resume|media-generation-settled|response-drain-completed|null`
      - `accountMirrorScheduler.lastWakeAt`
      - `accountMirrorScheduler.lastStartedAt`
      - `accountMirrorScheduler.lastCompletedAt`
      - `accountMirrorScheduler.lastPass`
      - `accountMirrorScheduler.operatorStatus.posture = disabled|paused|running|scheduled|ready|healthy|backpressured`
      - `accountMirrorScheduler.operatorStatus.reason`
      - `accountMirrorScheduler.operatorStatus.backpressureReason`
      - `accountMirrorScheduler.history.object = account_mirror_scheduler_pass_history`
      - `accountMirrorScheduler.history.entries[]`
      - compact scheduler history is available at
        `GET /v1/account-mirrors/scheduler/history[?limit=10]`
      - CLI parity is available with
        `auracall api scheduler-history --port 8080 --limit 10`
      - MCP parity is available with `account_mirror_scheduler_history`
      - scheduler diagnostics parity is available with
        `auracall api scheduler-diagnostics --port 8080 --provider chatgpt --runtime-profile default`
        and MCP `account_mirror_scheduler_diagnostics`
      - scheduler diagnostics browser-mutation readback includes `byKind`,
        `bySource`, and `duplicateSameRouteAttempts`; the duplicate summary
        includes completed same-route navigation no-ops and repeated
        same-source `navigate`/`reload` starts while the second attempt is in
        flight, so scoped proof can fail closed without manually scanning raw
        mutation rows
      - compact history reports `latestYield`, `yieldEvents[]`,
        queued-work owner/kind, resume cursor, and remaining detail surfaces
      - deterministic scheduler preemption proof is available with
        `pnpm run smoke:scheduler-preemption`; it starts an isolated local API
        server, injects a foreground-yielded scheduler pass, verifies
        `/status` and CLI-normalized status report target-level
        `operator_preempted`, and asserts no provider refresh/completion work
        starts
      - nonblocking completion is available with
        `POST /v1/account-mirrors/completions` and
        `GET /v1/account-mirrors/completions/{completion_id}`
      - CLI parity is available with
        `auracall api mirror-complete --port 8080` and
        `auracall api mirror-completion-status <id> --port 8080`
      - scoped proof server mode is available with
        `auracall --profile auracall-gemini-pro api serve --port 18173 --account-mirror-proof-provider gemini --account-mirror-proof-runtime-profile auracall-gemini-pro`
      - scoped proof status must include
        `accountMirrorProofScope.enabled = true`,
        `accountMirrorProofScope.provider`,
        `accountMirrorProofScope.runtimeProfileId`,
        `accountMirrorProofScope.tenantKey`,
        `accountMirrorProofScope.bindingKey`, and
        `accountMirrorProofScope.globalLiveFollowSuppressed = true`
      - scoped proof startup must report zero adopted completions before the
        operator starts the bounded proof, even when the shared completion
        store contains unrelated persisted active operations; proof
        `/status.liveFollow` should include only the requested provider/runtime
        target
      - after starting the bounded proof completion, use
        `auracall api mirror-complete --port 18173 --provider gemini --runtime-profile auracall-gemini-pro --max-passes 1 --sweep-mode full_sweep --materialization-policy full_missing_assets --materialization-asset-kinds all`
      - read back with
        `auracall api mirror-completion-status <completion_id> --port 18173`;
        terminal handoff jobs should hydrate
        `materializationOutcome.materialized`,
        `materializationOutcome.checksumCount`, manifest paths, and
        routeability counts
      - provider guard clearance is available with
        `auracall api mirror-provider-guard-clear --port 8080 --provider gemini --runtime-profile default`
        and MCP `account_mirror_provider_guard_clear`; the control updates both
        account-mirror scheduling state and the selected runtime profile's
        persisted browser guard, so a successful clear cannot leave browser
        submission blocked by stale cooldown data
      - omitted `--max-passes` means unbounded live follow; `--max-passes`
        is only a debug/test cap and must preserve the exact completion
        operation id through configured tab affinity and provider-traffic
        governance
      - ChatGPT metadata-only collection should retain conversation-history
        metadata titles when a virtualized sidebar anchor has no usable text;
        `tests/browser/chatgptAdapter.test.ts` guards the read-only fallback and
        its precedence over anchor labels and UUID fallback
      - a timed-out `Page.navigate` acknowledgement is recoverable only when
        the configured route, document-ready, and provider-ready predicates
        subsequently prove settlement; an acknowledgement timeout without
        those predicates remains terminal
      - cache merge tests must prove a UUID-title observation cannot overwrite
        an existing readable title
      - full-sweep backfill is explicit with
        `auracall api mirror-complete --sweep-mode full_sweep --materialization-policy full_missing_assets`;
        optional asset-kind, max-item, snapshot-refresh, and force flags flow
        to the same API fields, and completion status records the latest
        history-materialization handoff in `materializationCursor`
      - full-sweep completions pass an extended collector timeout to tolerate
        conservative provider pacing during project/history/detail reads;
        Gemini steady-follow completions also use a wider provider-specific
        envelope, and Gemini full-sweep completions use the widest default
        envelope because project/Gem history hydration can exceed the generic
        full-sweep window
      - configured `liveFollow` blocks may also set `sweepMode`,
        `materializationPolicy`, `materializationAssetKinds`,
        `materializationMaxItems`, `materializationRefreshSnapshot`, and
        `materializationForce`; absent fields keep the existing metadata-only
        steady-follow default
      - when configured `liveFollow` policy changes from metadata-only to full
        retrieval, startup reconciliation should upgrade an active completion
        in place and report an upgrade instead of starting a duplicate target
        loop
      - history materialization jobs should not fail on a wrapper timeout while
        provider/browser work continues; they remain running until provider
        work resolves or startup recovery marks an interrupted active job
        failed after service restart
      - refresh failures persist target status state; startup/status hydration
        must preserve failure-backoff across API and proof-server restarts
      - Gemini explicit-refresh proof retries use practical defaults:
        2 minutes plus at most 1 minute jitter; refresh failure backoff
        escalates from 2 minutes to a 10 minute cap, while provider guard hard
        stops still require manual clearance
      - steady-follow refreshes reset attachment/detail inventory to the
        current top of the provider rail/project conversation list; full-sweep
        refreshes are the mode that resume the persisted deep attachment cursor
      - three consecutive detail-read timeouts end the current pass as a
        checkpointed yield, not a fatal live-follow failure; the next pass
        resumes at the next conversation, and read-only failure settlement must
        never create an `outcome-unknown` provider-effect fence
      - Gemini account-mirror discovery reads both the left rail and
        Gem/project conversation histories; project histories reserve bounded
        row budget, distribute it across Gems/projects before deepening one
        history, hydrate bounded history when requested, cap project-history
        reads per refresh with a full-sweep continuation cursor, and tolerate
        individual Gem route failures with drift evidence
      - `accountMirrorScheduler.lastPass.selectedTarget.mirrorCompleteness`
      - `accountMirrorScheduler.lastPass.backpressure.reason = none|routine-delayed|blocked-by-browser-work|yielded-to-queued-work|provider-guard`
      - `accountMirrorScheduler.lastPass.metrics.inProgressEligibleTargets`
      - `accountMirrorScheduler.lastPass.metrics.delayedTargets`
      - `accountMirrorScheduler.lastPass.metrics.blockedTargets`
      - `accountMirrorScheduler.lastPass.metrics.defaultChatgptDelayedTargets`
      - routine scheduler refreshes use zero dispatcher queue wait and should
        block/yield when real browser work already owns the control plane
      - after a routine mirror acquires the dispatcher, bounded attachment
        inventory should check for queued browser work between
        project/conversation detail reads; a yield marks the inventory
        truncated and preserves the cursor for the next pass
      - mirror collector browser reads are paced by
        `limits.maxBrowserInteractionsPerMinute`; Gemini defaults to six
        interactions per minute, four page-read batches, 80 conversation rows,
        and 24 artifact rows per cycle unless the service `liveFollow` config
        overrides those fields
      - ChatGPT conversation navigation must not call `Page.navigate` when the
        attached target already has the canonical requested URL and its
        route/document/conversation predicates are ready; physical navigation,
        reload, reused-target routing, and their fallbacks must cross the
        provider traffic governor immediately before mutation. The governor
        verifies exact runtime/profile/workload/operation/tab-lease attribution,
        completes admission and awaited start recording before effect, and
        settles physical evidence before probing for a visible provider warning
      - installed traffic acceptance should attach a continuous passive
        direct-CDP observer before the bounded pass, reconcile AuraCall's
        explicit navigation count with top-level document/navigation events,
        retain subframes and hydration requests separately, and keep the
        observer attached through the final delayed-warning probe; the observer
        must not click, reload, navigate, dismiss, or retry
      - raw target creation is not provider work yet because no target ID exists
        to lease; every `openChromeTarget` caller must therefore provide an
        explicit `pre-lease-target-acquisition` authority with an operation ID
        and reason, and the acquired target must immediately enter its owning
        lease coordinator
      - the scheduler is disabled unless
        `--account-mirror-scheduler-interval-ms <ms>` is set
      - without `--account-mirror-scheduler-execute`, scheduler passes are
        dry-run only and must not call the refresh service or acquire the
        browser dispatcher
      - the first executable scheduler slice may request at most one
        default-ChatGPT routine refresh per pass
      - scheduler operator controls share `POST /status`:
        - pause: `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"accountMirrorScheduler":{"action":"pause"}}'`
        - resume: `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"accountMirrorScheduler":{"action":"resume"}}'`
        - dry-run one pass: `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"accountMirrorScheduler":{"action":"run-once"}}'`
      - installed-runtime smoke readback can assert the compact operator field:
        `auracall api status --port 8080 --expect-account-mirror-backpressure routine-delayed`
      - local deterministic smoke for scheduler-history/API/MCP yield readback:
        `pnpm run smoke:scheduler-history`
      - local deterministic smoke for live-follow cycle continuation:
        `pnpm run smoke:live-follow-cycle`; it runs two fixture scheduler
        cycles against the real status registry and scheduler service, proving
        a persisted backfill ledger advances from `project-conversations` to
        `detail-inventory` instead of restarting at identity/root rails, with
        zero provider or browser dispatcher access
      - local deterministic smoke for mirror completion controls:
        `pnpm run smoke:completion-control`; it uses an injected completion
        service and proves `POST /status` pause, CLI helper resume, MCP cancel,
        and `/status` readback without provider or browser dispatcher access
      - local deterministic smoke for foreground live-follow deferral:
        `pnpm run smoke:foreground-deferral`; it resumes a paused fixture
        live-follow completion under foreground backpressure and proves
        `foreground_work_deferred` status/diagnostics readback with zero
        provider refresh calls
      - local deterministic smoke for persisted completion hydration:
        `pnpm run smoke:completion-hydration`; it seeds a paused live-follow
        completion into a temp cache, restarts the API over the same cache,
        and verifies `/status`, CLI status, and MCP `api_status`
      - targeted full-sweep policy coverage:
        `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/liveFollowReconciler.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/mcp.accountMirrorCompletion.test.ts tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "full-sweep|account mirror completion|live-follow"`
      - targeted steady-follow cursor coverage:
        `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts --maxWorkers 1 --testNamePattern "sweep|steady-follow|attachment cursor"`
      - targeted Gemini project-history discovery coverage:
        `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts --maxWorkers 1 --testNamePattern "project conversations|project histories|route failures|walks bounded project histories"`
      - local deterministic smoke for setup-plus-batch agent workflows:
        `pnpm run smoke:che447-grading-batch`; despite the course-specific
        fixture name, this verifies the general operator project ensure,
        project-bound agent creation, scoped execution key, attachment-bearing
        batch enqueue, batch polling, and child response readback pattern
        without provider or browser dispatcher access
      - targeted tenant-pool batch coverage:
        `pnpm vitest run tests/runtime.responseBatchService.test.ts tests/http.responsesServer.test.ts -t "dispatch-pool|active runtime evidence" --maxWorkers 1`;
        this proves dispatch-pool expansion, team-scoped authorization, batch
        assignment metadata, and active-runtime-evidence selection without
        touching live providers
      - targeted tenant-pool setup coverage:
        `pnpm vitest run tests/projects.tenantPoolTeamEnsureService.test.ts tests/mcp.tenantPoolTeamEnsure.test.ts tests/mcp.server.test.ts --maxWorkers 1`;
        this proves per-member project ensure composition, missing-team
        creation, existing-team no-rewrite semantics, and MCP service wiring
        without live provider access
      - local deterministic smoke for scoped client handoff workflows:
        `pnpm run smoke:scoped-client-handoff`; it chains the composed
        redacted `POST /v1/agent-setup-handoffs` route, scoped key issuance
        with `clientEnvPath`, API service reload
        simulation, `/v1/models` validation, one direct response, and one
        response batch using only the generated client env values
      - local downstream-client smoke:
        `pnpm run smoke:scoped-client-env -- <client.env>`; it reads a
        generated scoped client env, validates `/v1/models`, submits one
        `/v1/responses` request, polls readback, and exits with clear
        diagnostics for apps that only know the generated env contract
      - local deterministic smoke for live-follow health parity:
        `pnpm run smoke:live-follow-health`; it compares `/status.liveFollow`,
        CLI `api status`, MCP `api_status`, and `/ops/browser` against one
        fixture-backed local API server without provider or browser dispatcher
        access
      - local deterministic smoke for browser-ops dashboard completion control:
        `pnpm run smoke:ops-browser-control`; it verifies `/ops/browser` button
        wiring uses `POST /status` with `accountMirrorCompletion`, then pauses
        a fixture live-follow completion through that path and asserts the same
        contract through `auracall api ops-browser-status` and MCP
        `api_ops_browser_status`
      - local browser-backed smoke for provider bot-gate clear:
        `pnpm run smoke:ops-browser-provider-guard`; it seeds a synthetic
        Gemini `google.com/sorry` provider guard, opens `/ops/browser` with
        `agent-browser`, clicks `Clear guard`, and verifies the target moves
        into `provider-guard-cooldown` without provider work
      - Browser Ops process diagnostics:
        `GET /v1/browser/processes` is read-only and separates Chrome launch
        command `about:blank` arguments from actual open DevTools page targets;
        `/ops/browser` renders the same `launchArgAboutBlank` and
        `openBlankPages` distinction for operator checks
      - CLI operator clear path for the same guard:
        `auracall api mirror-provider-guard-clear --port <port> --provider gemini --runtime-profile default`
        posts the same `/status` control payload and reports the resulting
        quiet cooldown
      - installed-runtime dashboard/status contract readback:
        `auracall api ops-browser-status --port 8080 --expect-live-follow-severity paused --expect-completion-paused 1`
        The same command now asserts the read-only Browser Tab Concurrency
        panel and prints `/status.tabConcurrency`, including mode, serialized
        rollback, lease/workload counts, provider warnings, aggregate usage,
        attention, target churn, and retirement posture.
      - provider-free tab-affinity soak contract:
        `pnpm vitest run tests/browser/tabAffinitySoak.test.ts tests/browser/tabConcurrencyRuntime.test.ts tests/cli/apiOpsBrowserCommand.test.ts tests/mcp.apiOpsBrowserStatus.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`.
        `pnpm run soak:tab-affinity <start|snapshot|finish> ...` reads local
        `/status` only and appends a mode-0600 JSONL receipt under
        `~/.auracall/soaks`. Finish rejects before 24 elapsed hours; warnings,
        lost/uncertain/restart-unverified/expired leases, new warning events or
        admission rejections, post-baseline target creation or non-crawler
        navigation, and any reload/focus growth are terminal findings.
        Governed live-follow navigation is reported separately by workload and
        is expected while the crawler walks conversation routes.
      - lease lifecycle regression contract:
        `pnpm vitest run tests/browser-service/tabLeaseRetirement.test.ts tests/browser-service/tabLeaseRestartReconciliation.test.ts tests/browser/configuredChatgptTabMaintenance.test.ts` proves heartbeat expiry, uncertain idle retirement, repeated lost-lease reconciliation, absent-browser release, and exact-target post-close proof without a provider or browser.
      - installed-runtime MCP dashboard/status contract readback:
        `pnpm run smoke:mcp-ops-browser`; it starts a fixture local API server,
        verifies packaged `auracall-mcp` lists `api_ops_browser_status`, and
        calls it with paused live-follow expectations
      - installed-runtime MCP provider-guard readback:
        `pnpm run smoke:mcp-provider-guard`; it runs packaged `auracall-mcp`
        against an isolated fixture home/config and asserts
        `account_mirror_provider_guard_clear` list/call/status behavior
        without provider/browser work
      - installed-runtime operator Search UX smoke:
        `pnpm run smoke:operator-search-ux`; it rebuilds the operator bundle,
        starts a fixture local API server, renders `/dashboard?nav=search`
        with URL-backed `assets=available` and
        `materialization=succeeded` filters through Chromium, verifies the
        cached-assets toggle, copy-current-search-url action, conversation-row
        reconciliation POST payload, and mobile no-overflow behavior without
        provider/browser dispatcher work
      - compact lazy-live-follow operator preflight:
        `pnpm run preflight:lazy-live-follow`; it runs the completion-control,
        live-follow cycle-continuation, foreground-deferral,
        completion-hydration, live-follow
        health/diagnostics parity, ops-browser-control, ops-browser
        provider-guard clear,
        ops-browser preflight run-detail, operator API-key issue,
        OpenAI-compatible client auth, scoped client handoff workflow,
        setup-plus-batch agent workflow, user runtime install, installed
        operator Search UX controls, installed archive/search/MCP asset
        readback, archive materialization job filters, installed MCP status,
        API log-tail, ops-browser MCP, and provider-guard MCP smokes in
        sequence before live dogfood.
        When started through the API/dashboard,
        `/status.preflight.lazyLiveFollowRun.steps` and `/ops/browser` show
        per-step progress before the run completes.
        Operators can also fetch one structured run with
        `GET /v1/preflight/lazy-live-follow/runs/{run_id}` or MCP
        `preflight_run`; the bounded log tail remains at
        `/v1/preflight/lazy-live-follow/runs/{run_id}/log`. Browser Ops
        mirrors this order with `Open Run` for structured details and
        `Open Log` for the bounded tail.
      - browser-backed dashboard run-detail smoke:
        `pnpm run smoke:ops-browser-preflight-run-detail`; it starts a fixture
        local API server, opens `/ops/browser` with `agent-browser`, verifies
        the header preflight health strip, clicks `Open Run`, and asserts the
        structured detail panel renders the run id, status, step, and log path
        without provider work.
      - execute one pass only when the server was started with
        `--account-mirror-scheduler-execute`:
        `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"accountMirrorScheduler":{"action":"run-once","dryRun":false}}'`
      - installed execute dogfood should use a long interval plus one manual
        `run-once` to avoid repeated provider navigation; the validated
        default-ChatGPT pass completed with five cached projects and 64 cached
        conversations for `ecochran76@gmail.com`
    - dedicated mirror posture route:
      - `GET /v1/account-mirrors/status`
      - `GET /v1/account-mirrors/status?provider=chatgpt&runtimeProfile=default`
      - `GET /v1/account-mirrors/status?provider=chatgpt&runtimeProfile=default&explicitRefresh=true`
      - `explicitRefresh=true` evaluates the shorter polite interval but still
        remains read-only in this slice
    - dedicated mirror manifest catalog route:
      - `GET /v1/account-mirrors/catalog`
      - `GET /v1/account-mirrors/catalog?provider=chatgpt&runtimeProfile=default&kind=all&limit=50`
      - `kind` can be `all`, `projects`, `conversations`, `artifacts`,
        `files`, or `media`
      - this readback returns cached project/conversation/artifact/file/media
        manifest rows by provider plus bound identity; it must not acquire the
        browser dispatcher, launch browsers, submit prompts, scrape provider
        pages, or load conversation ids
      - regression coverage should prove that changing only the browser binding
        keeps the same tenant catalog visible and that old binding-scoped
        status/backoff state is not treated as missing tenant catalog data
      - cached conversation rows expose `conversationFreshness`; tests should
        treat that object as cache projection only and should not expect catalog
        or search reads to validate routeability online
      - bulk reconciliation tests should prove freshness-aware candidate
        selection: fresh/complete rows are skipped unless forced, while stale,
        partial, or missing-assets rows can be selected for `refreshSnapshot`
        even when stale cached asset counts are zero
      - account-mirror snapshot writes also persist index freshness metadata on
        each cached conversation row: observed time, source surface, recency
        rank, and index-row fingerprint
    - explicit mirror refresh route:
      - `POST /v1/account-mirrors/refresh`
      - body: `{"provider":"chatgpt","runtimeProfile":"default","explicitRefresh":true}`
      - current implementation is default-ChatGPT only
      - it acquires the browser operation dispatcher and records
        queued/running/completed evidence
      - after dispatcher acquisition it verifies the bound ChatGPT identity,
        then collects bounded project/conversation metadata only
      - on success it persists the mirror snapshot under the existing provider
        cache key for `provider + boundIdentity`; AuraCall runtime profile and
        browser profile are stored as refresh provenance, not as duplicate
        mirror data ownership
      - the same success path persists bounded project and conversation
        manifests into the existing identity-scoped provider cache datasets,
        plus lightweight account-mirror artifact/file/media manifests; this does
        not fetch full conversation bodies or binary artifacts
      - it must not submit prompts, fetch full conversation bodies, or load
        immature conversation ids
    - nonblocking mirror completion route:
      - `POST /v1/account-mirrors/completions`
      - `GET /v1/account-mirrors/completions`
      - `GET /v1/account-mirrors/completions/{completion_id}`
      - start returns an operation id immediately
      - list readback supports `status=active|queued|running|idle_waiting|completed|blocked|failed`,
        `provider`, `runtimeProfile`, and `limit` filters without touching
        provider browsers
      - status readback reports queued/running/completed/blocked/failed,
        `mode = live_follow|bounded`, `phase =
        backfill_history|steady_follow`, pass count, next eligible attempt,
        latest refresh, and mirror completeness
      - live-follow mode must not finish simply because history backfill is
        complete; it stays running and periodically crawls for new content
      - an all-failed completion-owned materialization job is not a benign
        terminal event: bounded and live-follow operations become `blocked`
        with `account_mirror_materialization_failed` before completion or
        another collector/provider pass; a failed job with one or more verified
        materializations is partial success and retains the normal
        post-materialization quiet window, as do successful and genuinely
        skipped live-follow jobs
      - ChatGPT file-download regressions must cover both camel-case provider
        errors and the live snake-case `error_code` / `error_type` envelope;
        explicit not-found evidence is non-retryable `provider_unavailable`,
        while failed transport, browser interaction, malformed payloads, and
        asset-identity mismatches remain `retrieval_failed`
      - selected `catalogItemId` file materialization must preserve exact catalog
        ID/name/provider-file identity into the transfer filter; construct a
        multi-file conversation fixture and prove a nonselected earlier file is
        excluded before `maxItems` is applied
      - operation records persist under the account-mirror cache and are
        hydrated on API/MCP startup; active records resume, and a persisted
        `nextAttemptAt` must be honored before the next refresh request
      - `auracall api serve --background-drain-interval-ms 0 --account-mirror-scheduler-interval-ms 0 --no-account-mirror-completions-on-start`
        keeps persisted operation records readable, disables automatic
        completion resume and configured live-follow reconciliation at startup,
        and prevents the proof server from inheriting background drain or
        scheduler cadence; use all three controls for isolated
        provider/materialization proofs where only explicit commands should
        touch a browser
      - endpoint-only `about:blank` cold launch must return after native launch
        and DevTools readiness without selecting a restored blank page or
        cleaning its stockpile. The caller then creates the admitted owned
        crawler. Provider login URLs still open through the login helper.
      - persisted scheduler pause suppresses both startup runner restoration
        and configured live-follow reconciliation. Explicit scheduler resume
        restores runnable records and reconciles enabled missing subscriptions,
        including targets with failed terminal history, using the same startup
        capability flags and existing provider guards. Operator-paused targets
        stay paused; repeated resume must not create duplicate runners.
      - shutdown only parks account-mirror completion loops launched by the
        current server process; a startup-isolated readback server must not
        rewrite unrelated persisted completion records when it exits
      - `/status.accountMirrorCompletions` reports
        `object = account_mirror_completion_summary`, aggregate metrics, and
        active/recent operation arrays for operator readback
      - `/status.liveFollow` reports the shared live-follow health projection:
        derived severity, scheduler posture/state, completion counts,
        backpressure reason, and latest cooperative-yield evidence
      - `auracall api status --port <port>` projects the same completion
        posture into compact CLI output: aggregate counts plus active paused or
        running operations and recent controlled terminal operations
      - the same output includes one `Live follow health:` line combining
        `severity=healthy|backpressured|paused|attention-needed`, scheduler
        posture, scheduler state, completion counts, backpressure, and latest
        cooperative-yield evidence
      - status expectations can fail fast on derived live-follow severity with
        `--expect-live-follow-severity <severity>`
      - status expectations can fail fast on completion-control counts:
        `--expect-completion-active <count>`,
        `--expect-completion-paused <count>`,
        `--expect-completion-cancelled <count>`, and
        `--expect-completion-failed <count>`
      - `/ops/browser` includes the "Mirror Live Follow" panel and renders the
        same active/recent completion posture from `/status.liveFollow` and
        `/status.accountMirrorCompletions`
      - operator control is available with
        `POST /v1/account-mirrors/completions/{completion_id}` body
        `{"action":"pause|resume|run_one_pass|cancel"}`; paused operations stay
        discoverable in active readback, resume relaunches the service-owned
        loop, `run_one_pass` wakes one bounded live-follow pass while preserving
        safety gates; it may also explicitly re-arm a blocked or failed
        live-follow completion after the underlying fault is diagnosed and
        repaired, but does not re-arm completed, cancelled, or bounded
        operations. The forced pass
        retains ownership through any completion-owned
        materialization terminal, and blocks on an all-failed result before
        returning; successful/skipped materialization settles before the forced
        pass returns idle, and cancel records terminal `cancelled` without
        touching provider browsers
      - the regular status preflight path accepts
        `POST /status` body
        `{"accountMirrorCompletion":{"id":"<completion_id>","action":"pause|resume|run_one_pass|cancel"}}`
        and returns the updated `controlResult` plus refreshed status
        projections
      - ChatGPT completion uses `includeHistory` plus `historyLimit`, which
        must scroll the left rail to load older conversations before claiming
        inventory completeness
    - MCP parity:
      - `api_status` reads local API `/status` and exposes
        `scheduler.operatorStatus.posture`
      - `account_mirror_status`
      - `account_mirror_catalog`
      - `account_mirror_refresh`
      - status/catalog are read-only; refresh is explicit,
        dispatcher-owned, and metadata-only in this slice
    - plain `/status` also includes a compact direct-run local claim snapshot:
      - `localClaimSummary.sourceKind = direct`
      - `localClaimSummary.runnerId`
      - `localClaimSummary.selectedRunIds`
      - `localClaimSummary.blockedRunIds`
      - `localClaimSummary.notReadyRunIds`
      - `localClaimSummary.unavailableRunIds`
      - `localClaimSummary.statusByRunId`
  - optional operator control on the same surface:
    - pause: `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"backgroundDrain":{"action":"pause"}}'`
    - resume: `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"backgroundDrain":{"action":"resume"}}'`
    - cancel one active local run:
      - `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"runControl":{"action":"cancel-run","runId":"<response_id>"}}'`
    - resume one paused human-escalation direct or team run:
      - `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"runControl":{"action":"resume-human-escalation","runId":"<response_id>","note":"human approved resume","guidance":{"action":"retry-with-guidance"},"override":{"promptAppend":"Retry the resumed step.","structuredContext":{"approvedPath":"/repo/approved"}}}}'`
    - trigger one targeted drain pass for a direct or team run:
      - `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"runControl":{"action":"drain-run","runId":"<response_id>"}}'`
      - if the local configured runner cannot safely claim that run, targeted
        drain should return `status = skipped` with
        `skipReason = claim-owner-unavailable`
      - if the run is already leased by the configured server-local runner,
        targeted drain should reuse that lease and execute one host pass
    - claim one scheduler-authorized local run without executing it:
      - `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"schedulerControl":{"action":"claim-local-run","runId":"<response_id>","schedulerId":"operator:local-status"}}'`
      - accepted only when scheduler authority selects the server-local runner
      - follow with `runControl.action = "drain-run"` for immediate execution
        through the existing local-owned lease
      - for bounded multi-pass drain accounting:
        - preserve repeated executions for the same run across passes
        - but count one reclaimed stale lease only once in
          `expiredLeaseRunIds`
    - response/readback should preserve both targeted-drain outcomes:
      - `operatorControlSummary.targetedDrain.status = executed|skipped`
      - skipped targeted drain keeps `skipReason = claim-owner-unavailable`
      - `reason` should preserve the specific local-claim explanation when one
        is available
      - recovery detail timeline retains the persisted skipped drain note
    - when multiple resume/drain operator-control entries exist on one run,
      response readback should prefer the latest persisted resume summary and
      the latest persisted targeted-drain note
    - required structured-report / JSON requested outputs should not be
      satisfied by internal structured outputs alone:
      - `response.output`
      - `human.resume.<stepId>`
      - `step.localActionOutcomes.<stepId>`
    - orchestration timeline summaries stay bounded:
      - keep full `total`
      - but limit `items` to the newest `10` entries on both response readback
        and recovery detail
    - handoff-transfer summaries should prefer stored consumed transfer state
      over planned handoff fallback when both exist
    - cancellation readback should also preserve the no-note fallback:
      - if no cancellation `note-added` event exists, fall back to the
        cancelled run's `updatedAt`
      - read back `source = null` and `reason = null`
      - keep that fallback explicit on both:
        - `GET /v1/responses/{response_id}`
    - `GET /v1/team-runs/inspect?taskRunSpecId=<task_run_spec_id>`
    - `GET /v1/team-runs/inspect?teamRunId=<team_run_id>`
    - `GET /v1/runtime-runs/inspect?runId=<run_id>`
    - `GET /v1/runtime-runs/inspect?runtimeRunId=<runtime_run_id>`
    - `GET /v1/runtime-runs/inspect?teamRunId=<team_run_id>`
    - `GET /v1/runtime-runs/inspect?taskRunSpecId=<task_run_spec_id>`
    - `GET /v1/runtime-runs/inspect?runId=<run_id>&runnerId=<runner_id>`
    - `GET /v1/runtime-runs/inspect?runId=<run_id>&probe=service-state`
    - `GET /v1/runtime-runs/inspect?runId=<run_id>&diagnostics=browser-state`
    - `GET /v1/runtime-runs/inspect?runId=<run_id>&authority=scheduler`
    - CLI equivalent for read-only scheduler evidence:
      - `pnpm tsx bin/auracall.ts api inspect-run --run-id <run_id> --authority scheduler`
        - `GET /status/recovery/{run_id}`
    - resolve one pending local-action request on a direct or team run:
      - `curl -s http://127.0.0.1:8080/status -H 'Content-Type: application/json' -d '{"localActionControl":{"action":"resolve-request","runId":"<response_id>","requestId":"<request_id>","resolution":"approved|rejected|cancelled"}}'`
      - successful local-action resolution should also return bounded:
        - `resolvedAt`
        - `ownerStepId`
      - successful human-escalation resume should also return bounded:
        - `resumedAt`
        - `resumedStepId`
  - create bounded response:
    - `curl -s http://127.0.0.1:8080/v1/responses -H 'Content-Type: application/json' -d '{"model":"gpt-5.2","input":"Reply exactly with: local api smoke"}'`
    - browser-backed ChatGPT tool smoke:
      `curl -s http://127.0.0.1:8080/v1/responses -H 'Content-Type: application/json' -d '{"model":"gpt-5.2-thinking","input":"Use Deep Research to prepare a tiny smoke-test plan.","auracall":{"runtimeProfile":"wsl-chrome-3","service":"chatgpt","transport":"browser","composerTool":"deep-research","deepResearchPlanAction":"edit"}}'`
    - current ChatGPT workbench selector and attachment contract:
      `pnpm vitest run tests/browser/chatgptComposerTool.test.ts tests/browser/pageActions.test.ts tests/services/registry.test.ts`
      - the visible `.popover` may mix file-source rows and tool/app rows;
        file-source rows must never satisfy composer-tool selection
      - local and remote `--file` paths require one unrestricted multi-file
        `#upload-files` input plus the exact local-file row or the validated
        composer fallback below; the provider-library row is optional
      - label drift may use one uniquely visible composer/editor/trigger;
        `tests/browser/chatgptAttachmentComposer.test.ts` executes the real
        inventory expression for inactive forms, hidden fallback textareas,
        foreign inputs, ambiguous triggers/popovers, and explicit ownership
      - handoff coverage in `tests/browser/chatgptService.test.ts` retains both
        omitted/current and explicit semantic model/effort selection
      - unresolved drift, ambiguity, or an image-restricted `#upload-files` input must
        fail closed before any file transfer or prompt submission
  - read it back:
    - copy the returned `id`, then run `curl http://127.0.0.1:8080/v1/responses/<response_id>`
    - for compact operator status, run
      `curl http://127.0.0.1:8080/v1/runs/<response_id>/status`
      Browser-backed ChatGPT Deep Research `edit` runs should expose
      `metadata.browserRunSummary.chatgptDeepResearchReviewEvidence` here,
      including the review stage and screenshot path when capture succeeds.
    - CLI parity for the same durable status envelope:
      `pnpm tsx bin/auracall.ts run status <response_id> --json`
    - completed ChatGPT Deep Research report retrieval:
      `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 conversations artifacts fetch <conversation_id> --target chatgpt`
      should return `document` artifacts materialized from the Deep Research
      iframe: inline Markdown plus provider-exported Word and PDF files when
      the finished report exposes those export options. Word/PDF acceptance
      snapshots the destination first, then requires one fresh stable file with
      the requested extension and matching ZIP/PDF signature. An unchanged
      retained file or fresh wrong variant remains on disk but is an explicit
      manifest error and does not increment `materializedCount`.
  - create a shared-contract CLI media request:
    - `pnpm tsx bin/auracall.ts media generate --provider chatgpt --type image -p "Generate an image of an asphalt secret agent" --json`
    - `pnpm tsx bin/auracall.ts media generate --provider gemini --type image -p "Generate an image of an asphalt secret agent" --json`
    - Gemini API image generation uses the same durable contract when
      `GEMINI_API_KEY` is set, but provider API media access is parked for
      now; run this only when deliberately validating that non-primary path:
      `pnpm tsx bin/auracall.ts media generate --provider gemini --type image --transport api -p "Generate an image of an asphalt secret agent" --count 1 --json`
    - for async browser smokes, add `--no-wait` and poll with
      `pnpm tsx bin/auracall.ts run status <media_generation_id> --json`
    - inspect the durable media record and current local artifact cache without
      provider/browser work:
      `pnpm tsx bin/auracall.ts media inspect <media_generation_id> --json`
    - installed-runtime media smoke assertions can avoid raw JSON for common
      terminal readback:
      `auracall run status <media_generation_id> --expect-status succeeded --expect-min-artifacts 1 --expect-media-run-state terminal_image`
    - prefer this command for new media automation and routine operator
      smokes; the older Gemini-only `--generate-image <file>` flag is a
      compatibility shortcut for direct one-file browser image saves and does
      not produce a durable media-generation record
  - create a browser-transport Gemini image request only after capability
    discovery reports `gemini.media.create_image` as `available`; the local API
    then selects `Create image`, records media-generation `timeline[]`
    milestones, and materializes generated image artifacts:
    - `curl -s http://127.0.0.1:8080/v1/media-generations -H 'Content-Type: application/json' -d '{"provider":"gemini","mediaType":"image","transport":"browser","prompt":"Generate an image of an asphalt secret agent"}'`
  - create a browser-transport ChatGPT image request only when the managed
    ChatGPT browser profile is already authenticated; the local API selects the
    ChatGPT `Create image` composer tool, records the submitted tab target id,
    and performs post-submit image readback/materialization on that same tab
    without re-opening or reloading the conversation:
    - `curl -s http://127.0.0.1:8080/v1/media-generations -H 'Content-Type: application/json' -d '{"provider":"chatgpt","mediaType":"image","transport":"browser","prompt":"Generate an image of an asphalt secret agent"}'`
    - ChatGPT image media runs intentionally skip model switching before tool
      selection because the signed-in home composer can expose `Create image`
      without a model selector.
    - image readback should accept visible ImageGen DOM image artifacts when
      payload artifacts have not yet exposed `image_asset_pointer` entries.
  - create a browser-transport Gemini video request only when intentionally
    spending one of the small daily Gemini video-generation quota slots:
    - `curl -s http://127.0.0.1:8080/v1/media-generations -H 'Content-Type: application/json' -d '{"provider":"gemini","mediaType":"video","transport":"browser","prompt":"Generate a video of an asphalt secret agent"}'`
    - routine validation should use fixture tests instead of live video
      generation
    - expected successful runs include `capability_discovered`,
      `executor_started`, optional `browser_operation_queued`,
      `browser_operation_acquired`, `browser_target_attached`,
      `capability_selected`, `prompt_submitted`, repeated `artifact_poll`,
      `video_visible`, `artifact_materialized`, and `completed`
    - generated videos should cache as `video/mp4` artifacts with the
      materialization method reported in status diagnostics
  - create a browser-transport Gemini music request only when intentionally
    spending Gemini media-generation quota:
    - `curl -s http://127.0.0.1:8080/v1/media-generations -H 'Content-Type: application/json' -d '{"provider":"gemini","mediaType":"music","transport":"browser","prompt":"Create a spy theme song"}'`
    - routine validation should use fixture tests instead of live music
      generation
    - expected successful runs include `capability_discovered`,
      `executor_started`, optional `browser_operation_queued`,
      `browser_operation_acquired`, `browser_target_attached`,
      `capability_selected`, `prompt_submitted`, repeated `artifact_poll`,
      `music_visible`, `artifact_materialized`, and `completed`
    - generated music should cache every provider download variant exposed by
      readback, including video with album art and MP3 audio
    - when Gemini exposes one generated music artifact plus `downloadOptions`,
      the executor should materialize each option as a separate variant by
      selecting the requested visible provider menu item on the submitted tab
    - when fresh readback exposes only the generic `Download track` control,
      the executor should still request Gemini's known music variants
      (`VideoAudio with cover art`, `Audio onlyMP3 track`) for menu-backed
      materialization
    - explicit variant materialization should fail that variant rather than
      caching the default generated MP4 URL under MP3 metadata
    - read-only artifact discovery should preserve already-visible provider
      download option labels, such as `Download as video with album art` and
      `Download as MP3`, without clicking the menu during routine validation
    - `/v1/media-generations/<id>/status`, `/v1/runs/<id>/status`, MCP
      `media_generation_status`, MCP `run_status`, and CLI `run status --json`
      should surface provider labels as compact artifact `downloadLabel`,
      `downloadVariant`, and `downloadOptions`
    - the MCP status schemas should also advertise compact artifact checksum
      and preview/full-quality comparison fields so callers can rely on
      `checksumSha256`, `previewArtifactId`, `previewSize`,
      `previewChecksumSha256`, and `fullQualityDiffersFromPreview` when a
      provider adapter records them
  - create a browser-transport Grok image request only after capability
    discovery reports `grok.media.imagine_image` as `available`; the local API
    first checks the explicit `/imagine` entrypoint and fails before prompt
    submission when the capability is `account_gated` or otherwise unavailable:
    - `curl -s http://127.0.0.1:8080/v1/media-generations -H 'Content-Type: application/json' -d '{"provider":"grok","mediaType":"image","transport":"browser","prompt":"Generate an image of an asphalt secret agent"}'`
    - gated failures should include `capability_unavailable` before terminal
      `failed` in `timeline[]`, with `metadata.capabilityId`,
      `metadata.capabilityAvailability`, and the inspection command in
      `failure.details`
    - available Grok image runs should materialize bounded visible Imagine
      tiles through the active browser tab, then compare one preview against
      the provider download-button result before using remote media fetch as a
      fallback
    - visible-tile captures backed by provider `data:image` URLs must cache
      the image file and compact source evidence; status/API/MCP payloads
      should not echo full inline image data URLs
    - after a fresh Grok image run completes, operators can explicitly retry
      resumed full-quality discovery without submitting another prompt:
      `pnpm tsx bin/auracall.ts media materialize <media_generation_id> --count 1 --json`;
      the retry must use the browser-service operation dispatcher, preserve the
      existing terminal run status, and merge any new artifacts into the same
      media-generation artifact directory. Current live proof covers the
      navigate-away path where the active tab is later on `https://grok.com/files`
      and the materializer opens a `/files?file=...` detail row to use
      `Download Image`.
      If that detail page loads but the download control is missing, status
      diagnostics should include bounded `filesDetail*` evidence: href/title,
      readiness, download-control count/labels, visible image labels, and
      visible button labels.
  - create a browser-transport Grok video request:
    - `curl -s http://127.0.0.1:8080/v1/media-generations -H 'Content-Type: application/json' -d '{"provider":"grok","mediaType":"video","transport":"browser","prompt":"Generate a video of an asphalt secret agent"}'`
    - expected successful runs include `capability_discovered`,
      `executor_started`, `browser_target_attached`, `prompt_inserted`,
      `submit_path_observed`, `prompt_submitted`, repeated
      `run_state_observed`, `video_visible`, `artifact_materialized`, and
      `completed`
    - generated videos should cache as `video/mp4` artifacts, preferably with
      `materialization = download-button`
    - diagnostic readback of an already-submitted manual Grok video tab is
      gated behind explicit metadata:
      `grokVideoReadbackProbe = true`, `grokVideoReadbackTabTargetId`, and
      `grokVideoReadbackDevtoolsPort`; it must direct-connect to the existing
      tab only and must not submit, navigate, reload, or fall back to
      browser-service target resolution; use
      `docs/grok-imagine-video-readback-runbook.md` for the bounded manual
      live probe
    - read back the same id through both
      `/v1/media-generations/<id>/status` and `/v1/runs/<id>/status`; both
      should agree on terminal state, last event, artifact count, and cached
      artifact paths
    - status `diagnostics` should summarize capability preflight, submitted
      tab id/url, provider route progression, artifact polling/progress
      counts, terminal run-state counts, and materialization source from the
      persisted timeline without requiring `diagnostics=browser-state`
  - list workbench capabilities for service discovery:
    - `curl -s "http://127.0.0.1:8080/v1/workbench-capabilities?provider=gemini"`
    - `curl -s "http://127.0.0.1:8080/v1/workbench-capabilities?provider=chatgpt"`
    - `curl -s "http://127.0.0.1:8080/v1/workbench-capabilities?provider=grok"`
    - `curl -s "http://127.0.0.1:8080/v1/workbench-capabilities?provider=grok&diagnostics=browser-state"`
    - `curl -s "http://127.0.0.1:8080/v1/workbench-capabilities?provider=grok&entrypoint=grok-imagine&diagnostics=browser-state"`
    - `curl -s "http://127.0.0.1:8080/v1/workbench-capabilities?provider=grok&entrypoint=grok-imagine&discoveryAction=grok-imagine-video-mode"`
    - `auracall capabilities --target gemini --json`
    - `auracall capabilities --target chatgpt --json`
    - `auracall capabilities --target grok --json`
    - `auracall capabilities --target grok --diagnostics browser-state --json`
    - `auracall capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json`
    - `auracall capabilities --target grok --entrypoint grok-imagine --discovery-action grok-imagine-video-mode --json`
    - `auracall capabilities --target gemini --static --json` for a no-browser
      catalog check
    - use `category=research|media|canvas|connector|skill|app|search|file|other`
      to narrow the report
    - static entries are intentionally conservative until live browser/provider
      discovery proves current account availability
    - `diagnostics=browser-state` / `--diagnostics browser-state` adds bounded
      target/document/provider evidence and a stored PNG screenshot path
    - `entrypoint=grok-imagine` / `--entrypoint grok-imagine` opens or reuses
      the Grok `/imagine` route through browser-service control-plane
      attribution for read-only inspection only
    - Grok `/imagine` diagnostics include provider-owned read-only
      `run_state`, pending, terminal image/video, media URL, and
      materialization-control evidence when visible, plus bounded masonry and
      filmstrip visible-tile evidence. They do not submit a prompt or click
      generation controls.
    - a passive `Upgrade to SuperGrok` upsell alone is not an account gate
      when usable Image/Video controls or generated media are visible; blocking
      gate classification requires contextual generation-limit/subscription
      evidence with no ready composer or media
    - with the configured `api serve` runtime, `provider=gemini`,
      `provider=chatgpt`, and `provider=grok` can merge read-only
      feature-signature evidence from the matching managed browser profile;
      unfiltered reports remain static/cheap
  - create/read media-generation contract record:
    - `curl -s http://127.0.0.1:8080/v1/media-generations -H 'Content-Type: application/json' -d '{"provider":"gemini","mediaType":"image","prompt":"Generate an image of an asphalt secret agent","aspectRatio":"1:1"}'`
    - for active polling, request async creation:
      `curl -s "http://127.0.0.1:8080/v1/media-generations?wait=false" -H 'Content-Type: application/json' -d '{"provider":"gemini","mediaType":"image","transport":"browser","prompt":"Generate an image of an asphalt secret agent","aspectRatio":"1:1"}'`
    - the same contract accepts `mediaType = music|video`; Gemini music may
      still materialize over a video transport artifact
    - unsupported provider/media combinations return a persisted `failed`
      response with a provider-specific `failure.code`
    - copy the returned `id`, then run `curl http://127.0.0.1:8080/v1/media-generations/<media_generation_id>`
    - for compact operator status, run
      `curl http://127.0.0.1:8080/v1/media-generations/<media_generation_id>/status`
    - while a browser-backed media job is still running, add
      `?diagnostics=browser-state` to capture bounded live browser evidence
      from the active provider target, including recent Aura-Call browser
      mutation records when present
    - for the generic run-status surface, run
      `curl http://127.0.0.1:8080/v1/runs/<media_generation_id>/status`
    - the generic status route accepts the same
      `?diagnostics=browser-state` switch for running browser-backed media jobs
    - CLI parity for the same durable status envelope:
      `pnpm tsx bin/auracall.ts run status <media_generation_id> --json`
    - compact CLI assertions for that same envelope:
      `pnpm tsx bin/auracall.ts run status <media_generation_id> --expect-status succeeded --expect-min-artifacts 1 --expect-media-run-state terminal_image`
    - inspect `timeline[]` for `running_persisted`, `executor_started`,
      optional `browser_operation_queued`, `browser_operation_acquired`,
      provider-specific progress, and terminal `completed|failed` evidence
  - create bounded team run:
    - `curl -s http://127.0.0.1:8080/v1/team-runs -H 'Content-Type: application/json' -d '{"teamId":"ops","objective":"Reply with one bounded team result.","responseFormat":"markdown","maxTurns":2}'`
    - with background drain enabled, creation returns after persistence and
      the server-owned background drain advances the run; poll the response
      readback link for terminal output
  - read/inspect the team run:
    - copy `execution.teamRunId`, then run `curl "http://127.0.0.1:8080/v1/team-runs/inspect?teamRunId=<team_run_id>"`
    - copy `execution.runtimeRunId`, then run `curl "http://127.0.0.1:8080/v1/runtime-runs/inspect?runtimeRunId=<runtime_run_id>"`
    - response readback is also available at `GET /v1/responses/<runtime_run_id>`
  - current expected posture:
    - `POST /v1/responses` persists the run and the server-owned background
      drain advances it
    - `POST /v1/team-runs` constructs one bounded `TaskRunSpec`, projects one
      `TeamRun`, and executes one `sourceKind = team-run` runtime through the
      same server-owned host/runner path
    - direct browser-backed `/v1/responses` runs now use the configured
      stored-step executor path instead of a no-op wrapper path
    - managed browser response/chat execution now waits through the
      browser-service operation dispatcher when another operation owns the same
      managed browser profile; login/setup/manual-verification flows still
      surface busy state immediately
    - `api serve` now also persists one bounded local runner record and keeps
      it heartbeated while the server stays up
    - `GET /v1/runtime-runs/inspect` now exposes the bounded queue projection
      for one persisted runtime run:
      - `resolvedBy`
      - `queryId`
      - `queryRunId`
      - `matchingRuntimeRunCount`
      - bounded `matchingRuntimeRunIds`
      - `queueState`
      - `claimState`
      - `nextRunnableStepId`
      - `activeLeaseId`
      - `activeLeaseOwnerId`
      - optional `serviceState` when explicitly requested with
        `probe=service-state`
        - `probeStatus = observed|unavailable`
        - keep it separate from queue/lease posture
        - current default live probe coverage is:
          - ChatGPT on the managed browser path
          - Gemini on browser-backed runtime profiles only
            - active browser-backed Gemini runs prefer provider-owned
              lottie/avatar spinner evidence when visible, then fall back to
              executor-owned transient `thinking`
          - Grok on browser-backed runtime profiles only
            - active browser-backed Grok runs prefer executor-owned transient
              `thinking` state before DOM/page fallback
        - Gemini API-backed runtime profiles still return honest
          `unavailable` posture
        - Grok API-backed runtime profiles still return honest `unavailable`
          posture
      - optional `browserDiagnostics` when explicitly requested with
        `diagnostics=browser-state`
        - live, bounded, and run-scoped to the active step
        - includes target URL/title/id, document readiness, visible control
          counts, provider evidence, recent browser mutation records, and a
          stored PNG screenshot path
        - `GET /v1/runs/<id>/status?diagnostics=browser-state` and
          `GET /v1/media-generations/<id>/status?diagnostics=browser-state`
          expose the same bounded browser snapshot for active browser-backed
          media jobs, using the media run's recorded `tabTargetId` when present
        - `GET /v1/workbench-capabilities?provider=<provider>&diagnostics=browser-state`
          exposes the same bounded browser snapshot for current workbench
          capability discovery, including Grok Imagine gating evidence
      - optional `schedulerAuthority` when explicitly requested with
        `authority=scheduler`
        - read-only authority evidence only
        - returns decision, reason, active lease posture, candidates,
          selected runner evidence, future mutation label, and
          `mutationAllowed = false`
      - step-id buckets for running/waiting/deferred/terminal posture
      - bounded affinity posture
        - `requiredService`
        - `requiredRuntimeProfileId`
        - `requiredBrowserProfileId`
        - `requiredHostId`
        - `hostRequirement`
        - `requiredServiceAccountId`
        - `browserRequired`
        - `eligibilityNote`
      - when configured service identity exists for the active step service,
        runtime inspection and local claim evaluation should require the same
        `service-account:<service>:<identity-key>` id that `api serve` runner
        records advertise
      - this id is derived from config only:
        - identity key preference is `email`, then `handle`, then `name`
        - `api serve` does not live-probe the browser account during runner
          registration
        - a match proves configured account affinity, not independent proof of
          the currently logged-in browser tab
    - if `runnerId` is supplied, the same inspection route should also include
      one bounded persisted runner summary and evaluate queue affinity against
      that runner
      - `api serve` derives runner `serviceAccountIds` from configured service
        identities when present, using
        `service-account:<service>:<identity-key>`
      - when configured identities are absent or incomplete for a
        browser-capable runner, expect `eligibilityNote` to preserve that caveat
    - bounded local claims now use that live runner id as the lease owner
    - successful direct-run execution now also updates that persisted runner
      record with:
      - `lastActivityAt`
      - `lastClaimedRunId`
    - while a direct-run step is still executing, the active lease should now
      also be refreshed under the live runner owner instead of relying on the
      initial claim timestamp alone
    - for browser-backed response runs, lease refreshes should come from
      runtime evidence: runtime target hints and passive DOM observations such
      as thinking, response-incoming, and response-complete
    - long-running ChatGPT response runs must also keep emitting passive DOM
      probe lease evidence when the provider has not surfaced readable
      progress text; missing assistant/status text alone is not evidence that
      the run stopped
    - if the command observation window expires while the exact submitted
      generation has a visible Stop control, including before ChatGPT mounts
      an assistant turn, Session/model state remains `running` with
      `response.incompleteReason=observation_expired_generation_active`; exact
      browser and conversation evidence must survive for `auracall session
      <id>` read-only reattachment, with assistant identity and text
      fingerprint added once that turn mounts
    - if the last runtime URL is stale or synthetic, the validated final
      ChatGPT progress `/c/<id>` URL must replace only runtime URL/conversation
      identity before reattach; target ID and port must remain unchanged
    - healthy assistant fingerprint/length progress must not refresh the page;
      only positively stale or interrupted observation may refresh, only the
      same conversation may be targeted, and one Runtime may refresh at most
      once in a 15-minute window
    - passive DOM probe evidence must stay bound to the submitted conversation
      target; a target that has moved to ChatGPT Library/root/project or a
      different conversation should fail with `chatgpt-target-mismatch` instead
      of extending the lease
    - after restart recovery, a stranded browser-backed ChatGPT step should
      reattach to the persisted submitted tab target when available; it should
      fail for operator review rather than replaying the prompt into a new tab
      if reattach cannot be proven
    - response batches that allow more than one browser-backed run should drain
      up to their `maxConcurrentRuns` budget in one host pass; each ChatGPT
      child should expose a distinct `browserRunSummary.chromeTargetId`, and
      active lease heartbeats should advance from runtime evidence rather than
      from a blind timer
    - dispatch-pool response batches expand each child to one concrete member
      agent before authorization and persistence; batch status should expose
      `dispatch.team`, `dispatch.projectSync`, pool warnings, and per-job
      dispatch assignment. Availability should use active direct-run lease or
      running-step evidence before falling back to team order.
    - ChatGPT tenant limits should cap the shared drain path across batches and
      one-shot responses: default 4 concurrent chats, 120 chat starts per hour,
      and 240 chat starts per day per configured ChatGPT service account, with
      AuraCall runtime profile fallback when no service account identity is
      configured. Per-batch limits can only narrow that budget.
    - if that configured runner owner is missing or stale, new local claims
      should be skipped instead of silently falling back to a generic host id
    - `POST /status` run cancellation is now bounded to active locally owned
      runs:
      - active local runner-owned run => cancelled + lease released with
        `cancelled`
      - inactive or not-owned run => 409
    - `POST /status` human-escalation resume is now bounded to direct or
      team runs currently paused for human escalation:
      - paused human-escalation run => resumed to `running` / resumed step
        returned to `runnable`
      - any other run => 409
    - `POST /status` targeted drain is now bounded to direct or team runs:
      - runnable or resumed run => one targeted host drain pass and
        immediate execution if claimable
      - skipped or non-runnable run => 409
    - `POST /status` local-action resolution is now bounded to currently
      `requested` direct or team local action records:
      - requested request => approved/rejected/cancelled and reflected in later
        `metadata.executionSummary.localActionSummary`
      - already-resolved request => 409
    - `POST /status` scheduler local claim is bounded to the server-local runner:
      - local claimable run => active lease acquired for the server-local runner
      - expired stale/missing-owner lease => old lease expired and new local
        lease acquired
      - fresh active lease, active owner, non-local selected runner, or blocked
        affinity/capability => 409 with no mutation
    - when multiple persisted `step.localActionOutcomes.<stepId>` summaries
      exist on the same run, response readback should prefer the terminal
      step's summary instead of older step-local action summaries
    - if a running step finishes after an external/local cancellation wins the
      persist race, the final stored run must remain `cancelled`
    - the create response may initially be `in_progress`
    - `GET /v1/responses/<response_id>` should converge to `completed`,
      `failed`, or `cancelled`
    - terminal direct-run readback now also includes bounded execution details
      under `metadata.executionSummary`
    - when one run contains both:
      - a failed step
      - a later succeeded or cancelled step
      terminal readback should still prefer the failed step for:
      - `terminalStepId`
      - `completedAt`
      - `failureSummary`
    - if stored shared-state exposes `structuredOutputs[key="response.output"]`,
      preserve that structured mixed output on `response.output`
    - keep the split explicit:
      - `response.output` is the transport payload
      - runtime/readback summaries stay under `metadata.executionSummary`
      - do not leak execution-summary fields into individual `output` items
    - runtime-backed readback now also includes bounded assignment identity:
      - `metadata.taskRunSpecId`
      - task-backed runtime execution now also injects bounded assignment
        context into step execution:
        - `taskContext`
        - `taskStructuredContext`
        - `taskInputArtifacts`
        - dependency-scoped `taskTransfer` from incoming planned handoffs
      - task-backed team planning now also shapes bounded inter-step handoffs
        under handoff `structuredData.taskTransfer`:
        - `title`
        - `objective`
        - `successCriteria`
        - bounded `requestedOutputs`
        - bounded `inputArtifacts`
      - runtime-backed response/recovery readback now also includes bounded
        persisted task assignment identity when a stored `taskRunSpec` exists:
        - response: `metadata.taskRunSpecSummary`
        - recovery detail: `taskRunSpecSummary` on team-run-backed recovery
          detail only
        - public team inspection: `inspection.taskRunSpecSummary`
        - fields:
          - `id`
          - `teamId`
          - `title`
          - `objective`
          - `createdAt`
          - `persistedAt`
          - `requestedOutputCount`
          - `inputArtifactCount`
      - runtime-backed detailed response readback now also includes bounded
        task assignment artifact refs:
        - `metadata.executionSummary.inputArtifactSummary.total`
        - `metadata.executionSummary.inputArtifactSummary.items[*].id`
        - `metadata.executionSummary.inputArtifactSummary.items[*].kind`
        - `metadata.executionSummary.inputArtifactSummary.items[*].title`
        - `metadata.executionSummary.inputArtifactSummary.items[*].path`
        - `metadata.executionSummary.inputArtifactSummary.items[*].uri`
        - terminal readback should use the terminal step's artifact set when
          present, otherwise the latest earlier step with artifacts
      - runtime-backed detailed response readback now also includes bounded
        consumed handoff transfer context:
        - `metadata.executionSummary.handoffTransferSummary.total`
        - `metadata.executionSummary.handoffTransferSummary.items[*].handoffId`
        - `metadata.executionSummary.handoffTransferSummary.items[*].fromStepId`
        - `metadata.executionSummary.handoffTransferSummary.items[*].fromAgentId`
      - `metadata.executionSummary.handoffTransferSummary.items[*].title`
      - `metadata.executionSummary.handoffTransferSummary.items[*].objective`
      - `metadata.executionSummary.handoffTransferSummary.items[*].requestedOutputCount`
      - `metadata.executionSummary.handoffTransferSummary.items[*].inputArtifactCount`
      - response readback prefers stored consumed transfer state when present;
        recovery detail falls back to planned handoff transfer data when no
        stored consumed summary exists
      - runtime-backed detailed response readback now also includes bounded
        orchestration timeline summary from durable shared-state history:
        - `metadata.executionSummary.orchestrationTimelineSummary.total`
        - `metadata.executionSummary.orchestrationTimelineSummary.items[*].type`
        - `metadata.executionSummary.orchestrationTimelineSummary.items[*].createdAt`
        - `metadata.executionSummary.orchestrationTimelineSummary.items[*].stepId`
        - `metadata.executionSummary.orchestrationTimelineSummary.items[*].note`
        - `metadata.executionSummary.orchestrationTimelineSummary.items[*].handoffId`
      - requested-output fulfillment reads now also include
        `metadata.executionSummary.requestedOutputSummary`
        - `total`
        - `fulfilledCount`
        - `missingRequiredCount`
        - bounded per-item `label`
        - bounded per-item `kind`
        - bounded per-item `format`
        - bounded per-item `destination`
        - bounded per-item `required`
        - bounded per-item `fulfilled`
        - bounded per-item `evidence`
      - required requested-output policy reads now also include
        `metadata.executionSummary.requestedOutputPolicy`
        - `status`
        - `message`
        - `missingRequiredLabels`
      - terminal readback uses the terminal step's requested-output contract,
        not older step requests
      - if required requested outputs are still missing at terminal readback,
        the response now reads back as:
        - `status = failed`
        - `metadata.executionSummary.failureSummary.code = requested_output_required_missing`
        - stored runtime/service terminal state should also already be `failed`
          for those same clearly missing-required cases
      - explicit terminal step failure still wins over the derived
        `requested_output_required_missing` fallback
      - if the next runnable step would exceed
        `constraints.providerBudget.maxRequests`, stored runtime/service state
        should fail before execution with:
        - `failure.code = task_provider_request_limit_exceeded`
      - if cumulative stored provider usage already exceeds
        `constraints.providerBudget.maxTokens`, stored runtime/service state
        should fail before the next step executes with:
        - `failure.code = task_provider_token_limit_exceeded`
      - when the stored execution callback reports real usage, response
        readback now also includes:
        - `metadata.executionSummary.providerUsageSummary.ownerStepId`
        - `metadata.executionSummary.providerUsageSummary.generatedAt`
        - `metadata.executionSummary.providerUsageSummary.inputTokens`
        - `metadata.executionSummary.providerUsageSummary.outputTokens`
        - `metadata.executionSummary.providerUsageSummary.reasoningTokens`
        - `metadata.executionSummary.providerUsageSummary.totalTokens`
      - terminal step provider-usage summary wins over older step summaries
      - resumed/drained operator lifecycle reads now also include
        `metadata.executionSummary.operatorControlSummary`
        - `humanEscalationResume.resumedAt`
        - `humanEscalationResume.note`
        - `targetedDrain.requestedAt`
        - `targetedDrain.status`
        - `targetedDrain.reason`
        - `targetedDrain.skipReason`
      - local-action terminal reads now also include
        `metadata.executionSummary.localActionSummary`
      - cancelled terminal reads now also include
        `metadata.executionSummary.cancellationSummary`
      - current hardening checkpoint summary:
        - response metadata stays compact and `stepSummaries` carry per-step
          routing
        - recovery detail stays the lifecycle/timeline surface
        - targeted drain, cancellation fallback, requested-output policy,
          failure precedence, provider-usage precedence, input-artifact
          precedence/fallback, and transfer precedence/fallback are all now
          explicit and test-backed
  - mixed-provider cancelled local-action live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_CANCELLATION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "cancels auracall-cross-service-tooling local action"`
    - current expected posture:
      - initial `auracall-cross-service-tooling` run is `cancelled` with
        `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on ChatGPT:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - step 2 pauses on Grok after requesting one bounded local shell action:
        - `runtimeProfileId = auracall-grok-auto`
        - `service = grok`
      - `POST /status` `localActionControl.resolve-request` with
        `resolution = cancelled`, then `resume-human-escalation`, then
        `drain-run` completes the same team run
      - final stored/readback state includes:
        - `metadata.executionSummary.localActionSummary.counts.cancelled = 1`
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
        `AURACALL_CROSS_SERVICE_CANCELLATION_LIVE_SMOKE_OK`
  - mixed-provider rejected local-action live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_REJECTION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "rejects auracall-cross-service-tooling local action"`
    - current expected posture:
      - initial `auracall-cross-service-tooling` run is `cancelled` with
        `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on ChatGPT:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - step 2 pauses on Grok after requesting one bounded local shell action:
        - `runtimeProfileId = auracall-grok-auto`
        - `service = grok`
      - `POST /status` `localActionControl.resolve-request` with
        `resolution = rejected`, then `resume-human-escalation`, then
        `drain-run` completes the same team run
      - final stored/readback state includes:
        - `metadata.executionSummary.localActionSummary.counts.rejected = 1`
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
          `AURACALL_CROSS_SERVICE_REJECTION_LIVE_SMOKE_OK`
  - mixed-provider approval live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_APPROVAL_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "approves auracall-cross-service-tooling human escalation"`
    - current expected posture:
      - initial `auracall-cross-service-tooling` run is `cancelled` with
        `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on ChatGPT:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - step 2 pauses on Grok after one policy-blocked local shell action
      - existing `POST /status` `resume-human-escalation`, then `drain-run`,
        completes the same team run
      - this is operator approval to continue after a blocked action, not a
        `localActionControl.resolve-request` `approved` mutation
      - final stored/readback state includes:
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
          `AURACALL_CROSS_SERVICE_APPROVAL_LIVE_SMOKE_OK`
  - reverse-order mixed-provider approval live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_REVERSE_APPROVAL_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "approves auracall-reverse-cross-service-tooling human escalation"`
    - current expected posture:
      - initial `auracall-reverse-cross-service-tooling` run is `cancelled`
        with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on Grok:
        - `runtimeProfileId = auracall-grok-auto`
        - `service = grok`
      - step 2 pauses on ChatGPT after one policy-blocked local shell action:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - existing `POST /status` `resume-human-escalation`, then `drain-run`,
        completes the same team run
      - this is operator approval to continue after a blocked action, not a
        `localActionControl.resolve-request` `approved` mutation
      - final stored/readback state includes:
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
        - stored local action remains `rejected` as evidence of the original
          policy stop
      - final terminal step summary
          `AURACALL_REVERSE_CROSS_SERVICE_APPROVAL_LIVE_SMOKE_OK`
  - reverse-order mixed-provider cancelled local-action live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_REVERSE_CANCELLATION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "cancels auracall-reverse-cross-service-tooling local action"`
    - current expected posture:
      - initial `auracall-reverse-cross-service-tooling` run is `cancelled`
        with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on Grok:
        - `runtimeProfileId = auracall-grok-auto`
        - `service = grok`
      - step 2 pauses on ChatGPT after requesting one bounded local shell
        action:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - `POST /status` `localActionControl.resolve-request` with
        `resolution = cancelled`, then `resume-human-escalation`, then
        `drain-run` completes the same team run
      - final stored/readback state includes:
        - `metadata.executionSummary.localActionSummary.counts.cancelled = 1`
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
        `AURACALL_REVERSE_CROSS_SERVICE_CANCELLATION_LIVE_SMOKE_OK`
  - reverse-order mixed-provider rejected local-action live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_REVERSE_REJECTION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "rejects auracall-reverse-cross-service-tooling local action"`
    - current expected posture:
      - initial `auracall-reverse-cross-service-tooling` run is `cancelled`
        with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on Grok:
        - `runtimeProfileId = auracall-grok-auto`
        - `service = grok`
      - step 2 pauses on ChatGPT after requesting one bounded local shell
        action:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - `POST /status` `localActionControl.resolve-request` with
        `resolution = rejected`, then `resume-human-escalation`, then
        `drain-run` completes the same team run
      - final stored/readback state includes:
        - `metadata.executionSummary.localActionSummary.counts.rejected = 1`
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
        `AURACALL_REVERSE_CROSS_SERVICE_REJECTION_LIVE_SMOKE_OK`
  - reverse-order mixed-provider Gemini approval live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_REVERSE_GEMINI_APPROVAL_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "approves auracall-reverse-cross-service-gemini-tooling human escalation"`
    - current expected posture:
      - initial `auracall-reverse-cross-service-gemini-tooling` run is
        `cancelled` with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on Grok:
        - `runtimeProfileId = auracall-grok-auto`
        - `service = grok`
      - step 2 pauses on Gemini after one policy-blocked local shell action:
        - `runtimeProfileId = auracall-gemini-pro`
        - `service = gemini`
      - existing `POST /status` `resume-human-escalation`, then `drain-run`,
        completes the same team run
      - this is operator approval to continue after a blocked action, not a
        `localActionControl.resolve-request` `approved` mutation
      - final stored/readback state includes:
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
        - stored local action remains `rejected` as evidence of the original
          policy stop
      - final terminal step summary
        `AURACALL_REVERSE_CROSS_SERVICE_GEMINI_APPROVAL_LIVE_SMOKE_OK`
  - reverse-order mixed-provider Gemini cancelled local-action live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_REVERSE_GEMINI_CANCELLATION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "cancels auracall-reverse-cross-service-gemini-tooling local action"`
    - current expected posture:
      - initial `auracall-reverse-cross-service-gemini-tooling` run is
        `cancelled` with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on Grok:
        - `runtimeProfileId = auracall-grok-auto`
        - `service = grok`
      - step 2 pauses on Gemini after requesting one bounded local shell
        action:
        - `runtimeProfileId = auracall-gemini-pro`
        - `service = gemini`
      - `POST /status` `localActionControl.resolve-request` with
        `resolution = cancelled`, then `resume-human-escalation`, then
        `drain-run` completes the same team run
      - final stored/readback state includes:
        - `metadata.executionSummary.localActionSummary.counts.cancelled = 1`
        - bounded `operatorControlSummary`
      - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
        `AURACALL_REVERSE_CROSS_SERVICE_GEMINI_CANCELLATION_LIVE_SMOKE_OK`
  - reverse-order mixed-provider Gemini rejected local-action live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_REVERSE_GEMINI_REJECTION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "rejects auracall-reverse-cross-service-gemini-tooling local action"`
    - current expected posture:
      - initial `auracall-reverse-cross-service-gemini-tooling` run is
        `cancelled` with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on Grok:
        - `runtimeProfileId = auracall-grok-auto`
        - `service = grok`
      - step 2 pauses on Gemini after requesting one bounded local shell
        action:
        - `runtimeProfileId = auracall-gemini-pro`
        - `service = gemini`
      - `POST /status` `localActionControl.resolve-request` with
        `resolution = rejected`, then `resume-human-escalation`, then
        `drain-run` completes the same team run
      - final stored/readback state includes:
        - `metadata.executionSummary.localActionSummary.counts.rejected = 1`
        - bounded `operatorControlSummary`
      - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
        `AURACALL_REVERSE_CROSS_SERVICE_GEMINI_REJECTION_LIVE_SMOKE_OK`
  - reverse-order mixed-provider Gemini-to-ChatGPT approval live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_GEMINI_TO_CHATGPT_APPROVAL_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "approves auracall-reverse-cross-service-chatgpt-tooling human escalation"`
    - current expected posture:
      - initial `auracall-reverse-cross-service-chatgpt-tooling` run is
        `cancelled` with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on Gemini:
        - `runtimeProfileId = auracall-gemini-pro`
        - `service = gemini`
      - step 2 pauses on ChatGPT after one policy-blocked local shell action:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - existing `POST /status` `resume-human-escalation`, then `drain-run`,
        completes the same team run
      - this is operator approval to continue after a blocked action, not a
        `localActionControl.resolve-request` `approved` mutation
      - final stored/readback state includes:
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - stored local action remains `rejected` as evidence of the original
          policy stop
      - final terminal step summary
        `AURACALL_GEMINI_TO_CHATGPT_APPROVAL_LIVE_SMOKE_OK`
  - reverse-order mixed-provider Gemini-to-ChatGPT cancelled local-action live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_GEMINI_TO_CHATGPT_CANCELLATION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "cancels auracall-reverse-cross-service-chatgpt-tooling local action"`
    - current expected posture:
      - initial `auracall-reverse-cross-service-chatgpt-tooling` run is
        `cancelled` with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on Gemini:
        - `runtimeProfileId = auracall-gemini-pro`
        - `service = gemini`
      - step 2 pauses on ChatGPT after requesting one bounded local shell
        action:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - `POST /status` `localActionControl.resolve-request` with
        `resolution = cancelled`, then `resume-human-escalation`, then
        `drain-run` completes the same team run
      - final stored/readback state includes:
        - `metadata.executionSummary.localActionSummary.counts.cancelled = 1`
        - bounded `operatorControlSummary`
      - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
        `AURACALL_GEMINI_TO_CHATGPT_CANCELLATION_LIVE_SMOKE_OK`
  - reverse-order mixed-provider Gemini-to-ChatGPT rejected local-action live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_GEMINI_TO_CHATGPT_REJECTION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "rejects auracall-reverse-cross-service-chatgpt-tooling local action"`
    - current expected posture:
      - initial `auracall-reverse-cross-service-chatgpt-tooling` run is
        `cancelled` with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on Gemini:
        - `runtimeProfileId = auracall-gemini-pro`
        - `service = gemini`
      - step 2 pauses on ChatGPT after requesting one bounded local shell
        action:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - `POST /status` `localActionControl.resolve-request` with
        `resolution = rejected`, then `resume-human-escalation`, then
        `drain-run` completes the same team run
      - final stored/readback state includes:
        - `metadata.executionSummary.localActionSummary.counts.rejected = 1`
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
        `AURACALL_GEMINI_TO_CHATGPT_REJECTION_LIVE_SMOKE_OK`
  - mixed-provider Gemini approval live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_GEMINI_APPROVAL_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "approves auracall-cross-service-gemini-tooling human escalation"`
    - current expected posture:
      - initial `auracall-cross-service-gemini-tooling` run is `cancelled` with
        `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on ChatGPT:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - step 2 pauses on Gemini after one policy-blocked local shell action:
        - `runtimeProfileId = auracall-gemini-pro`
        - `service = gemini`
      - existing `POST /status` `resume-human-escalation`, then `drain-run`,
        completes the same team run
      - this is operator approval to continue after a blocked action, not a
        `localActionControl.resolve-request` `approved` mutation
      - final stored/readback state includes:
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
  - mixed-provider Gemini rejected local-action live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_GEMINI_REJECTION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "rejects auracall-cross-service-gemini-tooling local action"`
    - current expected posture:
      - initial `auracall-cross-service-gemini-tooling` run is `cancelled`
        with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on ChatGPT:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - step 2 pauses on Gemini after requesting one bounded local shell
        action:
        - `runtimeProfileId = auracall-gemini-pro`
        - `service = gemini`
      - `POST /status` `localActionControl.resolve-request` with
        `resolution = rejected`, then `resume-human-escalation`, then
        `drain-run` completes the same team run
      - final stored/readback state includes:
        - `metadata.executionSummary.localActionSummary.counts.rejected = 1`
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
        `AURACALL_CROSS_SERVICE_GEMINI_REJECTION_LIVE_SMOKE_OK`
  - mixed-provider Gemini cancelled local-action live proof:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_GEMINI_CANCELLATION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts -t "cancels auracall-cross-service-gemini-tooling local action"`
    - current expected posture:
      - initial `auracall-cross-service-gemini-tooling` run is `cancelled`
        with `finalOutputSummary = paused for human escalation`
      - step 1 succeeds on ChatGPT:
        - `runtimeProfileId = wsl-chrome-2`
        - `service = chatgpt`
      - step 2 pauses on Gemini after requesting one bounded local shell
        action:
        - `runtimeProfileId = auracall-gemini-pro`
        - `service = gemini`
      - `POST /status` `localActionControl.resolve-request` with
        `resolution = cancelled`, then `resume-human-escalation`, then
        `drain-run` completes the same team run
      - final stored/readback state includes:
        - `metadata.executionSummary.localActionSummary.counts.cancelled = 1`
        - bounded `operatorControlSummary`
        - bounded resumed execution timeline on
          `GET /status/recovery/<run_id>`
      - final terminal step summary
        `AURACALL_CROSS_SERVICE_GEMINI_CANCELLATION_LIVE_SMOKE_OK`
  - optional recovery summary:
    - `curl http://127.0.0.1:8080/status?recovery=true`
    - optional per-run detail:
      - `curl http://127.0.0.1:8080/status/recovery/<run_id>`
    - current expected recovery fields include:
      - `reclaimableRunIds`
      - `recoverableStrandedRunIds`
      - `activeLeaseRunIds`
      - `strandedRunIds`
      - `cancelledRunIds`
      - `idleRunIds`
      - `activeLeaseHealth.freshRunIds`
      - `activeLeaseHealth.staleHeartbeatRunIds`
      - `activeLeaseHealth.suspiciousIdleRunIds`
      - `activeLeaseHealth.reasonsByRunId`
      - `leaseRepair.locallyReclaimableRunIds`
      - `leaseRepair.inspectOnlyRunIds`
      - `leaseRepair.notReclaimableRunIds`
      - `leaseRepair.repairedRunIds`
      - `leaseRepair.reasonsByRunId`
      - `metrics.reclaimableCount`
      - `metrics.recoverableStrandedCount`
      - `metrics.activeLeaseCount`
      - `metrics.strandedCount`
      - `metrics.idleCount`
      - `metrics.actionableCount`
      - `metrics.nonExecutableCount`
      - `localClaim.runnerId`
      - `localClaim.selectedRunIds`
      - `localClaim.blockedRunIds`
      - `localClaim.notReadyRunIds`
      - `localClaim.unavailableRunIds`
      - `localClaim.statusByRunId`
      - `localClaim.reasonsByRunId`
    - startup recovery/batch-drain reporting now collapses repeated skipped
      states per run and suppresses follow-up terminal `no-runnable-step`
      entries after a run already executed in the same bounded batch
    - `GET /status/recovery/<run_id>` stays a separate read-only detail surface
      so `/status?recovery=true` can stay compact
    - compact summary contract:
      - `GET /status?recovery=true` should not grow per-run detail fields such
        as:
        - `taskRunSpecId`
        - `orchestrationTimelineSummary`
        - `handoffTransferSummary`
        - `leaseHealth`
    - compact local-claim contract:
      - top-level `/status.localClaimSummary` stays the direct-run local-claim
        snapshot
      - `recoverySummary.localClaim` is the recovery-filtered aggregate that
        follows `sourceKind=direct|team-run|all`
    - compact server-posture contract:
      - top-level `/status.runner` and `/status.backgroundDrain` stay the
        server posture snapshot
      - recovery/source filters do not reshape them into recovery-scoped
        fields
      - they continue to describe the current server process even when
        `recoverySummary` is filtered to `team-run` or `all`
    - the per-run detail surface now also includes bounded assignment identity:
      - `taskRunSpecId`
    - the per-run detail surface now also includes bounded orchestration
      timeline summary from durable shared-state history:
      - `orchestrationTimelineSummary.total`
      - `orchestrationTimelineSummary.items[*].type`
      - `orchestrationTimelineSummary.items[*].createdAt`
      - `orchestrationTimelineSummary.items[*].stepId`
      - `orchestrationTimelineSummary.items[*].note`
      - `orchestrationTimelineSummary.items[*].handoffId`
    - the per-run detail surface now also includes bounded consumed handoff
      transfer context when incoming planned handoffs carry task-aware transfer
      data:
      - `handoffTransferSummary.total`
      - `handoffTransferSummary.items[*].handoffId`
      - `handoffTransferSummary.items[*].fromStepId`
      - `handoffTransferSummary.items[*].fromAgentId`
      - `handoffTransferSummary.items[*].title`
      - `handoffTransferSummary.items[*].objective`
      - `handoffTransferSummary.items[*].requestedOutputCount`
      - `handoffTransferSummary.items[*].inputArtifactCount`
    - the per-run detail surface now also reports active-lease health under
      `leaseHealth`, including whether the lease looks fresh, stale-heartbeat,
      or suspiciously idle
    - bounded host drain and startup recovery logs now also break out
      `stale-heartbeat` separately; `suspiciously-idle` remains read-only
    - `POST /status` now also supports one bounded stale-heartbeat repair
      action:
      - `{"leaseRepair":{"action":"repair-stale-heartbeat","runId":"..."}}`
      - it succeeds only when the run is currently `stale-heartbeat` and the
        durable repair posture is already `locally-reclaimable`
      - successful action results should also include bounded
        `reconciliationReason`
      - suspiciously-idle leases remain diagnostic-only and should return 409
    - recovery summary/detail now also surface bounded operator attention for
      stale-heartbeat and suspiciously-idle active-lease cases:
      - `recoverySummary.attention.staleHeartbeatInspectOnlyRunIds`
      - `recoverySummary.attention.reasonsByRunId`
      - per-run `attention.kind = stale-heartbeat-inspect-only|suspiciously-idle`
    - recovery summary/detail now also surface bounded cancellation readback:
      - `recoverySummary.cancelledRunIds`
      - `recoverySummary.cancellation.reasonsByRunId`
      - per-run `cancellation.cancelledAt`
      - per-run `cancellation.source`
      - per-run `cancellation.reason`
    - startup recovery logs now also emit bounded stale-heartbeat attention
      when unrepaired inspect-only cases remain:
      - `attention=stale-heartbeat-inspect-only:<count>`
      - `attention=suspiciously-idle:<count>` when active leases look
        idle-but-not-stale
    - the per-run detail surface now also reports the configured local runner's
      claim posture under `localClaim`, including whether it is currently
      selected for local claiming
    - host recovery no longer treats every expired active lease as
      automatically reclaimable
    - bounded host lease repair now first consults persisted runner liveness:
      - stale or missing runner + expired lease => locally reclaimable
      - active runner + expired lease => still reported as `active-lease`
    - when startup recovery is capped, only still-executable work should report
      `limit-reached`; idle and active-lease runs should keep their real skip
      reasons
    - mixed-batch host drain now prioritizes actionable work in this order:
      - runnable
      - recoverable stranded
      - then non-executable classes
    - within each class, scheduling is intentionally oldest-first by
      `createdAt`
    - when both actionable classes are present and `maxRuns > 1`, one slot is
      reserved for the oldest recoverable-stranded run and the remaining slots
      go to oldest runnable runs
    - startup recovery logs now also emit aggregate metrics aligned with the
      same vocabulary; runner-aware startup skips may now also surface
      `claim-owner-unavailable` when the local runner cannot safely claim work:
      - `deferred-by-budget`
      - `active-lease`
      - `stale-heartbeat`
      - `stranded`
      - `idle`
    - current mixed-batch priority is:
      - runnable
      - recoverable stranded
      - then non-executable classes
- Service-volatility refactor rule: do not treat this as a pure config shuffle. Every extraction phase must keep a named regression set green and every service slice must declare its own acceptance bar before implementation starts. See [service-volatility-refactor-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/plans/0012-2026-04-14-service-volatility-refactor.md) and [service-volatility-service-plan-template.md](/home/ecochran76/workspace.local/auracall/docs/dev/service-volatility-service-plan-template.md).
- Gemini unit/regression: `pnpm vitest run tests/gemini.test.ts tests/gemini-web`.
- Gemini support matrix checkpoint:
  - API:
    - text: supported
    - streaming: supported
    - search/tooling: partially supported through `web_search_preview -> googleSearch`
    - attachments/files: not yet documented as a first-class Gemini API surface
    - image generation/editing: not yet documented as a first-class Gemini API surface
- Gemini web/browser:
    - text: supported
    - attachments: supported
    - YouTube: supported
    - generate-image: supported
    - edit-image: supported
    - Gem URL targeting: supported
    - cookie/login flow: supported
    - conversation context read: supported for canonical `messages[]`, visible
      sent `files[]`, and proven generated `artifacts[]`
    - conversation files list: supported for visible direct `/app/<id>` upload
      chips
    - conversation files fetch: partially supported for visible direct
      `/app/<id>` upload chips, including text-file chips and uploaded-image
      chips
    - account files: not supported
    - conversation artifact lane: closed for now at the proven
      image/music/video/canvas/deep-research surfaces; only reopen for
      regressions or newly proven live DOM surfaces
  - browser doctor: partially supported
      - `auracall doctor --target gemini --json` now reports live account
        identity plus detected Gemini feature signature when a managed Gemini
        browser session is alive
      - when browser-tools sees a blocking page such as `google.com/sorry`,
        CAPTCHA / reCAPTCHA, Cloudflare, or another human-verification
        interstitial, the embedded runtime report now carries a first-class
        blocking classification instead of only raw page text
      - package-owned `browser-tools probe|doctor` now also exit nonzero on
        those blocking pages instead of quietly reporting them as ordinary page
        probes
      - `auracall doctor --target ...` and `auracall features --target ...`
        now exit nonzero on those blocking surfaces and tell the operator to
        clear the page manually before retrying
      - `auracall features snapshot|diff --target ...` now also stop early on
        those blocking surfaces instead of writing misleading anti-drift output
      - `auracall setup --target ...` now also checks for a blocking surface
        after login and before live verification, so setup stops early instead
        of burning a verification run on a page that already needs manual
        clearance
      - `auracall login --target ...` now checks the managed browser after
        launch and exits nonzero with the same manual-clear guidance if the
        page is already blocked
      - shared browser execution now also does one early blocking-page probe
        after navigation settles, so headful browser runs stop before deeper
        automation on obviously blocked pages and leave the browser open for
        manual clearance
      - `auracall features --target gemini --json` is now the first-class live
        feature-discovery surface for Gemini tools, toggles, and upload paths
      - when browser-service can gather a live Gemini `uiList` census, doctor
        now merges that runtime evidence into `featureStatus.detected.evidence`
        instead of silently trusting a weaker provider-local fallback probe
      - full live selector diagnosis is still not implemented in
        `auracall doctor`, but package-owned DOM discovery is now available via
        `pnpm tsx scripts/browser-tools.ts ... search`
      - current live Gemini drawer proof on `default`:
        - `search --class-includes toolbox-drawer-button --text Tools`
          finds the real `Tools` opener
        - after opening the drawer, `search --class-includes toolbox-drawer-item-list-button --role menuitemcheckbox`
          finds:
          - `Create image`
          - `Canvas`
          - `Deep research`
          - `Create video`
          - `Create music`
          - `Guided learning`
        - `search --aria-label "Personal Intelligence" --role switch`
          returns the live switch state
        - `ls --limit-per-kind 10`
          returns the broader page census:
          - drawer surface under `menus`
          - drawer rows under `menuItems`
          - `Personal Intelligence` under `switches`
          - prompt composer under `inputs`
          - upload surfaces under `uploadCandidates`
          - hidden chooser paths under `fileInputs` when present
          - heuristic interaction hints such as:
            - `hard-click-preferred`
            - `hover-or-pointer-state-likely`
            - `file-chooser-candidate`
- Browser feature discovery:
  - `auracall features --target gemini --json`
    - returns `contract: "auracall.browser-features"`
    - current live `default` proof includes:
      - `modes`
        - `canvas`
        - `create image`
        - `create music`
        - `create video`
        - `deep research`
      - `toggles.personal intelligence = true`
      - browser-tools `uiList` evidence with:
        - `menus = 1`
        - `menuItems = 6`
        - `switches = 1`
        - `uploadCandidates = 3`
  - `auracall features snapshot --target gemini --json`
    - writes under:
      - `~/.auracall/feature-snapshots/<auracallProfile>/gemini/`
    - updates:
      - `latest.json`
  - `auracall features diff --target gemini --json`
    - compares live discovery to the latest saved snapshot by default
    - current live `default` proof returns:
      - `changed = false`
  - treat unsupported or undocumented cells as non-commitments until the Gemini completion plan advances them.
- Browser smokes: `pnpm test:browser` (builds, checks DevTools port 45871 or `AURACALL_BROWSER_PORT`, then runs headful browser smokes with GPT-5.2 for most cases and GPT-5.2 Pro for the reattach + markdown checks). Requires a signed-in Chrome profile; runs headful but now starts Chrome with `browser.hideWindow` as a best-effort minimized/no-focus-steal launch. On the current WSL/X11 stack, the active window stays unchanged even though DevTools may still report `windowState: normal`.
- ChatGPT skill capability fixtures must keep label-only `skills[]` evidence at
  `availability=unknown` and `invocationMode=unknown`. Stable installation,
  activation, identity, version, and invocation require separate exact-account
  evidence; developer-app fixtures cannot substitute.
- Grok browser smoke: `pnpm test:grok-smoke` (requires an active Grok session; uses the Aura-Call browser registry or `AURACALL_BROWSER_PORT`).
- Grok acceptance bar: run `DISPLAY=:0.0 pnpm test:grok-acceptance` on the authenticated WSL Grok profile before calling Grok browser support "fully functional." The script executes the canonical WSL-primary checklist from `docs/dev/smoke-tests.md` and covers project CRUD, instructions/files CRUD, project-knowledge cache freshness, account-wide `/files` CRUD plus `account-files` cache freshness, project conversation CRUD, root/non-project conversation-file parity, append-only `conversations files add`, markdown capture, the medium-file guard, and cleanup. If Grok's root conversation list lags after a browser-file prompt, the runner now logs that and falls back to the fresh browser session `conversationId` so the rest of the CRUD path still gets validated on the real new conversation.
- The ChatGPT and Grok acceptance scripts share
  `scripts/lib/browserAcceptanceHarness.ts` for process, deadline, output/exit,
  JSON, optional state, and final-evidence mechanics. Provider commands,
  assertions, retry/guard rules, phases, and cleanup decisions remain in the
  scripts. Run `pnpm vitest run tests/scripts.browserAcceptanceHarness.test.ts
  tests/scripts.browserAcceptanceStructure.test.ts` for the provider-free
  contract; that suite does not replace either authenticated live acceptance
  bar.
- ChatGPT project lifecycle + project-management CRUD is green on the authenticated managed WSL Chrome path: list/create/rename/delete, create-time `--memory-mode global|project`, `projects files add|list|remove --target chatgpt`, and `projects instructions get|set --target chatgpt`. Source add/remove now verify success against a fresh `Sources` reload rather than trusting only the first immediate post-picker row, and instructions writes verify by reopening the project settings sheet and confirming the persisted textarea value. The project surface is effectively complete for current native UI purposes; clone stays out of scope unless ChatGPT later exposes a real clone action. Historical closure notes now live in `docs/dev/plans/legacy-archive/0019-2026-04-08-chatgpt-conversation-surface-plan.md`.
- ChatGPT root conversation list/read/rename/delete are green on the authenticated managed WSL Chrome path, and the conversation context surface now includes more than sent user-turn file tiles. `auracall conversations files list <conversationId> --target chatgpt` still returns stable synthetic refs for real sent uploads, but `auracall conversations context get <conversationId> --target chatgpt --json-only` now also enriches ChatGPT context with `sources[]` from assistant citation/content-reference metadata plus `artifacts[]` for downloadable `sandbox:/...` outputs, generated `image_asset_pointer` artifacts, `ada_visualizations` table/spreadsheet artifacts, spreadsheet-like `.csv` / `.xlsx` markdown downloads, DOM-only assistant-turn `button.behavior-btn` artifacts, and canvas/textdoc blocks. Live proof on `69c3e6d0-3550-8325-b10e-79d946e31562` returns file-backed `sources[]` plus downloadable artifacts such as `updated skill.zip`, `combined JSON extraction`, and `combined BibTeX extraction`; live proof on image chat `69bc77cf-be28-8326-8f07-88521224abeb` returns four `image` artifacts with `sediment://...` asset pointers plus size/dimensions and generation metadata; live proof on CSV/table chat `bc626d18-8b2e-4121-9c4a-93abb9daed4b` returns two `spreadsheet` artifacts backed by ChatGPT `file_id`s; live proof on spreadsheet-download chat `69ca9d71-1a04-8332-abe1-830d327b2a65` returns `parabola_trendline_demo.xlsx` as a `spreadsheet` artifact; live proof on the DOCX + canvas chat `69caa22d-1e2c-8329-904f-808fb33a4a56` now fills `canvas.metadata.contentText` from the visible textdoc DOM; and live proof on the “vibe coding” chat `69bded7e-4a88-8332-910f-cab6be0daf9b` now returns `artifactCount = 86` from the assistant-turn button surface. The important implementation nuance is that direct in-page `fetch('/backend-api/conversation/<id>')` can return a JSON 404 even on a page that visibly hydrates correctly, so the adapter now falls back to CDP `Network.responseReceived` + `Network.loadingFinished` + `getResponseBody` while one governed fallback navigation reacquires the exact conversation route, even when ChatGPT has moved the active tab home. Another important artifact nuance is that many inline binary download buttons do not use fetch/XHR at all; a native click programmatically triggers an anchor click to a signed `backend-api/estuary/content?id=file_...` URL. The root rename repair still matters because ChatGPT's current header `Open conversation options` menu is not a rename surface; rename must come from the sidebar-row `Open conversation options for ...` menu on the home/list page, the edit field that appears there is just a plain visible `input[type=\"text\"]`, and the authoritative completion signal is that the same conversation id reappears as the top root-list row with the new title after a short lag. Root delete now uses that same list-first row surface with header delete only as fallback, standalone `auracall delete <conversationId> --target chatgpt` accepts a raw fresh ChatGPT conversation id directly, and the full guarded `scripts/chatgpt-acceptance.ts` runner is now green end to end even when this account hits real ChatGPT cooldowns during rename/delete cleanup. For project chats, keep the project page conversation list as the authoritative surface; the abbreviated sidebar subset shown while a project is selected is not the full catalog. For real small-text upload validation, force native uploads with `--browser-attachments always`; under `auto`, ChatGPT can inline the file content into the prompt and never create a real attachment tile. Treat those conversation files as read-only after send: users can remove them from the composer before sending, but durable delete belongs to ChatGPT project `Sources`, not post-send conversation history.
- ChatGPT now has an opt-in artifact materialization path: `auracall conversations artifacts fetch <conversationId> --target chatgpt`. On the current managed WSL Chrome profile, serialized live runs materialize generated images into `conversation-attachments/<conversationId>/files/.../*.png`, inline `ada_visualizations` table artifacts into CSVs in the same cache tree, visible textdoc/canvas blocks into text files when `contentText` is present or can be filled from the DOM, and signed anchor-backed binary downloads into real files by capturing the generated `backend-api/estuary/content?id=file_...` URL and fetching it directly. Each run also writes a sidecar `conversation-attachments/<conversationId>/artifact-fetch-manifest.json` so operators can inspect per-artifact `materialized|skipped|error` results without changing the existing attachment manifest shape. Live proof:
  - `69bc77cf-be28-8326-8f07-88521224abeb` -> `artifactCount = 4`, `materializedCount = 4`
  - `bc626d18-8b2e-4121-9c4a-93abb9daed4b` -> `artifactCount = 2`, `materializedCount = 2`
  - `69caa22d-1e2c-8329-904f-808fb33a4a56` -> `artifactCount = 2`, `materializedCount = 2` (`comment_demo.docx` + `Short Document With Comments.txt`)
  - `69ca9d71-1a04-8332-abe1-830d327b2a65` -> `artifactCount = 1`, `materializedCount = 1` (`parabola_trendline_demo.xlsx`)
  - `69d04b50-3c88-8325-8240-0d838d47ee50` -> `artifactCount = 2`, `materializedCount = 1` (`auracall-artifact-smoke-oxmhrl.docx`)
  - `69d061ea-5098-8326-a2e4-70e38d845190` -> `artifactCount = 1`, `materializedCount = 1` (`auracall-identity-matrix-qmrqpe.xlsx`)
  - `69d06243-62f8-832f-8fc7-cba9e0148044` -> `artifactCount = 1`, `materializedCount = 1` (`Kitten enjoying ice skating fun.png`)
  The workbook case matters because ChatGPT exposes it through the embedded spreadsheet card's unlabeled header button rather than a filename-matching behavior button; Aura-Call now uses that fallback for `sandbox:/...xlsx` spreadsheet artifacts. The earlier canvas sample `69c8a0fc-c960-8333-8006-c4d6e6704e6e` no longer reproduces a live canvas artifact on this account, so do not use it as a current smoke. Also, do not run multiple live ChatGPT artifact fetches in parallel against the same managed browser; they share one active signed-in tab and can interfere with each other's navigation/state.
  Sequential artifacts within one fetch are different: Aura-Call awaits each
  transfer and closes its scoped provider session before binding the next one.
  Deep Research Word/PDF export also separates the synchronous `Export` click
  from exact option selection: Node closes that iframe binding, waits, and
  reacquires a fresh target/context before the next synchronous click. Never
  await a page-owned timer across the export-menu DOM transition; Chromium can
  collect that execution-context Promise even though the menu opened.
  Provider-free coverage must include at least three distinct artifact paths so
  title/URI reconciliation cannot collapse the settlement fixture.
  One current side finding from the fresh generated-image proof: the direct browser-mode wrapper appeared to linger after the image artifact was already visible and materializable via `conversations context get` / `conversations artifacts fetch`. Record that as a later follow-up, not a current blocker.
- ChatGPT serialized full-context ingestion has now also been re-proven on a small representative chat set where each conversation was read first and then materialized:
  - `69bc77cf-be28-8326-8f07-88521224abeb` -> context `messages = 4`, `files = 1`, `sources = 0`, `artifacts = 4`; artifact fetch `materializedCount = 4`
  - `69caa22d-1e2c-8329-904f-808fb33a4a56` -> context `messages = 4`, `files = 0`, `sources = 0`, `artifacts = 2`, `canvasArtifacts = 1`; artifact fetch `materializedCount = 2`
  - `69ca9d71-1a04-8332-abe1-830d327b2a65` -> context `messages = 4`, `files = 0`, `sources = 0`, `artifacts = 1`, `spreadsheetArtifacts = 1`; artifact fetch `materializedCount = 1`
  During `conversations context get` and `conversations artifacts fetch`, the ChatGPT adapter now watches for a visible `Too many requests` / `...too quickly` dialog, dismisses it, waits about 15 seconds, and retries once before surfacing a real rate-limit failure. This particular serialized smoke set stayed below the throttle threshold, so the recovery path was present but did not have to fire live.
- ChatGPT project-scoped conversation list/rename/delete should now also be treated as live on the managed WSL Chrome path when `--project-id <g-p-...>` is supplied: the provider prefers the project page `Chats` tabpanel (`SECTION -> OL -> LI` in the main content area) over the sidebar subset when scraping project chats or verifying project-scoped rename/delete, and the phased guarded acceptance runner has now re-proven that slice live.
- ChatGPT browser-mode dialog selection tracks the live composer surface. New tests and fixtures should use the durable `chatgpt:fast`, `chatgpt:reasoning*`, `chatgpt:premium`, or `chatgpt:legacy` selectors; versioned GPT-5.2 and Sol/Terra/Luna spellings are compatibility cases only. The current compact provider label `6Pro` is semantically equivalent to `6 Pro` for exact premium-family matching, but AuraCall preserves `6Pro` as the observed label and continues to reject `6Power`, generic `Pro`, and effort controls. `--browser-composer-tool <tool>` applies ChatGPT add-ons like `web-search`, `canvas`, and dynamically discovered connected apps from the `Add files and more` menu. Connected apps accept the discovery stable ID (for example `chatgpt.apps.litscout`) or an exact unique label; aliases such as `google-drive` remain compatibility cases. File upload remains the normal attachment flow (`--file` / composer upload), not a composer-tool selection.
- ChatGPT effort-control fixtures must distinguish absence from ambiguity. An exact `chip-not-found` result may use the provider default only for `light`/Instant/default-fast intent. Medium, High, and Extra High remain fail-closed when the chip is absent, and every intent remains fail-closed when a control is present but its menu, requested option, disabled state, or outcome is ambiguous. A missing optional control must not be recorded as a selected thinking time.
- Provider-free connected-capability coverage: `pnpm vitest run tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptEcosystemMention.test.ts tests/browser/chatgptPromptAdapter.test.ts tests/workbenchCapabilities.test.ts tests/runtime.configuredExecutor.test.ts`. The fixtures must prove stable-ID and exact-label resolution for an unlisted future app, bounded missing/ambiguous/disconnected/unverified failures, an empty conversation-bound composer without navigation, exact pill revalidation immediately before Send, and requested-versus-observed receipt projection. Keep the installed ChatGPT acceptance separate and bounded to one already-connected app on its retained tab; do not refresh, navigate, connect, or approve access as part of that acceptance.
- ChatGPT existing-conversation tool state is now an inspected runtime surface, not just a click side effect: browser runs persist the actual selected add-on in session metadata as `browser.runtime.composerTool` (for example `web search`) and its bounded requested-versus-observed identity as `browser.runtime.composerCapability`. Final ChatGPT browser session metadata also persists the normalized `conversationId` alongside `tabUrl`, which makes prompt-matched acceptance/debug lookups reliable.
- ChatGPT live browser work now carries a persisted profile-scoped guard under `~/.auracall/cache/providers/chatgpt/__runtime__/rate-limit-<profile>.json`: mutating ChatGPT llmservice CRUD operations are spaced apart automatically, ChatGPT browser-mode prompt runs consult the same guard before sending another live write, and both paths now also enforce a rolling per-profile write budget before ChatGPT has a chance to surface a visible `Too many requests` dialog. If the live UI still does expose a `Too many requests` / `...too quickly` failure, later ChatGPT live CRUD or browser-mode calls fail fast on that cooldown instead of continuing to hammer the account from fresh CLI processes.
- Provider-free ChatGPT terminal rate-limit reconciliation:
  `pnpm vitest run tests/browser/chatgptRateLimitReconciliation.test.ts tests/browser/chatgptRateLimitGuard.test.ts tests/browser/browserModeExports.test.ts`.
  This proves bounded delayed detection on the leased and sibling same-endpoint
  targets, exclusion of unrelated targets, sibling-client cleanup, persisted
  browser-profile cooldown, and explicit non-retryability for observed and
  uncertain provider effects. It does not send a provider request.
- ChatGPT context/artifact read paths now also have local dialog recovery inside the provider adapter itself: if ChatGPT throws a visible rate-limit modal during `conversations context get` or `conversations artifacts fetch`, Aura-Call dismisses that modal, pauses briefly, and retries once before letting the higher-level persisted guard take over.
- Remaining Grok breadth work after the acceptance bar is archived in `docs/dev/plans/legacy-archive/0024-2026-04-08-grok-remaining-crud-plan.md`. Conversation-scoped file read/list/cache parity is now live for both project and non-project conversations via `auracall conversations files list <conversationId> --target grok [--project-id <id>]`; any resumed mutation follow-up should treat that archive note as background only.
- Interactive browser onboarding: `pnpm tsx bin/auracall.ts wizard` (preferred first-run path; detects candidate browser/profile sources, writes a browser-profile-backed `~/.auracall/config.json` entry using `browserFamilies.<name>` + `profiles.<name>.browserFamily`, then hands off to the normal setup/login/verification flow). On WSL, prefer the WSL Chrome choice first and keep that primary setup on the Aura-Call `default` profile; treat Windows Chrome as an advanced/manual-debug path in a separate named profile until a live DevTools endpoint is proven.
- Browser profile/setup inspection: `pnpm tsx bin/auracall.ts doctor --target grok --local-only --prune-browser-state` reports browser provenance and Chrome Google sign-in separately. Omit `--local-only` to obtain provider-app account evidence and a session-bound provider-session proof. Contract version 2 treats Chrome sign-in as informational only; it cannot satisfy configured-provider-account authorization.
- Provider-session authority regression: `pnpm vitest run tests/browser/providerSessionAuthority.test.ts tests/browser/providerSessionAuthorityStructure.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/runtime.historyMaterializationService.test.ts tests/browser/profileDoctor.test.ts`. This provider-free packet covers browser/account cross-products, missing versus conflicting dimensions, ChatGPT vocabulary normalization, process/target invalidation, old-path removal, and persisted redacted proof summaries.
- Scriptable browser onboarding: `pnpm tsx bin/auracall.ts setup --target grok` (inspects the managed profile, opens the managed login profile if needed, preserves existing managed profile state, then sends a real verification prompt through that same profile). The setup report now includes the detected signed-in account for managed ChatGPT/Grok sessions. Add `--force-reseed-managed-profile` if you explicitly want to rebuild the managed profile from the source profile before login. Add `--json` for a machine-readable `auracall.browser-setup` contract; it embeds the before/after `auracall.browser-doctor` reports plus explicit login/verification step status.
- Alternate-source bootstrap test: add `--browser-bootstrap-cookie-path <path>` to `auracall setup` / `auracall login` when you want to seed the managed Aura-Call profile from a different Chromium profile (for example Windows Brave) while still launching WSL Chrome at runtime.
- If the alternate source lives on Windows and the Chromium `Network/Cookies` DB is unreadable from WSL, expect the managed profile bootstrap to copy non-cookie auth state only; the browser can still launch, but CRUD/auth verification may stay guest-only until you sign in once in the Aura-Call-managed profile.
- Grok context sources smoke: `pnpm tsx scripts/verify-grok-context-sources.ts <conversationId> [projectId]` (validates `sources[]` extraction from inline links + Sources sidebar accordions).
- Grok context CLI source parity smoke:
  - live: `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations context get <conversationId> --target grok --json-only | jq '.sources | length'`
  - cache: `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache context get <conversationId> --provider grok | jq '.context.sources | length'`
- Cache context list smoke (bounded + bannerless for automation): `pnpm tsx bin/auracall.ts cache context list --provider grok --limit 5 --json-only`
- Cache context keyword search smoke: `pnpm tsx bin/auracall.ts cache context search "oracle" --provider grok --limit 5`.
- Cache context semantic search smoke: `OPENAI_API_KEY=... pnpm tsx bin/auracall.ts cache context semantic-search "oracle" --provider grok --limit 5`.
- Asset readback parity smoke: `pnpm run smoke:asset-readback-parity` checks
  one known media generation through installed `auracall api archive`,
  installed `auracall api search`, and installed MCP `search_projection`. Use
  `-- --media-generation-id <id>` to target a different durable media
  generation that should have an available generated artifact.
- Operator Search UX smoke: `pnpm run smoke:operator-search-ux` rebuilds the
  operator bundle, starts a fixture local API server, and uses Chromium to
  verify the Search dashboard's URL-backed cache-state filters, cached-assets
  toggle, copy-current-search-url action, and mobile no-overflow behavior
  without provider work. Set `AURACALL_OPERATOR_UX_SMOKE_CHROME_PATH` if the
  local Chromium executable is not on one of the default Linux paths.
- Archive materialization job filter smoke:
  `pnpm run smoke:archive-materialization-jobs` seeds fixture queued,
  succeeded, skipped, and failed async materialization jobs in an isolated
  AuraCall home, then verifies HTTP, CLI-helper, and MCP job list/status
  filters plus `/v1/search` asset-availability reconciliation before and after
  a materialization job completes, without provider or browser work.
- History-backed materialization unit coverage is deterministic and browser-free:
  `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts tests/runtime.historyMaterializationService.test.ts tests/runtime.historyArchiveItems.test.ts tests/runtime.searchProjectionService.test.ts tests/cli/apiHistoryMaterializationCommand.test.ts tests/mcp.historyMaterialization.test.ts tests/http.responsesServer.test.ts tests/mcp.server.test.ts --maxWorkers 1 --testNamePattern "history materialization|account history materialization|history-backed|history-materialized|mcp server service wiring|ChatGPT account mirror metadata collector"`.
  The attempt-lifecycle contract is additionally locked by
  `tests/runtime.historyMaterializationAttemptStructure.test.ts` and focused
  history-service cases: one selected handoff must own refresh/provider
  ordering, target and metric verification, awaited evidence persistence,
  phase projection, durable receipt construction, and receipt-derived budget
  and provider-guard accounting. Repeat provider work within one attempt must
  reuse the exact context object. A target mismatch or evidence-write failure
  must leave the terminal job with no accepted result or attempt receipt.
  Candidate-observability coverage additionally locks a fixture with seven
  globally missing-local assets, three eligible conversation candidates, and
  two selected candidates after within-job family deduplication/budget. The
  same public-result fixture locks the conversation-unit `candidateFunnel`,
  including exclusive pre/post reason counts and both arithmetic invariants;
  an adjacent fixture distinguishes already-complete rows from terminal
  asset-family rows. The fixture also binds a plain ChatGPT request identity to
  an equivalent composite catalog identity. Provider-aware tenant-binding
  coverage separately rejects conflicting, missing, malformed, and
  incomparable identities. Run
  `pnpm vitest run tests/runtime.historyMaterializationService.test.ts tests/accountMirror/completionService.test.ts tests/cli/apiStatusCommand.test.ts`
  to verify result metrics, completion hydration/persistence, legacy zero
  defaults, and CLI `/status` projection without provider work.
  Terminal-family coverage in the same history-materialization suite also
  binds explicit provider asset namespaces. A readable terminal entry whose
  provider ID starts `canvas:` must emit the same `artifact:canvas:<title>`
  exclusion as the current catalog before `maxItems` is consumed; unknown
  namespaces remain fail-closed as `unknown`.
  Readable archive-family admission uses the same positive provider-aware
  tenant matcher as current-catalog admission. The archived-family fixture
  binds a plain request identity to the same tenant's composite
  service-account identity and requires the readable family exclusion before
  provider work. Missing, malformed, incomparable, conflicting-provider, and
  provider-unknown identity evidence remains fail-closed; the adjacent
  `tests/accountMirror/tenantBinding.test.ts` contract locks those matcher
  boundaries without provider work.
  For a current-cache admission readback, use the cached catalog plus read-only
  archive/job snapshots, an in-memory job store, `maxItems=0`, and a provider
  callback that throws if invoked. The Plan 0192 receipt accounted for all 31
  rows as 1 eligible and 30 `noSelectedAssetEvidence`, with zero
  `identityMismatch`, both funnel equations true, zero provider calls, and zero
  runtime writes.
  Filtered archive-backed reads now apply stable persisted filters (`kind`,
  provider, AuraCall runtime profile, project, agent/team, response/batch, and
  status) before refreshing local-file metadata. Availability and text-query
  filters still run after hydration. The provider-free regression is
  `pnpm vitest run tests/runtime.archiveService.test.ts --maxWorkers 1 -t
  "hydrates only items that can match stable list filters"`; it proves both
  single and batched filtered reads ignore an unrelated path that would throw
  if opened.
  The same archive-service suite also binds availability normalization: once a
  readable file hydrates to `fileAvailable=true`, refresh-owned
  `unavailableReason`, `missingLocalPath`, and an `archive-read-refresh`
  unavailable materialization object are removed from both the returned row
  and persisted index. Still-missing evidence and successful materialization
  provenance owned by another source remain unchanged. Run
  `pnpm vitest run tests/runtime.archiveService.test.ts --maxWorkers 1 -t
  "refreshes indexed upload and generated artifact file metadata on archive
  reads"` for the focused provider-free regression.
- ChatGPT user-uploaded-file response-shape coverage is provider-free in
  `tests/browser/chatgptAdapter.test.ts`. It verifies that a `files-download`
  JSON string and bounded shallow/nested signed-URL fields resolve, while an
  error-only object does not. The same resolver body is embedded in the CDP
  capture expression, and existing response-identity tests remain the write
  gate. The same suite also locks structured unavailable-versus-retrieval
  classification, strongest-failure precedence, deadline-safe polling with a
  never-settling intercepted response, and distinguished per-stage fetch/body
  timeouts. The five-repair adjacent packet is:
  `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts tests/runtime.historyMaterializationService.test.ts tests/accountMirror/completionService.test.ts`.
  These tests cover direct conversation and catalog-item job creation,
  artifact/file catalog rows with nested conversation metadata, bounded
  reconciliation, freshness-aware bulk reconciliation candidate selection,
  explicit `refreshSnapshot` provider-context phases, selected
  `conversationIds` batches that can refresh stale cached rows, terminal
  snapshot skips before artifact materialization, refreshed cached
  conversation-file reuse without a redundant provider listing (including
  fallback to `files[]` from the refreshed conversation-context dataset), the
  pre-exclusion known-file count used to distinguish terminal/bounded
  `known-files-excluded` outcomes from genuinely empty inventory, ChatGPT
  library-plus-conversation detail inventory,
  exact non-forced artifact/file catalog-item rejection when the same family is
  already readable in archive evidence while preserving forced and
  non-terminal provider admission,
  Gemini conversation-artifact media manifest mapping, Gemini unavailable
  media-generation reconciliation by timestamp-backed cached conversation
  title, direct provider-conversation media recovery without a matching catalog
  conversation, selected conversation-id request ordering before catalog order
  for terminal route misses, targeted archive-item media matching for media-generation
  artifacts without provider conversation ids, duplicate-title ambiguity skips
  before provider browser work, duplicate-title media-recovery evidence counts in skip
  reasons, Grok unsupported history-media skips before active-surface
  materialization, cached conversation row evidence updates, direct
  provider-conversation row upserts, provider human-verification
  `provider_guard_required` job failures, account-mirror archive upsert/readback, Search
  materialization facets for history-backed archive rows, HTTP
  queue/poll/cancel routes, CLI helpers, MCP
  handlers, and MCP service wiring without launching provider browsers.
- Cache-only commands such as `cache export`, `cache context list`, and
  `cache context get` should read provider cache state without resolving or
  launching a live browser target.
- Bounded conversation-context regression:
  `pnpm vitest run tests/browser/llmServiceContext.test.ts`. The suite must
  prove the default/overridable deadline contract through never-settling
  target/list-option, cache-identity, and provider stubs. Pre-provider fixtures
  must terminate with attempt count zero, abort their local signal, invoke no
  provider context callback, and persist a stage-specific metadata-only
  receipt. The suite must also retain composed caller abort, exactly one
  provider timeout/abort attempt, and unchanged transient retry/cache behavior.
  For an already authorized provider session, the cache-identity preflight must
  skip duplicate live identity and feature detection, reach the provider
  context callback once, and leave live identity assertion to the adapter.
  CLI help must expose the shared `--timeout-ms` option. Provider-free installed
  validation may use these same seams, but must not run `conversations context
  get` against a real provider.
- A live-attempt receipt is stored at
  `context-read-receipts/<conversationId>.json` inside the resolved provider
  cache. `cache context get <conversationId> --provider <provider>` returns it
  as `terminalReceipt`; verify that it contains only bounded metadata and an
  account-scope hash, never messages, titles, URLs, or transcript content.
- Cache source catalog smoke: `pnpm tsx bin/auracall.ts cache sources list --provider grok --limit 10`.
- Cache artifact catalog smoke: `pnpm tsx bin/auracall.ts cache artifacts list --provider grok --limit 10`.
- Cache file catalog smoke: `pnpm tsx bin/auracall.ts cache files list --provider grok --limit 10`.
- Cache file pointer resolve smoke: `pnpm tsx bin/auracall.ts cache files resolve --provider grok --limit 20` (use `--missing-only` to focus orphan/missing local paths).
- Cache integrity doctor smoke: `pnpm tsx bin/auracall.ts cache doctor --provider grok --json` (use `--strict` to fail on warnings; JSON now includes aggregated conversation inventory summary counts).
- Cache repair smoke:
  - dry-run: `pnpm tsx bin/auracall.ts cache repair --provider grok --actions all --json`
  - apply single action: `pnpm tsx bin/auracall.ts cache repair --provider grok --identity-key <key> --actions rebuild-index --apply --yes --json`
  - parity drift actions:
    - `pnpm tsx bin/auracall.ts cache repair --provider grok --identity-key <key> --actions prune-orphan-source-links --json`
    - `pnpm tsx bin/auracall.ts cache repair --provider grok --identity-key <key> --actions prune-orphan-file-bindings --json`
    - `pnpm tsx bin/auracall.ts cache repair --provider grok --identity-key <key> --actions prune-orphan-artifact-bindings --json`
- Cache clear/compact/cleanup smoke:
  - clear dry-run: `pnpm tsx bin/auracall.ts cache clear --provider grok --identity-key <key> --dataset context --json` (JSON now includes `inventoryBefore` / `inventoryAfter`)
  - compact: `pnpm tsx bin/auracall.ts cache compact --provider grok --identity-key <key> --json`
  - cleanup dry-run: `pnpm tsx bin/auracall.ts cache cleanup --provider grok --identity-key <key> --days 30 --json` (JSON now includes `inventoryBefore` / `inventoryAfter`)
- Cache refresh hydration modes smoke:
  - conservative (existing IDs only): `pnpm tsx bin/auracall.ts cache --provider grok --refresh --include-history --history-limit 200`
  - opt-in project-only insertion: `pnpm tsx bin/auracall.ts cache --provider grok --refresh --include-history --history-limit 200 --include-project-only-conversations`
  - regression assertion script: `pnpm tsx scripts/verify-cache-refresh-modes.ts --provider grok --history-limit 200 [--project-id <id>]`
- Cache export SQL-first smoke:
  - standard: `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache export --provider grok --scope conversation --conversation-id <id> --format json --out /tmp/auracall-export-smoke/json`
  - no-index resilience: temporarily move `cache-index.json` aside for that identity, rerun the same export command, confirm output exists, then restore `cache-index.json`.
- Cache export parity matrix smoke (recommended): `pnpm tsx scripts/verify-cache-export-parity.ts --provider grok --conversation-id <id>` (runs `json|csv|md|html|zip` for conversation scope plus broader JSON scopes and performs a no-index SQL-first check).
- SQL catalog smoke: `pnpm tsx scripts/verify-cache-sql-catalog.ts --provider <grok|chatgpt> [conversationId]` (verifies `cache.sqlite` catalog tables and row counts; optional conversation drill-down).
- To start a DevTools session manually, run `pnpm tsx scripts/start-devtools-session.ts --url=https://grok.com` (prints the host/port and launches Chrome if needed).
- Verify scripts now auto-start a DevTools session via BrowserService; `AURACALL_BROWSER_PORT` is optional.
- Integrated WSL -> Windows Chrome runs now default to auto DevTools-port discovery. The normal product path is: launch Windows Chrome with `--remote-debugging-port=0`, read `DevToolsActivePort`, then attach through Aura-Call’s built-in `windows-loopback` relay. Firewall rules and `portproxy` are not part of the primary setup.
- WSL -> Windows Chrome smoke: if Windows Chrome is already running with `--remote-debugging-port=<port>` on Windows loopback, test the new relay path with `pnpm tsx bin/auracall.ts --engine browser --browser-target grok --remote-chrome windows-loopback:<port> --model grok --prompt "ping" --wait --verbose --force`.
- Integrated WSL -> Windows Chrome smoke: `AURACALL_WSL_CHROME=windows AURACALL_BROWSER_PROFILE_DIR='/mnt/c/Users/<you>/AppData/Local/AuraCall/browser-profiles/windows-smoke/grok' pnpm tsx bin/auracall.ts --engine browser --browser-target grok --browser-chrome-path '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe' --browser-cookie-path '/mnt/c/Users/<you>/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies' --browser-bootstrap-cookie-path '/mnt/c/Users/<you>/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies' --model grok --prompt "Reply exactly with: windows chrome just works" --wait --verbose --force`. Aura-Call now lets Windows choose the DevTools port and discovers the real endpoint from `DevToolsActivePort` automatically.
- On WSL, browser/profile paths can now be supplied as `/mnt/c/...`, `C:\...`, or WSL absolute paths like `/home/<you>/.auracall/...`; Aura-Call normalizes them before resolving managed profile roots and Chrome `--user-data-dir` flags.
- Live API smokes: `AURACALL_LIVE_TEST=1 OPENAI_API_KEY=… pnpm test:live` (excludes OpenAI pro), `AURACALL_LIVE_TEST=1 OPENAI_API_KEY=… pnpm test:pro` (OpenAI pro live). Expect real usage/cost.
- Gemini API live smoke: `AURACALL_LIVE_TEST=1 pnpm vitest run tests/live/gemini-live.test.ts`
- Gemini web (cookie) live smoke: `AURACALL_LIVE_TEST=1 pnpm vitest run tests/live/gemini-web-live.test.ts` (requires a signed-in Chrome profile at `gemini.google.com`).
- Gemini team live smoke: `AURACALL_LIVE_TEST=1 AURACALL_GEMINI_TEAM_LIVE_TEST=1 pnpm vitest run tests/live/team-gemini-live.test.ts`
- ChatGPT team live smoke: `AURACALL_LIVE_TEST=1 AURACALL_CHATGPT_TEAM_LIVE_TEST=1 pnpm vitest run tests/live/team-chatgpt-live.test.ts`
- ChatGPT approval/resume/drain team live smoke:
  - `AURACALL_LIVE_TEST=1 AURACALL_CHATGPT_APPROVAL_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-chatgpt-live.test.ts -t "human escalation"`
  - current acceptance bar:
    - initial `auracall-chatgpt-tooling` run returns:
      - `runtimeRunStatus = cancelled`
      - `finalOutputSummary = "paused for human escalation"`
    - `POST /status` then:
      - resumes the paused team run
      - drains the resumed team run through the real provider-backed path
    - final readback confirms:
      - `metadata.executionSummary.operatorControlSummary`
      - resumed execution timeline on `GET /status/recovery/{run_id}`
      - stored terminal step summary
        `= "AURACALL_CHATGPT_APPROVAL_TEAM_LIVE_SMOKE_OK"`
- ChatGPT cancelled-local-action team live smoke:
  - `AURACALL_LIVE_TEST=1 AURACALL_CHATGPT_CANCELLATION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-chatgpt-live.test.ts -t "cancels auracall-chatgpt-tooling local action"`
  - current acceptance bar:
    - initial `auracall-chatgpt-tooling` run uses:
      - `--allow-local-shell-command node`
      - `--allow-local-cwd-root /home/ecochran76/workspace.local/auracall`
      - `--require-local-action-approval`
    - initial run returns:
      - `runtimeRunStatus = cancelled`
      - `finalOutputSummary = "paused for human escalation"`
    - the stored local action is durable before operator follow-through:
      - `status = requested`
    - `POST /status` then:
      - resolves the pending request as `cancelled`
      - resumes the paused team run
      - drains the resumed team run through the real provider-backed path
    - final readback confirms:
      - bounded `metadata.executionSummary.localActionSummary` with
        `cancelled = 1`
      - bounded `metadata.executionSummary.operatorControlSummary`
      - resumed execution timeline on `GET /status/recovery/{run_id}`
      - stored terminal step summary
        `= "AURACALL_CHATGPT_CANCELLATION_TEAM_LIVE_SMOKE_OK"`
- Cross-service team live smoke: `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_TEAM_LIVE_TEST=1 pnpm vitest run tests/live/team-multiservice-live.test.ts`
- Grok team live smoke: `AURACALL_LIVE_TEST=1 pnpm vitest run tests/live/team-grok-live.test.ts`
  - opt-in provider-backed approval/resume/drain case:
    - `AURACALL_LIVE_TEST=1 AURACALL_APPROVAL_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-grok-live.test.ts -t "human escalation"`
    - current acceptance bar:
      - initial `auracall-tooling` run returns:
        - `runtimeRunStatus = cancelled`
        - `finalOutputSummary = "paused for human escalation"`
      - `POST /status` then:
        - resumes the paused team run
        - drains the resumed team run through the real provider-backed path
      - final readback confirms:
        - `metadata.executionSummary.operatorControlSummary`
        - resumed execution timeline on `GET /status/recovery/{run_id}`
        - stored terminal step summary
          `= "AURACALL_TEAM_APPROVAL_LIVE_SMOKE_OK"`
  - opt-in provider-backed rejected-local-action case:
    - `AURACALL_LIVE_TEST=1 AURACALL_REJECTION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-grok-live.test.ts -t "rejects auracall-tooling local action"`
    - current acceptance bar:
      - initial `auracall-tooling` run returns:
        - `runtimeRunStatus = cancelled`
        - `finalOutputSummary = "paused for human escalation"`
      - the stored rejected local action is durable before resume:
        - `status = rejected`
        - `resultSummary = "local action rejected because step policy forbids host actions"`
      - `POST /status` then:
        - resumes the paused team run
        - drains the resumed team run through the real provider-backed path
      - final readback confirms:
        - bounded `metadata.executionSummary.localActionSummary` with
          `rejected = 1`
        - bounded `metadata.executionSummary.operatorControlSummary`
        - resumed execution timeline on `GET /status/recovery/{run_id}`
        - stored terminal step summary
          `= "AURACALL_TEAM_REJECTION_LIVE_SMOKE_OK"`
  - opt-in provider-backed cancelled-local-action case:
    - `AURACALL_LIVE_TEST=1 AURACALL_CANCELLATION_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-grok-live.test.ts -t "cancels auracall-tooling local action"`
    - current acceptance bar:
      - initial `auracall-tooling` run uses:
        - `--allow-local-shell-command node`
        - `--allow-local-cwd-root /home/ecochran76/workspace.local/auracall`
        - `--require-local-action-approval`
      - initial run returns:
        - `runtimeRunStatus = cancelled`
        - `finalOutputSummary = "paused for human escalation"`
      - the stored local action is durable before operator follow-through:
        - `status = requested`
      - `POST /status` then:
        - resolves the pending request as `cancelled`
        - resumes the paused team run
        - drains the resumed team run through the real provider-backed path
      - final readback confirms:
        - bounded `metadata.executionSummary.localActionSummary` with
          `cancelled = 1`
        - bounded `metadata.executionSummary.operatorControlSummary`
        - resumed execution timeline on `GET /status/recovery/{run_id}`
        - stored terminal step summary
          `= "AURACALL_TEAM_CANCELLATION_LIVE_SMOKE_OK"`
  - live team chat hygiene now uses exact-id batched cleanup instead of
    immediate deletion:
    - successful ChatGPT, Grok, and Gemini team live tests enqueue disposable
      conversations into:
      - `~/.auracall/live-test-cleanup/chatgpt-team-conversations.json`
      - `~/.auracall/live-test-cleanup/grok-team-conversations.json`
      - `~/.auracall/live-test-cleanup/gemini-team-conversations.json`
    - once a provider ledger grows past `6` stored conversations, Aura-Call
      prunes toward the newest `3`
    - each enqueue now deletes at most the oldest `2` conversations so cleanup
      cannot dominate one live test turn
    - deletion stays exact-id only through:
      - `auracall delete <conversationId> --target <provider> --yes`
    - no fuzzy title matching is used for this cleanup path
 - Direct operator lifecycle regression:
   - `pnpm vitest run tests/http.responsesServer.test.ts -t "resume|drain|operator control summary"`
   - current acceptance bar:
     - seed one paused direct run
     - resume it through `POST /status`
     - drain it through `POST /status`
     - confirm `GET /v1/responses/{response_id}` exposes bounded
       `operatorControlSummary`
     - confirm `GET /status/recovery/{run_id}` timeline includes:
       - pause note
       - resume note
       - targeted drain note
  - optional bounded tooling case:
    - `AURACALL_LIVE_TEST=1 AURACALL_TOOLING_LIVE_TEST=1 pnpm vitest run tests/live/team-grok-live.test.ts`
    - keep this separate from the stable Grok baseline until the live
      tool-envelope path is consistently deterministic
  - current Grok guard posture:
    - browser-backed Grok runs now persist one bounded cooldown/spacing record
      per managed browser profile under:
      - `~/.auracall/cache/providers/grok/__runtime__/rate-limit-<browser profile>.json`
    - repeated live Grok runs may now briefly auto-wait before execution
    - if the remaining wait is larger than the bounded auto-wait window, the
      run should fail fast with:
      - `Grok rate limit cooldown active until ...`
      - or `Grok write spacing active until ...`
    - visible provider toasts such as:
      - `Query limit reached for Auto`
      - `Try again in 4 minutes`
      now count as Grok rate-limit signals and should seed that same cooldown
      instead of ending as a generic timeout
  - current baseline expected result:
    - `teamId = auracall-solo`
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - first step resolves to:
      - `runtimeProfileId = auracall-grok-auto`
      - `browserProfileId = default`
      - `service = grok`
    - `finalOutputSummary = "AURACALL_TEAM_LIVE_SMOKE_OK"`
  - current live follow-through:
    - uses returned `execution.runtimeRunId` to read the durable operator
      detail seam through `serviceHost.readRecoveryDetail(...)`
    - expected readback:
      - `runId = execution.runtimeRunId`
      - `sourceKind = team-run`
      - `taskRunSpecId = taskRunSpec.id`
      - non-empty `orchestrationTimelineSummary`
      - at least one `step-succeeded` timeline item
  - current HTTP follow-through:
    - starts a bounded local responses server against the same durable store
    - reads `GET /status/recovery/{run_id}` for the returned
      `execution.runtimeRunId`
    - expected HTTP payload:
      - `object = recovery_detail`
      - `detail.runId = execution.runtimeRunId`
      - `detail.sourceKind = team-run`
      - `detail.taskRunSpecId = taskRunSpec.id`
      - non-empty `detail.orchestrationTimelineSummary`
      - at least one `step-succeeded` timeline item
  - current response readback follow-through:
    - reads `GET /v1/responses/{response_id}` where
      `response_id = execution.runtimeRunId`
    - expected HTTP payload:
      - `object = response`
      - `id = execution.runtimeRunId`
      - `status = completed`
      - `metadata.runId = execution.runtimeRunId`
      - `metadata.taskRunSpecId = taskRunSpec.id`
      - `metadata.service = grok`
      - `metadata.runtimeProfile = auracall-grok-auto`
      - `metadata.executionSummary.stepSummaries`
        - bounded per-step routing projection from stored step state
        - use this when you need mixed-provider routing proof from response
          readback itself
      - contract split:
        - top-level `metadata.service` / `metadata.runtimeProfile` remain the
          compact response summary
        - `metadata.executionSummary.stepSummaries` is the mixed-provider
          routing projection
        - response `metadata.executionSummary` should not grow recovery-only
          status fields such as:
          - `activeLease`
          - `dispatch`
          - `repair`
          - `leaseHealth`
          - `localClaim`
        - recovery detail remains the orchestration timeline surface
        - recovery detail should not grow routing fields such as:
          - `runtimeProfile`
          - `service`
          - `stepSummaries`
      - non-empty `metadata.executionSummary.orchestrationTimelineSummary`
      - at least one `step-succeeded` timeline item
  - current broader-workflow expected result:
    - `teamId = auracall-two-step`
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - `stepSummaries.length = 2`
    - both steps resolve to:
      - `runtimeProfileId = auracall-grok-auto`
      - `browserProfileId = default`
      - `service = grok`
      - `teamStepStatus = succeeded`
      - `runtimeStepStatus = succeeded`
    - `finalOutputSummary = "AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK"`
    - `sharedStateNotes` includes consumed-transfer evidence
    - durable host, HTTP recovery detail, and HTTP response readback each show:
      - at least two `step-succeeded` timeline items
      - at least one `handoff-consumed` timeline item
  - current multi-agent expected result:
    - `teamId = auracall-multi-agent`
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - `stepSummaries.length = 2`
    - both steps resolve to:
      - `runtimeProfileId = auracall-grok-auto`
      - `browserProfileId = default`
      - `service = grok`
      - `teamStepStatus = succeeded`
      - `runtimeStepStatus = succeeded`
    - `finalOutputSummary = "AURACALL_MULTI_AGENT_LIVE_SMOKE_OK"`
    - `sharedStateNotes` includes consumed-transfer evidence
    - durable host, HTTP recovery detail, and HTTP response readback each show:
      - at least two `step-succeeded` timeline items
      - at least one `handoff-consumed` timeline item
  - current bounded tooling expected result:
    - `teamId = auracall-tooling`
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - `stepSummaries.length = 2`
    - both steps resolve to:
      - `runtimeProfileId = auracall-grok-auto`
      - `browserProfileId = default`
      - `service = grok`
      - `teamStepStatus = succeeded`
      - `runtimeStepStatus = succeeded`
    - `sharedStateNotes` includes:
      - `local shell action executed: node`
      - local action outcome summary for the executed step
    - `finalOutputSummary = "AURACALL_TOOL_TEAM_LIVE_SMOKE_OK"`
    - current automation posture:
      - manual provider-backed CLI proof is green
      - the automated live case is still gated behind
        `AURACALL_TOOLING_LIVE_TEST=1`
      - do not fold it into the stable `AURACALL_LIVE_TEST=1` baseline until
        Grok reliably emits the expected local-action envelope shape
- Gemini local browser-profile doctor: `pnpm tsx bin/auracall.ts doctor --target gemini --local-only --json`
- Full live Gemini selector diagnosis is not implemented under `auracall doctor` yet; use the dedicated Gemini live smokes instead.
- Team CLI bridge smoke:
  - `pnpm tsx bin/auracall.ts teams run auracall-solo "Reply exactly with: AURACALL_TEAM_SMOKE_OK" --title "AuraCall team smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_TEAM_SMOKE_OK and nothing else." --max-turns 1 --json`
  - inspect the persisted linkage from that payload:
    - `pnpm tsx bin/auracall.ts teams inspect --task-run-spec-id <taskRunSpecId> --json`
    - `pnpm tsx bin/auracall.ts teams inspect --team-run-id <teamRunId> --json`
    - `pnpm tsx bin/auracall.ts teams inspect --runtime-run-id <runtimeRunId> --json`
  - review the persisted team-run sequence from that payload:
    - `pnpm tsx bin/auracall.ts teams review --task-run-spec-id <taskRunSpecId> --json`
    - `pnpm tsx bin/auracall.ts teams review --team-run-id <teamRunId> --json`
    - `pnpm tsx bin/auracall.ts teams review --runtime-run-id <runtimeRunId> --json`
  - current expected result:
    - real `taskRunSpec` payload
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - single step resolves to:
      - `runtimeProfileId = auracall-grok-auto`
      - `browserProfileId = default`
    - `teams review` returns a read-only ledger with:
      - `ledger.sequence`
      - `ledger.handoffs`
      - `ledger.artifacts`
      - `ledger.observations = []` until passive-monitoring slices start
      - `service = grok`
      - provider refs include stored conversation id, tab URL, configured URL,
        project id, runtime profile id, browser profile id, agent id, and
        selected model when present
      - provider cache path stays `null` unless stored metadata already carries
        a concrete path
      - `ledger.observations` includes:
        - durable hard-stop observations derived from failure metadata
        - stored ChatGPT passive observations for `thinking`,
          `response-incoming`, and `response-complete` when present on
          `browserRun.passiveObservations`
        - stored Gemini passive observations for `thinking`,
          `response-incoming`, and `response-complete` when present on
          `browserRun.passiveObservations`
        - on the current managed WSL Chrome path, live thinking-mode evidence
          is best recognized from the placeholder assistant turn
          `ChatGPT said:Thinking`; generic status-node scans are supplemental
        - Gemini evidence stays Gemini-owned:
          - web executor observations come from returned
            thoughts/text/images and successful completion
          - browser-native attachment observations come from prompt committed,
            answer first visible, and stable completion
        - stored Grok passive observations for `thinking`,
          `response-incoming`, and `response-complete` when present on
          `browserRun.passiveObservations`
        - Grok evidence stays Grok-owned:
          - prompt submitted
          - first new assistant content visible
          - stabilized result returned
    - `finalOutputSummary = "AURACALL_TEAM_SMOKE_OK"`
  - `pnpm tsx bin/auracall.ts teams run auracall-chatgpt-solo "Reply exactly with: AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK" --title "AuraCall ChatGPT team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK and nothing else." --max-turns 1 --json`
  - current expected result:
    - real `taskRunSpec` payload
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - single step resolves to:
      - `runtimeProfileId = wsl-chrome-2`
      - `browserProfileId = wsl-chrome-2`
      - `service = chatgpt`
    - `finalOutputSummary = "AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK"`
  - automated live coverage now exists:
    - `AURACALL_LIVE_TEST=1 AURACALL_CHATGPT_TEAM_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-chatgpt-live.test.ts`
    - current expected result:
      - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - recovery detail and `GET /v1/responses/{response_id}` both read back the same run cleanly
    - response readback shows:
      - `metadata.service = chatgpt`
      - `metadata.runtimeProfile = wsl-chrome-2`
  - current inspect posture:
    - `teams inspect` should read back the same persisted `taskRunSpecSummary`
      and linked runtime run identity without creating a new execution surface
    - lookup should work by:
      - `taskRunSpecId`
      - `teamRunId`
      - `runtimeRunId`
  - automated provider-backed approval/resume/drain coverage now also exists:
    - `AURACALL_LIVE_TEST=1 AURACALL_CHATGPT_APPROVAL_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-chatgpt-live.test.ts -t "human escalation"`
    - current expected result:
      - initial `auracall-chatgpt-tooling` run is cancelled with
        `finalOutputSummary = "paused for human escalation"`
      - `POST /status` resumes the paused team run
      - `POST /status` drains the resumed team run through the real
        provider-backed path
      - final stored terminal step summary
        `= "AURACALL_CHATGPT_APPROVAL_TEAM_LIVE_SMOKE_OK"`
      - response readback shows bounded
        `metadata.executionSummary.operatorControlSummary`
  - `pnpm tsx bin/auracall.ts teams run auracall-cross-service "Reply exactly with: AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK" --title "AuraCall cross-service team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
  - current expected result:
    - real `taskRunSpec` payload
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - two steps succeed in order across different providers
    - step 1 resolves to:
      - `runtimeProfileId = wsl-chrome-2`
      - `browserProfileId = wsl-chrome-2`
      - `service = chatgpt`
    - step 2 resolves to:
      - `runtimeProfileId = auracall-grok-auto`
      - `browserProfileId = default`
      - `service = grok`
    - durable host, HTTP recovery-detail, and HTTP response readback all show:
      - non-empty orchestration timeline
      - at least one `handoff-consumed` timeline item
    - `finalOutputSummary = "AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK"`
  - `pnpm tsx bin/auracall.ts teams run auracall-cross-service-gemini "Reply exactly with: AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK" --title "AuraCall cross-service Gemini team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
  - current expected result:
    - real `taskRunSpec` payload
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - two steps succeed in order across different providers
    - step 1 resolves to:
      - `runtimeProfileId = wsl-chrome-2`
      - `browserProfileId = wsl-chrome-2`
      - `service = chatgpt`
    - step 2 resolves to:
      - `runtimeProfileId = auracall-gemini-pro`
      - `browserProfileId = default`
      - `service = gemini`
    - durable host, HTTP recovery-detail, and HTTP response readback all show:
      - non-empty orchestration timeline
      - at least one `handoff-consumed` timeline item
    - `finalOutputSummary = "AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK"`
  - automated live coverage now exists:
    - `AURACALL_LIVE_TEST=1 AURACALL_MULTISERVICE_TEAM_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-multiservice-live.test.ts`
  - mixed-provider readback nuance:
    - `execution.stepSummaries` are the authoritative per-step provider/runtime
      proof
    - `GET /v1/responses/{response_id}` metadata service/runtime fields are
      still shaped from the stored run response model and should not be treated
      as a per-step provider matrix
  - current live browser-profile rule:
    - if the runtime profile is bound to an existing managed browser profile
      through `manualLoginProfileDir`, the executor should reuse that browser-
      family-owned directory instead of launching a fresh runtime-profile-
      namespaced managed browser profile
  - current regression tell:
    - if Chrome launches on
      `~/.auracall/browser-profiles/auracall-grok-auto/grok` instead of
      `~/.auracall/browser-profiles/default/grok`, managed-profile ownership
      regressed and Grok project navigation may fall back to `issue finding id`
    - if the Grok page visibly renders `AURACALL_TEAM_SMOKE_OK` but the CLI
      does not exit promptly, Grok response completion detection regressed
    - if repeated Grok smokes now pause briefly or fail fast on a cooldown/
      spacing message, that is expected guard behavior rather than a prompt/
      transport regression
  - bounded broader-workflow smoke:
    - `pnpm tsx bin/auracall.ts teams run auracall-two-step "Reply exactly with: AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK" --title "AuraCall two-step team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
  - current expected result:
    - real `taskRunSpec` payload
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - two steps succeed in order on the same Grok runtime profile
    - `sharedStateNotes` includes consumed-transfer evidence for step 2
    - `finalOutputSummary = "AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK"`
  - bounded multi-agent smoke:
    - `pnpm tsx bin/auracall.ts teams run auracall-multi-agent "Reply exactly with: AURACALL_MULTI_AGENT_LIVE_SMOKE_OK" --title "AuraCall multi-agent team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_MULTI_AGENT_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
  - current expected result:
    - real `taskRunSpec` payload
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - two steps succeed in order on the same Grok runtime profile
    - `sharedStateNotes` includes consumed-transfer evidence for step 2
    - `finalOutputSummary = "AURACALL_MULTI_AGENT_LIVE_SMOKE_OK"`
  - bounded tooling smoke:
    - `pnpm tsx bin/auracall.ts teams run auracall-tooling "Run one bounded node local shell action that emits AURACALL_TOOL_ACTION_OK, then reply exactly with: AURACALL_TOOL_TEAM_LIVE_SMOKE_OK" --title "AuraCall tooling team live smoke" --prompt-append "For the tool envelope, use a top-level localActionRequests array with exactly one shell action. Preserve the provided toolEnvelope unchanged. Use kind \"shell\" and command \"node\". Use args [\"-e\",\"process.stdout.write('AURACALL_TOOL_ACTION_OK')\"]. Use structuredPayload {\"cwd\":\"/home/ecochran76/workspace.local/auracall\"}. After the local action succeeds, the final answer must be exactly AURACALL_TOOL_TEAM_LIVE_SMOKE_OK." --max-turns 2 --allow-local-shell-command node --allow-local-cwd-root /home/ecochran76/workspace.local/auracall --json`
  - current expected result:
    - real `taskRunSpec` payload
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - two steps succeed in order on the same Grok runtime profile
    - shared state includes `local shell action executed: node`
    - the stored local action outcome for the tool step shows `command = node`
      and executed stdout for the bounded smoke
    - `finalOutputSummary = "AURACALL_TOOL_TEAM_LIVE_SMOKE_OK"`
  - current automation boundary:
    - the manual CLI smoke above is the authoritative proof right now
    - the matching live Vitest case exists, but remains gated behind
      `AURACALL_TOOLING_LIVE_TEST=1`
    - if Grok shows a visible Auto quota toast during that tooling case, treat
      it as provider throttling, not as a local-action transport regression
    - do not treat occasional Grok envelope drift as a transport regression on
      the stable baseline team suite
- Gemini bounded tooling team smoke on 2026-04-12:
  - `pnpm tsx bin/auracall.ts teams run auracall-gemini-tooling "Use the provided toolEnvelope structured context to request one bounded shell action, then use the resulting tool outcome to return the provided finalToken exactly." --title "AuraCall Gemini tooling team live smoke" --prompt-append "Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must output only the final token after a successful executed tool outcome." --structured-context-json '{"toolEnvelope":{"kind":"shell","summary":"Run one bounded deterministic node command","command":"node","args":["-e","process.stdout.write('\''AURACALL_TOOL_ACTION_OK'\'')"],"structuredPayload":{"cwd":"/home/ecochran76/workspace.local/auracall"}},"finalToken":"AURACALL_GEMINI_TOOL_TEAM_SMOKE_OK"}' --max-turns 2 --allow-local-shell-command node --allow-local-cwd-root /home/ecochran76/workspace.local/auracall --json`
  - expected result:
    - `runtimeSourceKind = team-run`
    - `runtimeRunStatus = succeeded`
    - two steps succeed in order on `auracall-gemini-pro`
    - shared state includes `local shell action executed: node`
    - `finalOutputSummary = "AURACALL_GEMINI_TOOL_TEAM_SMOKE_OK"`
  - machine-specific prerequisite on this WSL pairing:
    - raw Chrome cookie reads currently return zero Google auth cookies plus
      `Failed to read Linux keyring via secret-tool; v11 cookies may be unavailable.`
    - export cookies first:
      - `pnpm tsx bin/auracall.ts login --target gemini --profile auracall-gemini-pro --export-cookies`
    - stored team execution now reuses:
      - `~/.auracall/browser-profiles/default/gemini/cookies.json`
      - then `~/.auracall/cookies.json`
      when Gemini browser auth cookies are not available from Chrome directly
  - automated live coverage now exists:
    - `AURACALL_LIVE_TEST=1 AURACALL_GEMINI_TEAM_LIVE_TEST=1 DISPLAY=:0.0 pnpm vitest run tests/live/team-gemini-live.test.ts`
    - current expected result:
      - `runtimeSourceKind = team-run`
      - `runtimeRunStatus = succeeded`
      - two steps succeed in order on `auracall-gemini-pro`
      - recovery detail and `GET /v1/responses/{response_id}` both read back the same run cleanly
      - response readback shows:
        - `metadata.service = gemini`
        - `metadata.runtimeProfile = auracall-gemini-pro`
        - executed local action summary for `node`
- Gemini login/export now treats a visible Gemini `Sign in` page state as a real login failure instead of waiting indefinitely for cookie export.
- Gemini web live-proof target surfaces:
  - text
  - attachment
  - YouTube
  - generate-image
  - edit-image
  - conversation context
  - conversation files list
  - conversation files fetch
- Recommended Gemini live-proof order:
  - text
  - attachment
  - YouTube
  - generate-image
  - edit-image
  - conversation context
  - conversation files list
  - conversation files fetch
- Run Gemini live proof against one explicit AuraCall runtime profile / browser
  profile pairing at a time so failures can be classified cleanly.
- Latest Gemini web proof on 2026-04-03:
  - pairing: AuraCall runtime profile `default` -> browser profile `default`
  - text: green
  - attachment: green
  - YouTube: green
  - generate-image: not green on this pairing
    - Gemini returned a provider/account capability response instead of an
      image:
      - `I can search for images, but can't seem to create any for you right now.`
  - edit-image: not green on this pairing
    - Gemini returned a provider/account capability response instead of an
      edited image:
      - `I can try to find an image like that for you, but can't create it right now.`
  - note: this machine required `auracall login --target gemini --export-cookies`
    plus `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json`
    because `secret-tool` cookie decryption returned zero Google auth cookies
- Secondary Gemini pairing check on 2026-04-04:
  - pairing: AuraCall runtime profile `wsl-chrome-2` -> browser profile `wsl-chrome-2`
  - managed Gemini browser profile directory exists under:
    - `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini`
  - login/export state is now green:
    - `auracall --profile wsl-chrome-2 login --target gemini --export-cookies`
      now succeeds and writes:
      - `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json`
    - the current Gemini login flow can click a visible Gemini `Sign in` CTA
      once and wait through the Google handoff when that is sufficient
  - browser text proof is now green:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json auracall --profile wsl-chrome-2 --engine browser --model gemini-3-pro --prompt 'Reply exactly with: WSL2 GEMINI TEXT GREEN 2' --wait --verbose --force`
    - returned exactly:
      - `WSL2 GEMINI TEXT GREEN 2`
  - browser file-input proof is now also green through Aura-Call's inline file
    bundling path:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json auracall --profile wsl-chrome-2 --engine browser --model gemini-3-pro --prompt 'Read the attached file and reply exactly with its full contents, with no extra words.' --file /tmp/gemini-wsl2-attachment-proof.txt --wait --verbose --force`
    - returned exactly:
      - `WSL2 Gemini attachment proof 2026-04-04`
    - note:
      - verbose output reported `Browser will paste file contents inline (no uploads).`
  - native Gemini browser upload is now green for a real text-file upload:
    - `auracall --profile wsl-chrome-2 --engine browser --model gemini-3-pro --browser-attachments always --prompt 'Read the uploaded file and reply exactly with its full contents, with no extra words.' --file /tmp/gemini-native-upload-proof.txt --wait --verbose --force`
    - returned exactly:
      - `WSL2 NATIVE GEMINI UPLOAD GREEN 2026-04-04`
    - Aura-Call now takes that path through the live Gemini page itself for
      upload-mode runs, instead of relying on the earlier raw Gemini upload
      protocol path for ordinary attachment-backed prompts
  - the old raw Gemini upload transport investigation remains relevant
    background, but it is no longer the active path for standard browser upload
    prompts:
    - earlier forced-upload text proof returned:
      - `[NO CONTENT FOUND]`
    - earlier forced-upload image proof reached:
      - `Gemini accepted the attachment request but returned control frames only and never materialized a response body.`
  - native Gemini browser image-upload proof is still not freshly re-proven on
    this pairing after the browser-driven pivot
  - native Gemini browser image-upload is now green again on this pairing:
    - the key fix was to prefer Gemini's hidden image uploader over the generic
      hidden file uploader for image-only synthetic `fileSelected` dispatch
    - fresh live rerun:
      - pre-submit:
        - prompt still in composer
        - `visibleBlobCount = 1`
        - `Remove file gemini-native-upload-proof.png`
      - post-submit:
        - prompt committed to history
        - blob still visible
      - Gemini answer:
        - `An empty room features white walls, light wood flooring, and a large window overlooking a lush green landscape.`
    - that means the active image-association failure was in the uploader path,
      not in prompt commit or staged-ready timing
  - this pairing is now a real second text-green Gemini browser proof
  - Gemini browser provider list surfaces are now also live on this pairing:
    - `auracall --profile wsl-chrome-2 projects --target gemini`
      - returns real Gem rows through the generic browser provider path
    - `auracall --profile wsl-chrome-2 conversations --target gemini`
      - returns real `/app/<conversationId>` chat rows through the same path
      - now also writes cache under:
        - `~/.auracall/cache/providers/gemini/ecochran76@gmail.com/`
      - the earlier cache-identity warning is resolved on this pairing
  - Gemini conversation rename is now live on the active `default` pairing:
    - `pnpm tsx bin/auracall.ts rename dc7b095922577de3 'AuraCall Gemini Rename Smoke 1775466602' --target gemini --profile default`
    - returned:
      - `Renamed successfully.`
    - implementation note:
      - Gemini rename uses the direct `/app/<conversationId>` page action menu
        (`rename-button`), the rename dialog input
        (`edit-title-input`), and native keystroke submission through the
        shared browser-service `submitInlineRename(...)` helper
  - Gemini conversation context read is now minimally live on the active
    `default` pairing:
    - `auracall conversations context get 841b485bcb3819af --target gemini --profile default --json-only`
      - returns canonical `messages[]`
    - `auracall conversations context get ab30a4a92e4b65a9 --target gemini --profile default --json-only`
      - returns visible uploaded-image `files[]`
  - Gemini conversation files list/fetch are now also live on the active
    `default` pairing for direct chat upload chips:
    - text upload proof:
      - `auracall conversations files list 841b485bcb3819af --target gemini --profile default`
      - `auracall conversations files fetch 841b485bcb3819af --target gemini --profile default --verbose`
    - uploaded-image proof:
      - `auracall conversations files list ab30a4a92e4b65a9 --target gemini --profile default`
      - returns:
        - `gemini-conversation-file:ab30a4a92e4b65a9:0:uploaded-image-1`
      - `auracall conversations files fetch ab30a4a92e4b65a9 --target gemini --profile default --verbose`
      - current image materialization path can fall back to browser-native
        visible-preview capture when the signed image URL returns 403 outside
        the live page context
    - `pnpm tsx bin/auracall.ts conversations context get 841b485bcb3819af --target gemini --profile default --json-only`
    - returned canonical `messages[]`:
      - user:
        - `Read the uploaded file and reply exactly with its full contents, with no extra words.`
      - assistant:
        - `GEMINI NEW CHAT UPLOAD SMOKE 1775437518`
    - and the same direct chat surface now exposes a visible conversation file:
      - `pnpm tsx bin/auracall.ts conversations files list 841b485bcb3819af --target gemini --profile default`
      - returned:
        - `gemini-new-chat-upload-smoke.txt`
    - implementation note:
      - the extractor now reads ordered `user-query` / `model-response` turn
        containers from the direct `/app/<conversationId>` page and pulls text
        from the inner message nodes instead of the outer Gemini chrome wrappers
      - visible sent upload chips now also populate `context.files[]` and the
        shared `conversations files list` fallback
      - Gemini now also returns visible generated artifacts on the active
        `default` pairing:
        - `pnpm tsx bin/auracall.ts conversations context get 3525c884edae4fa4 --target gemini --profile default --json-only`
        - returned one `image` artifact with:
          - `uri: blob:https://gemini.google.com/...`
          - `width: 1024`
          - `height: 559`
        - `pnpm tsx bin/auracall.ts conversations context get 8e8e58b57ae544ea --target gemini --profile default --json-only`
        - returned one `generated` artifact with:
          - `title: Before The Tide Returns`
          - `mediaType: music`
          - `fileName: before_the_tide_returns.mp4`
        - `pnpm tsx bin/auracall.ts conversations context get 23340d1698de29b8 --target gemini --profile default --json-only`
        - returned one `generated` artifact with:
          - `title: Generated video 1`
          - `mediaType: video`
          - `fileName: video.mp4`
        - `pnpm tsx bin/auracall.ts conversations context get 59b6f9ac9e510adc --target gemini --profile default --refresh --json-only`
        - returned one `canvas` artifact with:
          - `title: AuraCall Canvas Route Probe`
          - `uri: gemini://canvas/59b6f9ac9e510adc`
          - `metadata.contentText`
          - `metadata.createdAt: Apr 6, 9:44 PM`
          - `metadata.hasShareButton: true`
          - `metadata.hasPrintButton: true`
      - earlier generic Canvas probe `c653ec3c84410829` still matters as a
        caution:
        - simply selecting the Canvas tool does not guarantee a first-class
          canvas artifact on every Gemini chat
      - Gemini `sources[]` and broader artifact parity beyond the proven
        image/music/video/canvas surfaces are still pending
      - Gemini artifact fetch is now also live for the proven conversation
        artifacts on the active `default` pairing:
        - `pnpm tsx bin/auracall.ts conversations artifacts fetch 59b6f9ac9e510adc --target gemini --profile default`
          - `artifactCount = 1`
          - `materializedCount = 1`
          - materialized `AuraCall Canvas Route Probe.txt`
        - `pnpm tsx bin/auracall.ts conversations artifacts fetch 8e8e58b57ae544ea --target gemini --profile default`
          - `artifactCount = 1`
          - `materializedCount = 1`
          - materialized `before_the_tide_returns.mp4`
        - `pnpm tsx bin/auracall.ts conversations artifacts fetch 23340d1698de29b8 --target gemini --profile default`
          - `artifactCount = 1`
          - `materializedCount = 1`
          - materialized `video.mp4`
      - Gemini conversation file fetch now also has a bounded shared CLI path:
        - `pnpm tsx bin/auracall.ts conversations files fetch <conversationId> --target gemini --profile default`
        - current implementation is intentionally limited to chat-uploaded files
          whose Gemini chat surface exposes either:
          - a direct preview/download URL
          - or a recoverable text preview after opening the chip
        - the known text-upload smoke conversation currently is not a clean live
          fetch proof because direct `/app/<id>` route open on this account can
          trip Google’s `sorry` interstitial before the file preview is reached
  - Gemini Gem create is now also live on this pairing:
    - `auracall --profile wsl-chrome-2 projects create 'AuraCall Gemini Gem CRUD Proof 2026-04-04 1854' --target gemini --instructions-text 'Reply helpfully about AuraCall Gemini CRUD proofs.'`
    - returned:
      - `Created project "AuraCall Gemini Gem CRUD Proof 2026-04-04 1854".`
    - refreshed list then surfaced the new Gem id:
      - `8206744c0568`
  - Gemini Gem rename is now also live on this pairing:
    - `auracall --profile wsl-chrome-2 projects rename 8206744c0568 'AuraCall Gemini Gem CRUD Proof 2026-04-04 1914' --target gemini`
    - returned:
      - `Renamed project 8206744c0568 to "AuraCall Gemini Gem CRUD Proof 2026-04-04 1914".`
    - authoritative follow-up read on:
      - `https://gemini.google.com/gems/edit/8206744c0568`
      - showed:
        - `AuraCall Gemini Gem CRUD Proof 2026-04-04 1914`
  - Gemini Gem delete is now also live on this pairing:
    - created disposable Gem:
      - `AuraCall Gemini Gem Delete Proof 2026-04-04 1935`
    - resolved id:
      - `525572997076`
    - deleted with:
      - `auracall --profile wsl-chrome-2 projects remove 525572997076 --target gemini`
    - returned:
      - `Removed project 525572997076.`
    - refreshed Gem list no longer included:
      - `525572997076`
  - deferred Gemini list-quality note:
    - some Gem manager rows still resolve abbreviated or repeated display
      names during list scraping
    - treat that as a later Gemini list-quality fix, not a blocker on the
      first create-path proof
  - operator safety rule:
    - `projects create <name>` should be treated as create-only, not
      create-or-reuse by side effect
    - AuraCall now blocks exact-name duplicates before provider creation; if a
      project might already exist, resolve/list first and reuse the existing id
- Until that matrix is re-proven in one fresh pass, treat Gemini as supported with inherited coverage, not as a freshly re-certified browser provider.
- ChatGPT guarded browser acceptance: `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts`.
  - For a separately governed single context diagnostic, use
    `scripts/chatgpt-context-canary.ts`. Its sanitized acceptance outcomes are
    `context`, `terminal_unavailable`, and `classified_post_payload_failure`.
    The last outcome requires child exit 1, one failed attempt, no timeout or
    pending operation, no parsed context, and an exact stage from the closed
    payload-shape/route-class matrix; arbitrary or near-match stages remain
    rejected.
  - Provider-free payload fallback regression:
    `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceContext.test.ts tests/scripts/chatgptContextCanary.test.ts --maxWorkers 1`.
    The home-route tracer requires one forced governed navigation to the exact
    conversation route after response listeners are armed, no fallback reload,
    one mapping result, and no second provider attempt.
  - The runner now aborts if the persisted ChatGPT cooldown is still materially active instead of sleeping for minutes and resuming later.
  - If `~/.auracall/cache/providers/chatgpt/__runtime__/rate-limit-<profile>.json` shows a long active cooldown, wait for it to clear before rerunning.
  - The current safer default guard is weighted rather than flat-count based:
    - lighter actions like rename/instructions count less than project create/upload/browser sends
    - each successful write also opens a post-commit quiet period before the next refresh-heavy or mutating step
    - the quiet period starts around 12-18 seconds and gets longer as recent weighted activity accumulates
  - On this account, prefer the phaseable path instead of one dense full burst.
  - Recommended resumable workflow:
    - `... scripts/chatgpt-acceptance.ts --phase project --state-file docs/dev/tmp/chatgpt-acceptance-state.json`
    - `... scripts/chatgpt-acceptance.ts --phase project-chat --resume docs/dev/tmp/chatgpt-acceptance-state.json`
    - `... scripts/chatgpt-acceptance.ts --phase root-base --resume docs/dev/tmp/chatgpt-acceptance-state.json`
    - `... scripts/chatgpt-acceptance.ts --phase root-followups --resume docs/dev/tmp/chatgpt-acceptance-state.json`
    - `... scripts/chatgpt-acceptance.ts --phase cleanup --resume docs/dev/tmp/chatgpt-acceptance-state.json`
  - `--state-file` writes a phase summary JSON after progress, success, and failure.
  - `--resume` reuses the prior summary's ids by default and now also keeps the same suffix/naming for a coherent disposable run.
  - Latest clean phased live sweep on the authenticated managed WSL ChatGPT profile:
    - `project` green
    - `project-chat` green
    - `root-base` green
    - `root-followups` green
    - `cleanup` green
  - Existing-conversation browser runs now reject reused assistant turns when a visible ChatGPT rate-limit modal blocks the new send, instead of returning the previous assistant answer as false success.
  - Post-MVP polish history is archived in [0021-2026-04-08-chatgpt-polish-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/plans/legacy-archive/0021-2026-04-08-chatgpt-polish-plan.md).
  - Broader hostile-state hardening history is archived in [0020-2026-04-08-chatgpt-hardening-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/plans/legacy-archive/0020-2026-04-08-chatgpt-hardening-plan.md).
- MCP focused: `pnpm test:mcp` (builds then stdio smoke via mcporter).
- MCP media/workbench service wiring:
  - `pnpm vitest run tests/mcp.server.test.ts tests/mcp.mediaGeneration.test.ts tests/mcp.runStatus.test.ts tests/mcp.workbenchCapabilities.test.ts --maxWorkers 1`
  - proves MCP media generation, media status, generic run status, and
    direct media materialization plus workbench capability tools share the
    configured browser-backed service bundle instead of default no-executor
    services
  - persistence-safe polling coverage now seeds response and media records,
    creates fresh service instances, and verifies MCP `run_status` plus
    `media_generation_status` read the stored ids without provider/browser
    re-invocation
- HTTP/MCP media materialization contract:
  - `pnpm vitest run tests/http.mediaGeneration.test.ts tests/mcp.mediaGeneration.test.ts --maxWorkers 1`
  - proves `POST /v1/media-generations/<id>/materialize` and MCP
    `media_generation_materialize` call the configured materializer for an
    existing media generation, preserve caller metadata, and write back
    materialized artifact paths without creating a second media-generation job.
- MCP team-run parity:
  - `pnpm vitest run tests/mcp/teamRun.test.ts tests/mcp.schema.test.ts --maxWorkers 1`
  - proves the `team_run` tool registration, bounded input/output schemas, and
    MCP provenance handoff into the configured team-run executor.
- Gemini signed-out capability guard:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/workbenchCapabilities.test.ts tests/workbenchBrowserDiscovery.test.ts tests/mediaGeneration.test.ts --maxWorkers 1 --testTimeout 15000`
  - proves Gemini feature signatures carry `signed_out` / `disabled_modes`
    evidence and that disabled tool drawer rows do not become available media
    capabilities; also proves `mat-mdc-tooltip-disabled` is not treated as
    disabled Gemini tool-row evidence.
- Public prebuilt task-run-spec acceptance:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/mcp/teamRun.test.ts tests/cli/teamRunCommand.test.ts tests/teams.schema.test.ts --maxWorkers 1`
  - proves HTTP and MCP accept a prebuilt flattened `taskRunSpec`, reject
    compact/prebuilt assignment conflicts, and keep compact create behavior
    unchanged.
- If you are debugging a raw direct-CDP setup instead of Aura-Call’s integrated Windows path, you can still pin `AURACALL_BROWSER_PORT` / `AURACALL_BROWSER_DEBUG_PORT` and use firewall hints from `scripts/test-browser.ts`. That is now a fallback/debug workflow, not the primary Windows setup.
- Scoped browser runs can be smoke-tested by passing `--project-id` / `--conversation-id` to a browser command; they should not change default config behavior.

Viewer download scope regression: `pnpm vitest run tests/browser/chatgptViewerDownloadScope.test.ts`. Executes the real helper evaluation with captured inline-card shapes and synthetic DOM; no provider calls.


### Queued worker cache reuse and transfer limits

The history materialization worker must accept two verified cached-provider-file entries plus one new transfer with maxItems=1, retain all three available assets, and account for one attempted transfer. Two new transfers under that limit must fail. Run the focused cases with pnpm vitest run tests/runtime.historyMaterializationService.test.ts -t "counts only new transfers". Cache reuse must not increment frontier download counts.


### Partial materialization frontier

A one-transfer batch with two reused assets and two uncached eligible assets must report one pending artifact. The worker must retain partial asset completeness and a deferred frontier checkpoint; a later unchanged pass must remain eligible for the pending retained assets. Run tests/browser/llmServiceFiles.test.ts and tests/runtime.historyMaterializationService.test.ts for focused selection and evidence coverage. Detailed local acceptance uses the durable job store because monitoring responses omit manifest entries and telemetry.

- Fresh ChatGPT collector and scheduler failure contracts (focused, provider-free):
  `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/schedulerService.test.ts`.
  Exercises real-service cached fallback leakage and unexpected refresh failure receipts; does not prove installed navigation or scheduler resume.

- Live-follow final warning lifecycle (focused, provider-free):
  `pnpm vitest run tests/accountMirror/configuredLiveFollowAffinity.test.ts tests/accountMirror/refreshService.test.ts tests/browser-service/providerTrafficGovernor.test.ts`.
  Exercises real configured completion after collector transport release and preserves late-warning/probe-failure stops. Live scheduler convergence remains a separate gate.

- Requested detail-recovery frontier wiring: the collector regression in
  `tests/accountMirror/chatgptMetadataCollector.test.ts` exercises normal and
  requested-phase selection through the full collector with retained index rows
  and a prior cursor. Changed reads once; retained partial and unchanged complete
  rows incur no detail read. This is provider-free, not installed live proof.

- The changed-frontier planner table includes same-epoch completed detail with
  four known missing assets: expect retained materialization rather than skip.
  Run `pnpm vitest run tests/accountMirror/changeFrontierPlanner.test.ts`.

Scheduler paused-startup regression: `pnpm vitest run tests/http.responsesServer.test.ts -t "resumes restored runnable completions after paused startup"`. This exercises persisted runnable and operator-paused operations through the real HTTP resume endpoint, including repeated resume without duplicate refresh. It is provider-free; installed autonomous continuation requires separate live acceptance.

Cold-start live follow launches blank and creates one admitted crawler target with explicit custody. Restored browser pages remain untouched; default reuse still rejects ambiguous unowned targets. Provider-free checks cover the real affinity factory/coordinator handoff, one target creation/lease, and traffic-budget denial before opening. Installed unattended acceptance remains a separate gate.

Retained crawler recovery additionally covers acquire → idle → browser exit → reacquire with the same scheduler workload. Proven native browser absence releases the old lease before cold startup; unknown absence preserves it. Strict process-census tests distinguish absence, presence, command failure and malformed output. The native proof is bounded to five seconds; Windows absence recovery remains fail-closed.

Explicit conversation-scoped materialization excludes foreign conversation
archive, terminal-job, and completed-catalog title-family evidence. Same-scoped
terminal evidence still suppresses repeat downloads. A skipped child and a
nonzero snapshot fileCount do not prove newly captured bytes.

Completion conversation scope must survive disk persistence and service restart.
Validate it in the child request before accepting a resumed scoped run.


Plan 0391 native control boundary: `pnpm vitest run tests/browser/nativeDesktopControl.test.ts tests/browser/nativeDesktopCdp.test.ts tests/browser/desktopControlGate.test.ts tests/browser/remoteViewApplication.test.ts tests/http.desktopClient.test.ts`.
The native controller test uses real loopback HTTP and the persisted gate to
verify in-flight exclusion, second-human refusal, stale release rejection,
failed-revoke pause, exact revoke-before-resume and terminal-replay recovery after
restart. `pnpm tsx scripts/smoke-desktop-client.ts` renders the dedicated app with
fixture native embeds, exercises explicit take/release and reload, and checks
fresh OS absence of its own browser processes. Neither qualifies installed
Remote View input or authenticated provider behavior.

Plan0391 installed dedicated-client acceptance uses
`AURACALL_INSTALLED_DESKTOP_ACCEPTANCE=1 pnpm tsx scripts/acceptance-installed-desktop-client.ts prepare`
against the user-scoped installed runtime and explicit `remote-view-research`
and `remote-view-writing` browser-profile configuration. It opens only blank
local marker pages and leaves the browsers available after the launcher exits.
Authenticate at the real `/desktops` ingress, view both marker pages, take
control/type `research-391` and `writing-391`/release on each, and independently
open Root desktop. Run the same command with `verify` to check both actual marker
values through installed CDP; visual/root attestation remains separate. `cleanup`
closes only exact retained owned browsers and checks fresh physical absence.
Never rerun prepare while awaiting human input: it resets the marker pages.
Unknown or retained human control prevents cleanup commands through the same gate.

### Runtime-profile desktop rail

Run `pnpm vitest run tests/browser/desktopRuntimeProfiles.test.ts tests/http.desktopClient.test.ts`
for canonical Wake, shared-family placement, explicit configuration precedence,
ownership refusal and operator authorization. `pnpm tsx scripts/smoke-desktop-client.ts`
uses isolated provider-free Chrome and verifies compact rows, grouping persistence,
SVG collapse, dormant Wake, and existing observe/control/release behavior. It
prints fresh owned-process cleanup evidence. Installed catalog and served-byte
readbacks qualify adoption separately from authenticated viewer interaction.

- GPT-6 premium Power and downgrade protection: `pnpm vitest run tests/browser/modelSelection.test.ts tests/browser/thinkingTime.test.ts tests/browser/chatgptDeveloperAppLifecycle.test.ts tests/browser/browserModeExports.test.ts tests/browser/pageActions.test.ts`. Captured DOM fixtures cover checked GPT-6 recognition and available/unavailable Pro slot; source live selector-and-restore proof does not establish provider execution or lease-expiry acceptance.


### In-flight ChatGPT lease renewal

Run `pnpm vitest run tests/browser/chatgptAffinityExecutor.test.ts
tests/browser/legacyChatgptAffinityRuntime.test.ts
tests/browser/chatgptAffinityRuntime.test.ts tests/browser/activeChatRetirement.test.ts
tests/browser/configuredChatgptTabMaintenance.test.ts
tests/browser-service/tabLeaseRestartReconciliation.test.ts` for the focused gate.
Fake-clock executor tests keep the original prompt pending past its initial
15-minute idle expiry while maintenance reconciles the same registry. They verify
updated-claim settlement, provider admission after renewal, stop on success/error/
cancellation, fail-closed ownership loss and unchanged absolute deadline.
Legacy affinity must forward the executor cancellation signal to its browser run.
These are provider-free proofs; installed adoption and long-chat visual acceptance
are separate gates.

Absolute-deadline regression: `pnpm vitest run tests/browser/chatgptAffinityExecutor.test.ts`
includes new/existing conversation results at and just after the deadline without
running timer callbacks. Success must be rejected, aggregate outcome remains
unknown, and the existing registry ownership fence remains intact.


### Required installed runtime surface

Before package adoption, run `node dist/scripts/verify-runtime-contract.js <runtime-root>`
to verify required /desktops HTML in an isolated temporary home with all background
execution disabled. The user-runtime installer executes this gate before prefix
replacement. Run it against the staged package as well, then verify dist byte parity,
installed identity, live local routes and existing browser/configuration preservation.
The route probe does not replace active-lane/PR/ancestry reconciliation.

Issue253 process provenance regression: `pnpm vitest run tests/browser/chatgptDeveloperAppLifecycle.test.ts -t "carries managed browser provenance"` exercises actual app/affinity/remote preflight with hermetic transport/storage, including missing legacy PID metadata, unknown process and wrong account. It produces no provider effects.

Developer-app CLI terminal boundary: `pnpm vitest run tests/cli/developerAppTerminalExit.test.ts tests/cli/chatgptDeveloperAppsCommand.test.ts` executes the actual command in isolated child processes and verifies full output/custody before0/1 termination despite retained handles.


### Private HTTP history-materialization storage

`ResponsesHttpServerDeps.createHistoryMaterializationService` optionally wraps the
normal constructor to replace storage while retaining server-provided cleanup,
guard and foreground-work callbacks. An explicitly injected service takes priority.
`tests/http.historyMaterializationStoreIsolation.test.ts` exercises real HTTP and
private/default file stores without provider work; queued work is captured in the
test. Cold benchmark stores must start empty and retain the production scheduler.


### Native login and direct provider qualification

Manual login and browser-tools honor the selected native desktop launcher. Native
ownership failures propagate without generic-launch fallback. Tests live in
`tests/browser/manualLoginNative.test.ts`. Direct ChatGPT provider-session proof
uses read-only utility affinity unless the caller supplied an exact target;
`tests/browser/chatgptService.test.ts` covers both paths. A local-only doctor
missing-proof result does not establish sign-out. Verify the live provider proof
separately from native process/desktop ownership.

Owned backend cleanup cancels pre-dispatch capacity waits before disconnect; dispatched failures retain uncertainty. The regression in `tests/browser/backendRequestAdmission.test.ts` waits for a real capacity denial, then proves prompt cleanup and desktop custody release.

Owned backend client cleanup applies the three-second deadline to cancellation/shutdown wire replies and physical CDP disconnect after desktop admission; it drains callbacks before disconnect. A proven pre-dispatch cancellation whose paused resource has disappeared can settle; dispatched or uncertain failures still fail cleanup.

Cancellable CDP commands and owned request holds may wait behind other automation under the caller cancellation/deadline. Human desktop control still pauses automation immediately. Admission wait does not consume the command wire-response deadline; callers without cancellation retain the existing short contention wait.

### Shared request admission across developer-app tests and prompts

With `services.chatgpt.maxBackendRequestsPerMinute` configured, developer-app inventory sockets
and normal leased prompt execution use the account's shared request authority.
New prompt targets open blank before interception and provider navigation.
Concurrent developer-app CLI actions wait in the existing operation queue for up
to ten minutes. Preflight cancellation does not silently discard unknown request
cleanup, and an unresolved backend dispatch cannot produce a successful prompt.
Provider-free coverage:
`pnpm vitest run tests/browser/backendRequestAdmission.test.ts tests/browser/legacyChatgptAffinityRuntime.test.ts tests/browser/chatgptTabProvisioner.test.ts`.
The October18 ca2 trial returned an actual HTTP429; its active warning and unknown
submission remain preserved. Passing source tests does not establish installed
three-workload acceptance or authorize another submission.

Provider-session cancellation after setup (provider-free):
`pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'session proof carries caller cancellation'`.
This exercises the public proof call with real guarded CDP and desktop gate,
contention introduced at identity reading, cancellation, human ownership, and
cancellation with native-style continuous backend admission. Passing this does
not establish live-follow completion or resolve the retained provider429.

### App-list inventory and optional settings

`apps list` uses the existing inventory-only state read. Its complete app/account
result must survive unavailable optional Developer mode settings; unknown mode
never authorizes create or replace. The command fixture rejects settings-enabled
reads for list, while existing mutation tests retain enabled-mode requirements.
Installed acceptance must verify normal CLI output, inventoryComplete, owned
cleanup, exact build identity and current native browser proof. A diagnostic shim
or fixture pass alone does not establish installed acceptance. The settings-path
cleanup failure observed during Plan0438 is repaired by Plan0439 / PR349; its
separate installed settings-enabled read passes in 504.89 seconds.

### Long utility ownership and maintenance (issue337)

`pnpm vitest run tests/browser/configuredChatgptUtilityAffinity.test.ts tests/browser-service/tabLeaseRegistry.test.ts tests/browser-service/tabLeaseRestartReconciliation.test.ts`

A virtual-time utility read crosses the five-minute heartbeat deadline while a
second maintenance owner reconciles it. Before repair it reproduces the installed
ownership-change and stale-claim aggregate in milliseconds; short work and absent
maintenance are controls. A delayed storage acknowledgement overlaps an ownership
check and proves claim serialization. Removing that serialization makes the test
fail; restored source passes. Lost/expired ownership and storage failure abort even
if the callback ignores cancellation, and all heartbeat timers stop. Both storage
adapters preserve meaningful-use time and absolute expiry; stale maintenance cannot
invalidate a renewed claim. Settlement must not revive a failed heartbeat.

### Plain assistant prose and progress (issue311)

`pnpm vitest run tests/browser/pageActionsExpressions.test.ts tests/browser/pageActions.test.ts tests/browser/observationLease.test.ts`

A sanitized retained-conversation fixture has a role-bearing search unit with
plain prose and no article, legacy role or markdown wrapper. Snapshot and progress
must agree that it has answer text. Before repair, progress reports zero chars;
adding only a content wrapper passes, while role/boundary controls retain failure.
Keep descendant prose preferred over parent chrome, reject tool-only parent text,
and reject turns below the response boundary. Progress carries counts/fingerprints,
not raw answer text. These checks do not establish when a historical answer
completed relative to its outer session deadline; preserve that uncertainty.

Plan0441 / PR352 installed readback on the qualified original conversation verifies
public progress reports 557 chars (matching snapshot) and the public collector returns
the full authoritative answer in 10832 ms. Compare non-whitespace content because
rendered table cells introduce whitespace; retain the initial overly strict oracle
as a false positive. This does not prove completion before the historical deadline.

The Plan0444 request/readback selection passes177cases/9files on Linux, including
four new local refusal cases for existing-Chrome references on the generic broker.
The broader mounted-drive attempt retained79passes and one unchanged5s lock-child
startup timeout. Do not raise that timeout. A Linux fixture must include tracked
scripts and ambient types for the full typecheck, even when only frontend tests
run. Reused dependency links point to a previously verified frozen Linux tree;
keep the new node_modules/cache root private and writable, not the frozen tree.
## Native Agent Browser task identity source checks

Native-task identity preparation uses
`pnpm exec vitest run tests/browser/frontend.nativeTaskBinding.test.ts tests/browser/frontend.config.test.ts tests/mcp.frontends.test.ts tests/mcp.frontendWorkflow.test.ts --maxWorkers=1`.
The focused fixtures exercise public frontend inspection, legacy HTTP refusal,
native versus legacy receipt identity and target locking, native configuration
refusal, and two linked MCP replies across a reopened service with an injected
synthetic native broker. No production native transport or real browser is used.
Actual reuse-only admission, authenticated target/completion readback and real
ChatGPT replies remain separate acceptance requirements. Do not count this source
selection as browser acceptance.

# Direct stock Chrome source checks

Run `pnpm exec vitest run tests/browser/stockChrome.*.test.ts tests/mcp.stockChromeProcess.test.ts`
for native framing, exact-user capability privacy, authenticated loopback broker,
explicit shared-tab controls and setup preparation. The process fixture compiles
the production native-host and frontend-only MCP entries as standalone bundles,
runs actual Node child processes and HTTP/native messaging, executes the compiled
extension toolbar/native-Port entry and supplies a synthetic Chrome Input/DOM
boundary. It selects ChatGPT Pro/Grok Heavy, checks two complete
linked UTF8 replies and recovers them after the host and capability file are gone.
It uses private directories and does not install or invoke Chrome/Windows/providers.
Each process case has a45s budget; focused guards use Vitest defaults. Linux checks
do not verify Windows ACL semantics, launcher, registry, Chrome permission prompts,
provider markup/entitlement or live replies. Those require native acceptance.

`pnpm run build:stock-chrome` prepares the extension and standalone local Node
entries. `docs/stock-chrome.md` describes the separately held setup/rollback scope.

### Own native SDK source caller

`tests/browser/frontend.nativeRuntime.test.ts` uses private temporary synthetic
files and an injected own-client/lifetime fixture. It checks final grant/binding
consistency, pins/expiry/privacy, opaque serialization, one acquisition/public
route, concurrent/changed-ID and uncertainty fences, no invented release, and
unsupported Pro with zero Sends. Default foreground entry stays closed before
private-file reads when the lifetime contract is unresolved. This is source
evidence, never a real SDK/process/producer/browser acceptance claim.

### Native operator whole-operation boundary (2026-10-26)

Focused selection: frontend.nativeRuntime, frontend.nativeOperator,
frontend.nativeAdmission and frontend.nativeLifetime. Carried read-budget
qualification is covered inside the nativeRuntime selection.
The new regression first failed because post-handshake guard loss was ignored.
Synthetic checks exercise before/after refusal, exact-once callback execution,
opaque local results and refused readback/release; existing full-v2/custody/gap
and acquired-identity coverage remains. No Python production guard or browser is
executed. Preserve failed diagnostic receipts; fixture corrections are not flakes.


### Retained native finite-Send facade (2026-10-26)

The focused nativeRuntime/nativeConsumer/nativeLifetime/nativeOperator/nativePro
and relay.mcpFrontend suites exercise the retained source runtime through P447.
All files, canonical store, provider UI and allowances are synthetic. The test
checks one acquisition, observed Pro before exact Send, complete Unicode
persistence/return and no resend after an outer MCP acknowledgment loss. Native
acknowledgment loss remains held and denies normal reply reads. Guard callbacks
that skip, replace, repeat, refuse or hold their operation cannot publish success.
Malformed/unknown carry, exact-intent drift and expiry refuse; the default
prepare-only policy still forbids draft/Send. A red regression demonstrated a Send
with insufficient complete-readback capacity; finite draft/Send now preserve the
minimum eleven/nine remaining reads without adding quota. No browser, private
operator, production transport or real Send is exercised by these suites.


### Original ledger participant source checks

The affected six-suite selection from the finite sender is reused after the194d
repair. New runtime tests exercise a required participant before startup, original
authority before accounting/Open, whole acquisition through owned cleanup,
callback-held preparation, replacement-lock retention and charged incomplete
finite work. Legacy low-level session fixtures remain synthetic; owned runtime
fixtures explicitly supply a fake participant tied to their single fixture driver.
No fake participant is installed or used for actual SDK/browser operations.

Independent review reproduced two additional races: a final protector returning
success after hold, and a queued hold landing between an assertion helper and
its caller. Both public runtime regressions were observed RED before repair and
GREEN after synchronous caller-side fences; no provider effects were used.
