# Plan0443 — Integrate dead-browser readiness classification

State: OPEN
Issue: https://github.com/ecochran76/auracall/issues/226
Branch: fix/issue226-readiness-current
Owner: primary agent, serial

## Current State

17clean merged worktrees removed;3missing registrations pruned.13worktrees remain,
including dirty/unmerged lanes and current worktree. Branch refs retained. Cleanup
receipt /tmp/auracall-worktree-cleanup-20261021.json. Retained unmerged PR262 contains
source repair935ea9280; port source/test hunks only to current main. Public owned
child-exit regression RED generic error in277ms; patched29lifecycle tests GREEN.
Remaining validation, integration and installed fixture proof pending.

## Scope and acceptance

Classify observed owned child exit before CDP readiness with typed error, PID,
exit code/signal and managed directory; unproven exit remains CDP-not-ready with
explicit recovery guidance. Preserve abort reason and existing cleanup/ownership.
No auto-restart, stale-lock deletion, manual lease recovery, live browser shutdown
or provider request. Reuse existing launcher callback. Exact original historical
browser disappearance actors remain unknown. Source/installed classification is
bounded acceptance; no claim of identifying historical cause. Validate focused
lifecycle/process/utility checks, typecheck/build, review and merged installed seam.

## Diagnosis and review contract

Ranked predictions: dropped owned-child state; unobserved exit must stay unknown;
cancellation must retain original reason. Prior source patch supplies child state
and typed error, making regression pass. Fixed base f3b2e2a12; primary serial
Standards/Spec reviews governed by AGENTS, CONTEXT and runtime-proof policy.

## Source validation

29lifecycle tests plus65process/provisioner/CLI tests pass (94total/5suites).
Typecheck passes. Lint-only check passes with2preexisting mocked-export naming
warnings; full Biome check rejects legacy formatting in touched test files, retained
as baseline formatting debt rather than widened churn. Diff check passes.
Standards review: retained existing launcher seam and cleanup, no ownership bypass.
Spec review: typed observed exit versus unproven readiness and recovery guidance
qualified; historical exit actors remain unknown. No accepted source blocker.
