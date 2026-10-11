# Browser Service Tools

This doc captures the reusable browser-service helpers and the patterns we want to
follow when automating UI flows. The goal is to keep Grok-specific hacks minimal
and push general strategies into browser-service so new service adapters are
faster to implement.

The `browser-tools` DevTools helper CLI now lives in
[`packages/browser-service/src/browserTools.ts`](/home/ecochran76/workspace.local/auracall/packages/browser-service/src/browserTools.ts).
Keep Aura-Call-specific config/bootstrap logic in the thin compatibility wrapper
[`scripts/browser-tools.ts`](/home/ecochran76/workspace.local/auracall/scripts/browser-tools.ts).
Browser-service-related development entrypoints are also grouped under
[`scripts/browser-service/`](/home/ecochran76/workspace.local/auracall/scripts/browser-service/README.md)
as thin wrapper copies. Prefer the `scripts/browser-service/<name>.ts` paths in
new docs; root `scripts/<name>.ts` paths remain compatible.
When targeting managed Aura-Call sessions through that wrapper, prefer
`--auracall-profile <name>` and `--browser-target <target>` so it resolves the
same AuraCall runtime profile and managed browser profile that the real product
path would use.

## Agent-browser hidden RDP ownership lane

When remote-view opening reports `converging`, AuraCall resolves that exact
retained handoff rather than repeating open. The readiness phase makes at most
30 resolutions within the smaller of the configured job timeout and 60 seconds.
It retains the initial matching build proof and handoff URL, rejects changed
browser or handoff identity, and attaches only after opened/ready. Cancellation
also interrupts readiness waits. Agent Browser must support `remote-view resolve`.


`browserProfiles.<id>.agentBrowserRdp.enabled=true` moves process/display
ownership to agent-browser while AuraCall retains the exact managed browser
profile directory. The BrowserService launcher passes that AuraCall path via
agent-browser's external-profile `--profile` contract, requests
`remote_headed + rdp_gateway`, waits for `operatorVisible.state=ready`, requires
matching browser-build proof including the actual executable path, then reads
the exact opened browser from `service browsers` and attaches to its CDP port.

The compatibility matrix is closed-world:

| AuraCall executable family | agent-browser build |
| --- | --- |
| `chrome` | `stock_chrome` |
| `chromium` | `stealthcdp_chromium` |

Never set `AGENT_BROWSER_ALLOW_PROFILE_BROWSER_MISMATCH`. A healthy
agent-browser install, matching named runtime profile, available RDP route-pool
entry, durable handoff URL, and exact executable proof are activation
prerequisites. Repository contract tests do not authorize or substitute for a
live browser launch.

## Metadata-only agent-browser network detail

Do not print `agent-browser --json network requests` or
`agent-browser --json network request <id>` from an authenticated browser.
Those direct JSON contracts can contain complete request/response headers,
cookies, URLs, identities, and response bodies.

For an already attached named agent-browser session whose request tracking has
already been cleared and whose page has already reloaded, use the provider-free
validated reducer instead:

```bash
pnpm tsx scripts/browser-service/agent-browser-network-metadata.ts \
  --session <named-session> \
  --cdp <exact-live-port> \
  --expected-url 'https://chatgpt.com/backend-api/conversation/<conversation-id>' \
  --acquisition-timeout-ms 15000 \
  --discovery-timeout-ms 5000 \
  --timeout-ms 15000 \
  --max-output-bytes 8388608
```

The helper captures one filtered request list internally, requires exactly one
exact-URL 2xx candidate, keeps its request ID internal, then captures one full
request-detail command under an independent deadline and output cap.
`--discovery-timeout-ms` and `--timeout-ms` are daemon-worker deadlines passed
through agent-browser's `--job-timeout-ms`; they begin after serialized command
dispatch and cancel request-list or response-detail work at the daemon. The
separate positive `--acquisition-timeout-ms` is added to each worker deadline
only for the caller's client/session acquisition and command-transport
envelope. Do not replace the layered contract with one larger undifferentiated
child timeout.

Its public JSON is closed-world: outcome, terminal `stage`, exact candidate
count, request-ID/URL match booleans, status, elapsed time, body
presence/character length, JSON parse state, and mapping count. A timeout at
`request_discovery_command` or `response_detail_command` is a caller
acquisition/transport-envelope failure; a timeout at `request_discovery` or
`response_detail` is a daemon-worker operation deadline. `completed` means the
full reduced detail settled. The helper never emits the selected request ID,
URL, headers, cookies, body, stderr, child error text, or the worker's raw error
envelope.

The helper does not launch, attach, navigate, reload, close, or repair a
browser. Those effects require their own exact-profile gate and cleanup. A
`timeout` can leave the agent-browser daemon awaiting its internal CDP command;
the governing live plan must close the named session and exact browser process
without retrying the detail read.

`auracall features --target <provider> --json` is now the operator-facing
consumer of this browser-service evidence for live provider feature discovery.
`auracall features snapshot|diff ...` now layers anti-drift workflows on top of
that same contract. Use `browser-tools search` / `browser-tools ls` when you
need lower-level DOM evidence or are diagnosing why the higher-level feature
contract missed a live surface.

Use `browser-tools iframe-artifacts` when an artifact, export menu, or report
viewer appears inside a provider iframe. The command is read-only by default and
reports accessible frame URLs, visible controls, artifact-like labels, and body
text previews. Pass `--open-label <label>` only when the operator intentionally
wants to reveal a menu surface, for example:

```bash
pnpm tsx scripts/browser-tools.ts --auracall-profile wsl-chrome-3 --browser-target chatgpt \
  iframe-artifacts --url-contains 69f0deaf --frame-url-contains deep_research \
  --open-label Export --json
```

That ChatGPT Deep Research diagnostic should reveal the iframe-local `Export to
Markdown`, `Export to Word`, and `Export to PDF` controls without downloading
the artifact.

