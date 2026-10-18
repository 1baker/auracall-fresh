# Live-Follow Operating Model Contract

This contract records the shared live-follow vocabulary used by account-mirror
completion, scheduler, status, CLI/API readback, and operator surfaces.

The source of truth in code is
`src/accountMirror/liveFollowOperatingModel.ts`.

## Routine Phases

Collector phases:

- `identity`: verify the provider account binding without mutating provider
  state.
- `projects`: read the provider project index.
- `root-conversations`: read account-level conversation rail/catalog rows.
- `project-conversations`: read project-scoped conversation rows.
- `chatgpt-library`: read ChatGPT account-library metadata.
- `detail-inventory`: load selected chats and parse context, files, artifacts,
  media, and remote download references.
- `merge-persisted-catalog`: merge newly observed rows with persisted catalog
  state.
- `complete`: no collector phase remains for the current evidence window.

Routine-only phases:

- `materialization`: recover or materialize known remote assets according to
  policy.
- `account-library`: advance account-library catch-up work.

## Routine Decision States

- `disabled`: live follow is not enabled for this account.
- `unsupported`: the provider/account cannot currently support live follow.
- `missing_identity`: the target lacks provider account identity proof.
- `provider_guarded`: provider guard, CAPTCHA, sorry page, or cooldown blocks
  work.
- `operator_preempted`: foreground operator/API/browser work has priority.
- `running`: a live-follow completion is running or in its idle waiting state.
- `queued`: live-follow work is queued but not running yet.
- `paused`: an active live-follow completion is paused.
- `attention_needed`: the latest live-follow completion failed, blocked, or was
  cancelled.
- `backfilling`: historical metadata catch-up remains.
- `steady_follow`: newest-first maintenance is active.
- `materialization_pending`: metadata is sufficient for the current policy, but
  local bytes or materialization work remain.
- `account_library_catchup`: account-library catch-up remains.
- `caught_up`: live-follow metadata is current for configured provider surfaces.
- `eligible`: the account can run the next routine pass now.
- `delayed`: cadence, politeness, or another non-terminal delay is active.

## Broad Resume Policy

Live-follow target rows expose additive `resumePolicy` readback so broad resume
decisions can be audited without inferring from completion status alone:

- `safe_steady_follow`: metadata is complete with zero remaining detail
  surfaces; the target may continue cadence-only steady follow.
- `safe_bounded_resume`: unfinished account evidence remains and the target
  should resume only from the persisted next phase.
- `existing_active`: a live-follow completion is already queued, running, or
  otherwise active; keep that completion instead of starting another one.
- `operator_paused`: an active completion is paused; automatic broad
  reconciliation must keep it paused and must not policy-upgrade it.
- `provider_blocked`: a provider guard, cooldown, or provider-specific legacy
  policy blocks automatic resume.
- `identity_blocked`: configured identity is missing, unsupported, or
  mismatched.
- `disabled`: live follow is disabled or unconfigured for the target.

`resumePolicy.action` is one of `start`, `keep_existing`, or `skip`. It is an
operator classification layer, not a provider-safety bypass; provider guards,
foreground preemption, and cadence checks still apply before provider work.

## Explicit Bounded Retry

`run_one_pass` is the retry boundary for a terminal live-follow operation. It
may re-arm `blocked` or `failed` live follow for exactly one additional pass,
preserving the subscription mode while setting a pass-count ceiling. It never
re-arms completed or cancelled live follow, and it never reopens a bounded
completion.

Repeated controls are an operator/runtime policy decision, not an automatic
loop: diagnose the prior terminal class and apply a reasonable remediation or
wait for a materially changed condition before another attempt. Every forced
terminal pass requests managed-browser cleanup on both success and failure.

Browser-startup admission denial is an operational materialization failure. It
must not be reported as a skipped asset or a successfully refreshed file
inventory. When no inventory was reached, the snapshot remains failed with
unknown routeability; the reason is retained as a retryable retrieval failure.
Admission controls still apply before any resumed provider work.

## Scheduler Operator Authority

Scheduler pause/resume is operator control state, not transient process state.
The API persists that posture under the AuraCall home cache and hydrates it
before startup cadence. A paused scheduler therefore remains paused after a
service restart; only an explicit resume restores automatic scheduling.

ChatGPT rate-limit detection history is scoped to the browser profile. Recent
detections escalate the cooldown from 5 to 15 and 45 minutes up to a six-hour
cap, remain present across later successful reads, and age out after 24 hours.

## Materialization Backlog States

- `none`: no known remote assets are missing local materialization.
- `metadata_current_backlog`: metadata is current under the active policy, but
  known remote assets are not local.
- `materialization_required`: active policy requires local bytes and known
  remote assets are missing locally.
- `inventory_unknown`: remote asset inventory is not complete enough to judge
  local materialization.

`metadata_current_backlog` must not reselect a chat for detail scraping by
itself. Policies that require local bytes should expose or queue
`materialization_required` work instead.

