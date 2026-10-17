# Issue165 canonical acceptance — 2026-10-17

Issue165's empty artifact discovery, shared qualification and measured scrape
acceptance are satisfied on canonical installed source. Source PR323 merged as
23969f4692f3b504748cfe9d07a383240eb5c5a2. The complete production build was installed
side by side; all595compiled files match, with zero missing or mismatched files.
The installed desktop-client contract passes. Installed CLI/MCP launchers and the
main API now select this runtime; old runtime and wrapper bytes remain for rollback.

| Canonical automatic case | Full elapsed | Backend requests | Frozen agentic | Result |
| --- | ---: | ---: | --- | --- |
| Original existing-state conversation |43332ms|67|48532ms /72|Both1.3limits pass|
| Fresh two-valid-artifact proposal conversation |58636ms|69|49510ms /68|Both1.3limits pass|

Original case: all6trimmed texts match, saved A independently verifies13889bytes
and its baseline checksum, and B has explicit typed nonretryable unavailable
evidence. Child duplicate1/skipped1 preserves both outcomes; no new retry/transfer.
Fresh case: private archive/history stores initially empty, force=false, normal
HTTP automatic parent/real child, production callbacks and cleanup retained.
Child succeeds with2newfiles and zero duplicates/failures. All4trimmed texts and
both baseline checksums match. Files6172bytes(text/markdown) and21186bytes
(application/json) agree with manifest/archive filename, path, size, MIME and
checksum, with asset links. The positive-transfer gate uses this frozen two-valid-
file proposal case; the original pair separately verifies its unavailable result.
No prompts, OAuth reconnect, cookie reset or provider warning was observed.

Capture qualification is explicit. Owned blank-target Network starts before
provider navigation and persists across parent/child custody transfer. The raw
controller flags coverage false on a disconnect before its next terminal poll.
The repeat's only disconnect follows all provider/materialization wrapper calls,
occurs during normal managed-browser shutdown, and the exact process is absent.
There is no stream interruption during provider work. Separate readback qualifies
target-lifetime coverage; raw flags/events are preserved unchanged. The earlier
faster48727ms fresh run with a custody flag remains unaccepted. Requests are counted
on the owned page, including background requests; no browser-wide/worker claim.

Both parents settle exactly one pass and pause; exact task leases and controllers
are retired and browser exit verified. Main API executable points to the canonical
installation; scheduler and17existing subscriptions remain paused,0queued/running
and0warnings after activation and final readback. This is not scheduler resumption.

Validation:743affected tests/26files, production build, full lint/typecheck. Existing
239lint warnings/17infos and33inherited planning findings remain visible; the user
parked governance work, and those unchanged findings are not represented as green.
Serial primary Standards/Spec review found the ordinal fixture issue, now fixed
and verified; canonical installation and fresh transfer close the previously
unproven functional gates. The original performance tolerance exception remains
historical; both final cases now pass strict1.3limits.

Public measured ledger:docs/dev/issue165-scrape-benchmark-2026-10-16.json.
Private evidence under~/.auracall/diagnostics/plan0411:
canonical-install-parity-20261017.json; canonical-installed-contract-20261017.log;
canonical-fresh-acceptance-20261017.json; canonical-existing-acceptance-20261017.json;
canonical-activation-20261017/activation.json; final API readback. Final runner and
helper snapshots include SHA256 and restore paths in
canonical-harness-snapshots-20261017/manifest.json. Raw first/repeat receipts and
all earlier failures remain. No private filenames, identities or URLs are published.

Plan0386's scoped materialization objective closes with this acceptance. Broader
Plan0411 changed-frontier/cadence/scheduler-continuation work remains open in P92;
closing this bug does not claim that wider program. Memory disposition forbidden:
no explicit user memory-update authorization.
