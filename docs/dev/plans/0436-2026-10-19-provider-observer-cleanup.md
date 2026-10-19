# Provider observer shutdown diagnosis | Plan0436

State: CLOSED
Owner: ecochran76
Issue: https://github.com/ecochran76/auracall/issues/337
Branch: fix/issue337-observer-cleanup
Target: origin/main

## Current State

A disposable real-browser loop reproduces the exact protocol error on main
2801e0131 and passes on PR335 commit e3ade5d3b. The existing PR already has the
required shutdown barrier and portable success/failure regressions. No competing
implementation or installed-runtime change was made. PR335 remains open; source
integration and full installed inventory acceptance remain unqualified.

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
requires owner sequencing for overlapping work. The operator was asked whether
to build on PR335 or use a separately reconciled repair; that choice remains
pending. Preserve this diagnosis without treating the pending choice as approval.
