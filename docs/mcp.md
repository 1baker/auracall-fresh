# MCP Server

`auracall-mcp` is a minimal MCP stdio server that mirrors the Aura-Call CLI. It shares session storage with the CLI (`~/.auracall/sessions` or `AURACALL_HOME_DIR`) so you can mix and match: run with the CLI, inspect or re-run via MCP, or vice versa.

For agent/app workflow patterns, including setup-vs-execution separation,
scoped keys, response batches, attachments, and polling rules, see
`docs/agent-workflows.md`.

## Frontend intelligence controls (development)

`frontend_inspect({routeId})` reads the visible ChatGPT model and intelligence.
`frontend_configure({routeId, effort})` accepts `light`, `standard`, `extended`,
`heavy` or `pro`. It clicks an exposed choice, or focuses the slider and sends
native arrow keys through Agent Browser. Numeric position and the visible label
must match after input. Lost focus, model/URL drift, unavailable controls and
unexpected movement stop the operation. At most four arrows and six UI actions
are allowed. Uncertain input is never automatically replayed.

Administrator provisioning only: set `AURACALL_FRONTEND_CONFIG` to a private JSON file with `brokerBaseUrl` and
`routes`. `brokerBaseUrl` must be an explicit loopback HTTP origin, such as
`http://127.0.0.1:38551`; obtain the actual port from your Agent Browser service.
Each route contains:

- `id`: the opaque `routeId` clients may use.
- `provider`: `chatgpt`, `grok` or the ungrounded development `claude` recipe.
- `expectedUrl`: the exact retained HTTPS provider page URL.
- `expectedModel`: the exact visible model-button text.
- `serviceTabHandle`: the existing broker-issued handle, including `valid:true`,
  `browserId`, `profileId`, `tabId`, `targetId`, and `sessionName` or
  `ownerSessionId`. Preserve all additional broker-issued fields. Obtain custody
  through Agent Browser; do not manufacture a handle or borrow another owner.
- `profileCapabilityEnv`: the name of an environment variable holding the
  corresponding Agent Browser capability. Keep the value out of this JSON,
  prompts, source control and tool arguments.

Existing-Chrome `connectionRef`/`leaseRef` references, prototype `controlRef`
handles, and explicit read-only access/attestations are a separate contract.
The generic frontend client refuses these locally as `invalid_request`, before
capability lookup or HTTP. Do not wrap them in a `valid:true` service-tab object.
This check does not issue authority or replace Agent Browser's authentication
and custody checks. The Browser-owned controlled contract and its receiving
adapter must be integrated explicitly before that path can be used.

Startup loads configuration without connecting to the broker or looking up a
capability value. Missing configuration or no routes returns `route_missing` on
calls. Invalid opt-in configuration disables only the frontend tools: calls return
`invalid_config` while other MCP tools remain available. Direct callers of the
strict configuration loader still receive its validation error. On every actual operation the
client reads `/api/service/contracts`, requires service-request v1 and the
`probe`, `ui_action` and `press` actions, then posts once to
`/api/service/request`. The capability travels only in the Authorization header.
Calls have a timeout and capped response size; redirects are rejected. A broker
refusal does not authorize launch, repair or a replacement browser.

Tool output contains route IDs and bounded visible state; it omits handles and
credentials. `verified:true` means the requested setting matched that call's
readback. The control recipe's `liveVerified:false` remains qualified: actual
ChatGPT intelligence acceptance is pending. Durable `frontend_send` and
`frontend_status` now support ChatGPT and Grok; their persistence and native
Grok acceptance boundaries are documented below. The Claude recipe below is a source-only candidate until its UI grounding and
actual frontend workflow are qualified.

## Grok Heavy model controls (development)

An explicit Grok route with `expectedModel: "Heavy"` opts into model controls.
`frontend_inspect` reports the current model, even before selection.
`frontend_configure({routeId, effort: "heavy"})` selects the **Heavy model**;
this is different from ChatGPT's `heavy` thinking level. Other efforts on this
route return `unknown_effort` before contacting the broker. Existing Grok routes
for Fast or other labels retain `controls_unsupported` for inspect/configure.

The candidate matches the exact `Model: Heavy` button label, without aliases or
case folding. It opens the model picker, requires one visible, enabled Heavy
menu choice with no link or upgrade/subscription indication, clicks it through
Agent Browser, and verifies an unchanged URL and exact closed-menu readback.
At most three UI steps are allowed. Drafts, generation, unresolved saved requests,
foreign menus, dialogs and covered controls prevent further input. Failed or
uncertain input may report `menuMayBeOpen:true`; no Escape, cleanup click or
automatic retry follows. The reply includes `model:"Heavy"`, `effort:"heavy"`
and `verified:true` only after this readback.

Send and status still enforce the configured exact model. A Heavy route showing
Fast cannot send. Configure does not rewrite the route or downgrade its model
binding. The selector recipe is **unverified-grounding** and `liveVerified:false`:
the public MCP fixtures are source evidence, not actual Heavy availability,
subscription, UI compatibility or a provider response.

The trigger is opened only after the preflight gates pass; the exact Heavy
choice is checked before the option click. A missing or gated option after
opening returns `effort_unavailable` with `menuMayBeOpen:true`, without cleanup.
Inspect also refuses a draft or generation. A route bound to the root becomes
stale for controls once a conversation URL exists; obtain a newly qualified
exact conversation route instead of silently adopting it. A menu item whose
text combines Heavy and a description is deliberately not an exact match.
Upgrade badges outside the item are not detected by the candidate's local
upsell check. These are residual native-grounding risks, not verified support.

The requested ChatGPT/Claude workflow has the following source boundaries:

| Provider | Model selection and effort | Linked replies and response text | Native acceptance |
| --- | --- | --- | --- |
| ChatGPT | Intelligence slider only, including Pro; preserves the exact configured model (`src/browser/frontends/service.ts:71`, `:359`). Arbitrary model switching is not exposed by these four tools. | Three linked fixture turns and restart recovery (`tests/mcp.frontendWorkflow.test.ts:643`). Status returns saved `output`, assigned from the complete observed assistant text (`src/browser/frontends/messages.ts:189`, `:649`). | Pro intelligence and actual linked replies remain pending. |
| Claude | Effort Low through Max on the exact configured model; no arbitrary model switch (`src/browser/frontends/claude.ts:274`, `:303`). | Two linked fixture replies with restart readback (`tests/mcp.claudeFrontendWorkflow.test.ts:405`). Uses the same output/status implementation. | Current selectors, effort choice and actual linked replies remain pending. |

Response readback is bounded, not unlimited: each observed message must fit the
64,000-character schema and the broker response limit. Oversized or incomplete
evidence is refused rather than published as a completed truncated reply. Saved
completed status returns the same output without another Send. The historical
two actual Grok replies remain separate evidence; Heavy has no native proof yet.

## Claude frontend candidate (development S5)

The same four tools now include a Claude-local recipe. Administrator-provisioned
routes use provider `claude`, exact `https://claude.ai/new` or
`https://claude.ai/chat/<id>`, and the exact visible model-button label.
Other hosts, HTTP, credentials, query strings, fragments and login redirects
are refused. This does not add a Claude API or a bundled global service.

