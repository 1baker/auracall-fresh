# Plan 0421 — backend budget stop and project cursor yield

State: OPEN
Parent: Plan0420 / Plan0415 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: 0790b13bba3d83e114638cfde1404a51bd78c3d1

## Current State

Provider-free continuation. After a backend budget denial, the governor previously
admitted another browser navigation. Public governor regression goes red on that
admission. A local terminal latch now stops later browser actions and backend sends;
warning detection remains active. Uncertain dispatch takes precedence over budget
exhaustion, including requests already in flight when another reaches the ceiling.

Privacy-bounded admission snapshots distinguish ready, budget-exhausted, uncertain
and guarded request flow. These describe collection control state, not completed
HTTP responses or independently classified physical effects. Phase wrappers retain
the state without mixing request units into browser-operation budgets.

Project collector regression goes red because known exhaustion throws on its next
navigation instead of yielding a serialized cursor. Separate fixture modes also
require uncertainty and warnings to hard-stop even when the navigation budget is
already exhausted. Do not relabel either as an ordinary resumable budget yield.
Source composition now passes five project modes: physical budget, backend budget,
uncertainty, already observed warning, and a warning delivered during the external
yield predicate. The last case initially returned normal evidence from a stale
snapshot; reading the snapshot after that awaited predicate makes it hard-stop.
Both budget cases retain and reload the cursor; neither warning nor uncertainty
is relabeled as an ordinary yield. Final focused100tests/6files, typecheck and full
build pass. Scoped Biome reports only3pre-existing CDP fixture naming warnings;
diff checks pass. Serial Standards/Spec review against0790b13bb uses AGENTS,
architecture/testing/validation policies and Plan0421 under the parent contract.
The stale snapshot during the awaited yield predicate was an accepted blocking
finding and is repaired with its red/green case. No remaining blocker for this
source checkpoint; integration and the explicitly excluded native gates remain.

Goal meter at the stop checkpoint:1,648,195tokens /6,645seconds. Stop new work and
finish the restart-safe checkpoint before2million tokens; no goal renewal here.

## Acceptance and bounds

The existing full metadata collector seam must stop before another project read,
retain nextProjectIndex1 after complete project1, serialize/reload that cursor, and
read only project2 on a fresh bounded pass. Its physical-navigation case remains
covered alongside the new backend case. A warning or uncertain request must reject
collection before that next project read. Governor tests prove no later browser
admission or audit and continued warning persistence; the owned Fetch fixture must
still demonstrate shared pre-send limits and fenced unknown custody.

Commands:
`pnpm vitest run tests/browser-service/providerTrafficGovernor.test.ts -t 'backend budget exhaustion'`
`pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts -t 'project discovery preserves'`

No production request ceiling, runtime install, provider probe, scheduler change,
warning clearance or new resource window. This packet does not qualify interrupted
mid-project results, detail/artifact cursor handling, bootstrap, retained targets,
mixed-version callers or full Plan0386 materialization acceptance. Preserve the
original goal and early checkpoint limits. Serial primary TDD and bounded separate
Standards/Spec review; no delegation.
