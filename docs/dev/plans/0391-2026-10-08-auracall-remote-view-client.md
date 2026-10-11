# AuraCall Remote-View Client | 0391-2026-10-08

State: OPEN
Lane: P86
Target: main
Integration: pull request
Owner: Eric Cochran; primary agent handles design and serialized integration.
Branch: feat/issue240-named-desktops
Base: origin/main at 591a118245cafbc54c34cd0bc179c4b380308ef6
Work items: ecochran76/auracall#240, ecochran76/auracall#241, ecochran76/auracall#242

## Current deployment checkpoint: 2026-10-10

PR244 merged at578b642c33104e3b1bf4db2f10c6989a9504bb42. The combined desktop
and launch-policy package is installed byte-identically across589 dist files;
API88638 serves /desktops200 and four ready owned browsers on Research. Writing
is currently empty. Five registered browser parent identities and27 Remote View/
display identities survive from the pre-build census. Of136 broader identities,
18 Chrome identities disappeared over the build/test/adoption interval; no matching
lifecycle records identify an actor, so whole-census preservation is not claimed.
Configuration is unchanged; scheduler remains paused with17 paused completions.
Public unauthenticated /desktops reaches expected authentication302. Authenticated
public pixels/input and root acceptance were not rerun; the wider plan stays OPEN.
[Installed route acceptance](../evidence/desktops-install-reconciliation/installed-acceptance.json).

## Installed route regression recovery: 2026-10-10

The later Plan0403 installation replaced the off-main desktop client, causing
GET /desktops HTTP404. Recovery reconciles PR244 checkpoint4fd905b39 with main
8aa11f18a, preserving both intents in one validated build. The installer now
requires the compiled /desktops contract before prefix replacement. Evidence,
source review, dependency failure disposition and adoption gates are in
[the recovery note](../notes/2026-10-10-desktops-install-reconciliation.md).
This recovery does not erase outstanding authenticated input/root acceptance.

## Passive grant renewal correction: 2026-10-10

The ready-view retention guard also skipped the scheduled four-minute refresh,
so five-minute observation grants expired while the iframe remained mounted.
Scheduled refresh must request a fresh passive grant through replaceGrant;
visibility refresh and active control retain their existing behavior. Do not
extend control claims or rebuild the viewer. The rendered fixture advances the
actual timer, issues a distinct observation grant and proves same-iframe renewal,
with existing control retention and input exclusion checks. Remote View companion
PR370 removes per-protocol-message native OS health probes while retaining fresh
owner grant checks and the primary viewer health cadence. Installed public
stability remains an independent gate.

## Embedded grant handoff follow-up: 2026-10-10

The operator confirms primary Remote View is responsive. The embedded path
still reloads on each mode change and treats status interruptions as terminal.
Reuse the mounted native iframe and replace its authorized grant in place, with
same-origin and exact desktop-binding checks. Retain automation exclusion until
confirmed revoke, and keep input locked until the new control transport is ready.
Only the grant transport reconnects; the viewer page, toolbar and settings stay
mounted. Preserve the last display while connecting. Acceptance is bounded
consumer/helper regression, rendered native takeover/release without iframe
replacement, input exclusion after release, and installed software/process
readback. Native desktop/browser processes and configurations remain untouched.

## Bounded stability repair: 2026-10-10

Branch `fix/desktop-viewer-stability` preserves a ready or connecting selected
native viewer during periodic refresh and visibility return. Explicit confirmed
release still replaces control with observation. Failed viewers retain the
existing recovery path. No browser lifecycle, claim authority or timeout change.
Remote View companion `fix/consumer-control-reconnect` restores input locked by
a transient access failure only after same-grant authorization and transport
recovery; a mode request cancels that intent. Installed adoption and human input
acceptance remain pending. Full rendered smoke has an independently reproduced
baseline timeout at dormant-profile Wake; bounded stability excludes that axis.

## Native toolbar correction and Wake repair: 2026-10-09

