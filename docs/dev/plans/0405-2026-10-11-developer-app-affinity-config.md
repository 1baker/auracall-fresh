# Plan0405 | Developer-app affinity configuration (#253)

State: OPEN
Lane: P90
Integration: merge
Work items: #253
Owner: ecochran76; primary agent, serialized implementation.
Branch: fix/issue253-app-affinity-config
Target: main through PR merge
Base: 9b324b3dc7d3f8f1ec50e3888f02e71c39047e02

## Current State

Maintainer accepted the Issue253 agent brief. Actual runBrowserMode guard reproduced the exact reported missing-configuration failure before transport. The submission boundary regression failed red; the minimal forwarding repair passes 69 focused tests. PR276 integrated source at90b17d24124421fce5ff5e3eabb212a0596cff7e. Installed CLI matches590 compiled files and installed hermetic boundary passes. LitScout executed one native no-submit test; it failed at DesktopControlGate.owner on a persistently zero-byte ownership record before reaching submission. Demo10 remains unsent. Explicit bounded unknown-ownership recovery authorization is pending; no gate files changed.

## Scope and seams

Pass full selected resolved configuration from submitChatgptDeveloperApp to BrowserRunOptions affinity admission when the launch plan selects tab-affinity. Preserve fresh Chat/current posture, exact app/account checks, provider governor, desktop control and structured effect outcomes. Public seams: submitChatgptDeveloperApp and its supported runBrowser injection; the real guard reproduction is retained separately. No lease/control redesign.

## Acceptance and definition of done

- Hermetic red/green proves exact selected configuration despite a conflicting default; no browser/provider effects.
- Non-affinity lifecycle, app/account and conservative failure evidence tests pass; typecheck/build and scoped lint pass.
- Serial Standards and Spec review against frozen base and accepted issue brief.
- PR integrates exact source; installed runtime identity and feature preservation verified.
- Coordinate one bounded installed test with LitScout; record actual result and exact incomplete gates rather than treating removal of one error as full success.
- Close issue only when its configuration outcome and coordinated test are qualified; separate unrelated readiness/governor/control incidents.

## Non-goals and boundaries

No app recreation, OAuth reset, implicit prompt retry, ownership-file edits, browser restart or bypass of gates. Do not attribute unknown exits. No memory-write authorization. LitScout selects safe existing app/account and guards its drafts; provider submission waits for the coordinated bounded acceptance handoff.
