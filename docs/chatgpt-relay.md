# ChatGPT OAuth MCP relay

AuraCall can offer a request panel inside ChatGPT using its existing OAuth HTTP
MCP server. A local Codex/operator process stages an explicit approved request.
ChatGPT reads it through authenticated tools, then returns the entire final
answer through `relay_reply`. Codex reads the exact saved answer with `status`.
This is a ChatGPT/plugin exchange, not a provider API call or a browser launcher.

## Current verification boundary

The source provides the private store, CLI, OAuth resource server and static
panel. Synthetic signed-token loopback MCP and real local-process fixtures prove
delivery/persistence behavior. Actual OAuth consent, endpoint publication,
ChatGPT account/plugin installation, selected Pro intelligence, complete live
provider answer and native browser continuity require separate real acceptance.
No ready public URL, browser capability or model entitlement is implied.

The panel feature-detects the documented ChatGPT compatibility methods
`callTool` and `sendFollowUpMessage`. It only posts to the current conversation;
it assumes no new-conversation, sidebar, Work-only or desktop-only Extension.
Unavailable methods leave dispatch disabled. Verify the actual client and model
combination; do not substitute an API or another account when it is unavailable.

## Prepare the existing identity/endpoint binding

Use the existing approved authorization provider, registered owner and DEV
HTTPS ingress. `configs/relay-oauth.example.json` contains placeholders, not a
deployment. Make a private owner-only copy and replace every placeholder with
the approved values. `resource` is the exact canonical HTTPS MCP URL and token
audience. `issuer`, `jwksUri` and `subject` must match the real authorization
server and registered owner. Access tokens require `at+jwt`, RS256/ES256, expiry
and the exact resource audience. The authorization server owns consent, PKCE,
client registration, token issuance and refresh; AuraCall does not create these.

Permissions may use a space-separated `scope` string or an `scp` string list,
as used by Authelia JWT access tokens. When both claims are present they must
grant the same set. Malformed, oversized or conflicting claims refuse before
MCP tools are constructed. Signature, issuer, exact audience and owner checks
apply before either claim is read.

Grant only the needed `relay:read`, `relay:dispatch` and `relay:reply` scopes.
The server binds loopback; approved HTTPS ingress must preserve the canonical
Host. It rejects foreign Host/Origin, URL/body tokens, wrong audience/subject,
expired tokens and insufficient tool scope. The relay mode exposes no frontend
or browser-control tools. The UI has no external scripts/network endpoints and
receives no OAuth bearer credentials.

The relay store is an explicit private POSIX directory (Linux/WSL). Config and
request files must be regular owner-private files; store files/directories must
also belong to the executing user. Do not place live private state in a shared
checkout or modify another owner's configuration, service or registration.

### Verify the public OAuth route

Qualify the real issuer discovery and JWKS before preparing client fields. A
working browser login page does not establish an OAuth issuer. For a registered
public client, use the exact callback displayed by ChatGPT, PKCE `S256` and token
endpoint authentication `none`; the client identifier must actually be registered.
Authelia must issue signed JWT access tokens for the exact MCP resource audience,
including the allowed relay scopes. Qualify the deployed version and token shape.

The public edge must route both protected-resource metadata paths to the relay
without requiring a prior browser login. Their GET/HEAD responses must be 200 JSON.
An unauthenticated POST to `/mcp` must return 401 with a Bearer `resource_metadata`
challenge. GET `/mcp` returns 405 in this server; it is not the authentication test.
Preserve dashboard SSO and the relay's Bearer checks. Validate the actual upstream
and durable port source rather than copying the example port into live routing.
Discovery and source tests are separate from real client consent and tool use.

## Discover already-approved work (P449)

The source includes `relay_pending` under the existing `relay:read` scope. It
finds this authenticated owner's unfinished approved requests without a known
request ID. Use `limit` (1–20, default10) and optional `after` from `nextCursor`.
The response contains only request IDs, ready/awaiting-reply/held states and
predecessor IDs. It contains no prompt, answer, claim credential or other owner's
metadata. Replied work is excluded; use its original ID to read a saved answer.
Results are an advisory snapshot. Read the exact request/status before acting.

Discovery never creates or claims a request. Claimed/held entries remain the
original operation's readback path; their presence does not authorize another
message. Existing human intent, claim ownership, read/Send bounds and custody
remain controlling. The scan refuses beyond512 directory entries or on unsafe,
symlinked or corrupt request storage; it does not auto-clean or reset anything.

Once the exact reviewed runtime is selected and the actual client catalog exposes
`relay_pending`, ChatGPT can find approved work, read `relay_request`, process it
under the existing workflow and return the whole answer through `relay_reply`.
The deployed six-tool relay is not modified by a source-only validation. This
feature neither enumerates native Codex sessions nor opens unrelated browser
conversations; the relay's approved request is the communication address.

The actual manual FIRST/SECOND exchange already included complete reply readback
in Codex. `liveVerified:false` deliberately preserves the distinct browser/model
verification boundary; it is not evidence that the saved reply failed to reach
Codex. Automatic Pro controls and file transport retain their own acceptance.

## Stage and read one request

Use an opaque request ID of8–128 letters, digits, underscores or hyphens. A private
JSON input has `requestId`, exact `prompt`, and optionally `previousRequestId`.
The latter must already have a saved reply. Existing IDs accept identical
content only; changed content refuses. Prompts retain leading/trailing whitespace.
`attachments` may be absent or empty. Nonempty attachments explicitly refuse:
this first relay does not upload/commit ChatGPT files. Never omit figures or
replace a frozen attachment packet with text to bypass that boundary.

