# Plan 0428 — request-aware utility session boundary

State: CLOSED (bounded source packet; issue165 remains OPEN)
Parent: Plan0427 / Plan0425 / Plan0411 / issue165
Base: 13b657921a57c6884be16c9546f0943dd89d1e29
Branch: fix/issue165-owned-backend-request-admission
Owner: primary, serial

## Current State

Request-aware aborted reads preserve cleanup uncertainty. A successful retained
provider session can outlive the utility that owns its request/lease authority;
utility completion currently settles the lease without closing that session.
Qualify the actual public path before changing this seam.

## Acceptance and bounds

A request-aware utility may reuse its own session inside its operation, but must
drain/close it before final lease settlement. Confirmed cleanup permits idle known
custody; failed/unconfirmed cleanup fences lease and desktop custody while
preserving operation failures. An inherited session must not borrow stale or
foreign request authority. A fresh explicit utility call must use fresh authority.
No automatic retries or overflow sends. Legacy no-hook session behavior stays
compatible. Public service/utility/adapter/guard/store fixtures; simulated SDK.

Scope: utility session boundary and existing public fixture plus supporting docs.
Vertical TDD, serial primary Standards/Spec then accepted-findings-only check;
no subagents, no new broad drift review. No activation, provider probes, install,
scheduler changes or warning clearance. Other explicit-tab/retained/background
callers and full Plan0386 native acceptance remain separate gates. Goal resource
and review controls inherited without renewal; stop at packet source checkpoint.


## Diagnosis and review

Actual public retained-clean red left Fetch handler installed and close attempts0
on utility completion. Closing the operation-scoped session before settlement
makes it green. The fresh explicit repeat reuses the target with no second
navigation, connects client2, closes both clients and records three distinct
request permits (fixture ceiling3). Rejected/timed-out close fences idle unknown
custody; mixed read/close failure preserves both leaves. Inherited caller session
rejects before browser resolution or foreign close; built options are also checked.
The existing finite settlement wait bounds arbitrary retained-session close.

Serial primary Standards/Spec review against base13b657921, no delegation, no
fresh broad drift review. Accepted blocking finding: unconditional cleanup tagging
turned pure confirmed budget denial into unknown. Retained-budget red observed
idle/unknown instead of settled; preserve the shared typed-denial classifier in
this seam. Mixed or unknown close remains typed uncertainty. Closed-world
verification is limited to these findings and new critical regressions. Legacy
no-hook path retains existing session semantics; its production helper tests run.

## Validation and remaining gates

Primary focused validation:75tests/5files passed; typecheck, scoped Biome and
diffcheck passed. No retries. Focused provider-free selection: backendRequestAdmission,
configuredChatgptUtilityAffinity, configuredChatgptUtilityAffinity.production,
configuredProviderTrafficAuthority and chatgptContextAffinityRoute. No whole-suite,
native/manual or installed proof. SDK/provider output synthetic; actual public
service/utility/adapter/guard, ledger, registry and DesktopControlGate. Temporary
hold release after unknown assertions is fixture cleanup only. Initial selection
named a nonexistent configuredChatgptUtilityReads file; no such coverage was
claimed, and final selection includes the actual production utility fixture.

Remaining: explicit-tab and other retained/background callers, compatible
participants, production ceiling and full Plan0386 native acceptance (genuine
changed-B still missing). No production caller enables the optional ceiling.
Next bounded source step: qualify configured-authority session lifetime at its
actual collector caller before enabling any hook. Progress classification: progress.
Memory disposition forbidden by session developer instruction; no write.