Claude effort values are `low`, `medium`, `high`, `xhigh` and `max`; ChatGPT
keeps `light`, `standard`, `extended`, `heavy`, `pro`. Levels do not alias
between providers. The [documented Claude effort menu](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)
supplies the labels; `xhigh` matches only visible “Extra high”. Current model
availability and DOM selectors are NOT grounded against this account's UI.
All candidate selectors/labels and `unverified-grounding` status live together
in frontends/claude.ts; tool output carries that qualification.

Configure performs bounded broker-native clicks, reads visible effort state
after each action, and confirms the final selected level with the menu closed.
It never changes the thinking toggle or sends a prompt. A model without the
Effort menu returns `ok:false` structured content with `effort_unsupported_for_model`,
without MCP `isError`. Unknown labels are
never mapped to a nearby level. Missing, ambiguous, covered or disabled controls,
a draft, model/URL drift, login, challenge, generation or unrelated dialog
prevent further input. Inspector/configure share the existing durable target
lock with Send. Success confirms the menu is closed. If a change fails after
opening it, the typed error includes `menuMayBeOpen:true`; no automatic cleanup
click follows uncertain input. Send refuses a visibly open model menu.
An unexpected transport failure can return `frontend_failed` without that flag;
a failed configure call never guarantees that the menu is closed.

Claude Send/status reuse the same saved request IDs, intent-before-input,
one-click Send, continuity and no-replay rules. As with Grok, native message
IDs are not invented: receipts use derived_sequence observation keys with
two unchanged assistant observations at least one second apart. Restarted
services read the same completed receipt without more input. This is synthetic
logic evidence, not proof of actual Claude completion or generation signals.

Native intake made one governed tab acquisition. Its browser exited before the
first read-only probe; the previous Grok browser exited in the same second.
Both logs contain nearly simultaneous X-connection errors, but a shared
endpoint, initiator and cause remain unknown. No effort selection or prompt
was sent. The new scoped preference was retired and both ended handles are
invalid. Native retry needs the existing custody/milestone path; do not reuse
the historical handles or silently relaunch. Real Claude effort/replies and
shared SSO/HTTP-provider acceptance remain pending; overall progress stays50%.

## Protected frontend HTTP MCP (development S4)

The default `auracall-mcp` entry point remains stdio with the existing tools.
Explicit `auracall-mcp --http` selects a separate stateless Streamable HTTP
resource exposing exactly `frontend_inspect`, `frontend_configure`,
`frontend_send` and `frontend_status`. It does not initialize legacy/admin MCP
services. The listener binds only `127.0.0.1`, default port3100; administrator
managed HTTPS ingress must preserve the configured resource Host and restrict
network access. This is reviewed source/local-fixture work, not an installed or
externally available endpoint.

Ordinary browser use must follow the shared Authelia sign-in and remembered
central session. No second AuraCall login, token-paste form or WSL setup belongs
in that flow. OAuth protects the MCP connection; provider website sign-in and
browser custody still belong to Agent Browser. Actual shared SSO, authorization
server/client registration and native client acceptance are separate, pending
integration gates owned by the shared-service operator.

Administrator provisioning only: `AURACALL_FRONTEND_OAUTH_CONFIG` names an
explicit private JSON file (regular file, no symlink, <=16KiB, no group/world
permissions). Provision it privately alongside the existing frontend route
configuration; do not put subject IDs, retained handles or credentials in shared
artifacts. Required fields:

| Field | Meaning |
| --- | --- |
| `resource` | Exact canonical HTTPS MCP URL, including its path; also the token audience. |
| `issuer` | Exact trusted HTTPS issuer, matching `iss` without normalization. |
| `jwksUri` | Explicit trusted HTTPS signing-key URL; redirects are refused. |
| `subject` | One exact approved issuer subject; multi-user use is unsupported. |
| `routeIds` | Unique server-owned route allowlist, 1–32 configured IDs. |
| `port` | Optional loopback port, 1–65535; default3100. |
| `origins` | Optional additional exact HTTPS Origin allowlist, at most8. |

The resource provides RFC9728 protected-resource metadata at the root and its
path-suffixed well-known URL. It advertises the configured issuer/resource and
`frontend:read`, `frontend:send`, `frontend:configure` scopes intentionally.
Missing/invalid authority gets a401 challenge pointing to that metadata.
Read/status require `frontend:read`, Send requires `frontend:send`, and
intelligence changes require `frontend:configure`. Insufficient scope returns403
before service effects. Routes outside the allowlist have no service effects.

Only one header Bearer token is accepted. JWT access-token validation requires
RS256/ES256, `typ: at+jwt` (including `application/at+jwt`), signature, exact
issuer, one exact resource audience, expiry, the configured subject and grants.
Opaque tokens, ID-token types, untyped JWTs, query/body tokens and duplicate
Authorization headers are refused. This implements access-token typing, not the
full RFC9068 `client_id`/`iat`/`jti` profile. The actual authorization server must
be verified to emit this profile before activation. Browser cookies, gateway
identity headers and forwarded bearer injection do not replace MCP authority.
Tokens and private claims never pass to frontend adapters or tool output.

Before SDK dispatch, ingress enforces Host/Origin, POST-only MCP, JSON-only
bodies <=64KiB, depth<=16, nodes<=2048 and no JSON-RPC batches. Each HTTP request
uses a fresh stateless MCP server/transport; the existing shared FrontendService,
disk receipts and target locks preserve one-send/restart behavior. HTTP status
masks foreign-route IDs as missing. HTTP send masks foreign binding failures as
a generic content conflict and leaves foreign receipts untouched. Global
request-ID availability is not concealed between routes of this single owner;
this is not a multi-principal isolation design.

Tests cover real HTTP/official SDK clients, adversarial signed tokens, scoped
operations, route privacy, concurrent input, linked fixture replies and restart.
A compiled CLI process test uses a local HTTPS signing-key server and a synthetic
Agent Browser broker, then restarts the process and proves cached recovery adds
no input. These fixtures do not establish actual OAuth consent, Authelia SSO,
provider login, or production HTTP-broker acceptance. Existing embedded Grok
native acceptance remains distinct, at3/6=50% overall. HOST02 stays held.

## Tools

### `consult`
- Inputs: `prompt` (required), `files?: string[]` (globs), `model?: string` (defaults to CLI), `engine?: "api" | "browser"` (CLI auto-defaults), `slug?: string`.
- Behavior: starts a session, runs it with the chosen engine, returns final output + metadata. Background/foreground follows the CLI (e.g., GPT‑5 Pro detaches by default).
- Logging: emits MCP logs (`info` per line, `debug` for streamed chunks with byte sizes). If browser prerequisites are missing, returns an error payload instead of running.

### `sessions`
- Inputs: `{id?, hours?, limit?, includeAll?, detail?}` mirroring `auracall status` / `auracall session`.
- Behavior: without `id`, returns a bounded list of recent sessions. With `id`/slug, returns a summary row; set `detail: true` to fetch full metadata, log, and stored request body.