```sh
export AURACALL_RELAY_OAUTH_CONFIG=/absolute/private/relay-oauth.json
node dist/bin/auracall-relay.js enqueue /absolute/private/request.json
node dist/bin/auracall-relay.js serve
```
In plain English: select the reviewed private settings, save one approved request,
then run the relay on its configured loopback port. This writes private request
state and starts a local server; it does not publish an endpoint or send a prompt.

After the existing approved endpoint is qualified, add its MCP URL and OAuth
connection in ChatGPT Plugins and complete the normal consent. Open
`relay_open` for the explicit request ID, load the request, verify the selected
model/intelligence in ChatGPT, and choose **Ask ChatGPT** once. The panel first
persists one exclusive claim and only a fresh claim permits its message request.
ChatGPT must read `relay_request`, complete the task, and call `relay_reply` with
the original request/claim IDs and the entire answer.

```sh
node dist/bin/auracall-relay.js status YOUR_REQUEST_ID
```
In plain English: read the original request and complete saved answer locally,
including after a server/client restart. This never sends or retries a message.
The output may contain private task material; keep it in the authorized workflow.

## Automatic foreground frontend sender (P447)

The source also supplies an explicit foreground sender. It reads the original
queued request and uses an already configured retained ChatGPT frontend to type
and Send once, then saves the entire completed answer back to this relay store.
It does not require a second human message or the panel's **Ask ChatGPT** bridge.
Its operator must have both the existing private relay store and a qualified
frontend transport available in the same execution context. The deployed OAuth
endpoint alone does not provide that frontend binding.

```sh
export AURACALL_RELAY_OAUTH_CONFIG=/absolute/private/relay-oauth.json
export AURACALL_FRONTEND_CONFIG=/absolute/private/qualified-frontend.json
node dist/bin/auracall-relay.js dispatch YOUR_REQUEST_ID YOUR_ROUTE_ID
```
In plain English: send one already-approved queued request through the explicitly
configured signed-in browser route and save its complete answer. This may submit
one real model message and permanently records its claim before input. The
existing Send, read, expiry and custody limits must qualify before this command;
the command does not grant or renew them.

The sender checks the currently observed conversation URL and configured model
before its first claim. If effort is not Pro and the frontend supports bounded
configuration, it selects Pro once and independently inspects the page again.
A successful control acknowledgement alone is insufficient: the target/model and
visible Pro must still match. The configured model is preserved. A frontend
without effort controls or qualified effort observation still refuses.

Before changing effort, an immutable private `configuration.json` reserves that
attempt under the request lock. `configuration-verified.json` is published only
after successful control acknowledgement and independent Pro readback. Failure,
interruption or uncertainty leaves `held_unknown` with no Send claim; neither
automatic dispatch nor a panel/manual claim can bypass it, including after
restart. It needs explicit operator reconciliation, never a new automatic try.
A request with verified preparation does not change effort a second time.
Configuration, reads and Send still consume their existing authorized bounds;
this source capability does not renew those limits or activate a browser route.
Native Pro has matched AX source support described below; its installed producer
and runtime binding remain unqualified. File upload/download remain unsupported. A durable `sender.json`
binds this claim to its route/conversation/model comparisons; it is not a browser
grant. A preexisting panel/manual claim or an incomplete sender write is never
adopted as a new Send. Changed routes refuse even on cached automatic readback;
ordinary `status` still reads saved replies independently of frontend access.

`dispatch` performs bounded foreground status checks. An `awaiting_reply` result
means the original request is still pending. Repeating the same command and
binding only reads the original frontend status, including after process restart;
it never repeats Send. Uncertain input and frontend refusals preserve the claim.
A complete late original answer may still be saved. A follow-up must be enqueued
with the original `previousRequestId` only after the real preceding reply exists;
the existing frontend verifies the same conversation and original message order.
Before claiming a follow-up, the dispatcher also compares the frontend's completed
preceding answer with the entire saved preceding relay answer. Different answers
or an unavailable predecessor refuse before the child claim or Send.
The frontend's8192-character prompt and full-answer limits remain unchanged;
the sender neither splits nor truncates content or relaxes prompt correlation.

CLI configuration uses the existing service/stock-Chrome frontend factory. An
already-admitted native SDK caller may pass its current `FrontendTools` facade to
`dispatchRelayRequest`; JSON startup does not acquire or invent native authority.
The HTTP relay mode remains relay-only. P449 adds read-only pending discovery;
it does not expose public browser-control tools. Existing OAuth/service releases remain pinned until an independently
reviewed runtime admission selects the new sender. Source checks do not prove
actual private frontend readiness, provider/model identity or live replies.

## Durable Pro preparation without a model request

`prepare-pro OPERATION_ID ROUTE_ID` uses the existing explicit frontend and owner
config, but returns before any model claim or Send. `OPERATION_ID` names a real
route-control operation, not a queued model request. It refuses existing model
request IDs, including completed FIRST/SECOND; do not stage a fake request to
use it. The exported `prepareRelayProOnly` accepts only inspect/configure methods.

```sh
node dist/bin/auracall-relay.js prepare-pro YOUR_CONTROL_OPERATION YOUR_ROUTE_ID
```
In plain English: select and independently verify Pro on one already-authorized
browser route without sending a chat message. This changes a visible browser
setting and writes a private control journal; it still requires the current
browser binding, sufficient page-read allowance and remaining control authority.
It does not grant them or bypass an existing setup refusal.

