# Plan 0416 — preserve ready project routes with display-name suffixes

State: OPEN
Parent: Plan0411 / Plan0415 / issue165
Branch: fix/issue165-project-route-reuse
Target: main
Base: d9d0a8e88360147f9b4664c9e95b02791eef2272

## Current State

Provider-free repair of one verified avoidable-navigation pattern. ChatGPT's
current project URL may include a display-name suffix after its stable project ID.
The adapter asked the generic navigation helper for the canonical URL, which
differs textually from the current URL and therefore issued another Page.navigate
even when the correct project route and document were ready.

Feedback loop:
`pnpm vitest run tests/browser/chatgptContextAffinityRoute.test.ts -t project-conversations`.
The real bounded collector read, ChatgptService, utility affinity, coordinator,
registry, ledger, adapter and generic navigation helper execute against synthetic
external browser transport. Actual Page.navigate and reload calls are counted.
Correct-project suffix case returns one expected conversation with zero additional
navigation/reload/reopen; different-project case requires one navigation and no
reload. Initial harness incorrectly started on root; that precondition was fixed
before qualifying the unchanged-source red (unexpected canonical navigation).

The adapter selects the current URL only when origin, normalized project ID and
project-route shape match. The existing helper still checks route and document
readiness before avoiding a physical action. Failure to read the current location
retains the canonical route behavior. No generic URL comparison, identity check,
lease control, warning guard, physical budget or cooldown is weakened.

Focused validation:267tests across adapter, composed route and collector suites
pass; typecheck and build pass. The qualified baseline was rerun with the real
bounded collector read and fails specifically on unexpected Page.navigate; green
returns the same conversation with zero extra navigation/reload in that case.
Scoped test Biome and diff checks pass. Source-only formatting churn was removed.
Serial Standards review: no blocking source-boundary/custody finding; repeated URL
parsing is a small existing-style implementation choice, not a required refactor.
Serial Spec review: ready same-project reuse and necessary different-project visit
are both verified. Native request reduction remains unproved, as specified below.

## Acceptance and limits

Scope: the existing project-navigation helper and existing composed read test.
Definition of done: qualified red/green, affected validation, serial Standards and
Spec review, integrated source and appropriate installed readback. Primary serial
execution; no provider journey or delegated exploration. Native retry hold remains.

This proves one extra navigation avoided for a ready suffixed project route. It
does not establish that discovery5 used this pattern, quantify saved backend
requests, or label all root/project loading unnecessary. The142response capture
lacks per-request triggering-operation attribution. Separate request accounting
remains Plan0415; user approved retaining the operation cap with a separate request
ceiling, whose numeric value is still undecided.