## Provider Deadlines And Failure Authority

ChatGPT discovery/identity and detail inventory budget browser settling
separately from interaction pacing. The production provider window is 240
seconds, with the configured conversation/page/renavigation governor allowance
added to form the effective per-call deadline. Reaching that deadline aborts
the provider request and closes an account-mirror disposable tab; timed-out
work must not continue navigating, overlap the next chat, or write late cache
state. Browser-launch failure remains a host/runtime readiness failure; a wider
collector deadline must not be treated as a substitute for a working display
and reachable configured CDP endpoint.

A failed collector phase remains authoritative until a later successful
refresh. Persisting or reconciling the backfill ledger after the failure does
not convert the live-follow cycle to `complete` and does not clear the exact
completion error.

ChatGPT steady-follow index discovery uses the existing configured minimum
interval while retained detail backlog is pending. Explicitly scoped conversation
work and incomplete message chunks keep their detail continuation. A detail-only
read keeps its prior provider-index epoch rather than claiming a new observation.
Unresolved collector read diagnostics prevent a successful completion and child
handoff; the refresh and cursor remain available for a later explicit retry.

## Collector-To-Materialization Pacing

A successful collector refresh hands materialization the exact conversation IDs
whose detail snapshots were observed, the refresh freshness boundary, and the
effective browser-interaction policy. Materialization waits until the maximum
configured conversation-read, page-refresh, or renavigation cooldown has
elapsed before provider work begins. Its snapshot and asset operations then
share one job-scoped interaction governor.

For ChatGPT steady follow, supplied collector detail and retained-reference
IDs constrain the automatic child's conversation selection as well as snapshot
reuse. An explicit operator conversation scope takes precedence. A qualified
empty frontier does not fall back to account-wide reconciliation. Full sweeps
retain their account-wide selection contract.

When completion-owned materialization becomes terminal, its `completedAt`
provider-work boundary starts a fresh collector minimum interval. The
completion cursor persists that settlement timestamp across restarts, and the
next collector remains `idle_waiting` until
`providerWorkSettledAt + limits.minIntervalMs`. Time spent inside the
materialization job does not count as post-provider quiet time.

## Provider-Wide Fair Serialization

The routine account-mirror scheduler and all completion loops in one API
runtime share a FIFO provider-work lease keyed by provider. A direct scheduler
pass or completion must own that lease before collector refresh; completions
also require it before complete-ledger materialization begins. When collector
work queues completion-owned materialization, ownership continues until the
materialization job reaches a terminal provider-work settlement; it is not
released merely because a bounded completion run returns.

The lease is released before the owning completion enters its subsequent
minimum-interval wait. This permits the next same-provider tenant to rotate in
without allowing two managed browser profiles to touch the same provider
concurrently. Pause and cancel remove queued waiters, while in-flight owners
retain the lease until physical materialization settles. Providers use
independent queues, so ChatGPT serialization does not block Gemini or Grok.

For a conversation refreshed by the immediately preceding collector pass,
materialization must try the new cache first and must not issue another live
snapshot refresh merely because no local asset was produced. Account-mirror
context cache routing reuses the collector's already verified identity and
skips feature-signature probing. Disposable browser targets remain required;
this contract removes nested and duplicate reads rather than retaining one tab
across unrelated conversation URLs.

Configured ChatGPT Business/workspace targets use qualified service-account
identity (`plan`, `structure`, and configured organization/account ID when
present). When a target exposes only a Business account-level label, Account
Mirror adds `structure=business` as its cache-isolation fallback. Personal
targets retain the legacy email-only Account Mirror tenant key, and
presentation-only account-level labels do not alter shared execution affinity.
Provider identity verification compares the primary email portion, so
qualifiers isolate caches without masking a login to a different email.

Exact collector-ID handoff does not override terminal asset-family evidence.
Unless `force: true` is explicit, materialization must suppress a selected
conversation when all of its usable catalog asset-family signatures are
already terminal through available run-archive assets, recorded volatile
dispositions, or complete catalog evidence. A selected conversation with no
usable catalog signature remains eligible so stale or newly refreshed rows do
not lose the existing provider-work fallback.

The same rule applies to operator/API requests that use singular
`conversationId`: local catalog and terminal evidence must be checked before
opening the provider browser. The direct request keeps its direct source and
target result shape, and `force: true` remains the explicit replay override.

Download-family identity is provider-surface neutral. Percent-encoded URI
filenames, sandbox action labels, `download-dom` rows, and archived `download`
items must converge on the same decoded filename/source family before candidate
selection. UI action wording such as `Open the ... PDF` must not make an
already archived download look new.

## ChatGPT warning-check scope