### `team_run`
- Inputs: either compact fields (`teamId`, `objective`, optional `title`, `promptAppend`, `structuredContext`, `responseFormat?: "text" | "markdown" | "json"`, `outputContract?: "auracall.step-output.v1"`, `maxTurns`, and bounded `localActionPolicy`) or a prebuilt flattened `taskRunSpec` validated with Aura-Call's live `TaskRunSpec` schema.
- Behavior: creates and executes one bounded team run through the existing `TaskRunSpec -> TeamRun -> runtimeRun` path. The structured result is `object = "team_run"` with `taskRunSpec` and deterministic execution ids/status.
- Agent/team resolution uses the effective config plus user-scoped registry
  catalog, so registry-created teams are executable without rewriting
  `config.json`.
- Provenance: compact MCP-created runs are stamped with `trigger = "mcp"` and `requestedBy.kind = "mcp"`; prebuilt `taskRunSpec` inputs preserve their validated provenance.

### `response_create`
- Inputs: `model`, `input`, optional `instructions`, `runtimeProfile`,
  `agent`, `service`, `transport`, `outputContract`, `composerTool`,
  `libraryFiles`, `deepResearchPlanAction`, `attachments`, and `metadata`.
- Behavior: creates one durable response run through the same stored-step
  response service used by local API `/v1/responses`. Browser-backed ChatGPT
  calls can request volatile workbench tools per call, for example
  `composerTool = "deep-research"` with `deepResearchPlanAction = "edit"`.
  The structured result is `object = "response"` and its `id` can be polled
  through `run_status`.
- Agent model ids resolve through the effective config plus registry catalog.
- `attachments` accepts entries with `id`, optional `fileName`, optional
  `mimeType`, and optional `uri`. Local paths and `file://` URIs become
  browser-uploadable step artifacts; remote URIs are retained for metadata and
  future materialization.
- `libraryFiles` is a separate ChatGPT provider-Library selector collection.
  Each entry contains exactly one stable provider `id` or exact unique `name`.
  It never accepts local paths or file contents. Missing/stale IDs, duplicate
  names, incomplete inventory, and unverified document references fail before
  Send; `run_status` readback retains only bounded requested/attached
  identities.
- Polling contract: create the response once, keep the returned `id`, and use
  `run_status` for subsequent state checks. Status readback is file-backed and
  must not resubmit the prompt, reopen a provider tool, or navigate the browser.

### `response_batch_create` / `response_batch_status`
- Inputs: `response_batch_create` accepts `requests` as an array of ordinary
  response-create request bodies, plus optional `metadata`, caller-supplied
  `id`, and batch limits such as `maxConcurrentRuns` and
  `maxBrowserInteractionsPerMinute`. `response_batch_status` accepts the batch
  `id`.
- Behavior: creates one durable response run per request and returns
  `object = "response_batch_status"` with aggregate counts and child
  `responseId` values. Each child remains a normal response run, so operators
  can inspect it with `run_status`. Job rows also expose the child
  `runtimeState` and bounded runtime `diagnostics` when response readback has
  browser/runtime evidence; `runtimeState = "finalizing"` means the provider
  has reached `response-complete` but AuraCall has not yet persisted the final
  child output.
- Polling contract: create the batch once, keep the returned batch id, and poll
  `response_batch_status`. Polling is read-only and must not resubmit student
  prompts, domain prompts, or provider workbenches.
- Enforcement: the API server copies batch limits onto each child run and the
  shared service-host drain path checks them before acquiring an execution
  lease. Runs skipped for a batch gate remain queued for a later drain pass.
  The browser dispatcher and provider politeness controls still provide the
  lower-level CDP/account safety guardrails.

### `project_ensure`
- Inputs: `projectName`, optional `service`, `runtimeProfile`,
  `createIfMissing`, `instructions`, `modelLabel`, `files`, `memoryMode`,
  `agentId`, `agentModelSelector`, `agentInstructions`, `agentPrePrompt`,
  `agentPostPrompt`, and `agentMetadata`.
- Behavior: finds an existing provider project by normalized exact name, or
  creates it when missing. If `agentId` is supplied, it also writes a
  registry-backed agent bound to the resolved provider `projectId` and
  `projectName`.
- Use this as the setup step for project-scoped workflows. Course grading is
  one current smoke, but the contract is intentionally generic: after it
  returns, submit ordinary `response_create` or `/v1/responses` jobs against
  the returned/bound agent id.
- This is a privileged setup tool. Execution-scoped agents should normally call
  the already-bound agent, not create provider projects.

### `run_status`
- Inputs: `id` for a response/runtime run or media generation; optional
  `diagnostics: "browser-state"`.
- Behavior: returns `object = "auracall_run_status"` with a compact status
  envelope across normal response chats, team-runtime chats, and media
  generations. It includes current status, latest event, step summaries when
  available, artifact count, artifact cache path/URI, materialization method,
  provider/runtime metadata, timing, recommended polling interval, and failure
  details. Browser-backed Extended/Pro/Deep Research runs can legitimately stay
  active for minutes to hours; callers should keep polling the same id instead
  of resubmitting.
- Browser-backed response runs can also expose a bounded
  `metadata.browserRunSummary`. For ChatGPT Deep Research `edit` runs, this
  includes the review stage/action, conversation URL, modify-plan label,
  iframe/DOM edit target evidence, and passive screenshot path when captured.
- `diagnostics = "browser-state"` adds bounded live browser evidence when the
  run is active and browser-backed, including recent browser mutation records
  when Aura-Call has recorded navigation/reload/open-reuse activity for the
  selected runtime profile and service.
- Use this as the default operator polling tool when the run type may vary.
- Persistence-safe polling: `run_status` is read-only. Calling it after a fresh
  MCP process start should read the stored response/team/media record by id and
  should not trigger provider execution. If the status payload shows an active
  browser-backed run, poll the same id again instead of calling
  `response_create` or `media_generation` a second time.
- CLI parity: `auracall run status <id> --json` reads the same durable status
  envelope from local storage.

### `search_projection`
- Inputs: accepts optional `query`, `kind`, `provider`, `runtimeProfile`,
  `tenant`, `status`, `fileAvailable`, `assetAvailability`,
  `materialization`, `limit`, and `cursor`. `assetAvailability` may be
  `available`, `unavailable`, or `pending`; `materialization` may be
  `queued`, `running`, `succeeded`, `skipped`, `failed`, `cancelled`,
  `active`, or `terminal`.
- Behavior: reads the same unified operator search projection as
  `GET /v1/search` and `auracall api search`, merging account-mirror catalog
  rows with run-archive rows without launching provider browsers. Archive rows
  include local file availability and latest archive materialization job
  metadata when present. Archive rows also include compact
  `metadata.assetFreshness` so callers can distinguish newly materialized
  available assets from older archive evidence without reading the full job
  payload. Account-mirror conversation rows include
  `metadata.conversationFreshness` with cache-derived freshness state,
  routeability state, detail/asset completeness, source/rank/fingerprint index
  evidence, and missing-local asset counts. Conversation asset counts are
  projected from both cached transcript context and account-mirror manifest
  assets that are bound to the provider conversation id.
- Paging: returns `nextCursor`; pass that value as `cursor` for the next page.