Operator rejects duplicated AuraCall takeover controls and the reduced native
viewer toolbar. The desired client retains Remote View's full native controls;
its single view-only/interactive switch coordinates AuraCall pause, exact grant
revocation and the two-minute inactivity handoff. This supersedes the earlier
separate AuraCall Take control/Release UI. That cross-client coordination and
native toolbar restoration are still OPEN.

Real runtime-profile Wake incorrectly used legacy Agent Browser RDP validation.
Native launch now resolves the selected executable directly and retains exact
executable/process/assignment checks. Installed source d6d047f86 passes real
Grok Wake, observe and shared-alias placement while preserving all original
marker/runtime process identities. See native-wake-repair receipt.

## Runtime-profile rail revision: 2026-10-09

The operator reported the installed client working and requested a denser UX:
remove the extra control toolbar; use a single compact header, SVG rail hide/show
control, compact browser rows, and smooth interruptible rail motion with reduced
motion support. Organize actual configured AuraCall runtime profiles by account
or profile via a persisted toggle, including dormant entries and explicit Wake.
Account grouping uses configured service identity only. Unidentified accounts
remain explicitly unassigned; browser paths and secrets are never inventory fields.

Wake opens the selected runtime profile's provider browser through its canonical
launch plan. A configured named desktop wins; unassigned dormant profiles use the
selected existing native desktop. Successful Wake remembers placement in the
private `desktop-profile-assignments.json` configuration overlay. All normal
config loads apply the same overlay, bound to runtime profile, provider and browser
profile, while explicit operator assignments take precedence. This does not
rewrite the user's config file or move/terminate an already-running browser.
Remote/Windows/non-browser profiles and unowned running browser processes are
reported with an actionable unavailable reason. No scheduler/completion wake,
provider prompt, account inference or automatic control acquisition occurs.
New operator-scoped route: POST /v1/desktops/profiles/{runtime_profile}/wake with
an optional configured desktopName; GET /v1/desktops includes runtimeProfiles.
Acceptance covers real profile/identity projection, unauthorized wake refusal,
unknown profiles, deterministic placement persistence, no root fallback, duplicate
wake/native ownership, compact rendered rows, grouping, rail motion and retained
control/idle behavior. Full public handoff remains a separate viewer proof.

## Human input inactivity revision: 2026-10-09

The operator replaces indefinite manual human release with inactivity handoff.
AuraCall pauses while external control input is active. After a configurable
period without external input, the viewer becomes view-only and AuraCall may
resume after exact control-grant revocation. View-only blocks accidental input;
new input must not silently reacquire control. Explicit Take control is required
for the next human interaction. Explicit Release control remains an early exit.
The operator selected an inactivity duration of 120 seconds (two minutes).

The source revision is installed at AuraCall 77030b33d and Remote View 28baf035
(merged by PR346). Both native desktops and markers are preserved, and installed
configuration resolves to 120 seconds. Real never-used control grants expire
after about 124 seconds on both desktops; automation/CDP access resumes and
explicit retake/release passes. Actual input extending the deadline, rendered
view-only behavior, and signed-in root viewing remain unproven. Idle receipt:
`docs/dev/notes/2026-10-09-plan0391-installed-idle-validation.json`.
Installation receipt:
`docs/dev/notes/2026-10-09-plan0391-inactivity-installed-validation.json`.
The Remote View dependency is Plan0071, issue
CochranResearchGroup/remote-view#345, on feat/auracall-control-inactivity.
The gateway records admitted keyboard/pointer input for HTTP and WebSocket and
conditionally revokes under the owner lock. AuraCall polls that exact grant's
conditional revocation, preserves exclusion on uncertainty, and returns its
client to an observe grant only after a terminal release receipt. Parent-page
notifications are not used as inactivity authority. Existing source human-input
proof does not qualify the installed timeout revision.

