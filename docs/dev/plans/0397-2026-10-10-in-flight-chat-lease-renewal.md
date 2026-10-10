# Plan0397 | In-flight ChatGPT lease renewal

State: CLOSED
Owner: primary only. Authority: user ol go after source audit recommendation.
Base:23afb1012; branch fix/issue226-active-lease-heartbeat, isolated worktree.
CONTEXT.md domain authority; TDD at executor + reconciliation public seams.

## Current State

Executor pending-response regression RED before fix: active lease became lost
under maintenance at16m simulated time. Existing active/unknown DOM closure
protection remains independent. Source repair now renews pending lease at most
30s intervals, serialized with provider claim validation; updated claim is used
for settlement. Stops and drains renewal on original response completion, error,
cancellation, ownership loss and absolute deadline; sends cancellation signal
on renewal failure. Focused validation and review remain before integration.

## Scope and acceptance

No browser/provider calls or live installation in this source slice. Preserve
absolute deadline and independent pre-close DOM guard. Require deterministic
executor pending beyond idle expiry plus maintenance to remain active, successful
settlement with updated claim, no post-settlement/error/cancel renewals, absolute
deadline clamp and fail-closed ownership loss. Validate focused suites, typecheck,
scoped lint and build. Serial primary Standards + Spec review, no delegation.
Source qualification is separate from installed and live acceptance; original
browser exit cause remains unknown. WiderIssue226 remains open.
Memory disposition forbidden: no explicit durable memory-update request.

## Source qualification

45 focused tests passed across6 files,1.33s; executor18 tests includes both new
and existing pending conversations, outstanding-write settlement and early
cancellation. Original executor RED expected active/received lost; legacy signal
seam RED before forwarding. Typecheck, full build plus final source recompilation,
scoped lint and diff checks PASS. Serial primary Standards and Spec review PASS
against23afb1012, with blocking cancellation-forwarding issue fixed. Evidence in
docs/dev/evidence/issue226-heartbeat-20261010/.
Source packet CLOSED; integration/delivery recorded in PR. No installed/live
acceptance claimed, no provider submissions or new wakes in this packet.
