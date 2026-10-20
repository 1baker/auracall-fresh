# Plan0439 — Repair settings-enabled inventory cleanup

State: CLOSED
Owner: ecochran76
Issue: https://github.com/ecochran76/auracall/issues/337
Branch: fix/issue337-settings-cleanup
Target: origin/main

## Current State

PR349 / 510bbc1225952d069cf867fea8bddd81d8aa8203 is merged and accepted.
Settings-enabled installed public-adapter read passes in 504.89 seconds; ordinary
installed CLI list passes in 279.03 seconds. Both return observed, 26 identical
app identities, inventoryComplete=true and unknown Developer mode, with clean
cleanup and settlement. CLI/MCP wrappers activate the tested build, version 0.1.1.
Native process, assignment and window proof pass; the guard is unchanged. No
PR335 code was imported. Baseline audit/lint debt remains separate.

## Scope and acceptance

Capture and minimize the settings-enabled cleanup failure; rank falsifiable
hypotheses before testing; demonstrate regression red/green at the real seam.
Validate and integrate a bounded repair, stage exact merged source and verify
settings-enabled cleanup plus ordinary list. Unknown mode is allowed when the
settings control is absent; fabricated enabled mode is not. Preserve cancellation,
request limits, ownership, warnings and historical uncertainty.

## Non-goals

No app create/replace/uninstall, prompt, cookie export, profile rebuild, warning
or ownership reset, browser restart, scheduler/service control, or wholesale PR335
integration. Broader PR335 work remains separate; reconcile a qualified overlap.

## Execution and definition of done

Serial primary-agent diagnosis and implementation. Existing full-read feedback
is minutes long; capture the exact nested cause once, then build a provider-free
fast reproducer before source repair. Keep private diagnostics under the
user-scoped issue337 settings acceptance directory. Source fixes must retain a
meaningful regression, relevant tests, typecheck/build and scoped review. Close
only after installed settings-enabled success, ordinary list regression proof,
current native proof, accurate docs and truthful tracker/readback. No memory
write without an explicit user remember request.

## Diagnosis, implementation and controls

Ranked predictions: missing heartbeat during active work; independent claim-revision
change; incorrect maintenance expiry. The public test and controls isolate elapsed
heartbeat plus maintenance, without any SDK/browser. Existing reconciliation tests
require a live but unresponsive owner to expire, so that rule remains unchanged.

The registry now offers heartbeat renewal in both storage adapters. It advances
claim revision for maintenance CAS, preserves meaningful-use time and absolute
expiry, and rejects lost/expired ownership. A private utility controller renews
every 30 seconds, serializes observations with returned claims, carries an abort
signal on failure and drains renewal before settlement. Failure cannot be hidden
by a callback returning success or final meaningful-use renewal.

The concurrent storage acknowledgement case goes red when the serial queue is
removed; the exact mutation diff/hash and pristine restoration are retained
privately. Review also accepted expiry revival as blocking: new registry controls
went red on late renewal; after that repair the utility settlement control went
red when it revived the deadline. Both now pass after refusing expired renewal
and skipping meaningful-use refresh on heartbeat failure. This is one bounded
remediation of the same expiry invariant. No other cleanup error is suppressed.

Final source validation: 274 tests across 15 affected suites pass in 49.90
seconds; typecheck, build, scoped Biome and diff checks pass. Explicit package
lint matches the same three baseline diagnostics. Closed-world primary review
against 333f03e99 and this plan separately verifies Standards (no remaining
blocking findings) and Spec (expiry-revival blocker repaired and regression
passes; installed acceptance recorded below). No delegation or PR335 import.

## Installed settings acceptance

Merged PR349 / 510bbc1225952d069cf867fea8bddd81d8aa8203 is staged with 597
matching dist files and a passing installed `/desktops` contract. A settings-enabled
read through the real public adapter and CLI runner dependency seam exits 0 in
504.89 seconds: observed, inventoryComplete=true, 26 apps and unknown Developer mode
because its control is absent. There are no prototype overrides or diagnostic
imports. Real request admission, browser ownership, cleanup and settlement run.
Registry observations after 330 and 430 seconds show active ownership with fresh
heartbeats and unchanged meaningful-use time. Current native process, assignment
and window proof pass; rate-limit guard is unchanged. Ordinary CLI list exits 0 in 279.03 seconds with the same
account and exact
26-app identity set. Both runs have clean cleanup and utility settlement. Fresh
remote merge readback, current native proof and unchanged guard precede atomic
wrapper replacement. CLI and MCP now select the tested runtime, version 0.1.1.
Private receipts preserve both failure and acceptance
under `~/.auracall/acceptance/issue337-settings-20261019/`.

## Closeout

All acceptance criteria pass. Primary source validation: 274 tests / 15 suites,
typecheck, build, scoped lint and diff checks. Full planning audit has 33 baseline
findings, none for Plan0439; explicit package lint retains three baseline findings.
Standards and Spec closed-world review has no remaining blocking findings. Private
acceptance receipts bind commit, build parity, installed contract, both live reads,
current native process/assignment/window, guard hash and wrapper activation.
Historical failures remain preserved. The completeness flag is reported as returned
by the existing parser, without independent pagination attestation. Memory
write disposition: forbidden; no explicit user remember request. Issue337 is
resolved by the accepted settings read; broader PR335 remains separate.