Current upgrade backlog:
- generic browser-service work: [browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/auracall/docs/dev/browser-service-upgrade-backlog.md)
- lessons review: [browser-service-lessons-review-2026-03-30.md](/home/ecochran76/workspace.local/auracall/docs/dev/browser-service-lessons-review-2026-03-30.md)
- Aura-Call-only workflow work: [auracall-browser-onboarding-backlog.md](/home/ecochran76/workspace.local/auracall/docs/dev/auracall-browser-onboarding-backlog.md)

Owned Chrome lifecycle state is generation-bound. A launched instance is
identified by its managed browser profile plus PID, DevTools port, and
`launchedAt`. Child exit, explicit shutdown, and signal-driven shutdown retire
only that exact registry generation; a delayed callback cannot delete a newer
replacement's owner, operation, or lease. Registry mutation uses a short
cross-process file lock so matching and deletion remain atomic with replacement
registration. Liveness pruning remains the recovery path for abrupt exits that
cannot deliver a child event.

Current DOM-drift extraction priorities live in the 2026-03-28 section of
[browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/auracall/docs/dev/browser-service-upgrade-backlog.md):
- `navigateAndSettle(...)`
- anchored row/menu action helpers
- structured UI diagnostics wrappers
- canonical action-surface fallback helpers
- explicit per-client focus policy
- optional failure snapshots

Current active extraction plan:
- keep trigger/button scoring in adapters unless the same scoring shape repeats
  on another real surface/provider
- use browser-service-owned interaction strategies, surface fallbacks, and
  diagnostics context before adding new provider-local trigger workarounds
- for menu options whose authoritative selected state only lives in reopened
  menu markup, prefer the package-owned select-and-reopen helpers before adding
  provider-local reopen logic

## Experimental tab-concurrency execution

`browser.tabConcurrencyMode` resolves to `serialized` unless an operator or
test explicitly selects `tab-affinity`. Both modes construct shared file-backed
provider-traffic safety state under `~/.auracall/browser-coordination`, expose
read-only status through `BrowserAutomationClient.getTabConcurrencyStatus()`,
and require exact-tab admission and ownership for configured provider clients.
Serialized mode still disables concurrent tab-affinity execution; its registry
and interaction ledger exist so provider traffic cannot bypass persisted
admission merely by using the compatibility execution mode.

The status projection is intentionally aggregate and content-free. In addition
to total/fenced leases and interaction/warning counts, it reports active
provider-guard totals split into indefinite and bounded cooldowns, warning
classification counts, maximum remaining cooldown, admission-rejection totals
and reason counts, aggregate active/minute/hour/day usage windows, lease states,
workload classes, expired-idle and outcome-unknown attention counts, cumulative
target creation/adoption/navigation/reload/focus/close counts, and retirement
dispositions. It does not publish target IDs, conversation IDs, operation IDs,
tenant keys, or provider content. This projection is diagnostic evidence, not
authority to adopt, navigate, close, or retry any tab.

The API exposes that same projection as `/status.tabConcurrency`. Browser Ops
renders it in the read-only **Browser Tab Concurrency** panel, while
`auracall api ops-browser-status --port <port>` and MCP
`api_ops_browser_status` verify the dashboard contract and retain the same
status payload. The projection reports affinity whenever the root or any
resolved AuraCall runtime profile selects affinity because all such profiles
share the same user-scoped registry and ledger. The immediate rollback is to set
`browser.tabConcurrencyMode` to `serialized` in the affected AuraCall runtime
profile and restart the AuraCall service. Serialized mode reports
`enabled=false` and creates no affinity-maintenance owner, but retains the
registry and ledger as authoritative traffic-safety state.

For a guarded rollout, use the append-only soak receipt helper:

```bash
pnpm run soak:tab-affinity start --port 8080 --runtime-profile wsl-chrome-3 \
  --expected-identity <identity> --source-commit <sha> --installed-version <version>
pnpm run soak:tab-affinity snapshot --port 8080 --receipt-id <id> \
  --runtime-profile wsl-chrome-3 --expected-identity <identity> \
  --source-commit <sha> --installed-version <version>
pnpm run soak:tab-affinity finish --port 8080 --receipt-id <id> \
  --runtime-profile wsl-chrome-3 --expected-identity <identity> \
  --source-commit <sha> --installed-version <version>
```

Receipts live at `~/.auracall/soaks/tab-affinity-<id>.jsonl`. Snapshot and
finish are read-only provider operations. They fail closed on an active
provider warning, an unexplained or unsettled lost lease, a restart-unverified
lease, unknown outcome, expired idle lease, or navigation/reload/focus growth
after the baseline. A settled binding that is already past its idle or absolute
TTL may pass briefly through `lost` while normal retirement proves the target
absent; that expected transition is not a soak failure. Finish also rejects an
unelapsed 24-hour window. The helper records expected identity as
operator-supplied evidence; callers must independently verify live identity
before starting the soak. Unknown-outcome attention covers only leases that
still operationally fence a target; released uncertainty remains durable audit
history but is not an active soak hard stop.

An unattended monitor must treat a rejected snapshot as a terminal event. In
the same failure branch it must cancel the exact crawler, stop its snapshot
timer, and cancel the paired delayed evaluation wake. A 24-hour wake is only
valid while every earlier snapshot remains accepted; leaving it pending after
an early hard stop is stale control state.

