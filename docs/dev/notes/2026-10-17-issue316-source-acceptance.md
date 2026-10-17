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
