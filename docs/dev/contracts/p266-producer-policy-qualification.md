# P266 original producer: selected transitive policy v1

This policy qualifies only the isolated disposable producer in Browser binary
`ac1782b6684af44517b1ffea03f980b5852f48fbf0d32615582328732bd07d9b`.
Its complete build inputs are `ff332c7e8d06afef8d77ba52a24a66c1dc7daa3b2a8e77c86545c65d3a2128bf`,
with archived workspace bytes `0c159d16db0abd6816648eeb8ce1041a42e975f203eb36928414287c8284448f`.
The source operation table is compiled in `nativeProducerPolicy.ts`; the eighteen
selected source files are hash-bound by `nativeProducerPolicySources.ts`.
The build receipt binds the remainder of the code and locked dependencies to
the exact executable. This is not a policy for a different caller or worker.

## Units and qualification

The policy is an upper-bound projection onto the approved 80 browser reads and
6 controls. It does not assert that raw native counters cover all transitive
work. One browser read means one requested page observation or one bounded
post-navigation lifecycle observation; one control means acquisition of the
original cached target or one navigation. A local-state observation means one
named bounded compound observation invocation, not each syscall, SQLite row,
poll iteration, event, log line, byte or authorization assertion within it.
Its internal work is covered and retained as a whole, not individually refunded.
This local unit is separate from both the native three-snapshot summary and
the two charged private witness reads.

The existing human source classification is bound by Chief decision
`2981fa40d1cd8c9789576879f4d18748dbbec12aa406461066be5ccc0490fae0`.
Exactly five fresh/pre-navigation CDP sites are producer lifecycle administration:
`Target.setDiscoverTargets`, `Target.getTargets`, `Target.attachToTarget`,
`Page.enable`, and `Browser.setDownloadBehavior`.
They receive no shared page/UI control charge. The target-list result is still
one local observation. The download command sets a new own directory only; it
does not authorize any download or file transfer. No other CDP call inherits
this classification. Navigation and its page observations use the shared caps.

Conservatively charge one page read for the conditional same-session
`Page.loadEventFired` wait after navigation, even when no loader ID makes that
wait necessary. Charge the explicit `Target.getTargetInfo` URL observation
separately. Native budget v1 still reports its unchanged one explicit URL read;
the policy projection reserves two, without relabeling the native trace.

## Nine phases and complete effect groups

| Phase | Source operations covered | Shared reads | Controls | Local observations |
| --- | --- | ---: | ---: | ---: |
| freshness | Original protocol/owner/deadline/journal boundary; readonly SQLite, legacy-file, recovery/launch/retirement/archive freshness | 0 | 0 | 1 |
| initialize | Repeat freshness immediately before construction; load empty state/catalog/retention; start fresh-only runtime thread | 0 | 0 | 2 |
| open | Fresh state; create-only disposable allocation; both resource waits; one child/readiness; one original transport; five administrative CDP sites; conditional blank-target event; cache exact child/manager; commit new session | 0 | 0 | 10 |
| open_state | Read authoritative SQLite original browser/session identity | 0 | 0 | 1 |
| acquire_initial_tab | Require same cached child; select cached blank target, persist selection; no target creation/activation | 0 | 1 | 1 |
| target_state | Read authoritative SQLite original target identity | 0 | 0 | 1 |
| navigate | Check cached identity; one Page.navigate; conditional same-session load observation; commit own navigation history | 1 | 1 | 2 |
| url | Check cached identity; one exact-target Target.getTargetInfo URL observation | 1 | 0 | 1 |
| final_state | Read authoritative SQLite final identity | 0 | 0 | 1 |
| **Reserved total** | **One producer lifecycle, zero consumer acquisitions, zero drafts or Sends** | **2** | **2** | **20** |

The open row's ten local observations are: empty state, new allocation checks,
preflight resource wait, launch resource wait, child readiness, original transport
connection, blank-target list, conditional blank-target event, retained child
identity, and committed new-session state. Both resource waits are bounded by
the source-configured maximum 60 seconds each (default 5 seconds), with 250 ms
polling. Their memory/process/disk checks are local resource admission, not
page access. The separate capacity query/assertion does not become a witness
read, free page allowance or another producer acquisition.

