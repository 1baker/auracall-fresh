# Plan0439 — Repair settings-enabled inventory cleanup

State: OPEN
Owner: ecochran76
Issue: https://github.com/ecochran76/auracall/issues/337
Branch: fix/issue337-settings-cleanup
Target: origin/main

## Current State

Installed e8b704bc7 reproduced the settings failure in 378.60 seconds. Nested
causes are utility ownership changed and stale heartbeat/idle claims. A minimized
public utility plus maintenance loop reproduces the same aggregate in 18 ms;
short work and absent maintenance pass. Active utility liveness was never renewed
while waiting beyond its five-minute heartbeat. Local repair and focused controls
pass; integration and installed settings/list acceptance remain pending. The
accepted e8b704bc7 wrappers remain active; no PR335 code was imported.

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
against333f03e99 and this plan separately verifies Standards (no remaining
blocking findings) and Spec (expiry-revival blocker repaired and regression
passes; installed acceptance pending). No delegation or PR335 import.