ChatGPT handoff submission uses the same coordinated browser client in explicit
affinity mode. Existing conversation bindings are reused only after a live
target census confirms the exact conversation route; a missing target may be
replaced, while a live route mismatch fails closed. The legacy direct
`runBrowserMode()` now uses the same admission/provisioning coordinator for
ChatGPT when the caller supplies full profile-resolved affinity authority.
Stored responses and interactive/detached, TUI, and MCP browser sessions carry
that authority; the legacy response lifecycle attaches only to the leased
target and retains it. ChatGPT Account Mirror live-follow completions use one
dedicated crawler lease and the same tenant/provider interaction ledger.
Direct/manual refreshes and Gemini/Grok remain serialized or otherwise outside
affinity. ChatGPT project/conversation listing, provider identity reads,
conversation rename/delete, project/account file upload and delete, inherited
file/context reads, downloads, materialization, and active-media materialization
use one reusable exact utility tab per service instance. Project create, rename,
clone, instruction updates, and public project-UI substeps use the same target.
Nested operations reuse an already exact target, and affinity-owned scoped sessions keep the aggregate ledger governor
through transfers. Exact-target calls rebuild the provider-session authorization
envelope with browser startup disabled; this preserves the pinned target while
retaining identity enforcement. A failed provider mutation is outcome-unknown and that idle
lease cannot be reacquired. Affinity-owned provider mutations explicitly disable
retry; serialized callers retain their established behavior. Do not treat
configured mode or registry files as installed/live acceptance evidence.

Provider-free coexistence is covered by a combined fake-target fixture with two
conversation leases and one live-follow crawler lease. It proves exact prompt
targets, non-navigating retained prompt options, sequential crawler use of only
its dedicated target, and three exactly settled aggregate interactions. This is
contract evidence only; it does not replace installed/live ChatGPT acceptance.

ChatGPT Skill and Developer App operations also use the utility coordinator.
Their scoped browser clients attach only with the leased host, port, and target
ID, consume the aggregate interaction governor, and close before the lease is
idled. Developer App prompt submission continues through the separate
conversation-affinity executor rather than turning the utility tab into a chat.

Expired ChatGPT tab cleanup checks visible provider activity immediately before
closing. Active response or tool-approval controls preserve the page even when
its lease is settled (for example, a CDP-submitted chat). Missing/ambiguous DOM
or failed activity probes defer closure. This applies to maintenance's lost-lease
cleanup and ordinary foreground/utility retirement. Cleanup does not click or
navigate. A lease alone does not prove that the provider response is inactive.

Before a ChatGPT foreground or live-follow affinity acquisition, AuraCall also
reconciles expired idle leases for that exact runtime/account/managed browser
scope. A target is closed only after exact workload identity verification, and
`closed` is recorded only after a second census proves the target disappeared.
An expired `outcome-unknown` lease may retire, but its uncertainty remains in
the released record and never authorizes prompt retry. Retirement runs at acquisition
boundaries, and the long-running API also owns a non-overlapping
60-second maintenance cadence when explicit affinity is configured on the root
browser block or any resolved AuraCall runtime profile. Maintenance
uses `ensurePort: false`, so an absent browser is never launched merely for
cleanup; endpoint absence from that managed-browser resolution proves its old
targets are already missing, so expired idle and lost fences are released. The loop
is suppressed for proof-scoped server runs and is cleared and awaited during
API shutdown.

Active leases persist owner PID plus process-generation identity. Maintenance
marks dead, replaced, or legacy active owners `restart-unverified`, and marks a
lease whose heartbeat/idle or absolute deadline elapsed `heartbeat-expired`
even when its API process remains alive. Every pass revisits all lost leases:
missing targets are released, exact expired targets are closed only with a
post-close absence census, and identity mismatches remain fenced. Status exposes content-free per-binding age and
elapsed time since last meaningful use, idle/absolute time remaining, plus a
restart-unverified attention count.
The same maintenance pass reports aggregate live, fenced, and unleased ChatGPT
page-target counts. Unleased targets are preserved as observation-only evidence;
the census grants no authority to adopt, navigate, focus, refresh, or close them.

## ChatGPT composer-mode boundary

Choose the ChatGPT composer mode before any model action. Chat is AuraCall's
default. Work must be explicit and uses a different model selector.

Keep these provider-owned contracts separate:

- `src/browser/actions/chatgptComposerMode.ts` selects and verifies exact
  `Chat` or `Work` state. It supports a persistent `radiogroup` and the compact
  exact mode trigger whose menu choices are `menuitemradio` elements. An
  established conversation may omit both controls; only a visible, enabled,
  exact ChatGPT prompt editor with no Work slider marker may then prove
  implicit Chat. Explicit Work may use the visible active conversation link's
  exact `Work` badge only when its route has the same exact ChatGPT Project ID
  and conversation ID; ChatGPT may omit the loaded route's human-readable
  Project slug from that canonical link. Never infer Work from composer
  readiness or accept any other route mismatch.
- The dedicated Work-model selector reuses that same active-conversation Work
  proof on established conversations where ChatGPT omits the Chat/Work control;
  the shared animated model/thinking pill alone never proves Work.
- `src/browser/actions/modelSelection.ts` owns the Chat picker.
- `src/browser/actions/chatgptWorkModelSelection.ts` owns Work's animated
  slider, optional **Show advanced options** expansion, exact **Model ...**
  submenu, and final Work model `menuitemradio`.

Do not generalize the Work path into the Chat picker. If Work is requested and
the current provider DOM does not expose a distinct Work selector, fail closed
and collect bounded DOM diagnostics. For the provider-free suite, live-effect gates, and cleanup
record, follow the repo-local
[`auracall-chatgpt-browser` skill](../../.agents/skills/auracall-chatgpt-browser/SKILL.md).

## ChatGPT third-party tool approval boundary

