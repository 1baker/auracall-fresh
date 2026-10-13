# Issue253 developer-app CLI terminal exit

State: OPEN
Parent: Plan0405 / Plan0406-1. Issue253 remains OPEN.

## Current State

Authorized additional submissions: 0/10 consumed. Native no-submit app preflight emitted a completed selection receipt but exited124 at120 seconds. Browser retained; active model Pro rather than planned Instant. No provider prompt. Private packet-1 artifacts preserve actual timestamps, account/app and process/visual proof. Historical close attribution remains unknown.

## Scope and feedback loop

Correct one-shot developer-app CLI terminal semantics after the actual operation returns and dispatcher custody releases. Preserve exception handling, nonzero failed status, output completeness and retained browser ownership. Native causal handle attribution is unproven.

`pnpm vitest run tests/cli/developerAppTerminalExit.test.ts` executes the actual AST-extracted apps command body in a child process with injected provider-free operation/dispatcher and a retained background handle. Initial completed and failed cases timed out at1500ms after output/release. After repair both terminate with expected0/1 status, complete200000-character output and release proof. This proves the command boundary tolerates remaining handles; it does not identify the particular live handle.

Hypotheses: remaining browser/CDP handles, stalled dispatcher release, output/one-shot exit policy. Source command lacked the completed exit policy already used by browser-file utilities. Repair explicitly flushes stdout/stderr and exits only after returned operation plus successful release. Thrown operation/release must not be converted into a successful completion.

## Acceptance and remaining work

Focused suite34tests passes. Typecheck/build pass; final review moved completion flag after successful receipt emission to preserve serialization/output errors. Primary Standards/Spec review, integration and exact installed parity precede one native no-submit recheck. Instant setup remains separate. Then dispatch packet1 against the authorized unchanged prompt, one Send and ten-minute guard. No new wakes, general memory writes or historical attribution fabrication. Stop on accepted native completion or unsafe/unknown state; no blind retries.
