# Plan 0423 — owned file inventory budget continuation

State: CLOSED
Parent: Plan0422 / Plan0420 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: 28001783c8e3a178ec58da37918e2a6119306b6d
Owner: primary, serial execution

## Current State

Source packet complete; issue165 remains OPEN. Project-file red returned cursor0/
yielded=false after project2 denial despite retaining file1. Library red returned
truncated=false after denied inventory. Tolerant readers now propagate governed
request failures through one local classifier. Project scan retains completed files
and unfinished index1. Library returns a yielded, incomplete inventory immediately,
retaining prior attachment/chunk state instead of continuing to other surfaces.
Serialized fresh-authority passes resume only unfinished work after virtual +61s.

Public collector fixtures use real shared configured account authority, phase
wrapping, owned annotation and close; provider/CDP outputs remain simulated.
Warning, persisted-warning, uncertain-send and unsettled-action variants hard-stop
for both surfaces. Library fixture uses the actual plan controller; project two-row
accumulation omits its one-read cap while retaining the phase governor. A separate
public detail-inventory regression proves prior chunk24 preservation and no later
surface reads after denied library admission. Removing chunk preservation produces
red with conversationDetail=null; restoring it passes.

Serial primary review against28001783c: Standards uses AGENTS, architecture,
testing and validation policies plus the code-review baseline. Repeated request
failure classification was consolidated locally in a bounded review refactor.
Spec uses this plan under Plan0411/0386; accepted blocking cursor-preservation
finding repaired and verified. No remaining packet blocker. No broad drift-
discovery pass or delegation; inherited goal/review bounds remain in force.

Focused110tests/4files, typecheck, scoped Biome and diff checks pass. Original
red/green commands: `pnpm vitest run tests/browser/backendRequestAdmission.test.ts
-t 'mode=files-budget'` and `-t 'mode=library-budget'`. Final focused selection:
that file plus `tests/accountMirror/chatgptMetadataCollector.test.ts`,
`tests/accountMirror/providerTrafficPlan.test.ts`, and
`tests/browser/configuredProviderTrafficAuthority.test.ts`. Cursor sensitivity:
`pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts -t 'library
budget yield preserves'`. No retries or live tests; no build/install/provider,
scheduler or warning-clearance effects. Progress classification: progress.

Remaining source gates: initial bootstrap, retained/background targets, other
caller composition and compatible participants; production ceiling and full
Plan0386 acceptance are still unproved. User questions for a genuine changed-B
locator and production request ceiling are pending; fixtures do not choose either.

## Acceptance and bounds

Retain completed files; yield unfinished project-file work only for typed pre-send
budget denial plus final exhausted state, preserving its serialized project cursor.
Resume only unfinished work under fresh authority. Library denial must never report
an empty complete library or continue into other surfaces. Known denial is resumable;
observed/persisted warnings, uncertain sends and mixed cleanup failures hard-stop.
Preserve request/browser-operation budget separation; no automatic retry.

Write surface: collector, existing owned-request fixture and supporting plan,
journal, fixes and testing docs. One vertical red/green at a time, then serial
Standards/Spec review against the base and closed-world accepted-finding checks.
Terminal condition: validated source checkpoint, not full issue acceptance.
No provider probe, install, scheduler change, guard clearance, ceiling choice or
production activation. Bootstrap/background targets, other callers, compatible
participants and full Plan0386 changed-B/quiet/deferred/guard/resource gates remain.
Standing goal/resource/review controls carry forward; no delegation or reset.