Tool approval is provider-owned and runs only during the post-submit ChatGPT
response wait. `src/browser/actions/chatgptToolApproval.ts` requires one
visible surface with exact paired `Allow once` and `Always allow` controls. It
briefly settles and re-probes the same fingerprint and selected action, then
focuses and invokes that exact verified DOM control inside one CDP user-gesture
evaluation. Changed or ambiguous pre-activation state invokes no control;
independent disappearance reports no action. Current ChatGPT cards are rooted at the exact
`data-testid="tool-approval-card"`, not the containing assistant turn, so a
mounted card receives a stable page-lifetime identity in a private WeakMap.
The clicked card must disappear or be replaced by a different DOM card; the
replacement may have the same action-bound fingerprint and visible text, while
a truly unchanged mounted card remains one-attempt fenced. The default
`manual` policy detects and reports the pause without clicking. Keep this
classifier out of generic browser-service blocking-surface recovery, and never
widen it to broad `allow`, `continue`, or `Answer now` matching.

## Core helpers (packages/browser-service/src/service/ui.ts)

Shared DevTools attachment is owned by
`packages/browser-service/src/service/browserService.ts` and
`packages/browser-service/src/chromeLifecycle.ts`:

- `BrowserService.connectDevTools(options?)`
  - accepts an optional caller abort signal, positive per-stage timeout, and
    stage callback while preserving no-options callers
  - reports `browserDevToolsTargetResolution`,
    `browserDevToolsCdpConnection`, and `browserDevToolsConnected`
  - defaults target resolution and CDP connection to independent 10-second
    bounds; a late CDP client is closed instead of being published after the
    caller has already timed out or aborted
  - provider adapters remain responsible for bounding any domain-enablement or
    provider-specific readiness work performed after attachment

- `waitForPredicate(Runtime, expression, options)`
  - Generic polling primitive for truthy page predicates.
  - Returns attempts, elapsed time, and the last truthy value when a condition wins.
  - Every DevTools evaluation receives both a protocol execution timeout and a
    transport-side deadline capped by the remaining polling-loop budget. Set
    `evaluationTimeoutMs` only to require a smaller per-evaluation deadline.
  - Prefer this over ad hoc polling loops when the condition is not just a selector.

- `armDownloadCapture(Runtime, options?)`
  - Installs page-level hooks for `HTMLAnchorElement.click` and `window.open` to
    capture download intent before a click.
  - Stores captured `href` and `download` values under a shared state key for
    provider adapters to consume immediately after an action.

- `readDownloadCapture(Runtime, stateKey?)`
  - Reads the current captured download payload from page state.
  - Returns `{ href, downloadName }` with null normalization when no capture is
    present.

- `waitForDownloadCapture(Runtime, options?)`
  - Polls `readDownloadCapture(...)` until a target is observed or timeout
    expires.
  - Useful for adapter-specific “click then capture” artifact/materialization
    flows.

- `waitForDocumentReady(Runtime, options)`
  - Waits for `document.readyState` to reach `interactive` / `complete` by default.
  - Can also require `document.visibilityState === "visible"`.
  - Use this before probing apps that hydrate after the first navigation event.

- `waitForVisibleSelector(Runtime, selector, options)`
  - Waits for a selector to exist and have a visible bounding box.
  - Returns selector metadata (tag/text/rect) when it succeeds.
  - Prefer this when the next action needs an actually clickable element, not just a DOM node.

- `waitForScriptText(Runtime, options)`
  - Waits for inline script text to contain required tokens.
  - Useful for hydration/bootstrap payloads that appear before stable DOM markers.
  - Keep the tokens generic here; provider-specific payload semantics still belong in the app layer.

- `navigateAndSettle({ Page, Runtime }, options)`
  - Shared route-settling primitive for SPA/browser automation flows.
  - First checks whether the current canonical URL already equals the requested
    route. When that route also satisfies the requested route/document/ready
    predicates, it returns with `mutationPerformed=false` and emits no browser
    mutation record instead of redundantly calling `Page.navigate(...)`.
    Canonical comparison ignores fragments and query-parameter ordering, but a
    different origin, path, query key, or query value remains a distinct route.
  - Otherwise combines `Page.navigate(...)`, document-ready wait, optional route
    predicate, optional ready predicate, and optional in-page
    `location.assign(...)` fallback.
  - The existing positive `timeoutMs` also bounds the CDP `Page.navigate(...)`
    acknowledgement. A lost protocol response therefore fails the operation
    instead of holding an outer managed-profile lease indefinitely.
  - Set `forceNavigation=true` when the requested exact route must be reacquired
    even if the current canonical URL appears equivalent. A caller that arms
    stronger response evidence first may also pass `completionSignal`; that
    evidence can close the mutation audit while a CDP navigation acknowledgement
    remains pending, but a rejected navigation command still fails.
  - Returns structured phase data (`route`, `document-ready`, `ready`) so
    callers can throw provider-specific errors without reimplementing the
    settling loop.
  - The current control-plane slice also lets callers attach `mutationAudit`
    and `mutationSource` so browser-service can emit bounded mutation records
    around the navigation attempt and any `location.assign(...)` fallback.
  - Provider callers may pass the existing `interactionGovernor` and an
    `interactionClass`; browser-service invokes it immediately before every
    physical navigation or fallback mutation.
  - Prefer this over ad hoc `Page.navigate(...)` + `waitForDocumentReady(...)`
    + retry logic when the page can route asynchronously.

- `reloadAndSettle({ Page, Runtime }, options)`
  - Shared reload primitive for provider recovery flows.
  - Combines `Page.reload(...)`, optional document-ready wait, optional
    `location.reload()` fallback, and bounded mutation audit records.
  - Provider callers may pass the existing `interactionGovernor` and an
    `interactionClass`; browser-service invokes it immediately before the
    physical reload and again before a fallback reload.
  - A caller that owns stronger response evidence may pass `completionSignal`.
    The helper still issues the governed `Page.reload(...)`, but the external
    signal can close the mutation audit and return without waiting for a CDP
    reload acknowledgement that remains pending. A rejected reload command
    still fails the operation. Arm the response listener and its disposer
    before calling the helper, and do not start a response deadline until any
    caller-owned interaction governor has released the physical reload.
  - Prefer this over provider-local `Page.reload(...)` calls when a browser
    recovery path intentionally refreshes the active page.

