# Plan0438 — Repair terminal app inventory

State: OPEN
Owner: ecochran76
Issue: https://github.com/ecochran76/auracall/issues/325
Branch: fix/issue325-attachment
Target: origin/main

## Current State

User requested actual inventory repair. PR343/c18aec802, PR344/7c3eb0b61 and
PR345/87b20beb4 are merged; active wrappers remain856276cdb until terminal
acceptance. Predecessor installed reads still fail cleanup. Current branch
fix/issue325-custody-reads addresses reproduced redundant concurrent registry
observations, reusing only PR335 standalone1460ed0c8. Final merged/install/terminal
verification remains. No successful inventory yet.

## Scope and acceptance

Reproduce and minimize the actual failure at a public seam, rank falsifiable
hypotheses, observe regression red then green, validate affected tests and native
composition, integrate through PR and verify an attributable installed terminal
inventory outcome. Do not weaken request limits, admission, native ownership,
cleanup uncertainty, or CAPTCHA/human boundaries. No prompt, scheduler control,
browser restart or guard/owner reset. PR335's broader lane stays separate.

## Execution

Serial primary-agent work. Private diagnostics stay under the user-scoped
acceptance directory. The current capture records error names/messages only;
no cookies, request bodies or browser content in Git. Stop blind probes after
the targeted cause capture; continue with provider-free regression work.

## Definition of done

Original failure loop green, meaningful regression and affected checks pass,
temporary instrumentation removed, published and merged source, installed
readback, journal/fix log/domain/operator docs consistent, and truthful issue
state. Any unqualified remaining gate stays explicit.

## Diagnosis and regression evidence

Actual terminal errors: observer cleanup unknown at identity (29.86s), followed
by a provider-interaction ledger lock timeout during inventory. Attachment does
complete; the earlier external25s cutoff did not identify a hung attachment.
Private replay copies the retained24MBsnapshot to an isolated directory, calls
32public list operations, reports sanitized counts/errors and removes the copy.
Installed baseline fails6–7reads in4–5s twice; one-read control passes0.19s.

Ranked predictions: same-instance read self-contention; external lock holder;
corrupt snapshot. Isolated replay removes external holders; single read rules
out parse corruption. A minimized controlled-slow-load regression fails2of3reads
before repair and passes after. Original32-read replay now passes0.23s with zero
failures. No account identifiers or private snapshot included in the repository.

Implementation queues read operations with durable mutations, coalesces their
snapshot load, and skips persistence for pure-read batches. Extended existing
blocked/failed-commit tests cover mixed reads without early publication.

Broader validation found two existing developer-app tests broken by Plan0437's
plain Error wrapper. Preserve original errors and track JSON stage metadata in
a WeakMap; original AggregateError/nested causes and governor identity survive.
Those3focused ownership cases now pass. Final affected selection, typecheck,
scoped lint/build, review, integration and installed acceptance are in progress.

## Source verification and review

Focused provider-free selection:161tests across5suites pass in51.79s. Final
typecheck and full build pass. Scoped Biome checks pass; package source is
excluded by the repo's includes, so the same lint rules were also applied using
an external config that only expands includes. A preexisting void forEach
callback was made explicit in the touched hunk;20ledger tests still pass.

Review fixed point36bcd6175be65a57d636c3de9036e1a35e9431fa; issue325 and this plan
are the spec. Serial Standards review: no accepted blocker after lint repair.
Serial Spec review: original Error/aggregate preservation was accepted blocking,
repaired and covered by the3existing ownership cases. Mixed commit failure and
read-only non-persistence are covered. No unrelated PR335 changes are included.
Source is ready for published-diff review and integration; installed acceptance
remains a separate gate.

## Native lifecycle continuation

PR343 mergedc18aec802. Its installed597-file parity, contract and32-reader replay
pass, but terminal inventory remained unaccepted. The original native PID exited
(actor unknown); OS census found no matching root. Supported login started the
same managed browser profile; native process/assignment/window proof passed.
Its old-runtime post-launch diagnostic was still running, so only that task-owned
CLI was terminated (keepBrowser true); the native browser remained verified.

One isolated c18aec802read ended after262.43s: no installed/linked payload captured,
then observer cleanup failed with repeated Invalid InterceptionId errors. Private
aggregate diagnostics excluded request bodies, cookies and raw browser content.
Current branch fix/issue325-owned-probe continues this same bounded objective.

Three independently red/green invariants now protect the actual chain:

- A warning probe must use the request's own live Runtime, not a closed predecessor.
  Minimized real guard/governor/observer composition reproduces the same aggregate
  cleanup failure. Reuses only PR335 standalonee0f6cf1ec's handoff.
