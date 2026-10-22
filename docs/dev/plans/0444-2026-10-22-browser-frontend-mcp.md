# Browser frontend MCP | 0444-2026-10-22

State: OPEN

## Current packet: S3 Grok send/status, 22 October 2026

Owner: native thread 01a16096-da12-7753-8d44-e299c2172cef on
feature/auracall-web-mcp-01a16096, starting at a6ebcd56. The continuing human
instruction and all six saved Implement choices on objective auracall revision38
cover this packet. Earlier preparation-only instructions were superseded by
those selections and the explicit frontend implementation direction. HOST-02
remains held. The current shared tab allowance is 1,000,000 generated output
tokens, fixed baseline143981; older budgets below are historical. Peer output is
unmeasured, so combined usage is UNKNOWN; no peer turn is free of that allowance.

Claude task auracall-grok-frontend-s3-20261022 revision6 approves a provider recipe
and the shared durable request workflow. Scope: src/browser/frontends, public MCP
tests, and corresponding docs only. No Claude implementation, host installers,
ChatGPT browser actions, registry writes, new OAuth platform or LIVE changes.

Grok pins the currently observed Fast model, exact root or /c/<id>, one signed-in
composer and same-form Send control. Native fill and a single click follow
viewport and hit-test checks. The DOM recipe is read-only. Message identity is
explicitly derived from position/role/text; native message IDs remain null.
Completion requires two identical nonempty observations at least one second
apart, no known generation signal and a verified conversation URL. Generation
signals remain unverified until captured in native use; fixtures prove no live
acceptance. Root URL lag and disappearing rows remain pending. Changed baseline
or unknown click outcomes remain uncertain and never trigger another Send.
Old ChatGPT v1 receipts retain native identity and their prior behavior.

Acceptance: public MCP two linked replies and restart/idempotence; refusals for
unsupported URLs, identity/model/target changes, login/challenge, occupied or
ambiguous controls and overlays; no completion during known generation or after
one observation. The first tracer failed with invalid_route before implementation
(/tmp/auracall-grok-red.log). Run affected frontend/legacy tests, typecheck, lint
and build, then obtain a milestone peer check before any native Grok attempt.
Native acceptance requires actual replies and saved-request readback through
AuraCall's public tools under the same owned Agent Browser handle. Stop on human
verification or an uncertain send; no provider API or extra paid credits.