### `run_archive_search` / `run_archive_item` / `run_archive_backfill` / `run_archive_attach_evidence`
- Inputs: `run_archive_search` accepts optional `kind`, `provider`,
  `runtimeProfile`, `agent`, `team`, `responseId`, `batchId`, `status`,
  `fileAvailable`, `assetAvailability`, `query`, and `limit`.
  `assetAvailability` may be `available`, `unavailable`, or `pending`.
  `run_archive_item` accepts one stable archive `id`. `run_archive_backfill`
  has no inputs. `run_archive_attach_evidence` accepts
  caller-owned evidence with required `producer` and `schema`, optional
  `id`, `status`, `title`, `summary`, `responseId`, `batchId`,
  `archiveItemId`, `providerConversationId`, `data`, and `metadata`.
- Behavior: reads cached AuraCall-created work from the user-scoped archive
  index without provider browser or CDP access. The index covers persisted
  response runs, response batches, team runs, media generations, uploaded input
  artifacts, generated artifacts, provider conversation references, and
  attached evidence records. Runtime-backed archive items preserve raw run
  `status` and expose derived `runtimeState`, so MCP callers can filter for
  transient states such as `finalizing` without parsing response diagnostics.
  HTTP `/v1/archive` and MCP `run_archive_search` both expose cache-state
  filters for `fileAvailable` and `assetAvailability`. MCP
  `run_archive_materialization_create` queues provider-backed asset recovery
  for one generated artifact and accepts `force = true` when a caller needs to
  refresh a stale but locally readable cached asset. Use `search_projection`
  when a caller needs account-mirror rows, cursor paging, or latest archive
  materialization status filters.
- Backfill: `run_archive_backfill` rebuilds that index from existing runtime
  records and is safe for operator repair workflows because it does not touch
  provider pages.
- Evidence attachment: `run_archive_attach_evidence` stores validation,
  review, or post-processing evidence as `kind = "evidence"` so caller
  workflows can make their own audit results searchable beside the underlying
  AuraCall run.
- Use this when an MCP client needs to find uploaded files, generated
  intelligence artifacts, provider conversation ids, or batch evidence without
  knowing AuraCall runtime file paths.
- Boundary: these tools expose evidence; they do not validate domain-specific
  correctness. Caller-owned validators should attach their own evidence rather
  than expecting AuraCall core to know grading, transcript, or literature
  review semantics.

### `history_materialization_create` / `history_materialization_jobs` / `history_materialization_job` / `history_materialization_cancel`
- Inputs: create accepts a provider conversation target (`provider`, optional
  `runtimeProfile`, `browserProfile`, `boundIdentityKey`, `conversationId`,
  `providerConversationUrl`, and `projectId`), a selected `conversationIds`
  batch, `catalogItemId`, `catalogKind`, `archiveItemId`, or `reconcile`. It
  also accepts `refreshSnapshot`, `assetKinds`, `maxItems`, and `force`. Artifact
  transfers reuse readable cached files matching the current artifact ID, filename
  and URI unless `force=true`; cached files do not consume the artifact transfer
  budget. Missing files, changed sizes or mismatched retained checksums require
  transfer. Context refresh and forced artifact transfer are separate controls. List
  accepts optional `status`, `provider`, `runtimeProfile`, `sourceType`, and
  `limit`; job/cancel accept one `id`.
- Behavior: queues and reads durable `history_materialization_job` records. The
  service treats account-mirror history as a discovery index, then uses the
  provider conversation materializers to recover artifacts/files through the
  managed browser/provider path. Successful local files are written into the
  conversation attachment cache and upserted into the run archive as
  `account_mirror` rows so Search, archive, and asset routes see the same
  availability. Reconciliation target selection uses manifest assets bound to
  the provider conversation id as well as row count fields, so a refreshed
  account-mirror manifest can enqueue materialization even when the cached
  conversation row's older count fields are stale. Automatic bulk
  `reconcile=true` selection also uses conversation freshness evidence:
  fresh/complete rows are skipped unless forced, stale/partial/missing rows can
  be selected for `refreshSnapshot` reconciliation even when cached asset counts
  are zero, and terminal/guarded rows are not retried unless forced.
  Reconciliation with
  `assetKinds` containing `media` can also match unavailable media-generation
  archive rows to cached Gemini
  conversations by provider conversation id, unambiguous exact prompt/title,
  cached-media evidence, or nearest timestamp-backed exact prompt/title and
  resume the media-generation materializer. An explicit `archiveItemId` for a
  media-generation generated artifact uses the same media-history matching path
  before ordinary conversation materialization. Direct provider conversation
  evidence on the archive row can drive materialization even when that
  conversation is not present in the account-mirror catalog; legacy null
  runtime/identity archive evidence inherits explicit request selectors unless
  there is a concrete conflict. Duplicate title-only Gemini matches are skipped
  with explicit media-recovery evidence counts for cached media, timestamps,
  and cached artifacts/files before provider browser work.
  Grok media reconciliation records an explicit unsupported skip because Grok's
  resumed image materializer can only inspect the active Imagine/files surface,
  not a matched historical conversation.
  `refreshSnapshot = true` composes a current provider context read before the
  materialization phase and persists `result.phases.snapshotRefresh` plus
  `result.snapshotRefreshes` on the job. Terminal snapshot evidence, including
  Gemini direct navigation falling back to bare `/app`, skips materialization
  for that conversation and records the provider reason on the same job.
  Snapshot refreshes and materialization phases also update cached conversation
  row evidence when a row is available, and direct provider conversation id
  reconciliation can upsert a minimal cached row when provider routeability or
  detail evidence exists but the mirror list did not already contain that
  conversation. Provider hard stops such as `google.com/sorry`, CAPTCHA,
  reCAPTCHA, and visible human-verification pages fail the durable job as
  `provider_guard_required` with HTTP 409 semantics so MCP clients can ask for
  manual clearance before retrying.
- Boundary: account-mirror catalog and catalog-item tools remain cache-only.
  Call `history_materialization_create` only when an operator or agent
  explicitly wants provider recovery work. `history_materialization_cancel`
  cancels queued jobs; already-running provider work is not abortable yet.

### `api_status`
- Inputs: `port` for the local `auracall api serve` listener; optional `host`,
  `timeoutMs`, `expectedAccountMirrorPosture`, and
  `expectedAccountMirrorBackpressure`. Live-follow severity can be asserted
  with `expectedLiveFollowSeverity` (`healthy`, `backpressured`, `paused`, or
  `attention-needed`). Completion-control assertions are also available with
  `expectedCompletionActive`, `expectedCompletionPaused`,
  `expectedCompletionCancelled`, and `expectedCompletionFailed`.
- Behavior: reads the local API `/status` endpoint and returns the same compact
  scheduler summary used by `auracall api status`, including
  `scheduler.operatorStatus.posture`, wake reason, latest mirror backpressure,
  `scheduler.latestYield` when scheduler history contains a cooperative yield,
  `scheduler.foregroundWork` when API/service work is holding live follow back,
  and `completions` metrics plus active/recent controlled live-follow
  operations. Structured output also includes `liveFollow.severity` and
  `liveFollow.line`, a compact operator summary combining scheduler posture,
  completion counts, backpressure, and latest cooperative-yield evidence. It
  does not launch browsers, touch CDP, submit provider work, or read provider
  pages.