Child readiness is one bounded local compound observation: one child spawn;
up to 30 seconds of child/owned DevToolsActivePort/stderr endpoint observations,
50 ms waits and conditional 500 ms local TCP reachability checks. The command
has one launch attempt. Existing-profile lock cleanup, keyring unlock, common
port discovery and alternate launch attempts are not eligible in this branch.
No per-poll completion evidence is available, so the entire observation remains
reserved when the enclosing Open outcome is unknown.

The transport is one connection to the endpoint of that new child. Its passive
reader, WebSocket ping/pong keepalive, stderr drain and event demultiplexing are
transport/lifecycle bookkeeping, not requested page observations. They cannot
issue another CDP page command. The conditional original-blank event wait is
at most 15 seconds and restricted to `page/about:blank`; it does not repeat
getTargets, create a tab or fall back to a requested URL. The post-navigation
load wait uses the exact session and a 25 second timeout. No network-idle or
evaluation instrumentation is enabled by this fresh path.

## Source closure and ineligible paths

`producer_open_engine` brackets every phase with original owner/deadline checks,
journal-start publication, a second before-effect check, and terminal journal
publication/AFTER checks. The store's private metadata/hashchain/lock/fsync and
the process-identity checks are covered integrity bookkeeping; they are not
model controls, browser observations or alternate authority. Their failures
hold the operation. The maximum original operation deadline remains 300 seconds.

`browser_session_producer_open` requires a genuinely empty, readable current
realm, repeats freshness before loading the fresh host, validates each durable
identity and the exact cached target, and uses the fresh-only runtime.
`browser_session_host`, its SQLite store and local remote-view forwarding,
`browser_session_runtime`, the service-model manager/catalog/profile allocation,
`browser_launch_admission`, `browser_producer`, `browser`, Chrome launch,
process identity/runtime profile checks and the CDP client comprise the named
transitive effect groups above. The eighteen source pins bind these groups;
the exact built executable/full-input digest prevents substitution elsewhere.

Fresh runtime configuration requires explicit executable/display, headed mode,
empty own profile and no custom arguments, extensions, proxy, imported storage,
runtime profile or keychain. An existing session/tab/browser, profile recovery,
launch-custody/retirement continuation, old-host attachment, remote-view profile,
ordinary eager instrumentation, new-tab fallback, script evaluation and named
Service-profile substitution are outside this policy. Their source branches
are unreachable under these checks, not authorized at zero cost. A changed
branch, executable, dependency closure, missing source/evidence, partial trace
or unknown outcome refuses qualification/continuation; no guessed projection.

## Existing actor and operator consumption

Call `qualifyP266ProducerPolicy` only from selected compiled operator code with
the frozen browser-source root and this exact document. It verifies regular,
non-writable-by-group/other, non-symlink source/evidence files and stable hashes.
It returns an immutable plan, Aura `ProducerPolicySelection`, exact flattened
operation table, expected browser executable digest and `policyScopeDigest`.
Paths are part of the plan digest: freeze the intended paths before selection.
No runtime JSON mode, policy override, empty history or READY flag is added.

The existing Python operator selects the same source and constructs its existing
`CompiledPolicy` with `source`, `plan_digest`, `mapping_source`,
`qualification_evidence`, `operation_table` and `policy_scope_digest`.
For each returned `[step, operation]`, its table entry is
`(step, v4_records.canonical(operation))`. Select the reviewed compiled module,
source catalog and qualification evidence as one artifact; do not trust an
arbitrary serialized descriptor or instantiate policy from client input.

The real `HeldController`/scope/native owner must still match the exact selected
binary, realm, owner, original identity, current authority, full carried history,
relevant writers and deadline. Under that same participant, write the actual
plan record into the admitted selection directory, reserve the whole producer
plan before the first producer journal/effect, then validate the full immutable
R4 trace and actual NativeLink on the same actor/factory/peer. No prospective
native IDs or receipt aliases are needed or permitted by this policy.
Unknown Open retains the whole plan and never retries or releases capacity.

LOCAL2 is committed once by the existing local actor before the witness; the
carrier ACK verifies that same record read-only. These two reads are additional
to the producer's two projected reads within the same 80, never recharged here.
Subsequent consumer acquisition, Pro control/independent readback, exact finite
draft/Send and full-reply collector retain their existing reservations and caps.
The old two consumed Sends/UNKNOWN history and old5354 remain preserved.

This source selection creates no private plan record, controller, key, grant,
browser, SDK connection or model request. Runtime admission and the automatic
Pro/full-reply acceptance remain separate and unverified.