Implementation must add a bounded Remote View activity/idle handoff contract,
scoped to the exact viewer/control grant and desktop generations, and connect it
to AuraCall's existing revoke-before-resume coordinator. Inactivity begins at
successful takeover so a never-used control grant also returns to view-only.
Actual forwarded keyboard/mouse input resets it; pixels, status polling,
reconnection and unrelated parent-page interaction do not. Expiry disables input
before releasing automation admission. Browser suspension, disconnect or lost
replies must never resume automation before exact revocation is established.
Tests must cover continuous input, inactivity, never-used takeover, held keys or
buttons, multiple viewers, late activity, changed grants/generations, revocation
uncertainty, process restart and explicit reacquisition after timeout. Installed
acceptance must prove input rejection after timeout and actual AuraCall admission
resumption on both desktops. Existing manual-input proof does not qualify this
new requirement. Root viewing remains independently available.

## Installed dedicated client checkpoint: 2026-10-09

User-scoped runtime code cdb767f8 is adopted; API91439 serves ready Research and
Writing browsers with actual native observe grants. Explicit new browser-profile
selections resolve through installed config. All 21 existing launch plans remain
unchanged; scheduler pause, 17 completion identities/pauses, background drain
posture and all 33 pre-upgrade Chrome identities are preserved. The two blank
marker browsers remain intentionally available after the preparation launcher
exits. Operator authentication, native pixels/input and independent root viewing
are pending. Do not reset markers by rerunning prepare. The installed-client
validation receipt and acceptance-installed-desktop-client.ts verify/cleanup
commands carry the next gate. No ticket or full-feature closure is claimed.

## Bounded review remediation: 2026-10-09

The one allowed broad primary-agent review found and adjudicated four blockers.
The one allowed remediation pass verifies B1 Puppeteer admission, B2 root reuse
refusal, B3 authoritative refused/uncertain claim handling and prototype-free
client claims, and B4 native spec alignment. 170 regressions/25 files, build,
typecheck, actual Chrome/Puppeteer and rendered client checks pass. Native
pixels/human input, independent root viewing, installed AuraCall API adoption
and integration remain OPEN. Receipts: bounded-review and
review-remediation-validation under docs/dev/notes/2026-10-09-plan0391-*.
Do not reopen broad discovery; any remaining verification is closed-world.

## Installed placement/control outcome: 2026-10-09

The bounded repair run passed with two real local Google Chrome processes on
distinct native assignments, fresh window/PID ownership, same-process reuse,
actual observe/control grants, actual CDP refusal during takeover and resumption
after revocation. Final acceptance exits 0 and fresh OS census finds no remaining
acceptance Chrome processes. Both borrowed assignments and all 32 preexisting
Chrome processes remain unchanged. Remote View doctor reports ok=true. The two
AuraCall assignments remain retained after browser cleanup. Authenticated native
viewer pixels/input, independent root viewing, bounded review and integration
remain OPEN; this outcome does not close any ticket.

## Installed qualification revision: 2026-10-09

The native AuraCall consumer is configured from the existing 10-desktop effective
configuration; the unrelated unapplied 32-desktop source config is preserved.
The first actual Chrome launch stopped at Chrome's first-run terms window and
never exposed CDP. It also replaced argv with a flattened process title and
scrubbed environ; the original ownership verifier cannot accept that process.
The next invocation correctly refused its unretained still-running process.
The exact failed-launch process group was terminated using its pid file,
executable, exact managed directory/port and native window/PID proof. Browser
profile data remains intact. These two attempts qualify no feature outcome.

A bounded repair packet adds the standard no-first-run flag to minimal launches
and supports flattened/scrubbed processes only with a fresh exact Remote View
native window/PID/generation join. AuraCall's consumer requires `windows` for this
proof. A real process-title fixture first failed, then passed, including wrong
managed-directory and stale-generation rejection. Restarting only control and
gateway adopts the application configuration; no borrowed desktop/browser is
intentionally restarted. Re-run installed desktop acceptance only after these
source repairs and config readback qualify, with at most two repair attempts.

## Native control source checkpoint: 2026-10-09

