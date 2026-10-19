# Plan0437 — App inventory failure diagnostics

State: CLOSED

## Current State

Bounded diagnostic delivery complete: PR341 merged856276cdbe14f1e9a134aa757a534ad10bad4dbd.
CLI/MCP wrappers use user-runtime-issue325-856276cdb.101affected tests, final
typecheck, scoped lint, build, installed identity-timeout fixture and /desktops
contract pass;597installed files match merged source. Previous wrappers/runtime
retained; no service restart. Issue325 stays open for terminal installed inventory
acceptance. This plan closes the diagnostic packet, not the inventory workflow.

One bounded installed read on runtime/browser profiles wsl-chrome-3 passed queue
admission and identity; last reported attachment at external25s expiry (exit124,
stdout0bytes, stderr265bytes). This is stage evidence, not a reproduced internal
deadline or historical common cause. Current capacity wait600000ms makes inventory
645000ms; queue admission separately allows600000ms. Neither bound was increased.
Post-run native process/assignment/window verified; cooldown hash unchanged.
No retry, ownership reset, prompt or scheduler control. Private evidence retained
under ~/.auracall/acceptance/issue325-20261019; no private browser content in Git.

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

## Remaining gate

Investigate attachment using a new bounded feedback loop before another live
probe. Do not bypass admission, clear owner state or infer cleanup from process
exit. Memory disposition forbidden: developer requires explicit memory-update
request; recorded no-write receipt, zero Graphiti writes.