- Use this when an MCP operator needs to assert lazy mirror readiness or
  backpressure, or fail fast on live-follow control posture, without shelling
  out to the CLI. `account_mirror_status` remains the cache-only per-target
  mirror status tool; `api_status` is specifically for the running API service
  posture. Per-target mirror status includes the effective politeness limits,
  including `maxBrowserInteractionsPerMinute`; Gemini's default status should
  show the slower six-interaction-per-minute browser pacing unless service
  `liveFollow` config overrides it.
- Smoke: after `pnpm run install:user-runtime`, run
  `pnpm run smoke:mcp-api-status` to start short-lived local API servers and
  verify installed MCP `api_status` reports `disabled` and `scheduled` mirror
  scheduler postures.
- Installed ops-browser smoke: after `pnpm run install:user-runtime`, run
  `pnpm run smoke:mcp-ops-browser` to start a fixture local API server and
  verify installed MCP lists and calls `api_ops_browser_status`.
- Deterministic repo smoke: run `pnpm run smoke:scheduler-history` to start a
  short-lived local API server with an injected yielded scheduler pass and
  verify the HTTP scheduler-history route, CLI scheduler-history reader, CLI
  status summarizer, MCP `account_mirror_scheduler_history`, and MCP
  `api_status` all report the queued work owner and resume cursor.

- Deterministic completion-control smoke: run
  `pnpm run smoke:completion-control` to start a short-lived local API server
  with an injected completion service and verify `POST /status` pause, CLI
  helper resume, MCP cancel, `/status` readback, and compact `api_status`
  completion posture without provider or browser dispatcher access.
- Deterministic foreground-deferral smoke: run
  `pnpm run smoke:foreground-deferral` to resume a paused fixture live-follow
  completion under foreground backpressure and verify
  `foreground_work_deferred` status plus scheduler diagnostics readback with
  zero provider refresh calls.
- Deterministic scheduler-preemption smoke: run
  `pnpm run smoke:scheduler-preemption` to inject a foreground-yielded
  scheduler pass into an isolated local API server and verify API/CLI status
  report target-level `operator_preempted` with zero provider refresh or
  completion work.
- Deterministic health parity smoke: run `pnpm run smoke:live-follow-health`
  to start one fixture-backed local API server and compare `/status.liveFollow`,
  CLI `api status`, MCP `api_status`, and `/ops/browser` against the same
  live-follow health projection without provider or browser dispatcher access.
- Deterministic hydration smoke: run `pnpm run smoke:completion-hydration` to
  seed a paused live-follow completion in a temp cache, restart the API over the
  same cache, and verify `/status`, CLI status, and MCP `api_status` preserve
  active paused posture without provider or browser dispatcher access.
- Deterministic dashboard-control smoke: run
  `pnpm run smoke:ops-browser-control` to verify `/ops/browser` completion
  buttons are wired to `POST /status` with `accountMirrorCompletion`, then
  exercise that path against a fixture live-follow completion. The smoke also
  checks `auracall api ops-browser-status` and MCP `api_ops_browser_status`,
  which fail fast when packaged dashboard control wiring drifts from linked
  `/status` readback.
- Installed MCP dashboard-control smoke: run `pnpm run smoke:mcp-ops-browser`
  to verify the packaged `auracall-mcp` binary lists `api_ops_browser_status`
  and can call it against a fixture local API server.
- Lazy-live-follow operator preflight: run
`pnpm run preflight:lazy-live-follow` to execute the no-browser completion,
foreground-deferral, scheduler-preemption, hydration, health, dashboard, operator API-key
issue/client-auth, user-runtime install, and installed MCP status plus
log-tail checks as one release gate before live dogfood.

### `config_entities_list`
- Behavior: reads the effective AuraCall agent/team catalog. The returned
  `agents` and `teams` arrays include config-defined entries and enabled
  registry-backed entries with source/revision metadata, plus a `conflicts`
  array when duplicate ids resolve by config-wins compatibility.
- This is read-only and does not launch browsers or mutate provider state.

### `config_agent_upsert`, `config_agent_delete`, `config_team_upsert`, and `config_team_delete`
- Behavior: mutate the user-scoped agent registry by default and return the
  effective catalog with `mutationTarget`, source, and revision metadata.
- Config-defined overlay ids are pinned. Mutation attempts against those ids
  return `mutationTarget = "blocked"` with a `blockedReason` rather than
  writing a hidden registry row behind the config overlay.

### `config_snapshot_export` and `config_snapshot_import`
- Behavior: export selected effective agents/teams to
  `object = "auracall_agent_registry_snapshot"` and import that snapshot into
  the user-scoped registry.
- `config_snapshot_export` requires either `all = true` or at least one agent
  or team id. The snapshot is reviewable JSON and is not treated as the hot
  mutable store.
- `config_snapshot_import` supports `dryRun`. Config-defined overlay ids remain
  pinned and are reported as blocked rather than imported behind the config
  overlay.

