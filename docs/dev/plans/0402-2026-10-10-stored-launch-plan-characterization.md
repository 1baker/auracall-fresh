# Plan0402 | Stored browser launch-plan characterization

State: CLOSED
Authority: user approved Issue226 reconciliation and scoping the survey's
launch-plan improvement. Implementation and source review/PR authorized by subsequent operator go-ahead. No provider request or installation in this packet. Source baseline e3d6d94c1388ce0b1640efeacdc90ba33d484508.

## Current State

Issue226 reconciliation published as comment6104153240; issue remains OPEN.
Installed pending-chat idle renewal and native continuation passed Plan0400;
absolute deadline repaired/installed PR259. Prior exit actors and original
recovery classification remain unresolved, separate from architecture work.

CONTEXT.md is domain authority; no new terms or ADR required yet.
Configured executor resolves BrowserLaunchPlan at803 and already consumes managed
browser directory and selected browser profile at910. Browser options around1076
rebuild source-profile executable/cookie/display/root precedence from runtime,
browser-profile and global configuration. Existing test explicitly protects
ChatGPT provenance against a default Grok managed directory.

## Proposed bounded tracer

One stored ChatGPT step through createConfiguredStoredStepExecutor into injected
browser execution. Characterize the resolved launch plan and actual browser options
under conflicting explicit/default runtime/browser/provider selections. Map each
launch-owned field: executable, source browser profile name/root/cookies/bootstrap,
display and managed root/directory. Show exact precedence and divergence; do not
assume every difference is a defect. Keep model/effort/mode/tool preferences,
mutable provider-session authorization, runtime evidence, recovery semantics and
artifact-output policy outside the projection.

Design direction: consume the existing immutable plan's launchPolicy and typed
source/managed browser identity. Avoid adding a wrapper that merely relocates the
old precedence chain. Change must delete duplicated launch-owned decisions, retain
explicit caller intent and preserve provenance. No new model registry, broad
configuration migration, lease refactor or all-provider rewrite.

## Decision frontier

Asked operator: preserve current precedence during initial extraction, or adopt
existing launch-plan precedence wherever characterization finds a mismatch?
Recommended: preserve behavior first, document mismatches for explicit decision.
Accepted by operator: preserve current behavior first. Characterize mismatches before any projection; precedence changes require a separate decision.
This is the material product/compatibility choice. Other choices are routine scope.

## Acceptance and stopping rule

Provider-free tests at existing stored executor and launch resolver seams. Protect
explicit ChatGPT versus default Grok provenance, source/managed profile distinctions,
explicit overrides, stale managed-directory defaults and authorization origin.
Run focused configured-executor/launch-plan tests, typecheck and targeted lint.
A mismatch is evidence for a separate decision, not automatic permission to change
semantics. If characterization reveals no materially duplicated decision to remove,
park the maintenance lane. Source review, PR integration and installed/live adoption
remain separate. Memory forbidden: no explicit durable memory-update request.

## Outcome | 2026-10-10

Characterization completed; convergence refactor parked under the stopping rule.
Every proposed replacement has a demonstrated precedence difference; the managed
directory already uses the plan and source root is not an emitted stored option.
There is no equivalent duplicated decision removable through the existing plan
without changing current behavior. Production source unchanged; no wrapper added.
See [field map and review](../evidence/plan0402/characterization.md).

| Acceptance requirement | Current evidence |
| --- | --- |
| Stored ChatGPT tracer; conflicting explicit/default selections | Three new public executor cases and existing default-Grok provenance case |
| Executable, source root/name/cookies/bootstrap, display, managed root/directory | Field map plus exact plan and emitted-option assertions |
| Explicit canonical/legacy overrides; fallback; stale defaults | Literal expectations for all three new cases; existing complete-options stale-directory assertion |
| Source versus managed identity and authorization origin | Typed source assertions, distinct managed directory, canonical/legacy authorization contexts |
| Mutable authorization excluded from immutable launch snapshot | Public snapshot assertion and original authorization remains unfrozen |
| Remove only equivalent duplication; no relocated precedence wrapper | Six temporary single-field substitutions detected; production source restored exactly; park refactor |
| Preserve model/tool/recovery/evidence/artifact behavior | Production source unchanged; full existing stored executor suite passes |
| Focused validation, typecheck, targeted lint | Adjacent validation receipt and retained command outputs |
| Source review and PR delivery | Separate Standards/Spec review retained; PR publication recorded in delivery artifact |
| No provider/install/live scope expansion | Public browser seam injected; no provider command, installation or wake |

The initial fixture expectation was corrected from Browser Source to the observed
Global Source baseline. This is discovery evidence, not a repaired defect. No
precedence migration was approved or implemented. Installed/live acceptance and
Issue226 closure remain separate from this completed characterization packet.