- `service/mutationDispatcher.ts`
  - Package-owned mutation audit substrate for the browser control-plane lane.
  - `beginBrowserMutation(...)` emits bounded `start` / `complete` records for
    navigation, reload, location-assign, and target-open-or-reuse actions.
  - `createInMemoryBrowserMutationLog(...)` gives tests or future runtime
    diagnostics a bounded in-memory history surface.
  - The app-level `BrowserService` now keeps a bounded service-scoped mutation
    history per AuraCall runtime profile and target service. Runtime/media
    browser diagnostics include those recent records as
    `browserDiagnostics.browserMutations` when `diagnostics=browser-state` is
    requested.
  - This is distinct from `operationDispatcher`: `operationDispatcher`
    serializes ownership, while `mutationDispatcher` records which browser
    mutation AuraCall attempted under that ownership.

- `waitForSelector(Runtime, selector, timeoutMs)`
  - Polls for a selector to appear; prefer this over ad-hoc sleep loops.
  - Use after actions that spawn portals (Radix menus, dialogs) or lazy DOM.

- `waitForNotSelector(Runtime, selector, timeoutMs)`
  - Polls for a selector to disappear; use for modal/menu teardown.
  - Prefer this to fixed sleeps after closing dialogs or overlays.

- `isDialogOpen(Runtime, dialogSelectors)`
  - Light-weight check for modal presence.

- `waitForDialog(Runtime, timeoutMs, dialogSelectors)`
  - Waits for a dialog to appear. Use for modal-driven flows before interacting.

- `findAndClickByLabel(Runtime, options)`
  - Finds a clickable element by aria-label/text in a scoped root.
  - Prefer this to brittle CSS selectors when labels are stable.

- `closeDialog(Runtime, dialogSelectors)`
  - Closes dialogs via close button, backdrop, or Escape.
  - Use when a flow might leave a modal open and block other automation.

- `pressButton(Runtime, options)`
  - Clicks a button by selector or label match and waits for post conditions.
  - Supports scoped roots, visibility filtering, and post selectors.
  - Supports ordered `interactionStrategies` when a surface responds to pointer
    or keyboard activation differently than plain click.
  - Use `logCandidatesOnMiss` to include visible labels in failure messages.

- `openDialog(Runtime, options)`
  - Uses `pressButton` then waits for a dialog and optional ready selector.

- `openMenu(Runtime, options)`
  - Opens a trigger and waits for the menu/listbox to appear (aria-controls aware).
  - Supports ordered interaction strategies and reports which strategy opened
    the menu.
  - Supports expected-item-aware menu-family selection, so if multiple menus are
    visible it can prefer the one that actually contains the intended option.
  - When inventory selection is used, it returns a specific tagged selector for
    the chosen visible menu instead of a generic `[role="menu"]`.
  - That tagged selector is now stable across repeated
    `collectVisibleMenuInventory(...)` reads while the underlying menu node stays
    alive, so it is safe to pass into later submenu opens or verify flows.

- `openSurface(Runtime, options)`
  - Shared “try these triggers until the ready state appears” helper.
  - Use this when the same surface can be opened from more than one valid
    trigger and the ready-state is shared.
  - Returns structured per-attempt history for failure diagnostics.

- `openAndSelectMenuItemFromTriggers(Runtime, options)`
  - Shared ordered action-surface fallback helper for menu-backed actions.
  - Tries multiple menu triggers in order, optionally running per-attempt setup
    before each trigger, and returns structured attempt history.
  - Use this when the same action may live in more than one real surface, such
    as a hover row menu first and a page/header menu second.
  - Keep the trigger list provider-local; move only the fallback mechanics into
    browser-service.

- `waitForMenuOpen(Runtime, options)`
  - Waits for menu/listbox selectors, with fallback selectors when the primary id is missing.
  - Can use expected labels, existing-menu signatures, and optional anchor
    proximity to choose the right visible menu family instead of the first one.

- `collectVisibleMenuInventory(Runtime, options)`
  - Returns a bounded visible-menu census with specific selectors, item labels,
    geometry, and optional anchor distance.
  - Use this for menu-family diagnostics and for DOM drift repairs where
    multiple visible menus or submenus can coexist.
  - The returned `selector` is intended to be reusable as a scoped handle for
    later menu work; do not collapse back to a generic `[role="menu"]` unless
    the menu handle is truly unavailable.

- `collectVisibleOverlayInventory(Runtime, options)`
  - Returns a bounded visible overlay/dialog/alert census with specific
    selectors, summary text, visible button labels, geometry, and optional
    anchor distance.
  - Use this when multiple blocking surfaces can coexist and the automation
    needs a stable scoped handle instead of generic `[role="dialog"]`.
  - The returned `selector` is intended to be reusable as a scoped overlay
    handle for later dismiss/verify work.

- `openSubmenu(Runtime, options)`
  - Opens a submenu from a parent menu item and returns the specific submenu
    selector chosen by browser-service.
  - Use this when the parent menu is already open and the next valid surface is
    another menu, not a dialog or route change.

- `selectNestedMenuPath(Runtime, options)`
  - Drives a trigger through a menu path like top-level item -> submenu item.
  - Use this instead of provider-local `open menu, find More, open submenu,
    click target` glue when the UI is a real nested menu structure.

- `inspectNestedMenuPathSelection(Runtime, options)`
  - Reopens a menu path up to the containing menu for the target option and
    reads selected state from the current menu markup.
  - Use this when chips/pills are not authoritative and the app only exposes
    selected state inside the reopened menu.

- `selectAndVerifyNestedMenuPathOption(Runtime, options)`
  - Activates a menu option, reopens the same menu path, and verifies the final
    option stayed selected.
  - Prefer this over provider-local "click, reopen menu, inspect selected row"
    flows when the authoritative state lives in the menu itself.

