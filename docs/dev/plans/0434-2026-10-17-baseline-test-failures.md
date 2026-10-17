# Plan 0434 — repair provider-free baseline failures

State: OPEN
Lane: issue331
Branch: fix/baseline-test-failures
Target: main
Base: 822369207c4f7a0c4dd78ec5f37ac2d7221f318e
Work item: https://github.com/ecochran76/auracall/issues/331
Owner: ecochran76

## Scope and acceptance

Diagnose the five failures retained by issue316. Preserve browser navigation control, exact developer-app mention/effect checks, Work preparation without Send, shared write budgets, and truthful HTTP drain status. Repair behavior or obsolete fixtures only after a red-capable reproducer. No provider calls, installation, browser/account changes, or unrelated refactoring.

Run focused red/green loops, affected suites, typecheck/lint and one comprehensive provider-free run. Retain first failures and flaky passes. Standards and Spec self-review precede PR integration. Critical path is serialized; no delegation or parallel implementation.

## Current State

Fresh main worktree and issue331 established. Three fast failures reproduce (3 failed,9 passed,1.75s). HTTP drain case passes alone; shared budget passes in selected run. Five-file baseline still running. No source fixes yet. Next: minimize, rank falsifiable hypotheses, then repair one case at a time.

## Hypotheses and bounds

1. Work fixture advances URL on reads instead of navigation; stable fake location should reveal the expected navigation and preserve target reuse.
2. Mention source guard assumes an immediately adjacent if; current library verification and selected mention resolution legitimately precede the assertion. A bounded beforeSend-region assertion should protect the same invariant.
3. Desktop Wake directly invokes Page.navigate; routing it through the common control point should satisfy the guard and existing Wake behavior tests.
4. HTTP and budget timing assertions depend on elapsed real time; explicit drain gates and budget-clock evidence should isolate readiness from scheduler timing. First establish red-capable cases.

At most one broad review and one bounded remediation; reopen scope explicitly if actual runtime semantics require broader design.

## Diagnosis checkpoint

Fresh selected baseline:248 passed,3 failed; HTTP and budget passed this time. Fast red loop reproduces three failures in1.75s. Stable Work location fixture and beforeSend-scoped mention guard pass. Wake migration passes8 checks including conversation preservation.

HTTP delayed-consumer probe reproduces idle-vs-running. Replace sleep sampling with a drain gate and explicit start/completion observations. Clock-controlled budget probe reproduces25ms-vs30ms; old three-call case never exceeded the prior-weight threshold. Four service instances now prove the action executes at window expiry156ms rather than131ms.

Wake migration must preserve protocol-error rejection and allow provider canonicalization/login redirects. Shared navigateAndSettle previously ignored resolved errorText. A new UI-helper test goes red on that response; reject it before readiness/fallback. Wake uses acknowledgement-only bounded navigation, preserving its existing login behavior. This is necessary to retain existing Wake failure semantics, not a new browser feature. Existing common control-point tests protect admission and mutation accounting.

## Focused acceptance

96 affected tests pass across six files; the HTTP drain case passes separately. Budget sensitivity: bypassing the actual production budget wait makes the new assertion fail131ms vs156ms; source bytes restored. One affected intermediate run failed on undefined mock acknowledgements; optional result handling repairs that compatibility case. Typecheck and changed-file lint pass (existing warnings remain). Next: comprehensive provider-free validation and fixed-base Standards/Spec self-review against822369207 and issue331.
