# Plan 0413 — context command terminal exit

State: OPEN
Parent: Plan0411 / Plan0412 / issue165
Branch: fix/issue165-context-terminal-exit
Target: main
Base: 58d9615f754ca0c46cc207f6a56e526f8130c060
Integration: reviewed short-lived branch

## Current State

PR313 is integrated and installed with581compiled-file parity. One installed
original context read emits all10messages within its60second read deadline, but
the CLI remains alive afterward. The controller stops it at90seconds with SIGINT.
Extraction is proved; complete CLI acceptance remains OPEN. A native handle's
specific identity/cause is not attributed. Private raw context stays outside Git.

Primary owns serial diagnosis under the user's renewed2million-token/6hour
window, starting epoch1791974597. Checkpoint before1791996197, with advance
checkpoint1791995297/1.9million tokens. Historical counters remain. This packet
does not resume unrelated completions/scheduler jobs or send provider prompts.

## Feedback loop and repair

Loop: `pnpm vitest run tests/cli/conversationContextTerminalExit.test.ts`.
The registered context-command callback is parsed from the actual entrypoint and
executed in a subprocess. External SDK/config are replaced by a settled synthetic
context and a retained noncritical timer. One-byte output still produces
ETIMEDOUT at1500ms: neither provider work nor large output is required to fail.
Adding the existing flushed terminal boundary after the service returns makes
the same callback exit0. The private native handle remains unattributed.

Use the existing app-command flush/exit implementation under the shared internal
name exitAfterCompletedBrowserUtilityCommand. App commands still release their
operation custody before calling it. Context service completion already includes
utility settlement; errors before completion retain the normal nonzero path.
Flush stdout/stderr before exit with the existing process status. No browser
target/process is closed by this helper.

## Acceptance and non-goals

- Actual registered callback must exit0 with full one-byte and200KB context
  payloads; provider failure must emit no success JSON and remain nonzero.
- Existing app-command terminal and model-policy tests remain green.
- Run typecheck, scoped lint and build, then serial Standards/Spec review.
- Integrate and promote with compiled parity and stable foreign/idle custody.
- One paced installed read must return all10messages and exit0 at the unchanged
  60second read bound, with zero prompts/retries and preserved unrelated pauses.
- Recheck scoped registry and OS resources; normal bounded retirement owns idle
  resources, never synthetic close attribution.

Non-goals: selector changes, provider history changes, broader one-shot command
refactors, discovery budget changes or a claim of full Plan0411 acceptance.

## Next action

Finish source validation/review, integrate/promote, then the single installed
verification. Independent project-budget-yield and changed/quiet/guard/scheduler
acceptance remain separate parent work.