- `collectUiDiagnostics(Runtime, options)` / `withUiDiagnostics(Runtime, action, options)`
  - Capture a bounded page snapshot and optionally attach caller `context`.
  - Use `context` for intended trigger labels, interaction strategies, or root
    scopes so failure payloads explain what the automation was trying to do.

- `captureActionPhaseDiagnostics({ phases, capture })`
  - Captures named diagnostic snapshots like `pre-submit`, `post-submit`, and
    `final` in a stable shared shape.
  - Use this when a browser action can look successful at one phase and still
    fail later, especially for attachment-backed submits.
  - Keep provider-specific selectors, signal readers, and semantic
    classification outside the package.

- `runOrderedSurfaceFallback({ attempts, isSuccess })`
  - Runs real browser-action surfaces in bounded priority order and preserves
    which surface actually succeeded.
  - Use this for upload triggers or similar “try A, then B, then C” mechanics
    instead of hand-rolled provider-local loops.
  - Keep exact surface selectors and provider-specific error wording local.

- `waitForAttachmentSignals({ read, isReady, ... })`
  - Polls provider-defined attachment state until it is stably ready for the
    requested number of polls, then returns the winning state.
  - Use this for attachment staging/preview waits when the provider signal
    shape differs but the polling/stability mechanics are the same.
  - Keep signal payload shape and selectors provider-local unless a second
    provider proves a truly shared contract.

- `dismissOverlayRoot(Runtime, rootSelector, options)`
  - Dismisses one specific overlay root by stable selector/handle instead of
    closing the first visible dialog on the page.
  - Prefer this when multiple overlays can coexist and a provider already knows
    which root it intends to dismiss.

- `withBlockingSurfaceRecovery(action, options)`
  - Generic recovery loop for visible blocking surfaces.
  - Lets package clients supply:
    - a surface inspector
    - an optional dismiss handler
    - an optional error classifier
    - retry/pause policy
  - Use this when the mechanic is generic (`detect -> dismiss -> pause ->
    retry`) but the actual surface classifier/policy stays provider-local.

- `pressMenuButtonByAriaLabel(Runtime, options)`
  - Opens a menu by aria-label match and waits for the menu to render.

- `selectMenuItem(Runtime, options)`
  - Clicks a menu item and optionally waits for the menu to close.

- `selectFromListbox(Runtime, options)`
  - Opens a listbox via trigger and selects an option.

- `openAndSelectMenuItem(Runtime, options)`
  - Opens a menu via trigger, selects an item, and optionally waits for close.

- `openAndSelectListbox(Runtime, options)`
  - Opens a listbox via trigger, selects an option, and optionally waits for close.

- `setInputValue(Runtime, options)`
  - Sets input/textarea/contenteditable value with input/change events.

- `togglePanel(Runtime, options)`
  - Opens/closes a panel using `pressButton` and open-state selectors.

- `hoverElement(Runtime, Input, options)`
  - Scrolls an element into view, computes a stable hover point, and moves the mouse there.
  - Verifies the hover point with `elementFromPoint` to ensure hover-driven controls appear.

- `hoverAndReveal(Runtime, Input, options)`
  - Hover a row and optionally verify that a specific action is revealed.

- `pressRowAction(Runtime, options)`
  - Finds a row action button (Rename/Delete/etc.) near an anchor element and clicks it.
  - Uses proximity to the row to disambiguate buttons outside the row.

- `clickRevealedRowAction({ Runtime, Input }, options)`
  - Shared “hover row, verify action, then click it” helper for rename/delete-style controls.
  - Prefer this over hand-rolling `hoverAndReveal(...)` + `pressRowAction(...)` in adapters.

- `openRevealedRowMenu({ Runtime, Input }, options)`
  - Shared “hover row, verify trigger, then open its menu” helper for hidden `Options` buttons.
  - Prefer this over repeating row hover + `openMenu(...)` glue in adapters.
  - Supports optional trigger preparation plus a direct trigger-click fallback for
    link-adjacent menu buttons that need navigation suppression before the menu opens.

- `openAndSelectRevealedRowMenuItem({ Runtime, Input }, options)`
  - Shared “hover row, open its menu, then pointer-select a specific item”
    helper for stable row-local menu actions like Rename/Delete.
  - Prefer this when the provider-specific logic starts after the menu item has
    been invoked rather than at menu-open time.

- `collectAnchoredActionDiagnostics(Runtime, options)`
  - Captures a compact row-action snapshot: row state, trigger state, optional
    editor state, optional dialog state, active element, visible menus, and
    visible overlays around an anchor.
  - Prefer this over provider-local `Runtime.evaluate(...)` snapshots when a
    row/menu/editor/dialog flow needs failure evidence tied to one specific row
    action surface.

- `withAnchoredActionDiagnostics(Runtime, action, options)`
  - Wraps an anchored row/menu/editor action phase and automatically attaches
    anchored diagnostics on failure.
  - For result-style helpers, it augments `{ ok: false }` objects with
    diagnostics.
  - For thrown errors, it appends an `Anchored action diagnostics:` payload to
    the error and exposes it on `error.anchoredActionDiagnostics`.
  - Prefer this over provider-local `collectDiagnostics` lambdas when the
    provider helper already returns `{ ok: boolean }` or throws on failure.

- `pressDialogButton(Runtime, options)`
  - Clicks a dialog action button by label, with optional `preferLast` for destructive confirms.

- `submitInlineRename(Runtime, options)`
  - Sets inline rename input value, submits via Enter, optionally clicks Save, and can wait for close.
  - When no selector/match is provided, it prefers the active element and falls back to the first visible input.
  - Live lesson from Grok and ChatGPT rename surfaces: do not treat "editor closed" as proof that the rename persisted.
  - For row-local rename flows, the more reliable sequence is:
    - hover the row first so hidden `...`/Options controls are actually rendered,
    - open the row menu from that revealed trigger,
    - wait for the authoritative rename input selector on that surface,
    - focus the real input by geometry if needed,
    - type natively,
    - commit with one native `Enter`,
    - verify the row title text changed after submit.
  - Blur/click-away can be a fallback probe, but should not be the primary success path on surfaces where focus loss cancels or silently drops the rename.

