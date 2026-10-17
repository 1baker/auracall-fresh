# Issue316 installed acceptance

Outcome: ACCEPTED. Source PR328 and bounded settlement repair PR329 are merged.
Installed source is exact fresh canonical commit
ab89dcb6377b9883e96f3e51bc12636610c5eb0f, from merged PR329. The new runtime
prefix is user-runtime-issue316-ab89dcb6377b. Both user launchers point there;
584 packaged JavaScript files match the canonical build, including all accepted
refresh implementation hashes. Original launchers and prior prefixes remain
available in private diagnostics for rollback. Existing API service and scheduler
were not restarted by this CLI installation.

The normal installed refresh-tools command returned completed/exit0 with21 tools.
Its catalog fingerprint matches the accepted repaired source run. Account matched
the explicit configured expectation, the selected app was exact, and the operation
verified unchanged App ID, endpoint, connected accounts and permission setting.
No prompt, replacement, reconnect or consent occurred. Each command follows one
activation with no automatic mutation retry; separately bounded acceptance runs
remain in the history. Private account/app identifiers and raw provider payloads
are omitted from shared receipts.

The earlier installed7912118c4 attempt remains unconfirmed/exit1; its generic
message did not qualify native cause. Three independent synthetic cases proved a
readiness gap and went red before repair. Bounded readiness polling now passes
those cases while retaining genuine-change, foreign-link and human-approval
failures. Native source and the repaired installed acceptance both pass. A stalled
read-only reconciliation was cancelled by terminating only its diagnostic node
process; it produced no account/browser-cause proof.

Validation:108 affected checks/four files, typecheck, compilation, changed-file
lint, actual installed help, compiled-byte verification and native acceptance
pass. Parent full build/runtime contract/lint passed. The broader sweep remains
3943 passed,5 failed,65 skipped:four failures reproduced on untouched base and
one unchanged clock assertion passed on base and in feature isolation. These are
nonblocking backlog for issue316, owner ecochran76; no full-suite or hosted-CI
green is claimed. See installed-acceptance.json and the preserved parent and
settlement receipts under ../evidence/issue316/.

Issue316's in-place refresh contract is complete. Inventory diagnostics #325
and wider LitScout research acceptance remain separate scopes. Source and raw
failure/acceptance history are retained under user-scoped issue316 diagnostics.
Memory disposition:forbidden by the explicit-request-only developer boundary;
no durable memory write was requested.
