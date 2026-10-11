# AuraCall Remote-View Client Spec | 0392-2026-10-08

State: OPEN
Lane: P86
Parent: Plan 0391
Owner: Eric Cochran

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

## Current State

Tickets #240, #241 and #242 are published. Native placement, passive embeds and coordinated control pass source checks.
Installed two-desktop Chrome placement and API/CDP exclusion pass; authenticated
native pixels/input, root viewing and final integration remain pending. The installed API now serves both owned native desktops; the operator viewer check is pending. All tickets stay open until integrated and installed evidence qualifies
their respective outcomes.
This is a local spec, not a claim of installed behavior.

## Problem Statement

AuraCall browsers need a dedicated application view through remote-view,
without requiring the operator to use the general root desktop. AuraCall can
own multiple desktops, so one browser or one undifferentiated stream is not
a sufficient product model.

## Solution

A dedicated AuraCall remote-view client navigates multiple AuraCall-owned
named desktops. Configuration chooses the default desktop and allows each
browser profile to override its assignment. Root desktop remains available
independently. Views begin passively; manual interaction requires explicit
control handoff coordinated with automation. Unavailable configured remote-view
stops clearly rather than falling back to root desktop.

## User Stories

1. As an operator, I want a dedicated AuraCall client so I can find AuraCall work.
2. As an operator, I want multiple named desktops so I can organize browsers.
3. As an operator, I want navigation between desktops so I can inspect each one.
4. As an operator, I want a global default so new browser launches are predictable.
5. As an operator, I want browser-profile assignments so different browsers can use different desktops.
6. As an operator, I want explicit root desktop selection so the general desktop remains usable.
7. As an operator, I want clear unavailable-desktop errors so I can fix configuration.
8. As an operator, I want an empty client state so no browsers is not confused with a failure.
9. As an operator, I want passive viewing so observing does not disrupt automation.
10. As an operator, I want explicit control handoff so I can interact without conflicting automation.
11. As an operator, I want control release so automation can safely resume.
12. As an operator, I want conflict messages so another controller is not silently displaced.
13. As an operator, I want durable reconnect so transient disconnection does not lose the desktop binding.
14. As an operator, I want closing the client to preserve browsers so viewing and browser lifetime remain separate.
15. As an operator, I want positive AuraCall ownership filtering so unrelated browsers are not presented as mine.
16. As an operator, I want existing authenticated browser state preserved so display selection does not force account migration.

## Implementation Decisions

- Extend shared configuration resolution and browser launch dispatch; provider
  adapters do not independently choose desktops.
- Model desktop names separately from browser profiles and runtime profiles.
- Global defaults and explicit browser-profile overrides resolve deterministically.
- Named desktops use Remote View's external-application consumer API directly.
  AuraCall owns managed Chrome processes, profiles and CDP; Remote View owns
  assignment, display placement and native viewing. Agent Browser RDP remains
  an explicit compatibility path with separate ownership contracts.
- Retain assignment and exact process identities. Obtain fresh lifecycle and
  viewing generations before launch or embed issuance; raw DISPLAY alone is
  never ownership proof. Do not persist ephemeral viewer URLs.
- Preserve authenticated managed profiles, selected executable/build and
  existing browser processes. A config change requires explicit closure before
  a live browser can change desktop placement, including returning to root.
- Acquire only configured existing pool capacity. Do not provision desktops,
  RDP users or infrastructure during browser launch.
- The dedicated AuraCall browser client mounts Remote View's native embed with
  its unchanged consumer helper. Default grants are observe-only; the client
  renews ephemeral grants without replacing durable desktop/browser identity.
- Explicit human takeover acquires AuraCall automation exclusion before issuing
  a control grant. Direct CDP and Puppeteer commands share admission through
  each protocol reply. Closing a viewer or grant expiry never resumes automation.
- Explicit release revokes the exact grant before automation resumes. Unknown
  issuance or revocation retains the caller's recovery claim and pause. A
  definitive refusal with no caller-owned claim returns to passive observation.
- A client filter is presentation scope, not a new security isolation claim.

## Testing Decisions

Test externally observable behavior through three public seams: configuration
and launch dispatch, client inventory/view selection, and control handoff with
automation admission. Prefer existing config-resolution and launcher test
harnesses. Known literal expectations must come from this spec, not a duplicate
of the implementation algorithm.

Cover two named desktops, global default, profile override, unknown desktop,
root selection, unavailable route and no fallback. Verify exact route binding
and build/readiness checks. Client tests prove positive ownership filtering,
multiple-desktop navigation, empty/unavailable states and durable reconnect.
Control tests prove passive observation, explicit takeover, real automation
exclusion, conflicting ownership, release and fresh-ownership resume.
Provider-free checks prove source behavior only. Installed acceptance must
separately demonstrate the dedicated client, two actual desktops and root
availability, followed by process/resource readback.

## Out of Scope

A separately installed native binary, provider prompts, account migration,
automatic desktop infrastructure provisioning, root replacement, automatic
movement of running browsers, and unrelated recovery or refactoring.

## Further Notes

The approved vertical slices and their blocking edges are recorded in the
parent plan: #240 → #241 → #242. Product decisions are settled. The next
implementation frontier is the joint source checkpoint for #240/#241, followed
by #242 control coordination and whole-plan integration/installed acceptance.