### `api_key_issue`
- Behavior: privileged local operator tool that writes an additional
  agent/team-scoped key into `~/.auracall/api.env` and returns
  OpenAI-compatible `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `model` values for
  the caller.
- Optional `clientEnvPath` writes a separate scoped handoff file for the
  execution agent. That file contains `OPENAI_BASE_URL`, `OPENAI_API_KEY`,
  `AURACALL_MODEL`, `AURACALL_STATUS_URL`, and `AURACALL_BATCH_URL`.
- Scope validation uses the effective config plus registry catalog, so
  registry-backed agents and teams can receive scoped keys.
- Restart `auracall-api.service` after issuing a key. The running API process
  reads the systemd environment file at process start.
- This tool assumes local trusted MCP stdio. Do not expose it through a remote
  MCP surface until AuraCall has explicit principal/role enforcement for
  privileged agent-management operations.

### `agent_setup_package_create`
- Behavior: privileged composed setup tool that ensures a provider project,
  binds a registry-backed AuraCall agent, issues a scoped API key, and writes
  a scoped client handoff file in one call.
- Required inputs include `service`, `runtimeProfile`, `projectName`,
  `agentId`, and `clientEnvPath`. Optional inputs mirror `project_ensure` and
  `api_key_issue`, including `agentModelSelector`, agent instructions,
  `keyId`, `apiBaseUrl`, `envPath`, `services`, `runtimeProfiles`, and
  `overwrite`.
- Use this only when a privileged operator needs the full one-time
  secret-bearing setup response. Prefer `agent_setup_handoff_create` for normal
  downstream agent handoff.
- Restart `auracall-api.service` after issuing the key so the running API
  process reloads the service env file.

### `agent_setup_handoff_create`
- Behavior: privileged composed setup tool with the same inputs as
  `agent_setup_package_create`, but it returns only non-secret handoff metadata:
  project status/id, model id, scoped key id/scopes, generated client env path,
  and restart/source hints.
- The generated scoped secret is written into `clientEnvPath`; it is not
  returned in structured content.
- Use this as the default setup tool for privileged agents preparing work for
  downstream scoped execution agents.
- Restart `auracall-api.service` after issuing the key so the running API
  process reloads the service env file.

### `api_key_diagnostics`
- Inputs: optional `envPath`, defaulting to `~/.auracall/api.env`.
- Behavior: reads API-key metadata from the env file and returns
  `object = "auracall_agent_registry_diagnostics"` without returning any
  secret values. The report includes effective agent/team counts, disabled
  registry records, config-vs-registry conflicts, API-key ids, missing scoped
  agents/teams/runtime profiles, and team-derived effective agent reachability.
- Use this before handing a generated key to another agent and after restarting
  the API service to verify the key id still maps to the intended agent/team
  scopes.

### `api_ops_browser_status`
- Inputs: `port` for the local `auracall api serve` listener; optional `host`,
  `timeoutMs`, `expectedLiveFollowSeverity`, `expectedCompletionPaused`, and
  `expectedCompletionActive`.
- Behavior: reads `/ops/browser`, asserts the Mirror Live Follow controls use
  `POST /status` with an `accountMirrorCompletion` payload, reads linked
  `/status`, and applies live-follow/completion-count expectations without
  launching browsers or provider work. The dashboard contract also checks that
  browser-process diagnostics are wired to `GET /v1/browser/processes`, where
  process launch `about:blank` arguments are reported separately from actual
  open blank DevTools page targets.
- Output: dashboard contract booleans plus the same structured status summary
  returned by `auracall api status`.

### `account_mirror_scheduler_history`
- Inputs: `port` for the local `auracall api serve` listener; optional `host`,
  `timeoutMs`, and `limit`.
- Behavior: reads
  `GET /v1/account-mirrors/scheduler/history[?limit=10]` from the running API
  service and returns the compact scheduler-history payload. It does not launch
  browsers, touch CDP, submit provider work, or read provider pages.
- Use this when an MCP operator needs recent lazy mirror pass history, the
  latest cooperative-yield event, resume cursor, or no-yield proof without
  parsing `/status`.

### `account_mirror_scheduler_diagnostics`
- Inputs: `port` for the local `auracall api serve` listener; optional `host`,
  `timeoutMs`, `provider`, `runtimeProfile`, and `completionId`.
- Behavior: reads `GET /v1/account-mirrors/scheduler/diagnostics` from the
  running API service and returns the same target/wait/cache/completion/latest
  event bundle used by the dashboard and
  `auracall api scheduler-diagnostics`. When the selected provider/runtime
  profile matches the running API profile, the bundle also includes recent
  in-process browser mutation records without attaching to CDP.
- Use this when an MCP operator needs a compact handoff bundle for one
  scheduler wait row without opening `/ops/browser` or touching provider pages.

### `account_mirror_completion_start`, `account_mirror_completion_list`, `account_mirror_completion_status`, and `account_mirror_completion_control`
- Inputs: start accepts optional `provider`, `runtimeProfile`, debug-only
  `maxPasses`, `sweepMode = steady_follow|full_sweep`,
  `materializationPolicy = metadata_only|recent_missing_assets|full_missing_assets`,
  `materializationAssetKinds`, `materializationMaxItems`,
  `materializationRefreshSnapshot`, and `materializationForce`; list accepts
  optional `provider`, `runtimeProfile`, `status`, `activeOnly`, `limit`, and
  `detail = summary|full`; status accepts a completion `id` plus the same
  optional detail selector; control accepts `id` plus
  `action = pause|resume|cancel`.
- Behavior: start returns an `account_mirror_completion` operation immediately.
  Without `maxPasses`, the operation runs as `mode = live_follow`: backfill
  history until no more history is detected, then stay in `steady_follow` and
  periodically crawl for new content. List/status default to a bounded,
  side-effect-free summary suitable for monitoring. `detail = full` is an
  explicit one-off diagnostic mode that refreshes materialization status and
  returns the complete persisted receipt; it must not be polled. Status reports
  queued/running/idle_waiting/paused/completed/blocked/failed/cancelled, mode,
  sweep mode, phase, pass count, next eligible attempt, latest refresh, mirror
  completeness, materialization policy, and the latest
  `materializationCursor` when a refresh pass queued a history-materialization
  job. Bounded and live-follow operations do not become successfully terminal
  while that owned job is queued or running; a failed owned job produces
  `status = blocked` with `account_mirror_materialization_failed`. Full-sweep
  completions default to `full_missing_assets` and snapshot
  refresh; steady-follow completions default to metadata-only unless an
  operator or service `liveFollow` config opts into asset materialization.
  Full-sweep completion refreshes use an extended collector timeout to tolerate
  conservative provider pacing.
  Steady-follow refreshes restart attachment/detail inventory at the current
  top of the provider rail/project list, while full-sweep refreshes resume the
  persisted deep attachment cursor. Gemini discovery includes both the left
  rail and Gem/project conversation histories, with bounded project-history row
  budget distributed across Gems/projects before deepening one history and
  tolerated per-Gem route failures.
  Operation records are file-backed under the account-mirror cache and hydrated
  when the MCP service starts, so status readback survives process restarts.
  List readback returns recent or active persisted operations without touching
  provider browsers. Control pauses the service loop, resumes it, or records a
  terminal cancellation without launching or navigating provider pages.
- Use this instead of long-running shell commands when an operator wants the
  service to own mirror backfill and steady follow.
- Smoke: `pnpm run smoke:completion-control` proves
  `account_mirror_completion_control` cancels through the MCP handler after
  `POST /status` pause and CLI resume have both updated the same service
  operation.

### `runtime_inspect`
- Inputs: one runtime lookup key, `runId`, `runtimeRunId`, `teamRunId`, or
  `taskRunSpecId`; optional `runnerId`; optional `probe: "service-state"`;
  optional `diagnostics: "browser-state"`.
- Behavior: returns `object = "runtime_run_inspection"` with the same bounded
  runtime queue/lease projection exposed by
  `GET /v1/runtime-runs/inspect`. `probe = "service-state"` adds live
  provider state for the active step. `diagnostics = "browser-state"` adds a
  bounded browser snapshot for the active step: selected target URL/title/id,
  document readiness, visible control counts, provider evidence, recent
  browser mutation records, and a stored PNG screenshot path.
- This is read-only and does not expose raw JavaScript evaluation or unfenced
  DevTools access.

### `runtime_runs_recent`
- Inputs: optional `limit` from 0 to 100, optional
  `sourceKind: "team-run" | "direct"`, and optional
  `status: "planned" | "running" | "succeeded" | "failed" | "cancelled"`.
- Behavior: returns `object = "list"` with the same compact recent runtime-run
  rows exposed by `GET /v1/runtime-runs/recent` and the `/agents` dashboard:
  run id, source kind, team/task aliases, status, timestamps, step counts,
  service ids, and runtime profile ids.
- This is local-state only. It does not launch browsers, touch provider pages,
  or acquire dispatcher access.

### `media_generation`
- Inputs: `provider: "gemini" | "grok"`, `mediaType: "image" | "music" | "video"`, `prompt`, and optional `model`, `transport`, `count`, `size`, `aspectRatio`, `outputDir`, `wait`, and metadata.
- Behavior: creates one request through Aura-Call's shared media-generation contract and returns `object = "media_generation"` with durable artifact metadata. `wait = false` returns a running media id immediately so callers can poll `media_generation_status` or `run_status` while browser execution is active. Browser-backed Gemini/Grok media jobs wait through the browser-service operation dispatcher before provider adapters touch CDP; timelines can include `browser_operation_queued` and `browser_operation_acquired` when another operation owns the same managed browser profile or raw DevTools endpoint. Provider execution may still fail when the requested provider capability is unavailable or unsupported. Grok browser image requests are preflighted through `grok.media.imagine_image` on the explicit `/imagine` entrypoint and fail before prompt submission when the account is gated. Grok image requests scrape up to `count` currently visible generated tiles, defaulting to 8, without scrolling the wall to trigger more provider work. Grok browser video requests preflight `grok.media.imagine_video` with `discoveryAction = "grok-imagine-video-mode"`, submit through the active `/imagine` tab, poll the submitted tab for terminal generated-video evidence, and cache the MP4 through the provider download control when available. A diagnostic Grok video readback probe can poll an already-submitted tab when metadata explicitly includes `grokVideoReadbackProbe = true`, `grokVideoReadbackTabTargetId`, and `grokVideoReadbackDevtoolsPort`; it direct-connects to that tab and does not submit, navigate, reload, or fall back to browser-service target resolution.
- Provenance: MCP-created media requests are stamped with `source = "mcp"` in the structured response metadata.
- Polling contract: create the media generation once, keep the returned
  `media_generation.id`, and poll with `media_generation_status` when callers
  need media-specific timeline/artifact diagnostics or `run_status` when they
  need the generic cross-run envelope. Do not call `media_generation` again for
  status; that creates a new provider job.

### `media_generation_materialize`
- Inputs: `id` for a stored media generation, optional `count`, optional
  `compareFullQuality`, and optional metadata.
- Behavior: resumes the configured provider media materializer for one existing
  media-generation record and returns the updated `object = "media_generation"`
  response. MCP calls stamp the resumed materialization request with
  `source = "mcp"` in the materializer options. Use this for explicit artifact
  recovery or full-quality refreshes instead of creating a second
  `media_generation` job.
- Boundary: this is direct media-generation materialization parity with the
  CLI/API materialize surfaces. History-backed account-mirror recovery still
  goes through `history_materialization_create`.

### `media_generation_status`
- Inputs: `id` for a stored media generation; optional
  `diagnostics: "browser-state"`.
- Behavior: returns `object = "media_generation_status"` with current status,
  latest timeline event, full timeline, artifact count, artifact cache path,
  materialization method, checksum, preview/full-quality comparison fields
  when available, failure details when present, and derived `diagnostics` from
  the persisted timeline. The diagnostics block summarizes capability
  preflight, submitted tab, provider route progression, artifact
  polling/progress counts, terminal run-state counts, and materialization
  source without re-invoking the provider.
- `diagnostics = "browser-state"` adds bounded live browser evidence for a
  running browser-backed media job, using the recorded provider `tabTargetId`
  when present. The same diagnostics payload includes recent browser mutation
  records when available.
- Use this for polling a long-running media request without re-invoking the
  provider or inspecting raw JSON.
- Persistence-safe polling: this tool reads the stored media-generation record
  by id. It can be used from a fresh MCP process and must not submit another
  prompt, refresh the provider workbench, or materialize additional artifacts
  unless a separate materialization command is explicitly invoked.

### `workbench_capabilities`
- Inputs: optional `provider: "chatgpt" | "gemini" | "grok"`, optional `category: "research" | "media" | "canvas" | "connector" | "skill" | "app" | "search" | "file" | "other"`, optional `runtimeProfile`, optional `includeUnavailable`, optional `diagnostics: "browser-state"`, optional `entrypoint: "grok-imagine"`, and optional `discoveryAction: "grok-imagine-video-mode"`.
- Behavior: returns `object = "workbench_capability_report"` with known or discovered provider workbench capabilities, provider labels, invocation modes, surfaces, availability, stability, required inputs, output expectations, and safety flags. This is read-only discovery and does not invoke provider tools. `diagnostics = "browser-state"` adds bounded target/document/provider evidence and a stored PNG screenshot path for the selected provider. `entrypoint = "grok-imagine"` opens or reuses Grok `/imagine` through browser-service control-plane attribution before inspection. `discoveryAction = "grok-imagine-video-mode"` may click the Grok Imagine Video radio for an explicit mode audit, records before/after controls plus bounded `videoModeAudit` evidence, and restores the original Image/Video mode without typing or submitting a prompt. Grok `/imagine` provider evidence can include `run_state`, pending, terminal image/video, media URL, materialization-control signals, controls, and discovery-action evidence when visible.
- Volatility: static catalog entries use conservative `unknown` or `account_gated` availability until browser/provider discovery confirms the current account state. ChatGPT feature-signature discovery separates installed plugin inventory, linked/authentication state, and current composer visibility. Installed inventory alone does not prove current selection; `Connect`, `AUTH_REQUIRED`, and `REAUTH_REQUIRED` remain account-gated, and legacy page-token matches remain `unknown`. Discovery does not install, reconnect, enable, or invoke an app. Selectable apps report `invocationMode = composer_mention`. Grok discovery can report visible Imagine image/video evidence without submitting a generation request.

## Resources
- `auracall-session://{id}/{metadata|log|request}` — read-only resources that surface stored session artifacts via MCP resource reads.

