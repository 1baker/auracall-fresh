# Provider observer shutdown diagnosis | Plan0436

State: CLOSED
Owner: ecochran76
Issue: https://github.com/ecochran76/auracall/issues/337
Branch: fix/issue337-observer-cleanup
Target: origin/main

## Current State

Scoped shutdown repair integrated through PR339 at8504325be and active in CLI/MCP
runtime `user-runtime-issue337-8504325be`. This reuses only11917b044's8-line barrier
and regressions; the larger draft/conflicted PR335 remains unchanged. All97affected
tests, typecheck, scoped lint, build and the installed native reproducer pass.
The installed runtime contract passes and all597dist files match merged source.
Full app inventory remains unaccepted: the single staged command timed out at75s
with empty stdout/stderr. Issue337 stays open; this source-delivery packet is closed.
No cooldown/owner reset, scheduler/service restart, managed-browser restart or
unknown submission retry was performed.

## Scope, acceptance criteria and definition of done

Diagnose the exact error, establish a deterministic seconds-scale native loop,
minimize its required inputs, compare the existing repair and preserve failed
shutdown outcomes. This diagnosis packet is complete; it does not close issue337.
Serial primary-agent work; no delegation. No provider prompts, owner/warning
resets, account mutations or managed-browser restarts.

## Evidence and Matt workflow

1. Feedback loop: isolated Chromium, empty temporary browser state, local desktop
   admission gate and real Fetch/Network protocol. Provider host resolution is
   explicitly blocked and proxy use disabled. One actual paused request is
   buffered until after successful Fetch.disable, then delivered to the owned
   observer. No protocol error is mocked or injected.
2. Minimized seam: `attachOwnedChatgptBackendRequestAdmission().dispose()`.
   Removing the caller's mutation-audit wrapper preserves the exact error.
   An ordinary single attach/close and an already-disabled-domain control pass;
   only delayed event delivery during shutdown reproduces this path. Repeated
   runs fail with native `Fetch.failRequest: Fetch domain is not enabled`.
3. Ranked hypotheses were shown before differential verification: callback
   outlives own shutdown; competing client disables Fetch; request was dispatched
   before shutdown. The one-client, pre-admission reproducer demonstrates the
   first path without needing a competing client or explicit continuation.
4. Source differential changes only the checkout used by the same native loop:
   main2801e0131 exits1 in3.73s; PR335 e3ade5d3b exits0 in3.46s. This reproduces a
   concrete mechanism for the historical symptom; historical live event ordering
   was not captured and is not independently attributed by this experiment.
5. Existing PR335 repair: once interception shutdown begins, queued callbacks
   join its outcome rather than enqueueing a later Fetch command. Its existing
   `late paused event during owned Fetch shutdown` regression passes2/2, covering
   successful and failed disable. Failure is propagated, not generically hidden.
6. Temporary source-tree prototypes removed. A portable diagnostic loop and raw
   local evidence remain in the user-scoped issue337 acceptance directory,
   outside Git. Fresh OS census found zero remaining disposable browser roots.

## Reproduction

The retained debug fixture `native-loop.mts` accepts explicit
`AURACALL_SOURCE_ROOT` and `AURACALL_OBSERVER_CHROME_PATH`. It creates its own empty
browser directory and closes only its own spawned browser. Default mode buffers
one native paused event across domain shutdown; `control` performs ordinary
attach/dispose. Its source-root argument selects either immutable source ref.
Exact browser executable identity and portable-results.json remain private.

On the existing repair checkout:

```sh
pnpm vitest run tests/browser/backendRequestAdmission.test.ts \
  -t 'late paused event during owned Fetch shutdown'
```

Observed:2 PASS,89 skipped. A fresh full installed CLI probe still failed observer
cleanup; one bounded error-method capture timed out at60s. Neither is reported as
full inventory acceptance. No more account probes were attempted.

## Non-goals and remaining boundary

No duplicate implementation of PR335, broad cleanup, warning suppression or
unrequested integration of that larger lane. Repository collaborative policy0032
requires owner sequencing for overlapping work. The diagnosis initially requested operator sequencing. The later approval is
recorded below; it authorizes the isolated existing repair, not unrelated failed
acceptance work from the larger PR335 lane.

## Approved repair continuation

User: "ok go" after the diagnosis and sequencing recommendation. Critical path:
reuse the exact existing shutdown barrier; validate scoped regressions and native
loop; self-review PR339 against main2801e0131; integrate only this repair; stage
and verify the package; check local provider guards before one inventory read.
Preserve active warnings and stop rather than bypass a blocked provider boundary.
PR335 retains its unrelated open acceptance gates and branch custody.

## Scoped repair validation

- Tests copied from11917b044 before the source repair: RED with native-style
  Fetch-domain error through actual observer/guard/authority cleanup.
- Reused the exact8-line source barrier, adapted only to main context. No other
  PR335 feature/dependency was taken. Affected4suites:97/97PASS.
- The same real-Chromium portable reproducer: scoped source exit0 in3.90s.
- Scoped Biome lint and diff whitespace checks: PASS.
- Serial Standards/Spec review baseline: main2801e0131, issue337 and this bounded
  scope. Shutdown failures still reject and after-send uncertainty is preserved.

## Integrated and installed readback | 2026-10-19

- PR339 merge:8504325bed1ee207519ad46f3c17d06af41d4834. Only one existing
  compiled JavaScript file changed from the previous runtime; none were missing.
- Exact merged-source package staged separately and verified:597matching files,
  installed runtime `/desktops` contract PASS, real native shutdown loop exit0.
- CLI/MCP wrappers promoted atomically, with previous wrappers and runtime retained.
  Active version readback0.1.1 is informational; source/file parity is the proof.
- Selected AuraCall runtime profile and browser profile bothwsl-chrome-3;
  targetChatGPT. Local cooldown was inactive immediately before the one read.
- Staged `apps --target chatgpt list --json`: timeout75s, exit124, empty output.
  This does not prove successful inventory or attribute the timeout to one stage.
  Existing issue325 tracks the missing bounded/structured failure surface.
- Post-attempt native process, ready assignment and current window checks PASS;
  native browser generation retained. Cooldown file hash unchanged; no probe retry.
  Fresh OS census:zero remaining disposable browser roots.
- Private installed identities, checksums, raw command output and summaries stay
  in the user-scoped issue337 acceptance directory outside Git. Temporary error
  capture removed. Full inventory acceptance remains a separate open gate.
