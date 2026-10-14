# Plan 0415 — browser-generated provider request accounting

State: OPEN
Parent: Plan0411 / issue165
Branch: fix/issue165-provider-request-accounting
Target: main
Base: 5ad7a5fd8706e8ff52d89e5701e93224e14b1f35

## Current State

Provider-free investigation resumed after installed PR318. No native journey,
warning clearance, browser attachment, API restart or scheduler mutation occurs
in this packet. Primary serial execution; no delegation.

Offline replay of the private discovery5 observer:460 responses,142 backend
responses,72 backend responses in an inclusive rolling minute, two native429s.
The observer subscribed once per owned target; one attachment was recorded.
Responses lack request IDs and triggering-operation IDs. These are observed
response counts, not proved distinct requests or fan-out from one navigation.
The earlier category-only estimate140 omitted the two conversation-metadata
responses; pathname-qualified142 is the corrected total.

Reproduce without contacting any provider:
`pnpm tsx scripts/replay-provider-response-accounting.ts ~/.auracall/diagnostics/plan0411/discovery5-20261014-observer.json`.
Only aggregate counts/qualification are printed. Raw IDs, URLs, bodies, account
identity and private content are not copied to Git.

Validation: offline replay succeeded with the counts above; typecheck, scoped
Biome and diff checks pass. No product behavior or installed runtime changed.
Progress classification: blocker_reduction (verified missing admission mechanism
and explicit unresolved unit decision). Serial source assessment preserves the
response/request/operation distinction; no production regression is claimed.

## Qualified finding and missing seam

`providerTrafficGovernor.begin` reserves one browser-operation permit before the
physical action. The ledger-backed governor aggregates those permits by provider
and configured account. Provider-side Network response listeners in the ChatGPT
adapter acquire payloads; they do not reserve account-wide request permits.
`probeChatgptRateLimitWarning` reads visible warnings and selected conversation
ResourceTiming429s, not general backend volume. No Fetch.requestPaused interception
or Network.requestWillBeSent admission boundary exists in the inspected browser
code. Passive ledger observations are explicitly excluded from admission usage.

Therefore the installed shared-operation budget is not a backend-request budget.
A response listener alone cannot prevent the request whose response it observes.
An invented response-emitter test would not exercise a production admission seam;
do not treat such a test as a native request-enforcement regression.

## Scope and acceptance

First settle units and ceiling: preserve the existing6browser-operations/minute
setting with a separate backend-request ceiling, or deliberately change its units.
User clarification requested; do not silently reinterpret that setting. This is a
material operator behavior decision, not permission for another provider probe.

Then establish a production boundary that accounts for owned backend requests
across concurrent callers, attributes target/account/request IDs without bodies,
deduplicates repeated events, persists observed429s immediately, and blocks later
admissions without weakening guards. Test the real boundary with synthetic CDP
transport and separate processes sharing isolated stores. Do not intercept or
alter foreign/human browser traffic, static assets or unrelated providers.

Non-goals: provider retry, account-key migration, browser-wide interception without
custody, fabricated changed-B assets, or widening the parent acceptance scope.
Done: meaningful red/green regression, serial Standards/Spec review, appropriate
affected validation, truthful integration/installed readback when changed behavior
is approved. Native acceptance and retry clearance remain separate.