Native client take/release now issues control only while holding the shared
AuraCall desktop gate. Durable claims retain exact browser generation and stable
provider issuance identity; a failed or ambiguous revoke leaves automation
paused. Explicit release accepts exact revoke readback or exact issuance replay
with `consumer_grant_unavailable`; generic access denial is insufficient. Reload
retains the tab's claim and requires explicit reconnect or release. Source
fixtures and rendered client checks pass; installed native transport, independent
root, two-desktop placement and whole-feature review/integration remain OPEN.

## Current State

The product decisions below are confirmed by the operator on 2026-10-08.
AuraCall can own multiple desktops. Named desktops are configuration-driven,
with a global default and per-browser-profile assignments. The AuraCall-only
client navigates those desktops. Viewing is the default; manual input requires
explicit control handoff coordinated with automation. Root desktop remains
independently available and explicitly selectable. Selected remote-view failure
must not silently fall back to root desktop.

PR #243 merged at 591a118245cafbc54c34cd0bc179c4b380308ef6.
The operator then authorized execution of the full plan, with checkpoint and
stop before two million tokens or three hours. All three source packets are implemented on
feat/issue240-named-desktops and await their coordinated integration/acceptance. The execution
ledger records bounds, current evidence and unmet acceptance. No feature
acceptance is claimed from the planning merge. Current implementation and
installed API adoption have progressed through all three source packets on the
serialized branch: 170 regressions/25 files and bounded review remediation pass.
Installed API28088 code 77030b33d serves both retained native desktops with
120-second inactivity configured. RemoteView 28baf035 is integrated and adopted.
Both typed markers are verified and preserved. Real never-used idle expiry and
automation/CDP readmission passed on both desktops. Actual input extending the
deadline, rendered view-only behavior, authenticated root visual acceptance, and
final PR244 integration remain pending. All three tickets remain open. The
inactivity-installed-validation receipt is current installation authority.

### Historical execution revision: 2026-10-09 (superseded by native correction)

The implementation remains on one serialized branch for source qualification.
Packets retain their dependency order; shared launch-binding retention and
client projection are committed together before joint integration. No ticket
closes before its outcome is integrated and verified. The dedicated route is
`/desktops`; passive presentation uses Agent Browser's full-desktop capture
contract on retained remote-view browsers. Controller presentation remains
withheld until real automation exclusion and conflict arbitration are proven.

The first checkpoint used a nonexistent `service route-pool` CLI command.
Installed readback disproved it. The current source reads the actual supported
`service status` response and its `service_state.routePool` collection. Existing
three installed routes currently report unavailable; this is an installed
acceptance gate, not evidence to synthesize ready state or provision capacity.

### Contract correction: 2026-10-09 native application integration

Canonical Agent Browser main `c4054ed6` and Remote View main `e1ad20d`
expose a newer native application integration than the local Agent Browser
checkout used for the first source checkpoint. Remote View's authoritative
`docs/consumer-integration-guide.md` explicitly includes AuraCall and supplies
application pools, retained assignments and observe/control embed routes through
`POST /v1/consumer`. The native viewer owns pixels, transport and input. AuraCall
owns its dedicated route, desktop selection, durable assignment lookup and
coordination with automation. Replace the snapshot presentation as the primary
product path with native presentation; keep prior receipts as historical source
evidence, not feature acceptance. No second viewer/access layer is required.

The installed consumer API at loopback port 19096 returned native application
inventory with live-resource desktop joins. Legacy RDP route unavailability does
not establish native capacity failure. Installed configuration currently has no
AuraCall consumer. A separate supported Agent Browser `service browsers` read
failed with `protected_browser_owner_observation_invalid`, effect `no_effect`;
preserve that failure without repeated recovery attempts. Native Agent Browser
responses retain `browserSession` handoff identity and differ from legacy open
responses, so launch/attachment contracts must be adapted and tested before
acceptance. This revision preserves all confirmed product decisions and gates.