The owner-bound `.frontend-preparations` namespace stores operation and target
fences before controls. Interrupted/refused attempts and changed IDs or bindings
cannot replay. Successful repeats return a historical receipt with
`cached:true,currentPageObserved:false`; this does not prove current Pro or grant
further input. No automatic cleanup/stale-lock recovery is supplied. Operator
reconciliation is required before another transaction for that owned target.
The CLI/store are POSIX; an already-authorized SDK facade may be supplied to the
callable module. No Windows/native connection or broker grant is manufactured.

Configuration must return genuine verified Pro, followed by independent
inspection of the same pinned route/target/model. This includes all actual
underlying page evaluations. The documented18/20 read charge cannot cover even
one3-read stock inspection; the proposed additional60 remains pending until the
human explicitly grants it. Source fixtures do not authorize a live call. The
original2Send allowance remains exhausted, and `dispatch` must not be used for
Pro-only work because it proceeds toward a model claim/Send.

## Own native SDK receiver and guarded foreground caller

The source continuation adds `prepare-native-pro PRIVATE_RUNTIME_INPUT` and the
`nativeRuntime` module. This is an explicit local receiving format, **not** a
`native` mode in `AURACALL_FRONTEND_CONFIG`, the HTTP relay or ordinary startup.
It does not enroll a producer, initialize keys, issue a grant or repair a browser.

The acquired `OwnNativeProRuntime.originalReadback(originalKey)` port holds
preparation before delegating to the same session's existing validated metadata
reader. It requires an original locally reserved key and a matching stored
operation; it returns no page observation or model reply, clears no hold and does
not replay an already attempted readback. Missing acquisition binding still
requires owner reconciliation. No consumer release or reconnect is added.

```sh
node dist/bin/auracall-relay.js prepare-native-pro /absolute/private/runtime-input.json
```
In plain English: request the separate native Pro-only workflow. The shipped CLI
currently refuses with `native_runtime_lifetime_contract_required` **before it
reads the private file or starts an SDK process**. Runtime admission is unresolved;
no input-file flag can enable it. A future reviewed compiled integration must
supply the actual producer lifetime and shared-limit policy before acquisition.

The owner-private POSIX input has version `auracall.own-sdk-runtime.v1` and exactly
these top-level fields: `version`, `bindingOut`, `grant`, `admission`, `options`.
`bindingOut` is the path to the immutable private ProducerBinding receipt;
`grant` is the separately admitted final OwnerGrant, not that receipt. `admission`
is the existing strict eight-field NativeConsumerAdmission. It contains the
**consumer** capability, never the owner capability or key. Parsing only validates
private storage and field consistency; the producer still authenticates the
current distinct owner/caller and finite grant under its authority fence.
Owner-profile-capability, enrollment, cleanup-enable and unrelated fields refuse.

`options` names `producerExecutable`, `producerManifest`, `producerHome`,
`producerSocketDirectory`, `consumerLedgerDirectory`, `preparationDirectory`,
`routeId`, `expectedUrl`, `expectedModel`, and `operationId`. All files/paths must
be explicit, owner-controlled and bounded. The two pre-existing private ledger
roots must be distinct and not nested. Producer bytes/manifest must match the
trusted source pin e43ca62a/6814c8cc; JSON cannot choose a replacement pin. The
source fixture seam supplies its own synthetic pin without changing that default.
No ordinary broker/stock JSON semantics or public OAuth scopes change.

`startOwnNativeRuntime` retains one caller-owned SDK1.32 client, using only the
pinned producer `mcp serve` transport and explicitly selected child DEV realm.
Parent HOME is unchanged. The production connector verifies its child executable
and process UID/start identity before sending the consumer capability; backend
peer/generation/owner preservation remain separately enforced by the producer.
`NativeConsumerSession.acquire()` runs once; its **public** `session.binding`
supplies the returned native route. No hidden facade lookup, borrowed task,
serviceTabHandle projection or second Open is used. The returned interface offers
the immutable route, state, journaled `prepareProOnly`, original metadata
readback, explicit hold and `releaseConsumerReference(originalKey)`. The latter
releases only the consumer reference under contract6b47, as detailed below.
It does not expose Send or claim.

A fixed `.sdk-runtime/intent.json` in the original consumer ledger is fsynced
before the SDK attempt. Uncertainty leaves it held, including changed operation
IDs or process restart; no fresh client, stale-lock cleanup or retry is supplied.
Private capabilities are not serialized in runtime objects or receipts. Held
clients stay retained, and the compiled lifetime receiver retains that exact
client privately for original readback before Open; its typed client port has no
close method. SDK.close disconnects transport; it is not consumer release.
Browser contract6b47 defines browser_close as consumer-reference release only,
retaining producer/history. This caller does not invoke it automatically.

`createRetainedNativeLifetime` supplies the compiled retention policy for the
existing `qualify`/`retain`/`uncertain` interface. It binds one exact receipt,
producer pin and expiry; retains one client; rejects replacement clients and
requalification; and never clears a hold from stored or mismatched metadata.
Admission completing after a hold or expiry cannot revive the attempt. The
existing runtime journal separately fences attempts across processes and IDs.

The compiled policy requires a trusted `admit(context)` verifier supplied by an
operator integration, covering actual host preservation, private admission,
shared limits and SDK handshake-failure behavior. No production verifier is
implemented or selected here, and a no-op fixture is not live qualification.
JSON cannot supply it or enable the CLI. Review of this retention policy alone
does not authorize startup, consumer release, reconnect or browser activity.

