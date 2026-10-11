# Plan0402 | Stored browser launch-plan characterization

State: OPEN
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
