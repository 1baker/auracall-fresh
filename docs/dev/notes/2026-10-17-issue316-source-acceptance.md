# Issue316 source acceptance

Plan0433 and the issue agent brief freeze the in-place refresh contract.
Fresh source base987bc0867, isolated branch feat/issue316-refresh-tools.

The compiled CLI refreshed the existing LitScout app through its current
settings surface. It returned completed/exit0 with21 tools, schema fingerprint
in ../evidence/issue316/source-acceptance.json, and an app-qualified connection
link_id response. Exact App ID, endpoint, connected accounts and permission
setting were preserved. No prompt, replacement, reconnect or consent change.
Private account/app identifiers and raw provider payloads remain local-only.

105 affected tests across four files pass. Typecheck, compiled TypeScript,
changed-file lint, git diff --check and actual compiled CLI help/required-input
checks pass. Provider-free receipts are retained beside the JSON. Two earlier
native attempts returned unconfirmed/nonzero; their attribution gap was repaired
by binding current connection metadata before activation. Those failures remain
part of the acceptance history and are not passing evidence.

Review fixed point987bc0867; standards and spec checked separately against
Plan0433 and the issue brief. Blocking multi-app identity and foreign-link
attribution findings have observed red/green tests. An untouched-base failure
proved the pre-existing submission test expected an obsolete two-minute default;
its assertion now matches existing two-hour behavior without changing submission.

This proves source/compiled operation only. PR, canonical merge, and installed
runtime acceptance remain pending. Memory disposition: forbidden by the
explicit-request-only developer boundary; no durable memory write requested.

## Full presubmit and published review

Published source checkpoint:f23d870c839aa7b9b7e0afd4f2fe729443f869ed, PR328.
Full lint passed with239 warnings/17 infos, exactly matching untouched base.
Full build and compiled /desktops runtime contract passed.
The full provider-free run exited1:3943 passed,5 failed,65 skipped across438
files (412 passed,5 failed,21 skipped). It is not a green full-suite result.

Four failures reproduced on untouched base987bc0867: HTTP background-drain
state, desktop direct-navigation guard, Work prompt preparation expectation,
and shared lifecycle source-pattern expectation. Their test files are unchanged.
The fifth is the unchanged rolling write-budget clock assertion (27ms versus
30ms); it passed on base and passed in isolation on the feature commit. Preserve
the original failure as a timing flake, not a clean full-suite pass.

Disposition:nonblocking_backlog for issue316, owner ecochran76. These checks
cover unchanged background-drain, desktop and prompt/rate-limit surfaces; the
new refresh-tools path and its105 affected checks pass. The published diff was
self-checked separately for Standards and Spec against the frozen agent brief;
no private diagnostic scripts or provider payloads were published. There are no
reported hosted workflow runs or PR checks, despite enabled Actions, and main
has no required branch checks. Local scoped validation is the acceptance basis;
no hosted CI success is claimed. See ../evidence/issue316/presubmit.json. Raw
full-run and baseline logs remain in user-scoped private issue316 diagnostics.