The native adapter consumes the matched AX facts described below. Missing or
conflicting facts still refuse; ordinary input ACKs cannot manufacture Pro. The
existing protected helper reserves a distinct route-only operation and performs
an additional independent Pro inspection. Frozen191/c8 remains separate history; this source candidate
is not installed or activated. Bastion's canonical relay store is not a WSL local
store; the explicitly admitted local preparation journal does not create model
requests or replace canonical dispatch/readback. Existing 18 documented reads,
unknown full trace, pending extra60 decision, six-control bound and exhausted two
Sends/PD hold all carry. A fresh directory or SDK session is not fresh capacity.

## Completion, uncertainty and limits

A successful panel message call is only message submission, not a model reply.
Claims never expire into a fresh dispatch and have no automatic stale recovery.
Repeated or concurrent claims cannot authorize a second panel message. Unknown
delivery leaves the original claim held; read back that original request, never
create another ID or resend. A late original answer can still be stored against
the original claim. Exact repeated answers read back; conflicting answers refuse.
An existing complete reply remains readable even if a later hold/cleanup fails.

Saved replies include their exact UTF-8 SHA256 digest. Prompts allow131,072
characters, answers262,144; oversize input refuses rather than truncates. Relay
HTTP bodies are bounded at2MiB; legacy frontend mode retains its64KiB ingress.
`providerResponseId:null` and `liveVerified:false` remain explicit: a relay claim
ID is not a native ChatGPT response ID, and OAuth delivery does not prove native
browser continuity, project, model or intelligence.

The existing owner must reconcile approval, current source/packet hashes,
original conditional intent and shared Send ledger **before staging/dispatch**.
These generic relay records do not issue browser grants or supersede that ledger.
In particular, the standing PD request2d52984e remains unclaimed until its eight
unchanged committed files, actual Pro, current project/custody and remaining
shared two-Send checks pass. Do not use a generic canary in its place. No watcher,
scheduler, automatic refresh/replay or provider call runs in this implementation.

## References

