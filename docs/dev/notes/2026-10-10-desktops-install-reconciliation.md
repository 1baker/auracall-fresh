# Desktop runtime regression and integration recovery

The installed Plan0403 package at 8aa11f18a replaced the previously adopted
Plan0391 desktop-client build. `/desktops` returned HTTP404; this was application
route loss, not an ingress failure. PR244 remained draft/open, and the P86 lane
projection was stale despite newer installed and published desktop checkpoints.
The deployment failed to reconcile installed off-main capabilities with target
ancestry, open PRs and active worktree custody.

Recovery scope: integrate published desktop checkpoint 4fd905b39648a2078163bff1c24eb014ff028942
with main 8aa11f18a4bba84e9ba67c88e69f4ed3916d3588 in an isolated worktree;
preserve both desktop behavior and Plan0403 launch precedence. Code merged
without conflicts. Six documentation conflicts were independent additions;
both source histories were retained. Original worktrees and dirty acceptance
records remain preserved. No provider prompts or new wakes are authorized.

The persistent compiled-runtime guard creates an isolated temporary home and
loopback server with recovery, maintenance, drain and scheduler disabled. It
checks GET /desktops returns 200 and AuraCall Desktops HTML. The installer runs
it before replacing any prefix; staged-package parity and the same probe qualify
actual packaged adoption separately. This protects the required route, not every
feature or PR ancestry; lane reconciliation remains mandatory before deployment.

Red: `pnpm tsx scripts/verify-runtime-contract.ts ~/.auracall/user-runtime/node_modules/auracall`
returned assertion actual404 expected200. Green: the same script against the
combined compiled tree returned PASS. Public HTTP/control and launch tests retain
the existing behavioral seams rather than duplicating them.

First validation failures were dependency-resolution errors caused by borrowing
old root node_modules without ws. They are retained. Isolated frozen-lockfile
offline dependency installation corrected that environment; no source behavior
was changed to hide the failure. Focused selection:99 tests across16 files PASS.
Full build PASS; final typecheck, rendered native smoke and installed acceptance
are recorded separately as they complete. These are focused, provider-free checks,
not comprehensive or new live-chat idle-expiry acceptance.

Source review is bounded to reconciliation against both pinned parents and the
new installer guard. Standards: preserve custody/history, no owner bypass or new
controller behavior. Spec: retain desktop client/ownership/exclusion/grant renewal,
launch precedence and active-chat heartbeat. No blocking source findings identified;
installed/public acceptance remains a distinct gate.

Memory disposition: forbidden; no explicit user request to update memory.

Rendered fixture first failed at refused-control recovery: the upstream helper
changed its default access recheck from two to thirty seconds, coinciding with
the fixture timeout. The merged HTTP desktop source is byte-identical to the
desktop checkpoint. The fixture now explicitly requests a supported two-second
access cadence, preserving assertions and production defaults. First timeout and
zero remaining owned-process readback are retained. This is fixture qualification,
not a claim of authenticated public input acceptance.

Final typecheck and build passed. Adjacent selection adds103 passing tests in11
files, for202 checks across27 files total. Installer guard lint passes. Staged
package required-route probe passes and589 compiled files match byte-for-byte.
A shorter declared fixture recheck did not resolve refusal recovery, disproving
timing alone; retain both failures and inspect actual renderer state before
source qualification or promotion.

Actual refusal failure state: observation capability, unavailable presentation,
empty claims and no browser page errors. The ready-view retention shortcut skipped
passive recovery after definitive refusal. Minimal bounded remediation forces
and awaits a fresh observe grant only after claimRetained=false; uncertain claims
keep their existing exclusion. The native same-iframe grant handoff cancels the
pending mode request and restores view-only transport. Production native cadence
is unchanged; the trial fixture cadence/diagnostic edits were reverted. Original
ready-view assertion is retained rather than weakened.

Final rendered smoke PASS:26 functional checks, zero page errors and zero
remaining smoke-owned OS processes. The original refused-control ready assertion
passes after the minimal recovery change. Final bounded Standards/Spec review
finds no accepted blockers: known refusal clears only the caller's non-held claim
and refreshes observation; uncertain takeover/revoke keeps exclusion. New route
gate probes compiled behavior before prefix replacement, never provider work.
Source integration and final installed/public readbacks remain separate receipts.