## Background / detach behavior
- Same as the CLI: heavy models (e.g., GPT‑5 Pro) detach by default; reattach via `auracall session <id>` / `auracall status`. MCP does not expose extra background flags.

## Launching & usage
- Installed from npm:
  - One-off: `npx auracall auracall-mcp`
  - Global: `auracall-mcp`
- From the repo (contributors):
  - `pnpm build`
  - `pnpm mcp` (or `auracall-mcp` in the repo root)
- mcporter example (stdio):
  ```json
  {
    "name": "auracall",
    "type": "stdio",
    "command": "npx",
    "args": ["auracall", "auracall-mcp"]
  }
  ```
- Project-scoped Claude (.mcp.json) example:
  ```json
  {
    "mcpServers": {
      "auracall": { "type": "stdio", "command": "npx", "args": ["auracall", "auracall-mcp"] }
    }
  }
  ```
- Tools and resources operate on the same session store as `auracall status|session`.
- Defaults (model/engine/etc.) come from your Aura-Call CLI config; see `docs/configuration.md` or `~/.auracall/config.json`.


### `frontend_send` and `frontend_status`

Routes support `provider: "grok"` as well as ChatGPT. A Grok route pins the
visible model (currently observed as `Fast`) and an exact `https://grok.com/` or
`https://grok.com/c/<id>` URL. Non-Heavy routes retain `controls_unsupported`
for inspect/configure; the opt-in Heavy model recipe is described above.
Message input uses a unique signed-in composer
and same-form Send control; covered or offscreen controls return
`blocked_overlay`. A failed presend may leave the owned draft for operator review.
Cookie consent, model menus and onboarding are never clicked by this recipe.
A single visible `main` or `[role="main"]` region is required. Missing or
ambiguous scope returns `unsupported_scope` before input; during status it stays
pending and resets stability. Only a structurally empty editor (no child nodes,
or exactly one P containing one BR, with empty textContent) has its empty-line
rendering treated as empty. Whitespace text, extra elements and images remain
occupied drafts. Post-fill and sent-message text comparisons stay exact.

