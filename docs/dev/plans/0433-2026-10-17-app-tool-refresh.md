# Plan 0433 — In-place ChatGPT app tool refresh (#316)

State: OPEN
Lane: issue316
Branch: feat/issue316-refresh-tools
Target: main
Owner: ecochran76
Base: 987bc086752751eaecf65206214cce98766bbd4a

## Current State

Source PR328 is merged and installed from canonical7912118c4. Installed acceptance
returned unconfirmed; successor Plan0433.2 owns bounded settlement repair and final
installed proof. The full user objective remains OPEN.

## Goal and authority

Resolve #316 through Ask Matt: grounded specification, behavioral red/green
implementation, review, PR integration, and bounded native acceptance. User
explicitly authorizes browser interaction as needed. Preserve app identity,
account, endpoint and connection. Never replace the app, consent, submit prompts,
clear traffic ownership fences or reset browser state to obtain acceptance.

## Specification

Add `apps refresh-tools ID --server-url URL --expected-account ACCOUNT
--yes [--json]`. Reuse the existing browser operation ownership and exact account
and inventory qualification. Match exactly one app; bind its endpoint to the
explicit expected endpoint. Follow the current exact-app Manage/settings surface
and activate only Refresh tools. Verify catalog/tool metadata after refresh and
unchanged app/connection identity. Human approval and uncertain outcomes are
explicit non-success outcomes; do not auto-consent or retry a mutation.
Keep existing destructive `apps refresh` semantics explicit and unchanged.

## Acceptance and public test seams

1. CLI parsing/help exposes refresh-tools distinctly; existing refresh still
   means replacement. Test actual CLI registration/parsing.
2. Operation dispatcher rejects unconfirmed, wrong account, ambiguous app or
   endpoint mismatch before mutation. Test public dispatcher with adapter seam.
3. Browser adapter reaches the current app settings, refreshes exact tools,
   verifies catalog and identity, and reports human/uncertain/error states.
   Test adapter with synthetic CDP/UI fixtures, then one bounded native run.
4. Documentation explains preserved identity, separate replacement semantics,
   expected endpoint and all failure outcomes.
5. Typecheck, affected tests, lint, published diff review and CI pass; merge via
   PR and verify canonical remote custody before installed acceptance.

## Bounds and checkpoints

Start 2026-10-17T20:16:45Z. Hard user limit: six hours (02:16:45Z on Oct18)
 or two million tokens, whichever first. Checkpoint before either limit; use
30-minute checkpoint backstop and material state transitions. At most two
attempts per work unit, one broad review and one remediation pass before
reframing. No delegation unless explicitly authorized by applicable instructions.

## Checkpoint 1 — discovery to active

Progress: outcome_progress. Fresh origin/main inspected, isolated worktree
created, no overlapping refresh-tools PR found. #316 assigned and categorized.
Existing refresh deletes first; safe refresh operation is absent. Root checkout
has unrelated edits preserved. #325 inventory timeout may limit native
acceptance; diagnose only as needed for this operation, without bypassing guards.
Next: implement dispatcher tracer bullet, browser adapter and CLI, then review.

## Checkpoint 2 — source implementation and review

Progress: outcome_progress. CLI, dispatcher, browser adapter and operator docs
implement the frozen brief. Native investigation proved the current settings
route and a trusted refresh_actions response containing21 tool definitions.
Two initial compiled attempts returned unconfirmed/nonzero rather than falsely
claiming catalog success. Their request diagnostics identified link_id as the
wire identity. The implementation now captures connection metadata on a forced
exact-settings navigation and qualifies that link against the selected app
before activating Refresh tools. Missing or foreign connection metadata refuses
activation. No prompt, reconnect, app replacement or permission change occurred.

Public-seam red/green receipts: unsupported action; missing browser method;
multi-app bundle identity switch; and foreign refresh link carrying a matching
endpoint all failed before their respective repairs. Current tests also execute
the actual settings probe expression against a synthetic DOM boundary. The
pre-existing two-minute submission assertion failed on untouched base987bc0867;
it now matches the already documented two-hour configured default. Runtime
submission behavior is unchanged by that assertion correction.

Review fixed point:987bc086752751eaecf65206214cce98766bbd4a. Spec authority:#316
agent brief plus this plan. Standards review: provider details remain in the
existing adapter, native ownership/traffic fences retained, no new prompt path.
Spec review accepted two blocking candidates (exact App ID preservation within
multi-app plugins, and foreign-link false attribution); both have observed
red/green behavioral coverage. Subsequent review is closed-world against those
findings, changed code and frozen acceptance criteria.

Validation: affected tests, TypeScript build and changed-file lint pass at the
current source checkpoint; final counts and native acceptance are recorded in
the validation note. New refresh-tools alone skips irrelevant Developer mode
observation while retaining account/inventory/settings qualification. It has a
90-second operation ceiling and explicit non-success JSON. Existing replacement
semantics remain intact. Compiled native acceptance with qualified connection metadata passed: completed,
exit0,21 tools, preserved identity/connection, no prompt or consent. See
`docs/dev/notes/2026-10-17-issue316-source-acceptance.md`. PR custody, CI, merge
and installed acceptance remain unmet.

Budget readback at20:32:38Z:212214 goal-accounted tokens and1047 elapsed seconds;
user stop thresholds remain two million tokens or six hours. Checkpoint before
thresholds; next checkpoint by20:46:45Z or a material transition.

## Checkpoint 3 — published self-check and integration readiness

Progress:outcome_progress. PR328 publishes f23d870c8. Source-native operation,
105 affected tests, typecheck, full build, runtime contract and full lint pass.
Full provider-free sweep:3943 passed,5 failed,65 skipped. Four failures reproduce
on untouched base; the fifth is an unchanged clock flake passing on base and in
feature isolation. All five are nonblocking_backlog for this frozen issue316
scope, owner ecochran76; preserve the failed run. No full-suite or hosted-CI green
claim is made. No hosted runs/checks are reported; canonical main has no required
status contexts. The configured affected-test/primary-adjudication policies
support scoped integration with this explicit baseline disposition.

Published Standards and Spec self-check passed for the changed surface. Exact
remote branch readback matches the source checkpoint; no private payloads or
scripts are included. Remaining gates: canonical PR merge, fresh canonical SHA
and merged-PR provenance, fresh isolated install prefix, wrapper and compiled
hash readback, one bounded installed refresh-tools acceptance, and final closure
record. No API service restart, scheduler action or provider prompt is included.