An account-mirror refresh with a pre-acquired crawler checks only that exact
ChatGPT tab before collection. It does not inspect restored tabs or close them.
The connection, owned-page warning read, and transport cleanup have a ten-second
outer deadline. A failed or timed-out check fails the refresh with an explicit
error; a visible rate-limit warning persists the normal cooldown and stops work.
The owned-page probe also reads native ResourceTiming results for same-origin
conversation endpoints. A latest HTTP 429 is a rate-limit signal even without
visible warning text; a later successful response supersedes that old result.
This is passive observation of requests the page already made, not a separate
provider API request. When no crawler has been pre-acquired, the collector checks the ChatGPT page it
loads through the existing adapter guards. Persisted cooldowns remain effective.
Gemini's account/captcha census is unchanged.

## Endpoint-only cold startup

An explicit `about:blank` manual startup obtains a DevTools endpoint without an
initial browser window (`--no-startup-window`). The existing admission path then
creates its owned crawler. The flag alone does not prevent session restoration when a first crawler window
is created. Before any absent managed browser starts, including ordinary visible startup, the launcher moves only
Chromium tab-session restore entries into `auracall-session-quarantine` under
that managed directory. These backups are preserved for restoration while the
browser is stopped. A strict native absence check is required before moving
files; unknown process state refuses the launch. Authentication files remain
in place. Existing running browsers and directories outside the managed root
are preserved; admission remains required.
Ordinary provider login URLs retain their visible startup window.

## Process tab ownership and physical deadlines

Within a managed ChatGPT browser and account, an OS process has at most one
process-bound tab. Runtime-profile aliases for the same browser/account share
that binding. Sequential live-follow collection, child materialization, utility
reads and conversation execution reuse it with revision-fenced claims. A second
concurrent operation receives explicit process contention before opening another
page; a provider action still requires its own admission and account identity.
Conversation changes navigate the same owned target under the existing governor.
A resumed detail pass freezes its one-row traffic budget for the row selected
by the persisted cursor, using the same normalized cursor indices as the reader.
A single-visit ChatGPT context read reuses an already ready conversation when
the conversation ID and expected project ID match, including project URLs with
a title slug. A slug difference alone does not spend another navigation; a
different project still requires the normal governed navigation.
An explicit exact-existing-page request refuses an incompatible retained
live-follow tab instead of opening another page.

A live-follow tab remains retained across collection and materialization and is
exempt from automatic idle/absolute TTL retirement while its browser is open.
Explicit cancellation/operator retirement and proven browser shutdown still
release its binding. A stopped previous process may transfer its idle tab to a
new process after target verification; an alive process cannot be displaced.

Every other observed page in that managed browser has a persisted finite
deadline. Previously untracked/restored pages, blank pages and external pages
receive a five-minute deadline on their first census. Repeated census does not
extend it. Existing conversation/utility tabs retain their configured idle and
absolute limits; meaningful use may extend idle time up to that absolute limit.
The API maintenance loop closes expired idle pages and verifies disappearance,
including pages that navigated since discovery. Ownership checks protect running
work; retiring records remain fenced until cleanup is verified. Persisted
deadlines survive maintenance-loop/API restarts.

Lease count is not physical tab count. Runtime status reports each binding's
process ID and TTL exemption; physical census and deadline retirement are part
of acceptance. Positive native browser absence reconciles settled idle records
for that exact browser before another launch. Authentication files and unrelated
browser directories remain intact.

A lost follow binding is no longer the retained current follow. Its lease
returns to ordinary TTL retirement; loss cannot retain an orphan page forever.

Maintenance checks retained idle process bindings for native PID liveness. A
stopped owner loses retention and becomes eligible for ordinary TTL retirement.
A living active retained follow may outlive its old absolute TTL while its
heartbeat remains fresh; heartbeat expiry still fences stale active ownership.

## Explicit conversation scope

`POST /v1/account-mirrors/completions` accepts optional `conversationIds`
(nonempty IDs, at most 100) with `sweepMode: "steady_follow"`. The scope is
persisted on the completion and reaches both detail collection and its
automatically queued materialization child. Cached conversation metadata is
retained, unrelated cursor offsets are ignored, and unrelated account-library
catchup is omitted. The account identity and normal traffic, cadence, warning
and cache rules still apply. `full_sweep` with a scope is rejected.
`materializationMaxItems` continues to limit new transfers rather than
verified cache reuses. Use `materializationForce: false` for an unchanged repeat.

### Frontier retry fairness

Frontier-scoped reconciliation applies the existing retry rotation within the
supplied IDs. A settled skipped attempt with zero attempted assets, no guard
and no materialized candidate moves behind unattempted work in the same retry
lane. Ties preserve collector order; force mode bypasses rotation. Account,
provider, runtime browser profile and selected asset-kind boundaries remain
unchanged. No target or transfer budget is increased, and no row outside the
frontier becomes eligible. This does not mark metadata-only rows complete.

### Endpoint-denial projection

A crawler-target verification denial caused by a missing browser endpoint is
failed retryable materialization, preserving its exact diagnostic. It must not
project a refreshed, routeable file snapshot or a benign empty-inventory skip.
This classification does not authorize relaunch, adoption, forced retry or
closing another workflow's browser. Native loss causality remains separate.
