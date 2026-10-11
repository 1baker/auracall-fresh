# Desktop pool interview — 2026-10-10

## Confirmed operator decisions

- Sleeping AuraCall runtime profiles remain visible in the rail independently of desktop allocation. Wake assigns a desktop.
- Automatic placement is the default. Research was an arbitrary prior name and is not the automatic destination.
- AuraCall may use up to ten desktops, matching the requested Agent Browser model. Grow on demand and wrap around healthy desktops at capacity.
- Redistribute the existing browsers currently concentrated on Research, preserving conversation routes, drafts, managed browser data, and exact process custody. The operator explicitly approved redistribution.

## Confirmed shrink and capacity decisions

- Maximum desktops is configuration-driven, with the requested deployment set to ten; do not hard-code ten in allocation logic.
- Retain one ready spare and release only excess empty desktops. Do not close idle browsers merely to shrink.

## Remaining frontier

- Determine implementation and installed acceptance from existing Remote View contracts. Do not treat these design decisions as evidence that the feature is installed.

## Primary source references

- Agent Browser: crates/agent-browser-service-model/src/remote_view_session_pool.rs (demand growth, occupied/unknown handling, policy limit wrap-around).
- Agent Browser: cli/src/native/browser_session_pool_maintenance.rs (retain one spare, owner-observed idle release, guarded retirement).
- AuraCall: src/browser/service/desktopRuntimeProfiles.ts and desktopProfileAssignments.ts (current named placement and remembered assignment overlay).

State: interview decisions settled; no browser redistribution or service change performed in this packet.
