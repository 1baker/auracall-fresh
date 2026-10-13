# Issue253 developer-app CLI terminal exit

State: CLOSED
Parent: Plan0405 / Plan0406-1. Issue253 remains OPEN.

## Current State

Authorized additional submissions: 0/10 consumed. Native no-submit app preflight emitted a completed selection receipt but exited124 at120 seconds. Browser retained; active model Pro rather than planned Instant. No provider prompt. Private packet-1 artifacts preserve actual timestamps, account/app and process/visual proof. Historical close attribution remains unknown.

## Scope and feedback loop

Correct one-shot developer-app CLI terminal semantics after the actual operation returns and dispatcher custody releases. Preserve exception handling, nonzero failed status, output completeness and retained browser ownership. Native causal handle attribution is unproven.

`pnpm vitest run tests/cli/developerAppTerminalExit.test.ts` executes the actual AST-extracted apps command body in a child process with injected provider-free operation/dispatcher and a retained background handle. Initial completed and failed cases timed out at1500ms after output/release. After repair both terminate with expected0/1 status, complete200000-character output and release proof. This proves the command boundary tolerates remaining handles; it does not identify the particular live handle.

Hypotheses: remaining browser/CDP handles, stalled dispatcher release, output/one-shot exit policy. Source command lacked the completed exit policy already used by browser-file utilities. Repair explicitly flushes stdout/stderr and exits only after returned operation plus successful release. Thrown operation/release must not be converted into a successful completion.

## Acceptance and remaining work

Focused suite34tests passes. Typecheck/build pass; final review moved completion flag after successful receipt emission to preserve serialization/output errors. Primary Standards/Spec review, integration and exact installed parity precede one native no-submit recheck. Instant setup remains separate. Then dispatch packet1 against the authorized unchanged prompt, one Send and ten-minute guard. No new wakes, general memory writes or historical attribution fabrication. Stop on accepted native completion or unsafe/unknown state; no blind retries.

Installed PR301 bcc48e31f / validated29ed141e1 into user-runtime-issue253-terminal-exit;592compiledparity,CLI/MCP/API25715 argvqualified/processKillMode,/desktops200. Installer metadata lacked sourceCommit and was explicitly annotated against source/parity after verification. First readiness read was connection-refused during startup, then sameprocess ready200; no retryrestart for readiness. Native no-submit recheck authorized with distinct artifacts, pending.

Native installed no-submit recheck completed with exact account/app and full inventory, CLI exit0 in39012ms at02:09:00.039Z; receiptSHA7b5ab4f1585b60d0643b0a19c19e6f2225fc55b40b37c5c031412d78d32913f6 independentlyverified. Bounded terminal packet CLOSED; Issue253 full submission acceptance remains OPEN,0/10consumed. Modelsetup next under canonical guardedutilitylease. Memory disposition forbidden, no general memory authority.