Next bounded source work: implement exact application/pool/assignment generation
joins at the native consumer seam, then integrate named placement and native
observe/control presentation. Native viewer control must use the proven CDP
admission gate; a viewer grant alone remains insufficient. Configuration adoption
and installed acceptance remain explicit later gates. Do not mutate borrowed
Agent Browser desktops or reuse foreign application assignments.

## Objective and scope

Display AuraCall managed browsers through a dedicated remote-view client,
selected by configuration. Preserve root desktop display access. Cover shared
browser launch resolution rather than adding provider-specific behavior.
Keep managed browser profile identity and authentication intact.

## Verified source baseline

- src/browser/service/agentBrowserRdpLauncher.ts already requests remote_headed,
  rdp_gateway, manual_attached_desktop and shared_display, with serviceName
  AuraCall. It requires exact build proof and operatorVisible.state=ready,
  resolves the same converging handoff, and attaches to the returned CDP endpoint.
- docs/dev/browser-service-tools.md and docs/configuration.md document
  browserProfiles.<id>.agentBrowserRdp.enabled. Existing configuration does not
  itself implement an AuraCall-only client application.
- Agent Browser's remote-view command exposes retained browser handoffs and
  route/display binding. Its dashboard has workspace inventory and view/control
  modes. The bounded contract search did not identify a dedicated client-app
  mode. Private display isolation alone is not acceptance of a dedicated app.
- The supplied checkout has pre-existing dirty journal and handoff work; it is
  preserved. This design uses an isolated worktree from freshly fetched main.

## Confirmed product decisions

- One AuraCall-only client may present multiple AuraCall-owned desktops.
- Named desktop definitions and browser assignments live in configuration.
- A global default applies unless a browser profile explicitly overrides it.
- Root desktop remains separately available and explicitly selectable.
- Viewing does not acquire manual control. Explicit handoff coordinates manual
  control with automation ownership.
- Unavailable configured remote-view fails clearly; it never silently falls
  back to root desktop.

## Contract findings and remaining engineering checks

Agent Browser exposes routePoolEntryId, displayAllocationId and routeId binding
for remote-view opens. It also exposes observer viewer leases and explicit
service_controller_lease_takeover requests. These are existing building blocks,
not proof that desktop grouping or human/automation exclusion is implemented.

The implementation must verify whether multiple managed browsers may share one
route allocation, and how controller leases exclude AuraCall CDP mutations.
Do not equate a dashboard controller lease with paused AuraCall automation.
Use service-owned route/allocation identity, never guessed DISPLAY values.
Map named desktops to exact available service routes; missing configuration or
capacity must produce an actionable error. Automatic infrastructure provisioning
is outside this slice. Configuration changes apply to subsequent launches;
existing running browsers are not moved automatically.

The public test seams are effective configuration and launch dispatch, client
inventory/view selection, and control handoff with observable automation
admission. These follow existing ownership boundaries; exact implementation
names remain an engineering choice.

## Acceptance criteria

- Global display configuration applies to every managed AuraCall browser path;
  an explicit browser-profile override wins deterministically.
- Remote-view mode provides an AuraCall-only client with navigation between
  multiple configured desktops; only positively owned desktops/browsers appear.
- Browser-profile desktop assignment overrides the global default. Unknown
  desktop names and unavailable route allocations fail before browser launch.
- Root desktop remains independently available and explicitly selectable.
- Unavailable remote-view fails clearly without silently launching on root.
- Client reconnect uses durable handoff identity; raw provider URLs are not
  stored as durable client links.
- Authentication, browser-build proof, managed browser profile ownership,
  existing target leases and readiness checks remain enforced.
- Provider-free tests exercise real config resolution and launch dispatch;
  client tests prove ownership filtering and the agreed control posture.
- Viewing starts without a controller lease. Explicit control handoff prevents
  conflicting automation; release restores admission only after fresh ownership
  checks. Closing the viewer does not close an owned browser by implication.
- Any installed/live acceptance is recorded separately from source validation.

## Non-goals

