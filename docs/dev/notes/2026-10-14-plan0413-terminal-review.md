# Plan0413 context command terminal review

Primary serial review, no delegation. Frozen base:
58d9615f754ca0c46cc207f6a56e526f8130c060. Exact working-tree patch on
fix/issue165-context-terminal-exit. Spec: Plan0413 and the original-command
acceptance boundary retained by Plan0412/Plan0411.

## Standards

Apply AGENTS.md, CONTEXT.md, architecture/testing/documentation/integration
policies and Matt's smell baseline. The actual CLI registration is exercised
without importing an executable entrypoint. External configuration/SDK and the
retained timer are transport/runtime doubles; source callback and flush/exit
helper are actual code. The existing app boundary is renamed internally and
reused, avoiding duplicate terminal implementations. No new public CLI command,
runtime API, browser selector or package dependency is introduced.

Source behavior does not close browser resources. Completed service settlement
precedes the terminal boundary; app dispatcher release still precedes the same
boundary. Errors do not enter a successful terminal path. No accepted blockers.

## Spec

The one-byte public-command subprocess reproducesETIMEDOUT at1500ms after a
settled synthetic result. One200KB result also failed before the repair. This
qualifies the missing terminal contract; it does not identify the native handle.
The existing flush boundary preserves full stdout/stderr and actual exitCode.
One-byte/200KB success and provider failure verify output/status independently.
Existing app completed/failed cases and explicit model flag forwarding remain
green after the internal helper rename. CLI error propagation is retained.

Native original read has already emitted10messages but ended with controller
SIGINT; it stays failed CLI evidence until reviewed installation passes a new
paced command. No retry of that receipt or conversion into successful acceptance.
No accepted blockers.

## Validation

8tests/two files, typecheck and full build pass. New test Biome check passes;
bin/auracall.ts is intentionally excluded by repo Biome configuration, so no
entrypoint lint pass is claimed. Narrow source hunks are manually reviewed.
Promotion requires current idle control readback, compiled parity and stable
retained/foreign custody, not killing a remaining browser to manufacture absence.
Original-command exit0 remains the native gate. Parent acceptance remains OPEN.

Accepted findings: Standards0 / Spec0; no accepted severity on either axis.