The human-supplied [OpenSign OAuth guide](https://github.com/CochranResearchGroup/opensign-mcp/blob/main/docs/oauth-mcp.md)
was read through the connected GitHub reader, file SHA
98555cdfd4a0197d0a8a0172f06348ab756ca837. Its exact callback/resource binding,
PKCE, restart-persistent revocation/refresh replay checks, and distinction between
synthetic TLS tests and real installed-client acceptance are useful references
for the existing reusable OAuth skill. It is a separate owner-auth implementation,
not authority to add another auth server or a provider website sign-in method.

## Current State

The user explicitly requested browser-front-end ChatGPT Pro intelligence, Claude effort and Grok conversations through MCP, and said "ok go" on 2026-10-22. The OAuth skill/starter is separately available. S1/S2 source and S3 source are implemented on feature/auracall-web-mcp-01a16096 from a3d365fe. One real Grok round trip is verified through the embedded MCP harness; linked replies and complete three-provider acceptance remain pending. Current S3 outcome and recovery are recorded below; earlier packet states remain historical.

## AU-WEB-MCP01-S1 | Inspect and configure ChatGPT intelligence

Authority: direct current human chat instruction, "work on building a custom mcp server for this", followed by "ok go"; no Previews selection receipt exists for this new scope. Receipt 44d2bf98449f remains HOST-02 only. The lead treats the later direct instruction as selection of this bounded slice, consistent with current user instructions taking precedence over earlier repo markdown. Claude accepted S1 at peer revision 4 while preferring readback of this interpretation at review; preserve that disagreement, not a general exception to selection gates.

Budget: use the existing tab-wide 100,000 generated-output-token allowance, fixed native baseline 143981 at 2026-10-22T03:40:46.388Z. Count reasoning once. No new allocation from a plan, ticket, restart or compaction. Preserve earlier usage. Checkpoint at aggregate +75000; stop at +100000. Human no-progress rule: two consecutive grill/grade rounds without a newly passed required check call for safe handoff, not an automatic tab kill or reset.

Outcome: frontend_inspect reads the current visible ChatGPT intelligence state; frontend_configure requests a known effort and returns success only after readback confirms it. Both take a server-owned opaque route ID; callers cannot supply JS, handles, cookies or authority. Missing custody, wrong origin/URL/model, unknown or unavailable effort and readback mismatch fail explicitly. The slice never sends a message or calls a model API.

Implementation: share pure power-slider mapping/readback interpretation with the existing thinkingTime implementation without changing its CDP execution path. Add the frontend broker adapter under src/browser/frontends and register two tools on existing stdio MCP. Reads use probe with an evaluate detector; mutations use bounded ui_action click/focus recipes and native press arrow keys, each carrying the same retained handle. Unsupported controls refuse rather than injecting mutation JS. Route configuration explicitly binds session, exact service tab handle, authority, expected URL and model. No launch, adoption, repair or borrowed profile.

Consumption boundary: installed agent-browser 0.28.0, binary SHA256 d20b0a1307694f428b41631cd6cafcfd52c792d97f7d3edc44fa753ed838bef3. Actual no-launch GET /api/service/contracts succeeded at local port38551; raw response SHA256 526fb0f6268e964ddcd3accf52a592dac853512c1adaf88d7da3faae8d1d3309. Retain the receipt as tests/fixtures/frontend/service-contracts.json. It advertises probe/ui_action in service-request v1. This is metadata evidence, not live operation. Current inventory has no compatible retained AI-provider browser; no provider smoke is authorized by an absent route.

Plan0141 is CLOSED with its June pilot deferred. Reuse its broker-seam lessons and generic-service handoff; do not resume its old account/pilot. This new human-directed frontend packet does not implement that deferred migration or bypass its live ownership gap.

Acceptance: public MCP red/green with a fake broker mirroring actual probe/ui_action envelopes; synthetic DOM inputs; verified Pro selection/readback and idempotence; refusals for missing route/capability, wrong origin/URL/model, unavailable/unknown effort, excessive steps and mismatch; prove no Send or model API. Run focused existing thinking-time tests, typecheck, affected lint, broader source-required validation, and separate Standards/Spec review. Source validation is not live acceptance.

Later slices remain separate from S1: S2 durable browser send/status without uncertain-send replay; S3 Claude effort and Grok model adapters; S4 OAuth HTTP exposing only authorized frontend tools with principal isolation. They require their own bounded peer-reviewed execution packets under the user's continuing goal. HOST-02 remains held and unchanged.


## S1 keyboard and contract correction, 2026-10-22

Human clarification received in the active chat before the 04:33:35 UTC native
counter sample: "the keyboard step is through the front end. the slider can be
moved with the mouse and keyboard similar to how agent browser would use the
mouse autonomously". The precise message timestamp is unavailable. Keyboard
input is a frontend action. Prefer exposed click targets; otherwise focus the
observed slider through ui_action, confirm exact activeElement, send at most four
ArrowLeft/ArrowRight inputs and six total UI actions, and verify a one-step
numeric and label change after each. Never replay uncertain input.

Read-only Agent Browser source 028471e8: actions.rs:819-904 validates and selects
the exact native handle target for ordinary press and prevents autolaunch;
interaction.rs:1638 implements native keyboard dispatch; service_ui_action.rs
supports focus. The actual synchronous HTTP service-request route relays and
returns success/data. No undocumented queued ACK or polling protocol is assumed.

Peer revision6 accepted the keyboard correction and removed invented taskAuthority.
Codex rejects the peer's literal {action, params, handle} suggestion: the canonical
schema service-request.v1.schema.json names serviceTabHandle at the top level,
not handle. Existing top-level routing fields remain valid. Only action-specific
key belongs in params; capability authentication uses the Authorization header.
The fixture now checks this actual shape. The peer's sourceValidated flag would
conflate test evidence with runtime observations; public output instead explicitly
states liveVerified:false pending native/provider acceptance. Source validation
and grades remain in review evidence.

Observed validation so far: initial public contract red18fail/6pass; after route
and keyboard corrections45tests pass including21legacy thinking-time cases.
Serialized readonly DOM and real loopback HTTP fixture23tests pass. These are
synthetic broker/provider fixtures and never send a prompt. Typecheck/lint/full
provider-free regression and startup wiring remain pending.


Peer revision8 accepted both source-based corrections, withdrawing the literal
handle field and sourceValidated flag. Agent Browser service_ui_action.rs:161
explicitly supports focus; interaction.rs:1651 returns {pressed:key} without
targetId. Native request preparation fences the handle before that dispatch, and
the following probe independently rechecks targetId. No target field is invented.

Startup wiring now registers both tools through the explicit configuration
factory. The factory never opens a connection or reads a capability value.
User-facing configuration and the per-request contracts preflight are documented
in docs/mcp.md. Existing shared services remain unchanged. Validation is ongoing.


Validation checkpoint: native219349 at2026-10-22T04:44:16.367Z equals75368/100000
lead output tokens used,24632 remaining; combined peer totals UNKNOWN. Later
measurement229045 at04:49:02.126Z equals85064 used,14936 remaining. Preserve this
baseline; no new slice allocation. S2/S3/S4 and real-provider acceptance remain
pending. At peer instruction threshold (<10000 remaining), stop after the S1
commit and report rather than starting another work unit.

Two Gemini media tests failed in the comprehensive run and reproduced on the
unchanged a3d365fe isolated baseline: first case times out, then resumed image
returns generated.png instead of resumed.png. They are pre-existing in this
checkout/environment. The initial MCP schema/compiled smoke failures were a lead
validation-order mistake: tsc alone omitted dist/configs/auracall.services.json.
The complete pnpm run build now passes; recheck compiled startup after its assets
are staged. Do not erase the first failures or label a rerun as initially clean.


## S1 validation result

Complete pnpm run build PASS. Post-format typecheck and scoped lint PASS.
Compiled stdio smoke PASS: both tools listed, unknown route returns route_missing,
outbound TCP/fetch blocked and zero attempted connections. Mounted-drive smokes
also timed out; do not erase those environment failures. An exact executable-source
and fixture hash manifest pins an isolated Linux validation copy, with the same
installed dependencies copied without install/lifecycle effects.

Comprehensive provider-free Linux run (AURACALL_LIVE_TEST=0, tests/live excluded,
maxWorkers2):426files,422passed/2failed/2skipped;4100tests,4087passed/2failed/
11skipped,176.97seconds. All frontend52tests and legacy thinking-time21 pass;
existing MCP schema2 and server1 pass. Two failures reproduce on unmodified
base a3d365fe: llmServicePromptStructure exact-text assertion and browser/login
launch-profile expectation. The earlier Gemini mounted-drive failures disappear
in the Linux run. This is not a clean comprehensive PASS or live acceptance.

Runtime source references remain Agent Browser028471e8; contract fixture SHA256
526fb0f6268e964ddcd3accf52a592dac853512c1adaf88d7da3faae8d1d3309.
Current S1 source is reviewable and bounded. Parent goal remains incomplete:
no real frontend provider round trip, no Claude/Grok frontend adapters, no durable
send/status integration, and no OAuth HTTP hookup. Historical HOST02 is unchanged.


Final peer revision10 CONTINUE/LOW: code inspection only, reported tests not rerun. Standards B+; bounded S1 Spec meets with F1 open; full goal NOT MET. F1 (medium): malformed opt-in frontend config currently aborts the whole existing MCP server startup. Follow-up should isolate invalid_config to frontend calls; no live release until resolved. Low: inconsistent starting label can spend one focus action before refusing. No new work within remaining allowance.


## F1 correction and human allowance amendment, 2026-10-22

The human requested "fix thr invalid front end configuration", then granted
"each tab gets 1M token allocation to complete the objectibe" and directed
"ask matt and grill and grade" with an unfinished/non-progressing chat cutoff.
This explicit grant supersedes the100k allocation; baseline143981 and all
spending carry forward. Lead measured use was100766 at the earlier stop;
combined usage including unmeasured peer output remains UNKNOWN. The750k
checkpoint is an advisory proposal, not a separately stated human number.
At1M, interpret ending the chat as saving exact-owner work/evidence/handoff and
ending agent work while preserving browser custody and history. The ambiguous
"and or" early-stop condition uses the existing two-review no-progress trigger;
newly verified requirements and improved grades are progress, not more files.
Ask Matt is a router; there is no external Matt answer or invented approval.
This is instruction-level enforcement, not an installed process-kill controller.
Previews currently still hardcodes100k; its distinct1M policy slice is being
prepared in an owned worktree, not claimed deployed.

F1 change: keep createConfiguredFrontendService strict; startup uses
createStartupFrontendService, catching only invalid_config. Its disabled typed
frontend tools return a generic invalid_config for every route; sibling tools
remain registered. Missing config remains route_missing. Unexpected errors are
rethrown, and there is no network or capability lookup at startup. Public MCP
regressions cover malformed JSON, directory/missing paths, oversized files and
non-loopback broker URLs while the real sessions sibling still works. Red was
observed at compiled stdio: the original bad config closed the MCP connection.
Final focused regression62pass (8files), including existing MCP schema/server;
typecheck, scoped lint and complete build PASS. Compiled stdio with malformed
config preserves exactly the normal tool-name set, returns invalid_config only
for frontend calls, successfully calls the real sessions sibling and attempts
zero outbound network operations. F1 is resolved in source; no installation or
live provider qualification is claimed. Peer revision12 approved F1 plan; no counter reset.


F1 drift peer revision14: Spec met; Standards A-; code inspection only. Low
hardening follow-up: name an actual capability variable in an invalid-route
fixture so its Proxy guard is non-vacuous. The separate valid-route configuration
test already checks capability non-lookup. Codex rejects the peer concern that
the sessions sibling reads real developer state: tests/setup-env.ts creates a
unique temporary AURACALL_HOME_DIR before each worker imports modules (lines17-21),
and the compiled smoke supplies its own temporary child home. Keep those
isolation mechanisms. No real session/provider state was read by the fixture.
The750k checkpoint remains advisory; clean-stop and ambiguous early-stop readings
are documented interpretations, with no automatic process-controller claim.

## S2 execution packet v1 | 2026-10-22

State: CLOSED (S2 source/fixture packet; parent provider acceptance remains OPEN). Owner: native thread 01a16096-da12-7753-8d44-e299c2172cef.
Peer: auracall-frontend-send-status-20261022, revision4, explicit planning ACCEPT.
Codex accepts the same scope, steps and completion checks, including all three
peer amendments. S1/F1 remain completed; HOST-02 remains held. S2 was predeclared
above, rather than replacing an exhausted task. The current human instruction
is to move forward; canonical objective /o/auracall has Implement selections for
ChatGPT and linked replies. No new provider/account or installation authority.

Current state: inspect/configure are committed e0e7e762 and offline validated.
Sending, persistence and linked replies do not exist on the frontend seam yet.
Current no-launch access plan finds zero compatible retained browsers. This
packet delivers source and local-fixture acceptance; real workflow remains pending.
Use the amended shared1M allowance, fixed baseline143981; last sample158000 lead
used /842000 upper-bound remaining, combinedUNKNOWN. No refill or counter reset.

Outcome: frontend_send(routeId,requestId,text,previousRequestId?) produces one
saved request receipt. frontend_status(routeId,requestId) can read and reconcile
it after restart without ever sending again. Require an existing exact ChatGPT
/c/<id> route, retained target, expected model, an empty composer and no active
generation. No new-chat navigation, API fallback, arbitrary caller JS or repair.

Steps, serialized under this owner:
1. Add version1 validated frontend records in the AuraCall home, reusing existing
   filesystem conventions without the legacy retryable execution runner. Names
   are validated opaque IDs; bind content, prior request and exact route identity.
   Same ID/content returns the saved receipt; conflicting reuse refuses.
2. Create private0700 storage. Durable writes:0600 exclusive temporary file,
   fsync file, atomic rename, fsync directory. Unknown/corrupt schemas return a
   typed error and are never overwritten. One exclusive per-target lock covers
   configure/send/status. Record pid/hostname/requestId/createdAt; never steal a
   lock. Status reports lock_orphaned for a proven dead local holder. Manual
   operator inspection/clear is the documented recovery, never automatic.
3. Save intent before native fill. Fixed read-only DOM detection checks the
   composer exactly equals text before persisting sending and one Send click.
   Mismatch is failed_presend with no click; only a new ID can retry. Sending or
   later uncertainty blocks further sends until readonly status reconciles it.
4. Status makes at most one probe. Require baseline message identity, exactly one
   fresh user message matching text, fresh nonempty assistant identity/text,
   stopped generation and same conversation/model/target. A follow-up references
   a completed request on the same route and immediate conversation tail.
   No background polling, automatic resend or automatic stale-lock recovery.
5. Expose strict MCP inputs and idempotency annotations; keep malformed frontend
   configuration isolated from all sibling MCP tools. Update user docs and the
   existing journal/runbook/roadmap, then commit the reviewed source packet.

Completion checks: observe red then green at public MCP for two linked turns,
restart/readback, duplicate and conflicting IDs, fill mismatch, click timeout,
crash-held lock, cross-process exclusion, occupied composer, changed target,
model/conversation and interleaved user turns. Test serialized readonly DOM,
malformed record/version and filesystem persistence. Regress existing frontend
controls/startup; run typecheck, scoped lint and full build. Comprehensive prior
baseline is4087passed/2known failures/11skipped, not a green full suite. Local
fixtures are not signed-in provider acceptance. Peer milestone and final review
must grade Standards and bounded S2 Spec separately; parent Spec stays PARTIAL.

Non-goals: S1 polish, HOST-02, Claude/Grok adapters, OAuth HTTP, browser launch,
provider sends, installs, LIVE changes. Terminal condition: reviewed committed
S2 source/fixture result or a concrete gate, preserving unmeasured/live boundaries.


### S2 implementation and review checkpoint

Peer revision6 explicitly accepted packet v1 and clarified status locking;
revision8 accepted code with a must-fix interrupted-prepared window. The red MCP
regression reproduced that window and direct-call untyped ID error (2fail), then
both were fixed. Status now locks and converts prepared to failed_presend with
presend_interrupted and zero probes, because sending always precedes the click.
Same ID remains non-retrying; another ID can proceed only with a clear composer.
Initial publication deliberately uses fsynced temp+exclusive hardlink+directory
fsync (peer accepted), avoiding cross-target same-ID overwrites; updates rename.
Lost initial-create races currently fail safely with record_write_failed.

Focused Linux regression101tests/9files PASS; typecheck PASS. Scoped lint initial
warnings were corrected before final validation. Includes existing S1 controls,
configuration failure isolation and actual child process crash lock coverage.
No need to repeat original API/schema tests independently after this combined run.
Status always reads the saved receipt without a lock, and only its single probe
requires the shared lock. Orphan/foreign/unproven holders return receipt+lock state
without probing; no automatic stealing. Inspect/configure now require the same
private writable home lock and fail on orphan locks. Send overlapping controls
fails immediately. Corrupt records conservatively block all sends. Prepared
recovery is automatic only under an acquired lock; unresolved sending/sent/
uncertain with no matching evidence stays held for operator inspection and a
separately approved recovery. Never delete a receipt or change IDs to replay it.
Multiple assistant DOM nodes and virtualized history remain live-acceptance risks;
current detector refuses them instead of claiming a reply. Full build, full suite
and final peer check pending at this checkpoint. Parent Spec remains PARTIAL.


### S2 final validation before commit

Linux full provider-free regression:427files,423passed/2failed/2skipped;
4125tests,4112passed/2failed/11skipped,170.59seconds. Failures are the same
llmServicePromptStructure and browser/login cases already reproduced on base
 a3d365fe. Compared with S1's4087passed baseline, seven F1 startup regressions and
18S2 workflow cases account for the25additional passes and one added test file.
This is not a clean full-suite PASS. Focused101tests/9files PASS; typecheck PASS;
scoped lint clean with no warnings; complete build PASS. Compiled stdio lists all
four frontend tools, isolates invalid config while sessions still works, and
attempts zero outbound connections under a network-blocking preload.
Seven changed code/test files match the Linux validation copy by SHA256
(/tmp/auracall-s2-source-parity.json). Separate fresh no-launch access plans for
ChatGPT, Claude and Grok each report zero compatible retained browsers. No browser,
provider, installer or LIVE effects. The parent acceptance remains1/6(16%).
Last native budget184393/1M lead output used (baseline143981), combinedUNKNOWN.


S2 final peer revision10: Standards PASS, bounded S2 Spec PASS, DONE/LOW;
reported validation not independently rerun. Separate Codex Standards review
PASS with a nonblocking duplicated terminal-state-list heuristic; leave it for
future relevant work. Separate Codex Spec review found no behavioral violation,
with only the pending commit keeping its pre-commit verdict PARTIAL. The source
commit below closes that packet requirement. Parent Spec remains PARTIAL; real
provider acceptance and retained DEV route are still missing. No new approvals,
peer capacity, source deployment or LIVE acceptance arise from these grades.


## S2 live-acquisition and first-send correction | 2026-10-22

The human explicitly requested connecting Google Chrome and opening ChatGPT,
Claude and Grok through MCP using existing subscriptions. Same task/baseline and
caps retained: peer replan12 and drift14; no fresh task or grant. Source fa76150b
could only send in existing conversations; this prevented the requested normal
new-chat workflow. Peer14 accepted a narrow correction, including all four
required tightenings: inherited URL on every turn, no unproven adoption,
lookalike-root refusal and exact previous receipt/target/handle binding.

Actual effects: default stock-Chrome profile preflight was incompatible. The
lead explicitly selected the already-registered, compatible chatgpt-pro native
Chrome152 binding and requested a fresh access plan/preflight, which passed.
This was an operator-selected registered route, NOT the default recommendation;
no registry records were changed and no unrelated profile/lease was borrowed.
One MCP tab_new opened ChatGPT in a headless browser. A single auth probe found
'Just a moment...' human verification, no composer and no model picker. No
further ChatGPT probe, input, reload, send or model change followed that challenge.
The retained tab remains open. remote_view_open refused because no display
allocation or route-pool entry is available; this does not provide a human view.
The lead acknowledges the presentation gap and preserves the retained session.

Grok's existing validated Chromium route passed preflight; one MCP tab_new opened
it. Read-only checks found an account menu, no login/challenge and an onboarding
heading; composer visibility and subscription remain unverified. No prompts or
controls were submitted. Claude stock/default preflights have no matching
executable preference; no Claude browser was opened. HOST-02 remains held.

First-send correction: accept only the literal root or strict /c/<id>. Root must
have zero messages before fill; persist the original route/handle binding, then
one sending marker and one click. Status adopts a new /c/<id> only with the exact
fresh user text and at most one assistant, under the same target/model. Unknown
adoption becomes uncertain and blocks sends. Every linked receipt inherits the
adopted URL; previous requests must be completed, same target hash/handle and
conversation tail. Legacy v1 receipts missing conversationUrl stay c/<id>-only.
No navigation, replay, browser repair, new provider sender or HTTP OAuth added.

Public MCP RED observed conversation_required on a three-turn fresh-root test
(/tmp/auracall-first-send-red.log). Green:120focused tests/9files, including
38workflow cases, first-send timeout recovery, URL drift, incorrect user/extra
turns, old v1 receipts and changed/missing previous bindings. Typecheck and scoped
lint PASS. Build and remaining peer checks pending at this checkpoint. No paid
API fallback or extra credits. Overall provider Spec remains PARTIAL.


First-send review16 clarification: an uncertain adoption may later recover on a
fresh read-only status probe if every target/model/user/URL gate matches; no
input is replayed. A root receipt that never gains a verified /c/<id> remains
sent/uncertain and cannot complete. conversationUrl is private/local MCP
receipt data: omit actual conversation IDs from shared progress summaries.
Focused121tests/9files PASS; typecheck, scoped lint and full build PASS. The
three-turn root/restart fixture and all prior frontend cases pass. Source
inspection accepted at peer16; presentation remains a separate unresolved gate.


S3 milestone Claude8: G1-G7 accepted; nested markdown/bubble double counting
(D1) accepted as a blocking fixture gap, reproduced RED, then fixed by reading
distinct role rows with markdown precedence. D2 main-container presence is a
native preflight gate; D3 exact-text normalization stays unchanged and uses a
one-line public marker.150focused tests/10files PASS (29Grok,121prior),
typecheck/scoped lint without warnings/full build PASS. A compiled-schema run
overlapping build cleanup failed ENOENT; the post-build serial run passes all150.
Do not run compiled startup tests concurrently with a build that removes dist.

Claude8 accepts an explicitly labelled embedded MCP acceptance harness: public
AuraCall tools in-process -> existing installed Agent Browser MCP over stdio,
with isolated private AuraCall home and exact retained handle. This does not
qualify the separate HTTP broker configuration. Fresh read-only preflight must
prove unchanged browser inventory/target, exact root, signed-in Fast, empty unique
unobstructed composer, main container, and no new dialog. Then one public marker
send, at most20 sequential status probes >=1s apart, and only after completion
one linked prompt referring to the actual first reply. Stop any uncertainty,
login/challenge/new dialog or ambiguous Send; leave cookies untouched.


S3 native preflight after9eff5286 reached the exact Grok target via the existing
Agent Browser MCP with unchanged browser inventory, Fast model, account menu, no
login/challenge/dialog and no input. It exposed D2/D3: one role=main instead of
main, and an empty P/BR editor whose innerText is LF but textContent is empty.
Claude10 approved the narrow repair. Public RED6fail/32pass then38Grok PASS: a
unique deduplicated visible main/role=main scope; no scope before input returns
unsupported_scope, navigation churn during status clears stability and stays
pending. Canonical empty applies only to an editor with no nodes or exactly one
P containing one BR, no text. Spaces, extra spans and images remain drafts.
Post-fill input and user messages retain exact matching. No prompts/fills/clicks
have occurred; redo all native gates immediately before the approved send.

D2/D3 validation:159focused tests/10files PASS (38Grok+121prior), typecheck, scoped lint without warnings and full build PASS. Native acceptance remains pending.


S3 native variant: one authorized native frontend_send delivered and saved sent,
then the first status probe rejected the provider-issued /c/<id>?rid=<UUID> URL.
No resend/follow-up occurred. Read-only evidence also showed the same composer
switches to role=textbox after the first send. Claude12 approved R1-R5: one
Grok-only canonicalizer validates exact HTTPS host/credentials/port/fragment,
conversation path, one UUID rid and no other query. Preserve exact raw URL
agreement, compare/persist canonical conversation identity, and keep configured
query routes rejected. Accept exactly one combobox/textbox composer in total;
retain all form/hit/text gates. Public RED3fail87pass, then90PASS across Grok/S2
workflow tests. The saved native record needs no migration/version change.
After full validation/commit, status may reconcile this SAME request only (19
remaining of20); no more input until completed and a fresh linked-turn preflight.

R1-R4 followthrough retains all earlier source gates. Initial typecheck caught
a TypeScript negative type-predicate narrowing in the URL helper; use the
existing regex's boolean result instead. A compiled test was launched after
that unsuccessful build and failed for missing staged assets; full build is
now successful and compiled checks rerun serially. These validation-order errors
are lead errors, not provider evidence or baseline failures.

R1-R4 final validation:172focused tests/10files PASS (50Grok,122other), full typecheck, warning-free scoped lint and complete build PASS. Resume status only on the existing first native request after this commit.


## S3 native result and held linked turn | 2026-10-22

Source commits:9eff5286 (provider recipe), e533c368 (semantic scope/empty editor),
a72fe827e18d024aeaefada95aa6682b826a3eb5 (rid/textbox readback). Final focused
validation172PASS/10files (50Grok,122other); typecheck, scoped lint zero warnings
and complete build PASS. All repairs observed RED before GREEN. The earlier
full-suite4112pass/2known-fail/11skip result is historical, not rerun for S3.

Actual path: public AuraCall MCP tools embedded in-process -> existing installed
Agent Browser MCP -> exact retained signed-in Grok Fast tab. Fresh preflight
proved unchanged inventory/target, root, empty unique composer, scope and hit
test. One native fill and one click sent request grok-native-20261022-first.
After its first status found the rid/textbox variant, the same saved record was
reconciled read-only after the source repair, without migration or replay.
Status probes2/3 adopted the canonical conversation and verified identical
nonempty reply observations >=1s apart. Final status completed, exact output:
AURA-GROK-20261022-S3. Fresh embedded client/server processes read the same
receipt; identityKind derived_sequence, native message IDs null, observation
keys saved privately. Immutable completed receipt SHA256:
6a671d90958b1a073cfd27ce6e72da9cb4b6321ca693ded07bd94a73ef377475.
Actual conversation URL and browser handles are intentionally not published.

Linked-turn full preflight stopped before any second send/fill/click because the
composer's centre was covered by the original cookie-notice dialog. All other
identity/model/account/scope/empty/viewport gates passed. The second receipt does
not exist; no send is unresolved. Claude14 accepted source and first-turn proof,
held cookie controls because their persistent consent effects were unverified,
and required a human cookie choice. The assertion that Dismiss necessarily
accepts cookies was not verified; the hold rests on uncertain semantics, not a
claim of observed acceptance. No Dismiss/Accept/Reject/settings action was taken.

Standards PASS; source Spec PASS; native connected-workflow Spec PARTIAL. A real
Grok round trip passed via the embedded MCP harness; the HTTP broker path is
unverified. Two-connected-replies stays pending. The separate
configured HTTP broker, subscription entitlement and generationSignal remain
unverified. No paid API fallback, install, registry change, LIVE change or HOST02
work. ChatGPT still awaits human verification; Claude executable binding absent.

Recovery: the user answers/dismisses the existing Grok cookie notice in the same
retained tab. A resumed owner first recovers this exact peer task/revision and
request state. Then one fresh full read-only linked preflight including the hit
test, the single authorized linked prompt referring to the actual first reply,
and <=20status checks >=1s apart. Preflight must confirm the same canonical
conversation (a different rid is allowed), that grok-native-20261022-first remains
the exact conversation tail, that no cookie notice or other dialog is present,
and composerHit is true. If the tab navigated away, the path changed, or a new
dialog, login or challenge appears, stop without navigating back.
No resend/navigation/new chat/counter reset.
Preserve the final peer allowance and all existing holds. Budget at latest native
sample:338730 lead output used /661270 upper-bound remaining, same baseline143981;
combined lead+peer UNKNOWN. Parent objective remains OPEN.

Claude final16 confirms Standards PASS/source Spec PASS/native PARTIAL and the
2/6=33% milestone count, with grok-real explicitly limited to the embedded MCP
harness. Source/report check complete; the same peer task remains held with
one final check reserved for the actual linked result after the human cookie
choice. Plan status OPEN; no counter/task/budget reset.