A separately installed desktop binary, provider prompts, account migration,
root desktop replacement, bypassing browser ownership, and unrelated recovery.
Do not modify Agent Browser solely to simulate an unsupported contract; identify
any actual dependency and the narrow required change first.

## Execution packets and blocking edges

The product decisions and three-packet breakdown are approved. Detailed behavior
is captured in [the companion spec](0392-2026-10-08-auracall-remote-view-client-spec.md).
GitHub is the coordination ledger; this plan owns execution scope and evidence.
Issue receipt: [verified ticket creation](../notes/2026-10-08-plan0391-ticket-receipts.json).

| Packet | Work item | Blocked by | Bounded outcome | Initial status |
| --- | --- | --- | --- | --- |
| 1 | [#240](https://github.com/ecochran76/auracall/issues/240) | None | Configured desktop assignment and exact launch binding | READY |
| 2 | [#241](https://github.com/ecochran76/auracall/issues/241) | #240 | Dedicated client with multiple desktops and passive viewing | BLOCKED |
| 3 | [#242](https://github.com/ecochran76/auracall/issues/242) | #241 | Explicit human control coordinated with automation | BLOCKED |

Dependency links are in the issue bodies. Native planning/assignment mutations
are outside the configured forge target allowlist; no assignee, Project,
milestone, custom label, or native dependency metadata was changed. Existing
enhancement labels classify intent; they do not assert implementation readiness.

### Packet 1: configured desktop assignment and launch binding

Owner: Eric Cochran, implemented by the primary agent or a separately assigned
ready-ticket session. Inputs: confirmed spec, current configuration model and
Agent Browser route/allocation contracts. Expected write surface:
`src/schema/types.ts`, shared configuration and browser-profile resolution,
`src/browser/service/agentBrowserRdpLauncher.ts`, shared browser-service types,
public configuration/launch tests, and operator configuration docs. Follow
current graph-backed discovery before editing; these are locators, not frozen
symbol names or permission to refactor the entire configuration model.

Prove two named desktops, global default, browser-profile override, explicit
root selection and errors before launch for unknown/unavailable assignments.
Check actual service capacity and reuse behavior before promising that distinct
browser profiles can share an allocation. Freeze the minimal config schema at
implementation time after that contract check. Red-green through public config
and launch seams; preserve existing authentication/build/readiness boundaries.
Terminal condition: published, validated integrated source fulfills #240;
record any missing Agent Browser capability as an exact dependency rather than
simulating a successful binding. No live adoption is implied.

### Packet 2: dedicated multi-desktop client

Owner: Eric Cochran. Inputs: qualified packet 1 source on the joint branch and its resolved desktop
identity contract. Expected write surface: AuraCall application/API presentation
and integration tests; any necessary Agent Browser presentation change must
have its owning-repo plan and governed work item before modification. The exact
hosting seam is selected from current application architecture, not invented
by treating a raw Guacamole URL as the product.

Deliver owned inventory/navigation, passive viewing, empty/unavailable states,
durable reconnect and independent root desktop access. Prove inventory
filtering with foreign and ambiguous owners, and verify viewer closure does
not implicitly close browsers. Terminal condition: dedicated client behavior
and documentation meet #241 through integrated source and public tests.
Manual input remains disabled until packet 3 meets the control contract.

### Packet 3: coordinated human control

Owner: Eric Cochran. Inputs: integrated packet 2, real automation admission
seams, viewer/controller lease contracts and current ownership checks. Expected
write surface: the client handoff controls, shared automation admission and
handoff coordination, public behavior tests, and operator docs.

Takeover must coordinate in-flight automation before admitting human input;
prevent subsequent conflicting CDP/desktop mutations while human control is
held. Release requires fresh authority before automation resume. A controller
lease or disabled UI button alone cannot prove this exclusion. Document and
test disconnect/expiry policy conservatively; do not infer a safe resume from
an absent viewer. Terminal condition: integrated #242 source proves passive
startup, takeover, mutation exclusion, conflict refusal and verified release.

## Validation strategy

- Planning slice: verify each issue's exact title/body, label, state and marker;
  retain append-only mutation receipts, check the ticket graph and local links,
  run diff hygiene and the applicable planning audit. Do not call this a code
  test or runtime acceptance.
- Each implementation packet: read relevant policies and current graph context,
  run one meaningful failing behavior test before the minimal implementation,
  then the focused affected checks and required type/lint/build checks. Preserve
  exact red/green commands and commit/PR evidence in this plan or bounded receipts.
- Installed acceptance: separately scoped proof must show two actual named
  desktops in the AuraCall client, profile/default assignment, passive viewing,
  independent root desktop and exact control exclusion/resume. Use a bounded
  non-provider fixture where possible; browser visibility is not provider
  success. Read OS process/resource state after any live desktop run.

## Sequencing, scope controls and remaining gates

Primary owns the critical path. Packets are sequential; no parallel agent work
is needed. Register implementation custody/active lane and claim the ready work
item under applicable forge policy before editing source. Preserve other
worktrees, paused scheduler lanes and unrelated dirty state. The current execution goal authorizes implementation, integration and bounded
acceptance work. Infrastructure provisioning and unrelated provider prompts
remain excluded. Preserve unrelated installed services and browser sessions.

All three packets are expected; this plan does not silently drop the client or
control handoff if existing remote-view launching proves insufficient. If a
service contract blocks a packet, retain the exact failing evidence, identify
the owning-repo dependency, and keep the affected acceptance criterion open.

## Definition of done

- All three approved work items have integrated source and acceptance evidence.
- Operator docs describe the effective configuration and actual client behavior.
- Named desktops, default/override precedence, root access, passive viewing,
  reconnect, failure handling and coordinated control meet the acceptance criteria.
- Source validation, installed acceptance and any deferred runtime work are
  distinguished truthfully; no readiness claim stands in for observed behavior.
- Work items, plan state, roadmap/runbook and custody projection are reconciled
  from verified evidence. Close the plan only when required outcomes are met;
  this ticket-and-plan publication alone leaves it PLANNED.

### Native placement execution decision: 2026-10-09

AuraCall will use Remote View's documented external-application contract directly
for native named desktops. AuraCall already owns its Chromium launch, managed
browser profiles and CDP lifecycle. Keep those existing seams and provide the
exact provider launch environment per child process. Agent Browser's globally
configured application identity does not become AuraCall ownership merely by
changing service labels; borrowed Agent Browser assignments stay excluded.
Existing explicitly configured agentBrowserRdp behavior remains independently
supported. Native named desktop configuration selects an AuraCall application
and pool; acquisition uses a stable key per named desktop and retains the exact
assignment. Multiple AuraCall browsers may share that retained desktop.

Expected write surface adds native application configuration/resolution, durable
native assignment/browser receipts, the existing Chrome launch environment seam,
native client inventory/embed/control APIs and their public tests. No upstream
code or installed runtime upgrade is required for this path. The provider must
already expose a configured AuraCall consumer/pool and approved embed origin;
missing configuration fails before browser launch. Capacity acquisition within
that configured application pool is ordinary desktop use, not installation or
network provisioning. Release and cleanup require exact process/assignment
readback; closing a viewer does not release the desktop.

## Rail-only browser management correction

Remove the redundant AuraCall top header, refresh button and raw browser-ID selector. Keep native Remote View toolbar unchanged. The left rail selects each browser with runtime profile/account labels; unprofiled rows use desktop label and local ordinal. Move the SVG rail toggle into a persistent rail handle. Add an operator-only close action bound to the configured desktop and exact owned native browser identity. Release the caller’s retained human claim before close, keep other claims fail-closed, send guarded CDP Browser.close, and confirm the original process exited before reporting closed. Never stop the shared desktop or delete the managed browser directory; aliases of the closed browser become dormant and may Wake. Validate authorization, stale/foreign IDs, graceful-close confirmation and rendered rail actions. Installation must preserve live browsers through API package adoption.
