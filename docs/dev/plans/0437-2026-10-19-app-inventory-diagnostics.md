# Plan0437 — App inventory failure diagnostics

State: OPEN

## Current State

Issue325; owner ecochran76; branch fix/issue325-inventory-diagnostics from
ca3ce73b6. A public CLI-operation test reproduces lost stage and serializable
timeout evidence in 3.83s (test body28ms): expected inventory/code/timeout,
received empty object. No provider access required.

## Scope and acceptance

Preserve named operation stages, effective timeout and structured list failures.
Test public operation and CLI output seams; preserve existing ownership,
cancellation, cooldown and unknown-cleanup handling. Queue admission precedes
the operation deadline and must be named separately. No timeout increase,
browser restart, prompt submission or ownership reset. PR335 remains separate.

## Diagnosis

Ranked predictions: stage-less deadline construction loses context; cleanup can
replace primary failure; CLI only handles refresh-tools JSON errors. Probe one
at a time. The configured capacity-wait allowance extends the default45s:
75s external expiry does not establish failure of the internal deadline.

## Validation and done

Red/green command: pnpm vitest run tests/cli/chatgptDeveloperAppsCommand.test.ts
-t 'retains the stalled inventory stage'. Then affected CLI/adapter suites,
typecheck, scoped lint, build, published diff review and merged PR. Installed
and live acceptance require separate attributable readback; do not close325
on source tests alone. This packet is serial; no delegated work.

## Current verification

Focused provider-free selection:101tests across5suites passed in4.10s.
Final typecheck, full build and scoped Biome passed. Full planning audit retains33preexisting
errors (32missing AGENTS policy targets and Plan0406-1 Stateheader); this plan
introduces no audit finding. No managed browser process was created by fixtures.

## Review

Fixed point ca3ce73b6566ef08485f7b9fcc1a79ee61f27e36; issue325 is the spec.
Serial primary review uses AGENTS, CONTEXT, testing, documentation and branch
policies and Matt's smell baseline. Standards: no accepted blocking finding.
Spec: cleanup fallback mislabeled as queue admission was accepted and repaired
with red/green regression; no remaining accepted blocker. Original admission
causes and unknown cleanup remain preserved, while JSON excludes raw causes.
No claim that source tests explain the historical live blocking stage.

PR341 publishes cbc05ee36. Remote branch equals the validated local checkpoint;
main remains ca3ce73b6 before integration. No CI checks are configured on the PR.