- [OAuth client/server flow](https://developers.openai.com/plugins/build/auth#oauth-flow)
- [Connect a custom MCP server](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Component bridge capabilities](https://developers.openai.com/plugins/reference#capabilities)
- [MCP App compatibility methods](https://developers.openai.com/plugins/build/chatgpt-ui#prefer-shared-fields-and-methods)

## Matched native AX Pro and explicit reference release (Plan0448)

The source adapter now consumes the reviewed privacy-r2 AX contract d082ce05 and
17-case fixture8434aa4a. It requires a unique named Intelligence or Thinking effort
slider, explicit enabled state, finite integer value in the observed0..4 range,
and a matching visible label. Model/account/composer evidence and URL must remain
qualified. Unknown names or missing/conflicting AX facts refuse; this recipe is
synthetically tested, not proof of a current website layout.

Preparation opens only the observed enabled model picker when necessary, then
uses snapshot-ref ArrowRight input with a Boolean native ACK. Each step requires
a newly correlated URL/snapshot/URL observation and exactly one value increment;
the protected prepare-only journal additionally runs independent inspection.
Input reservations retain the existing control cap and leave six reads for the
post-input and final independent checks. No claim, prompt, Send or file transfer
is added. Refusal or uncertainty holds the session and never replays input.

The own runtime exposes explicit `releaseConsumerReference(originalKey)` on its
retained session. It journals one consumer-reference release, conservatively
charges one existing control slot and reserves one remaining metadata read.
`browser_close` must report released/retained with matching prior-operation
metadata; this is not a fresh close/input ACK. A lost result permits only original
metadata readback. Unknown operation history, the SDK connection and producer
browser remain retained; no SDK.close, reconnect or automatic cleanup occurs.

The compiled producer pin remains e43/6814, not silently changed to AX55 or a
future cache-preserving host. Actual operator admission, compatible installed
producer, cache transition/old-host preservation and browser Pro acceptance stay
unqualified. Default startup is closed. Shared Sends remain2/2 used, +60 page
reads pending, PD held; source tests grant no live capacity.

### Carried native Pro accounting (source-only Plan0448 repair)

`startOwnNativeRuntime` also requires `readBudget(context)` from a reviewed
compiled operator integration. `qualifyNativeReadBudget(context, verify, now)`
accepts only the exact `same-p266-pro-only-063a5c60-additional60` amendment:80
cumulative reads, six carried controls and already-used two Sends. The context
binds receipt/producer/admission digests, the canonical private ledger directory
and admission expiry. The verifier must independently establish COMPLETE original
counts plus the byte-digest of the sorted original reservation snapshot. Null,
unknown, omitted, conflicting or expired evidence refuses before SDK startup.
Neither this callback nor the qualifier is supplied by JSON or OAuth metadata.

The opaque qualified token is matched again by the runtime and ledger. An
immutable private `read-budget.json` binds original rows to the policy; totals
are carried usage plus new reservations, without charging original rows twice.
Failures remain charged, and a changed policy, omitted original row, fresh target
or changed directory cannot reuse the token. Draft and Send are forbidden even
if a caller attempts to use this Pro-only session outside preparation. The
ordinary unamended consumer retains its20-read guard, but cannot consume a
budgeted ledger without its original policy. A new owned runtime always requires
qualified accounting; it cannot obtain fresh capacity by omitting the callback.

Chief4aa approves the numerical amendment only. Current18 documented is a floor,
not a complete total or62 reads remaining. Production complete-history verifier,
old-host preservation and real finite private admission remain missing. The
compiled producer pin remains e43; the later7d candidate is not selected here.
The default CLI still refuses before private inputs or SDK startup. This repair
performs no browser/provider calls and does not activate the route.

Review correction: bind the entire post-amendment reservation snapshot to the
retained opaque policy, not only its initial baseline. Missing or changed later
rows cannot restore capacity. Revalidate original reservation/completion metadata
immediately before the first SDK connector call after asynchronous qualification.
A refused or lost attempt retains its journal; restarting cannot issue a new
policy over an already-budgeted ledger. This source check still requires actual
operator-held writer exclusion and does not manufacture preservation proof.

### Isolated producer selection (same P266 source integration)

The compiled `NativeProducerPin` can include `namespace: "p266new"` for the
reviewed isolated direction. The received pin is frozen before private reads;
the SDK child adds `AGENT_BROWSER_DEV_NAMESPACE=p266new` to its existing explicit
home/socket/development environment. Other namespace values refuse. Private
runtime JSON has no namespace field, and ambient environment cannot select it.
The source default e43 binary/manifest remains unchanged and does not select or
activate the new realm. The operator must supply the final matching reviewed
selection and bind the exact disjoint roots/authority through real admission.

This fixes namespaced producer process-evidence routing without passing the
installer's seven ports or Remote View credentials into the SDK by assumption.
Frozen producer `renderDevelopmentLauncher` emits the variable, and native
`dashboard_backend_unit_name` uses it for the isolated DEV backend. The explicit
socket override still controls endpoint routing; namespace alone is not authority.

Current direction5efee avoids any old5354 shutdown/write rather than proving old
shutdown safe. The remaining operator/native integration must hold current guard
and complete original accounting across observation, SDK acquisition and use.
The early observer's30-second validity cannot be replaced by the longer grant
expiry or a one-time READY boolean. No such production guard is supplied here.

### Final observer and current-protection integration

The compiled `createRetainedNativeLifetime` options now require two callbacks:

- `admit(context, requestNonce)` runs once before acquisition. The policy creates
  the fresh32-byte nonce. The actual trusted callback must reserve original
  accounting, hold the operator guard, invoke the exact pinned owner-private
  helper, verify its qualified completion and directly consume the fresh0600
  result. It validates the FULL final1727 grant/owner/generation/private binding
  before returning only `receiptDigest`, `producerSha256`, `requestNonce`,
  `observedAtMs` and `validUntilMs` to the policy. This projection is not a new
  producer wire format and never supplies authority from caller-loaded JSON.
- `assertCurrent(context, dispatch)` verifies the actual held operator guard
  and current authority immediately before the requested protected dispatch.
  It uses the original admission provenance and original accounting lineage;
  it must not invoke admission/observation again or renew task/grant/expiry.

The policy checks exact nonce/digests, timestamp order, clock reversal and the
at-most30-second initial deadline bounded by the original grant. Freshness is
checked before connection/acquisition and after validated acquisition completion.
Later use can outlive that observation only under the finite original grant and
real current protection. Successful prior input/completion identity is not a
substitute for the guard. No lock across CDP is inferred from the observer's
before/after native snapshots; platform protection is a separate integration.

`NativeRuntimeLifetime` now requires `assertCurrent(context, dispatch)` and
`acquired(context)` alongside its existing methods. Dispatch metadata is closed:
`sdk_connect`, `acquire`, `command` with action/key, `original_readback` or `release`
with original operation key. It contains no capability, selector or prompt.
The own SDK caller guards every native call on the retained connection; the
consumer still independently validates correlated completed-operation identity.
A denied/expired assertion leaves the original journal and client held. Runtime
hold fences pending calls before durable I/O and independently checks held state
after the guard wait, including when the lifetime hold hook refuses. Original
metadata readback/ref-only release also require current protection and do not
restore preparation or close the SDK/producer.

The ordinary startup still supplies no trusted callbacks. The matching platform
helper executor, full grant/output validation, continuous exclusion and complete
original accounting must be connected before runtime use. No successor binary
is selected by this source update, and no intermediate7d/e43 repin/build occurs.

### Final native v2 operator composition (source only)

The compiled own caller can use `bindNativeOperatorIntegration(receivedInput,
operator)` and pass its `lifetime`, `readBudget` and `execution` to the existing
`startOwnNativeRuntime` once. The receiver supplies the expected grant, receipt,
producer hash and clock; the operator supplies independently registered owner
identity and original producer task. Private JSON cannot enable this path.

The required `guard` is one already-acquired live instance with
`checkpoint(stage, originalContext)`, `assert_current(originalContext)` and
`attach_read_budget_context(budgetContext)`. Its three-field context remains
unchanged. The required supplier provides `reserveObservationReads(context, 2)`,
`observe(context, nonce)`, `originalUsage(budgetContext)` and
`assertCurrent(fullContext, dispatch)`. The latter receives the acquired task and
operation; it cannot be replaced by trimming them for the older operator method.

The observer supplier must itself execute the qualified pinned helper and consume
its newly created private output, returning the exact public completion and full
private v2 result. The composition validates the sealed contracte0db/fixture74e3,
including every coverage gap, before giving the lifetime policy a projection.
This does not implement a Node/Python transport or a live accounting actor.
Complete original carry, participation of all relevant writers, two-read charging,
current native authority and one retained operator handle remain required.
Unknown usage refuses. Default pins and CLI remain closed; no activation follows
from these source tests. Existing 80 cumulative reads, six controls and zero
remaining Sends are unchanged.

### Automatic roundtrip across the existing host split

Current actual deployment evidence pins the Bastion relay to release0601a218 /
source db5c0196. Its canonical store is
`/home/bak3r/.local/state/auracall-relay/store`, selected through the existing
private `/home/bak3r/.config/auracall-relay/relay-oauth.json`. These are Bastion
paths, not WSL aliases. No current-state network probe is implied by this source
trace. The WSL native runtime uses a separate route-preparation journal.

The source consumer `createMcpFrontend(ownedConnectedClient, routeId)` adapts the
existing frontend_inspect/configure/send/status tools to P447 FrontendTools.
The compiled operator can pass that facade and the actual Bastion RelayStore into
`dispatchRelayRequest`. That function returns the complete saved status/reply to
its caller and verifies it through RelayStore.status. It owns the same claim and
completion flow; the adapter introduces no sender loop or alternate store.

The remote endpoint would need to expose the genuine admitted frontend using the
existing frontend MCP registration/server, with reviewed host/auth/transport and
same-route lifetime. None is inferred from the connected relay-only MCP URL.
The current JSON dispatch CLI still supports service/stock configuration only;
the native Pro runtime still exposes prepare-only. No runnable native automatic
CLI, new server registration or authority is supplied by this adapter alone.

Next operator join: one owned authenticated frontend MCP client on the canonical
store host; a genuine guarded native facade on the browser host; complete original
accounting and a specifically admitted future automatic Send. Current f874 policy
forbids draft/Send and native protected dispatch excludes fill; both remain intact.
Do not call createNativeConsumerFrontend to acquire a second task as a shortcut.
No copying live stores/claims/locks, WSL path alias, API-ID conversion, manual claim,
widget action or human reply copying satisfies automatic acceptancebf8f5906.

### Whole-operation operator join (exact311f, source only)

`bindNativeOperatorIntegration` now requires `dispatchJoin` alongside the existing
original guard and suppliers. Its five callback methods match the exact311f
operator component: admit_once, qualify_budget, handshake, acquire and
protected_dispatch. One persistent actual operator binding must supply them; the
source port creates no Python process, FD, IPC, reservation, authority or client.

The own runtime requires the returned `execution` object before admission or SDK
work. Connection, acquisition and governed calls execute inside these wrappers,
so a failure in the operator's AFTER check cannot be mistaken for success. The
callback must run exactly once and return the original local result. No skipped,
substituted or repeated operation is accepted. A connected SDK client is retained
even when a post-connect check fails. Existing acquired-task/current-authority and
completed-operation validation remain mandatory.

Integration-contract.v2 is not observation-v2: the supplied311f still names the
old1727 observation. The actual admission callback continues to validate FULL
f865/e0db/74e3 observation-v2, including custody coverage and mandatory gaps, before
producing timing. The persistent bridge must construct Python ObservationTiming
from that validated callback and return the original Node timing object; a JSON
object cannot substitute for the Python type or establish authority. The opaque
NativeReadBudget/client/results stay in the original Node process.

The Python join marks both itself and the original guard uncertain on refusal.
Its ABI has no recovery-readback method. Aura's originalReadback/ref-only release
remain conditional on whole-call wrapper success; if it refuses, retain the
original history and stop. Never bypass it, reconnect, recreate a claim, clear a
hold or promise that metadata readback can recover this operator.

Actual persistent bridge, writer exclusion, original usage/reservation, helper
execution, private admission and host transport are still unbound. The normal CLI
has no defaults for them. No native Send/fill permission, producer pin, JSON input
field, Bastion store identity or cumulative limit changes in this source slice.

### Finite Send on the retained native runtime (source only)

`bindOwnNativeSendFrontend(runtime, intent, authority)` exposes the existing
`FrontendTools` interface from the SAME acquired `OwnNativeProRuntime`. It does
not call the factory, acquire a second task, start a transport or change broker
routing. The original `prepareProOnly` entry and f874 allowance remain closed to
Send. Binding is one-way, and only an actual retained runtime instance qualifies.

The strict intent binds request ID, canonical request fingerprint, exact UTF-8
prompt digest and nullable previous request ID. `NativeFiniteAuthority` has three
mandatory compiled ports: `verify(context)` supplies complete original carry and
a real additional one-draft/one-Send approval; `assertClaim(context)` verifies the
original canonical P447 frontend claim; `protect(operation, run)` holds the real
original writer authority and same canonical request/current P447 phase across
the entire native ledger transaction, SDK effect, completion and lock cleanup.
Preclaim reads/controls use its ready/configuration intent; draft/Send requires
its current frontend claim. This is one phase driver,
not a second nested operator checkpoint. No JSON token, OAuth scope or default
callback supplies that authority.

The verifier receives the actual acquired task, route/model/URL, admission and
producer digests, ledger directory and expiry. Its closed evidence binds that
context, approval and original lineage/reservation digests, complete consumed
counts, one additional draft and Send, and unchanged 80-read/6-control ceilings.
The original two Sends stay charged. Unknown carry refuses. A separate immutable
`finite-send-policy.json` binds the approved finite policy while the original
read-budget anchor advances with every reservation; default sessions refuse that
policy rather than silently downgrading after a restart.

Only the active opaque transaction permits its exact native operation. Fill must
match the bound prompt and deterministic request key. Send requires the same
request, real claim and fresh independent Pro/model/URL observation. Before draft
or Send, capacity must cover the minimum reply verification (eleven or nine
remaining native reads respectively); variable generation may need more. Every
actual read still charges the original ledger. Missing authority, callback hold,
expiry, changed accounting or native uncertainty remains held without replay.

For future composition, inject this facade into the existing frontend MCP server
on the WSL browser host. Bastion keeps the canonical store and P447 dispatcher;
its owned connected SDK uses the existing `createMcpFrontend` adapter. P447 alone
claims and sends; it saves and returns the complete reply. A lost outer MCP ACK
can use original status while native authority remains valid. A lost native ACK
or authority does not grant ordinary status access or imply recoverability.

**Production remains unbound:** actual finite approval and full carried usage;
original-writer/claim authority and persistent live guard; qualified producer,
private admission and current target; and authenticated Bastion-to-WSL transport
with the real canonical claim verifier. No new endpoint, native JSON startup,
store alias, credential or runtime activation is supplied. Current two Sends are
exhausted. Files/PD remain held, and `liveVerified: false` is retained. Synthetic
success is not automatic live ChatGPT acceptance.


### Original writer participation around the native ledger (194d)

The owned runtime now requires `writer: NativeLedgerWriter` alongside lifetime,
readBudget and execution, before private startup. `bindNativeOperatorIntegration`
accepts and returns that same compiled participant; it does not create production
authority. Low-level legacy session callers remain outside this owned-runtime
admission contract. No JSON field supplies a participant.

`NativeLedgerWriter.protect(operation, run)` is the single whole-transaction phase
driver for acquisition, preparation, original metadata and consumer-ref release.
It begins before NativeLedger directory/lock creation and encloses accounting
baseline, reservation, opaque counter advancement, SDK effect, completion and
known owned cleanup. The descriptor carries immutable original base3, acquired
nativeTask6 only after acquisition, full budget context, key/bucket/intent digest,
normalized originalKeys and readReserve. The operator supplies real all-writer
participation and maps this to the current bridge; the old SDK-only wrappers must
not be nested inside it. Before-SDK lifetime/task checks remain mandatory.

`assertCurrent(operation, stage)` revalidates the SAME held participant at mutation,
effect and cleanup boundaries. It does not advance a second driver or reserve
quota again. Local hold epochs are checked synchronously in the caller after awaited assertions
and after the outer protector returns; expired or
unknown authority cannot revive the operation. File creation is already a write,
so checks occur before open and again before content/sync/accounting/completion.
Cleanup verifies that the pathname still identifies the exact owned lock. A
cleanup refusal or ownership mismatch retains evidence instead of deleting another
writer's lock. Separately admitted original-key readback/release never clears the
hold; lack of authority still refuses.

The finite facade selects its existing finite protector instead of nesting the
ordinary participant. Its authority now also requires `assertCurrent` for the
same transaction, and its descriptor carries originalKeys/readReserve. Exact
request/claim, consumed Sends, read capacity and uncertainty behavior stay intact.

**Writer classification:** this hook covers NativeLedger's files and quota updates.
Runtime `.sdk-runtime` attempt/hold journals are separate owner continuity writes,
not quota receipts; the lifetime admission/operator must explicitly govern them.
Observer reservations belong to the existing supplier and must charge both reads
before helper execution. External/manual writers and the Bastion canonical store
retain their own original-authority enforcement. Supplying this interface does
not prove those actors participate. A refused hold-journal write remains uncertain;
no cleanup/retry/usage reset follows. All production suppliers remain unbound.


### Private full-observation and acquired-task handoff (ab099/24d)

The existing `NativeOperatorDispatchJoin.admit_once` Node port now receives the
original nonce, a one-shot callback returning `{wire,value}`, and a same-attempt
`validateFullV2(wire)` callback. This is private compiled composition, not a new
MCP tool, JSON startup mode or RPC framing protocol. The operator carrier retains
the original opaque Node value and returns it only after the same Python bridge
completes its AFTER checks. It never serializes/reconstructs the local result.

The wire is the deeply frozen complete observation-v2 decoded by the unchanged
validator. The private validator captures the original grant, distinct owner and
consumer authority, producer-history task, context, nonce and original start time.
It accepts an exact full-wire roundtrip only within that attempt; missing, repeated,
late, altered-history or wrong-nonce validation holds even if the carrier catches
the refusal. No second helper call or refreshed validity is allowed.

`acquired(context)` is now a mandatory same-bridge notification. The runtime first
validates its same-client consumer task, then awaits this acknowledgement before
exposing the route. The mandatory local `assertAcquiredCurrent(context)` fence is
synchronous at the runtime caller immediately before construction; it accepts no
Promise or RPC and checks the same held state, task and original validity.
Held/expired/lost acknowledgement retains the original task
and connection, without another Open. Original producer history task is never
substituted for the acquired consumer task.

Ordinary and finite ledger operation descriptors now include immutable `dispatch`
from the same request: acquire, command/action/key, or original-readback/release
with the ORIGINAL operation key. The existing original-authority participant
selects ONE whole-operation boundary before ledger mutation. It must not nest a
second wrapper at SDK dispatch; immediate full-task/lifetime checks remain.

**Exact remaining compatibility:** reviewed Python8f1004 dispatch validation
refuses `fill`. The finite sender requires exact prompt fill, so its actual binding
remains closed pending the operator's reviewed finite-input contract. Do not
relabel fill, widen prepare-only policy or treat the three raw guard methods as
the five callback ports. The persistent carrier, actual bootstrap/affected-writer
participation/full carry/two reserved reads, helper/private admission and home-host
frontend process/reachability/auth still require operator qualification. Bastion
keeps the canonical store; no port or route is selected by these interfaces.

For the human's Surface-via-SSH workflow, browser and runner must remain home-hosted
and their lifetime must survive SSH disconnect. This source change neither starts
a background service nor proves that lifetime; runtime acceptance must verify it
and preserve original-request readback after uncertainty. Current two Sends remain
consumed, with no further model execution authorized by this source result.

### Private native frontend host entrypoint

`src/mcp/http/nativeHost.ts` exports `startOwnNativeFrontendHost(options)` for the
private compiled operator bootstrap. Its compiled import is
`dist/src/mcp/http/nativeHost.js`. This function executes the startup composition:
one `startOwnNativeRuntime`, one `bindOwnNativeSendFrontend` on that same returned
runtime, then `createFrontendHttpServer({config, service})` and an explicit
loopback listener. Starting it performs acquisition and finite qualification but
does not claim, configure, fill or Send. It is not selected by ordinary JSON/CLI
startup, and this source slice does not build, install or invoke it.

The operator must supply these exact inputs:

- `input`: the opaque result of the existing private receiver, bound to the
  selected matching producer/helper, actual finite consumer admission and paths.
- `dependencies`: the actual lifetime, complete carried `readBudget`, one
  `execution` driver and original-authority `writer`. The production entrypoint
  deliberately rejects an injected SDK connector; it uses the receiver's pin.
- `intent`: the canonical request ID, fingerprint, exact prompt digest and
  previous request ID. These are parsed and frozen before acquisition.
- `authority`: the actual finite `verify`, canonical P447 `assertClaim`,
  original-writer `protect` and `assertCurrent` ports. No additional Send is
  inferred; the exhausted original two remain charged.
- `http`: explicit frontend mode, operator-selected port, exactly the acquired
  route ID, resource, issuer, JWKS and owner subject. Relay mode, default port,
  additional routes or substituted relay scopes are not accepted. Existing
  frontend OAuth verification still requires `frontend:read`,
  `frontend:configure` and `frontend:send` as appropriate to the call.

The private bootstrap retains the returned server and runtime in the home-host
process. It must keep that process independent of the Surface SSH session and
govern shutdown using the same original authority. There are no signal handlers,
stdin hooks, SDK-close-as-release, automatic reacquisition or sender loops here.
Any post-acquisition binding/listen failure holds the original runtime and closes
only an owned listening HTTP server. Re-running the startup is not recovery.
The thrown `NativeFrontendHostError.runtime` retains that exact held runtime for
the private caller's original-readback/release reconciliation; the handle is not
serialized. Local held state and a resolved `hold()` do not prove the hold journal
or operator acknowledgement; original-record reconciliation must establish those.

On Bastion, use the existing authenticated MCP client with `createMcpFrontend`
and P447 `dispatchRelayRequest` against the canonical Bastion RelayStore. Do not
copy that store to the home host. The concrete missing production input is the
operator's private compiled bootstrap with the above real suppliers, selected
listener/reachability/authentication and SSH-independent supervision. No such
bootstrap or transport binding is supplied by this source result; there is no
qualified live launch command yet.
## Persistent private carrier composition (source only, 2026-10-26)

`createNativeCallbackIntegration` in
`src/browser/frontends/nativeCallbackIntegration.ts` supplies the existing private
`startOwnNativeFrontendHost` with `dependencies` and finite `authority`. The
operator still supplies its actual received input, exact request intent, ingress
configuration, original accounting suppliers and dedicated inherited IPC. This
is a compiled library entrypoint; there is no new JSON mode or process launcher.

It consumes frozen operator f8625bd4 / contract d4d38756, protocol
`p266.original-callback-carrier.v1`. One persistent peer retains the full-v2
validator, local SDK client and opaque results. Root results become available only
after the carrier's final return. Nested authority assertions run within that
single transaction. Malformed frames, duplicate callbacks, mismatched identity,
transport loss and holds refuse without replay, reconnect or endpoint closure.

The runtime binds a memory getter to its actual `NativeConsumerSession` before
acquisition; it refuses until that same session has a validated binding. The
carrier's before/after task callbacks read that getter, not a caller-supplied task
descriptor. Its reads perform no page or SDK action. A synchronous peer fence
also guards acquired-runtime publication. Existing local drivers may omit this
receiver; this carrier composition always supplies it.

The production path uses ordinary/finite `protect` around the whole ledger
transaction, including its exact dispatch. The legacy callback-only
`protected_dispatch` port has no context/dispatch metadata and intentionally
refuses in this peer. It is not nested inside the writer transaction or rebuilt
from remembered arguments.

Current compatibility boundary: f862's Python ledger parser rejects the mandatory
`dispatch` field already carried by Aura. A real Node-to-frozen-Python synthetic
IPC check reproduces that refusal before invoking the operation. Do not remove
that field or select a guessed successor. The incumbent operator owns the repair
and finite-fill compatibility. Its independent carrier review is also pending.
Local IPC proof does not qualify real bootstrap, original accounting participation,
complete carried usage, two reserved observations, private admission, producer
selection, frontend transport or an additional Send. Existing 2/2 Sends remain
spent; autonomous browser acceptance is still incomplete.
