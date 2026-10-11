# Plan0404 — Demand-driven desktop pool

State: OPEN
Owner: primary AuraCall desktop lane
Spec status: approved; published as GitHub issue264.
Lane: P87
Branch: feat/issue264-desktop-pool
Target: main
Integration: merge
Work items: #264, #265, #266, #267, #268
Execution limits: checkpoint before 2,000,000 tokens or six hours from goal start.

## Current State

Named desktop placement and remembered assignments currently concentrate browsers
on Research. Profiles already appear in the rail and support Wake. Agent Browser
provides primary-source demand allocation, wrap-around and guarded empty-capacity
release patterns. Operator approved equivalent allocation plus rail Wake and
redistribution. No pool implementation or redistribution has occurred.

## Problem Statement

Sleeping profiles should remain easy to Wake without requiring a permanent
named desktop. Running browsers should spread across available capacity rather
than all opening on an arbitrary Research desktop.

## Solution

Wake allocates a healthy free desktop, growing the Remote View-owned pool on
demand within configured limits. At capacity, wrap around to the least crowded
healthy desktop. Keep one ready spare and release excess empty desktops. Closing
a browser leaves its runtime profile visible in the rail. Redistribute existing
browsers while preserving their managed state and work.

## User Stories

1. As an operator, I can see sleeping runtime profiles without desktop allocations.
2. As an operator, I can Wake a profile and see its assigned desktop immediately.
3. As an operator, independent browsers spread across free desktop capacity.
4. As an operator, I can configure the maximum rather than rebuild the application.
5. As an operator, I can Wake at capacity through healthy least-crowded wrap-around.
6. As an operator, excess empty capacity shrinks while one spare remains ready.
7. As an operator, idle open browsers survive desktop pool maintenance.
8. As an operator, existing browsers can be redistributed with routes and drafts preserved.
9. As an operator, ambiguous allocation or release results are reconciled without duplicate effects.
10. As an operator, shared browser-family aliases resolve to the same exact running browser.

## Implementation Decisions

Remote View owns physical desktop allocation, policy bounds and retirement.
AuraCall owns demand, browser placement and rail presentation. The requested
installed maximum is ten, read from configuration/pool policy. Research is not
a special destination. Remembered automatic placement is historical/runtime
custody, not a permanent pin. Explicit pin compatibility must be characterized
against current configuration before migration; no silent root fallback.

Reuse current native consumer and guarded process/control ownership. Acquire
and reconcile exact assignment generations before launching. Serialize concurrent
Wake and maintenance. Failed observations do not qualify free/empty capacity.
Keep healthy existing browser identity until deliberate redistribution. Preserve
routes, drafts and managed browser data before any required exact browser close.
Do not close active or unknown chat activity; defer that browser's redistribution
and report its exact gate. No provider prompt is needed for acceptance.

## Testing Decisions

Proposed primary seam: operator-facing Wake/Close/inventory with injected native
Remote View transport. Assert externally visible assignment, rail state and
allocation/release effects. Extend existing rendered rail acceptance for sleeping
profiles, assigned selection and stable viewer identity. Exercise concurrent
Wake, configurable limits, wrap-around, unknown inventory, release races and
restart reconciliation. Installed acceptance uses fresh process/generation,
window/display joins and route/draft preservation receipts.

## Published Tickets

1. #265 Automatic rail Wake allocation and demand growth. Blocked by: none.
   Demonstrate sleeping profile -> free/new configured desktop -> ready rail row;
   reconcile concurrent/ambiguous acquisition and preserve browser identity.
2. #266 Configured capacity and wrap-around. Blocked by: 1.
   Demonstrate different configured maxima and healthy least-crowded placement
   when full; unknown/unhealthy destinations cannot qualify.
3. #267 Close and guarded shrink. Blocked by: 1.
   Demonstrate profile remains wakeable after exact close, excess empty desktops
   release, one spare remains, and active browsers/viewers/recovery survive.
4. #268 Installed redistribution and preservation. Blocked by: 2 and 3.
   Deploy verified integrated source, redistribute original browsers with
   preserved routes/drafts/account state and exact before/after process receipts.

## Acceptance and Definition of Done

All four ticket outcomes verified; targeted behavior tests, rendered acceptance,
source review and installed readback recorded. Configured maximum ten is effective
without hard-coded allocation count. Existing browsers distributed or each
unresolved active/unknown gate explicitly recorded; no claim of complete
redistribution while a required browser remains deferred. Rail UX remains intact.

## Out of Scope

Provider prompt submissions, scheduler wakes, unrelated browser restarts,
Agent Browser changes and idle-chat TTL policy changes.

## Further Notes

Decision provenance: operator conversation and desktop-pool-decisions note.
Agent Browser demand pool and background maintenance source inform the behavior;
these source facts are not installed AuraCall acceptance. Tracker configuration
file is absent; use existing repository GitHub policy and repo plan authority
when publishing approved tickets. Do not publish draft tickets before breakdown
review required by the to-tickets skill.