Grok receipts report `identityKind: "derived_sequence"`, null native message IDs,
and explicit `observedUserKey`/`observedAssistantKey` hashes of position, role and
text. These hashes are observation keys, not provider IDs. ChatGPT and old v1
receipts retain `identityKind: "native"`. Grok requires two identical nonempty
reply observations at least one second apart before completion. A busy,
progressbar, streaming or Stop signal resets the stability check. URL lag and
temporarily absent rows remain pending; changed baseline rows become uncertain.
No background polling or resend occurs. `generationSignal: "unverified"` exposes
the remaining native generation-detector qualification; fixtures do not establish
provider acceptance or subscription entitlement.
On Grok, a provider-issued conversation URL may include one UUID `rid` query
parameter. Readback validates it and pins the canonical conversation path, so a
response-selector change does not change the conversation identity. Extra or
duplicate parameters, fragments, credentials, other origins and changed paths
are refused. Configured routes still cannot contain queries or fragments. The
composer may use either the observed combobox or textbox role; exactly one in
total is required. The rid is never represented as a native message ID.

`frontend_send` takes `routeId`, a caller-generated `requestId` (8-128 letters,
digits, hyphens or underscores), `text` (up to 8192 characters), and optional
`previousRequestId`. Configure either the exact `https://chatgpt.com/` root or an existing
`https://chatgpt.com/c/<id>` conversation through `AURACALL_FRONTEND_CONFIG`; the retained handle and visible
model must match. The composer must be empty and generation stopped. This path
uses native frontend fill and one Send click through Agent Browser. It neither
launches a browser nor calls a model API. ChatGPT qualification remains local
fixtures. Two real linked Grok replies completed through public tools embedded
in-process and the existing Agent Browser MCP. The user explicitly selected
accept-all cookies at 2026-10-22T16:05:08.928Z; the operator made one hit-proven
native click on the original notice, then rechecked the same conversation,
exact tail, empty/hit composer and absence of dialogs/login/challenge. The
single linked send used previousRequestId and the actual first reply. Its
output was `AURA-GROK-20261022-S3 CONNECTED`: two identical reply observations
9.630s apart, then fresh-process cached readback (3/20 status calls).
Claude final18: Standards/source Spec/native Grok linked PASS, embedded path
only; continuity-real PASS, 3/6=50%. The HTTP/OAuth broker, subscription and
generation detector remain unqualified; native IDs remain null with
`derived_sequence` keys. `liveVerified:false` is unchanged. Plan0444 records the
receipts and qualifications; ChatGPT verification, Claude binding, HTTP setup
and HOST02 remain open, with no LIVE change.

Keep the request ID before calling. Repeating the same ID/content returns the
saved receipt without input; changing content under that ID refuses. Call
`frontend_status` with the same route/ID to read the reply, user and assistant
message IDs and current status. It performs at most one read-only probe per call,
never a send. Status reads the receipt without a lock and acquires the shared
per-target lock only for reconciliation. A completed previous request must still
be the exact conversation tail before a linked follow-up is allowed.

Receipts live in the private AuraCall home `frontend-requests` directory. They
contain prompt/reply text; keep that directory private. Initial records publish
an fsynced 0600 temporary file with an exclusive hard link (no overwrite race);
updates use fsynced temporary file, rename, then directory fsync. Unknown versions
and malformed records are preserved. One corrupt record currently blocks new
sends on every target; inspect and repair only through a separately reviewed
operator recovery, never discard evidence just to make sending proceed.

`sent` means native input was confirmed, not that a reply completed. A timeout
returns `uncertain`; `sending` after a crash is also unresolved. Both block new
sends on that target until status sees the exact new user text followed by a
fresh completed assistant reply. Never change the request ID to replay an unknown
send. Multiple assistant nodes or incomplete/virtualized history currently fail
closed; qualifying actual provider variants remains part of live acceptance.

Inspect/configure/send/status share a filesystem target lock. Inspect/configure
now need writable private AuraCall storage as well. A send overlapping controls
returns `lock_held` rather than waiting. Status returns its saved receipt with
`lock_held`, `lock_foreign_host`, `lock_unproven` or `lock_orphaned` without probing
when ownership is unavailable. No tool steals or removes an existing lock.

For an orphan, the operator must inspect its exact recorded host/pid/request and
prove the original holder is gone before manually clearing only that target's
lock. Do not clear a foreign-host or unproven lock. After clearance, status can
convert a remaining `prepared` record to `failed_presend/presend_interrupted`
without browser input, since Send always follows a durable `sending` marker.
Any remaining composer draft still needs operator review before another request.
For `sending`/`uncertain`/`sent` without matching reply evidence, preserve the
receipt and inspect that exact conversation manually. This slice has no forced
completion/abandon API; unresolved requests stay blocking until verified readback
or a separately approved recovery. No automatic retry or receipt deletion.


Fresh-chat first send: the root route is allowed only on an empty conversation
with a clear composer. The same request receipt remains bound to the original
route and retained tab. After one Send click, status adopts the new exact
`https://chatgpt.com/c/<id>` only when the fresh user message exactly matches the
saved input and no unrelated turns appear. The adopted URL is saved before
completion and required on all later probes. A mismatch remains uncertain with
no automatic retry. Query/fragment roots, temporary-chat flags, custom GPTs and
project paths are unsupported and refuse before input.

Keep a root route configured for its receipt lineage. Every follow-up must name
its completed `previousRequestId`; each new receipt inherits the adopted URL and
requires the exact previous reply at that conversation's tail. Receipts without
this field from older versions remain usable only on their exact configured
`/c/<id>` routes and never become fresh-root receipts. Three linked turns and
restart persistence are covered by local public MCP fixtures. These checks do
not prove signed-in provider acceptance.


First-send review16 clarification: an uncertain adoption may later recover on a
fresh read-only status probe if every target/model/user/URL gate matches; no
input is replayed. A root receipt that never gains a verified /c/<id> remains
sent/uncertain and cannot complete. conversationUrl is private/local MCP
receipt data: omit actual conversation IDs from shared progress summaries.
Focused121tests/9files PASS; typecheck, scoped lint and full build PASS. The
three-turn root/restart fixture and all prior frontend cases pass. Source
inspection accepted at peer16; presentation remains a separate unresolved gate.
# Direct stock Chrome frontend route

The optional stock Chrome adapter reuses `frontend_inspect`, `frontend_configure`,
`frontend_send` and `frontend_status` with explicitly shared existing ChatGPT/Grok
conversations. It has a frontend-only stdio entry and does not require Agent Browser
or start a browser/provider runtime. This is a DEV source candidate, not installed
or real-browser accepted. See [stock Chrome setup and bounds](stock-chrome.md).