- Native cancellation or document replacement must cancel matching queued requests
  before SDK send. Copied7controls from PR335df6ddbec6/9a056a006 fail2pre-wire
  cases before repair and pass after. The guarded transport certifies no SDK call;
  after-wire failures remain unknown, foreign/non-cancellation events do not cancel.
  The broader startup/ownership/live-follow changes from PR335 remain excluded.
- The old12sresponse timer expired while configured capacity waiting still held
  requests; navigating away after5s could cancel the awaited installed response.
  A20svirtual response went red before repair. Primary observation now includes
  the existing configured capacity allowance; optional linked metadata retains a
  bounded12swindow after root navigation. Missing optional data does not consume
  the whole capacity allowance. Caller abort removes listeners/timers and prevents
  restoration/navigation after cancellation. No outer deadline or rate limit raised.

Package/source review and final affected checks precede the second integration
slice. Native terminal acceptance, active wrapper readback and truthful issue
closeout remain required; no old unknown record, warning or paused work is cleared.

## Second-slice verification and review

All229affected tests across10suites pass in62.53s, including guarded SDK-send/native-generation
fixtures. Typecheck and full build pass. Scoped lint has
no errors;8existing CDP-casing warnings in the inventory fixture remain unchanged.
Explicit package-source lint with the repository rules passes. No debug prefixes,
startup-waiter API or cross-client ownership helper were imported from PR335.

Serial review fixed pointc18aec8021406d75acf8d55ab96e5c2372424654. Standards:
no accepted blocker; generic send-certainty lives in shared transport and native
request/frame handling remains provider-local. Spec: optional metadata consuming
the full capacity allowance was accepted blocking, fixed with a red/green elapsed
response test; caller-abort/no-post-navigation control passes. Unknown post-wire
outcomes and original history remain preserved. Source is ready for published
review/integration; terminal installed acceptance remains required.

## Capacity-wait cancellation continuation

PR344 merged7c3eb0b61;597-file installed parity and contract pass. Normal read
failed after275.7s and a targeted aggregate capture after279.65s, both at
restore-navigation with unknown cleanup. The capture identifies raw native
AbortError plus Invalid InterceptionId; the retained backend records for that
capture contain76settled and26proven-unsent requests, no unknown sends.

Current branch fix/issue325-capacity-cancel retains the same owner/objective.
Ranked predictions: budget-wait entry bypasses cancellation classification;
warning probe propagates cancellation before admission; or continuation reaches
wire after interception disappearance. The public authority wait regression
cancels during listActiveProviderWarnings, after the prior cancellation check.
It goes red with raw AbortError rather than the certified pre-dispatch error.
waitForBackendBudget threw synchronously before its caller's promise catch could
run. Make its entry asynchronous so the existing classification handles both
already-aborted entry and timer cancellation. Warning and post-wire controls
remain. A final stack-only capture of the installed predecessor is pending;
no new live run starts concurrently. Original terminal acceptance remains open.

Third-slice focused validation:104tests across3suites pass in53.12s; typecheck,
scoped Biome and full build pass. Comparison7c3eb0b615534ef9511c6ca16eb9700c119dc13c:
serial Standards review found only formatting, repaired; serial Spec review found
no blocker in the scoped cancellation fix. Original whole-workflow acceptance
remains pending. The post-run native verification identifies the current browser
process910183, exact assignment and current window; predecessor PID absence does
not establish current browser absence. No additional launch is required.

## Shared custody observation continuation

The final predecessor stack capture failed after283.38s with tab-lease registry
lock timeout plus raw dispose cancellation. It is a distinct retained failure,
not a successful retry of the prior native-cancellation run. No concurrent live
inventory runs were used. Native process/assignment/window readback passed.

Ranked predictions: redundant concurrent custody reads; an external lock holder;
corrupt snapshot. Private isolated32-reader control passed0.69s;256read stress
reproduced136lock timeouts in8.01s without any external holder. Existing PR335
standalone1460ed0c8 is a directly applicable overlap. Its focused public regression
fails before repair (2snapshot reads instead of1) and passes with the scoped
change. Share only unfinished identical list observations across registry
instances, clone each result, clear successful/failed promises, and keep writes
under the original exclusive lock. No settled-state cache or ownership reset.
The same256-reader replay now passes0.187s with no failures. Private snapshots
are deleted after each replay and never committed. Final source checks, review,
integration and terminal installed read remain required.

Fourth-slice focused selection:124tests across4suites pass in53.12s. The stronger
concurrent-result clone control passes separately. Typecheck and full build pass.
Normal scoped lint passes for the fixture; explicit package lint encounters
preexisting undeclared-variable diagnostics at the unchanged sameWorkload type
assertions and existing whole-file formatting debt. No new source lint rule is
introduced. Serial Standards review preserves local package style; Spec review
against87b20beb451121608204bc47b78acab8f9a64978 finds no scoped blocker. Source
review does not establish terminal inventory acceptance.