- `queryRowsByText(Runtime, options)`
  - Locates rows by visible text in a scoped root. Useful for lists that reorder or virtualize.

- `ensureCollapsibleExpanded(Runtime, options)`
  - Ensures a collapsible list is open by checking for row selectors and clicking a toggle if needed.

- `hoverRowAndClickAction(Runtime, Input, options)`
  - Scrolls a row into view, hovers via bounding box, and clicks a row action (Rename/Delete).

- `openRadixMenu(Runtime, options)`
  - Alias for `openMenu` when targeting Radix menus; keeps the naming consistent in adapters.

## Core helpers (packages/browser-service/src/chromeLifecycle.ts)

- `openOrReuseChromeTarget(port, url, options)`
  - Shared tab-open policy for Aura-Call browser flows.
  - Default policy is:
    1. reuse the most recent exact URL match
    2. reuse an existing `about:blank` / new-tab page
    3. reuse an existing same-origin page by navigating it
    4. reuse an explicitly compatible host-family page (for example `chatgpt.com` <-> `chat.openai.com`)
    5. only then create a fresh tab
  - After selecting/opening the target, it also trims obvious stockpile patterns:
    - keep the selected tab
    - keep at most 3 matching-family tabs total
    - keep at most 1 spare blank/new-tab page
    - if CDP exposes Chrome window ids, collapse extra windows for the same profile only when every tab in that window is disposable for the current service action
  - The caps are now profile-configurable through Aura-Call browser config:
    - `browser.serviceTabLimit`
    - `browser.blankTabLimit`
    - `browser.collapseDisposableWindows`
  - Use this instead of raw `CDP.New(...)` when the goal is “get to this page without stockpiling tabs”.

## Usage notes

- Prefer selector helpers from `packages/browser-service/src/service/selectors.ts`.
  - Use `cssClassContains('group/sidebar-wrapper')` instead of fragile `.group/sidebar-wrapper`.
  - Use attribute selectors (`[class*="..."]`, `[aria-label="..."]`) to avoid escaping issues.
- Keep reusable UI helpers in browser-service or llmService; keep Grok-specific selectors only in adapters.
- For workflow guidance, see `docs/dev/browser-automation-playbook.md`.

## Smoke helpers

- `pnpm tsx scripts/browser-service/browser-tools.ts --auracall-profile <name> --browser-target <target> start`
  - Resolves the selected AuraCall runtime profile plus browser target before
    attaching or launching.
  - Prefer this over ad hoc launches when you want the same managed browser
    profile Aura-Call itself would use, for example:
    - `pnpm tsx scripts/browser-service/browser-tools.ts --auracall-profile wsl-chrome-2 --browser-target chatgpt start`
  - `start` no longer injects its own fallback `--profile-dir`; if you do not
    pass one explicitly, it now preserves the managed browser profile resolved
    from the selected AuraCall runtime profile.

- `pnpm tsx scripts/browser-service/browser-tools.ts tabs --port <port> [--url-contains <text>] [--json]`
  - Shows the live tab census for one DevTools browser instance.
  - Explicit `--port` commands acquire a port-scoped browser operation
    dispatcher lock; they are no longer a lock-free bypass around
    browser-service ownership.
  - Includes the tab that `browser-tools` would select and why (`url-contains`,
    `focused`, `non-internal-page`, `last-page`).
  - Reports generic manual-clear blocking states, including hidden
    `google.com/sorry` tabs, at census level.
  - Use this before ad hoc `eval` when a run might be targeting the wrong tab.

- Legacy direct-CDP scripts under `scripts/verify-*`, `scripts/inspector.ts`,
  `scripts/open-grok-history.ts`, and similar development helpers are guarded
  by default.
  - Prefer `scripts/browser-service/browser-tools.ts --port <port> ...` for normal diagnostics.
  - When a legacy script is genuinely needed, pass `--allow-raw-cdp` or set
    `AURACALL_ALLOW_RAW_CDP=1`.
  - The guard consumes `--allow-raw-cdp` before the script parses positional
    arguments.
  - Raw scripts that directly mutate browser state must also be listed in
    `RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST`; the control-plane regression test
    fails if a new raw mutating script appears without that explicit entry and
    guard.

- `pnpm tsx scripts/browser-tools.ts probe --port <port> [--url-contains <text>] [--selector <css>] [--script-any <token>] [--script-all <token>] [--json]`
  - Collects structured generic probes from the selected page.
  - Reports document state, visible selector matches, script-text token presence,
    storage-key presence, and cookie-name presence.
  - `--json` emits a versioned envelope:
    - `contract: "browser-tools.page-probe"`
    - `version: 1`

- `pnpm tsx scripts/browser-tools.ts doctor --port <port> [--url-contains <text>] [--selector <css>] [--script-any <token>] [--script-all <token>] [--storage-any <key>] [--storage-all <key>] [--cookie-any <name>] [--cookie-all <name>] [--json]`
  - Combines the tab census with the structured selected-page probes.
  - Use this as the first package-owned diagnosis surface before app-specific doctor logic.
  - Fails manual-clear checks when either the selected page or any census tab is
    on a generic blocking surface such as Google `google.com/sorry`.
  - `--json` emits a versioned envelope:
    - `contract: "browser-tools.doctor-report"`
    - `version: 1`

