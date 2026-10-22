# Browser frontend MCP | 0444-2026-10-22

State: OPEN

## Current State

The user explicitly requested browser-front-end ChatGPT Pro intelligence, Claude effort and Grok conversations through MCP, and said "ok go" on 2026-10-22. The OAuth skill/starter is separately available; no live provider acceptance exists. This packet implements S1 only, on feature/auracall-web-mcp-01a16096 from a3d365fe.

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