- `pnpm tsx scripts/browser-tools.ts search --port <port> [--selector <css>] [--text <token>] [--aria-label <label>] [--role <role>] [--data-testid <id>] [--class-includes <token>] [--tag <name>] [--checked <true|false>] [--expanded <true|false>] [--visible-only] [--json]`
  - Collects a bounded structured DOM census from the selected page and returns
    only nodes matching the requested generic facts.
  - Each match reports reusable metadata:
    - tag
    - role
    - text
    - `aria-label`
    - `data-test-id`
    - class list
    - `aria-checked`
    - `aria-expanded`
    - visible state
  - Use this before ad hoc `eval` when the question is “does the live DOM
    currently expose a button/row/switch like this?” rather than “run this app
    behavior.”
  - Common Gemini drawer examples:
    - find the `Tools` opener on the managed Gemini page:
      - `pnpm tsx scripts/browser-tools.ts --auracall-profile default --browser-target gemini search --class-includes toolbox-drawer-button --text Tools --limit 10 --json`
    - after opening the drawer, census the visible tool rows:
      - `pnpm tsx scripts/browser-tools.ts --auracall-profile default --browser-target gemini search --class-includes toolbox-drawer-item-list-button --role menuitemcheckbox --limit 20 --json`
    - read the `Personal Intelligence` toggle state:
      - `pnpm tsx scripts/browser-tools.ts --auracall-profile default --browser-target gemini search --aria-label "Personal Intelligence" --role switch --limit 10 --json`
  - Drawer/open-surface note:
    - `search` only reports what is currently in the live DOM.
    - If a menu or drawer is closed, query the opener first, open the surface,
      then rerun `search` for the rows inside that surface.

- `pnpm tsx scripts/browser-tools.ts ls --port <port> [--selector <css>] [--limit-per-kind <count>] [--json]`
  - Produces a generic structured listing of the important discoverable visible
    UI surfaces and controls on the selected page.
  - Groups results into:
    - `dialogs`
    - `menus`
    - `buttons`
    - `menuItems`
    - `switches`
    - `inputs`
    - `links`
  - Each row includes reusable metadata such as:
    - tag
    - role
    - text
    - `aria-label`
    - `data-test-id`
    - class list
    - checked / expanded / disabled state
    - inferred widget type
    - path hint
    - interaction hints
    - input type when relevant
  - It also hunts for likely upload paths:
    - `fileInputs` includes native `input[type="file"]` paths even when hidden
    - `uploadCandidates` includes visible upload/attach triggers plus hidden
      native chooser inputs that likely back them
  - Interaction hints are heuristic, not authoritative. Current generic hints:
    - `hard-click-preferred`
    - `keyboard-activatable`
    - `soft-js-events-possible`
    - `hover-or-pointer-state-likely`
    - `pointer-gesture-preferred`
    - `file-chooser-candidate`
    - `hidden-native-file-input`
  - Use this when the question is “what important interactive surfaces are on
    this page right now?” rather than “does this exact selector exist?”
  - Common Gemini usage:
    - first open the `Tools` drawer
    - then run:
      - `pnpm tsx scripts/browser-tools.ts --auracall-profile default --browser-target gemini ls --limit-per-kind 10 --json`
    - the listing should surface the drawer as `menus`, the drawer rows as
      `menuItems`, the `Personal Intelligence` control as a `switch`, the
      prompt composer as an `input`, and any upload affordances under
      `uploadCandidates` / `fileInputs`

- `pnpm tsx scripts/browser-service/browser-tools.ts --auracall-profile wsl-chrome-3 --browser-target chatgpt watch-chatgpt-deep-research --duration 60000 --interval 1000 --json`
  - Passively samples the selected ChatGPT page for Deep Research state without
    clicking, navigating, refreshing, or submitting a prompt.
  - Captures outer-page evidence that remains available around the provider's
    cross-origin Deep Research iframe:
    - visible iframe title/src/geometry and whether it is Deep-Research-like
    - visible outer-page Start/Edit/Update/Stop-style controls
    - recent assistant conversation-turn previews
    - compact state signals and a stable hash so unchanged samples can be
      suppressed
  - Add `--screenshot-dir <dir>` when visual evidence is needed; screenshots
    are passive viewport captures and do not interact with the page.
  - Use this before changing Deep Research selectors or CTA behavior. The live
    plan/run card can be inside `internal://deep-research`, so ordinary outer
    DOM scans may not see the real tool labels.

- `pnpm tsx scripts/verify-grok-project-sources-steps.ts <step|all> <projectId|current> [file... ] [--delete <fileName>]`
  - Steps 1–6 are independent; use `all` to run the full flow.
  - `current` resolves the project id from the active grok tab.
  - Step 5 uploads files; step 6 removes a single file.

- `pnpm tsx scripts/verify-grok-context-get.ts <conversationId> [projectId]`
  - Fetches conversation context through the Grok adapter path and prints message count.

### Canonical CDP inventory

The RDP launcher derives attachment host and port from canonical `cdpEndpoint`
when present. It accepts HTTP(S) and WS(S) with an explicit positive port and
rejects credentials, query strings and fragments. Invalid canonical endpoints
fail closed. Older inventory with `cdpHost` and `cdpPort` remains supported.
Focused source validation does not establish actual installed client success.

### Owned browser lifecycle observations

When a browser registry path is configured, browser-service appends owned launch,
shutdown-request/return and child-exit observations to `<registryPath>.lifecycle.jsonl`
(mode 0600 on creation). Each row carries UTC time, owner PID, browser PID,
Linux process start ticks when available, port, launch generation and a SHA-256
fingerprint of the managed browser profile path. Child exits include exit code
and signal. `[browser-lifecycle]` logs carry the same observations; persistence
failures are reported without preventing cleanup.

A shutdown return is not proof of process exit. Adopted handles do not expose
owned child exit callbacks. Pre-readiness failures, external process deaths,
direct CDP Browser.close and per-target retirement are outside this journal.
This source change requires runtime adoption before installed evidence is expected.
