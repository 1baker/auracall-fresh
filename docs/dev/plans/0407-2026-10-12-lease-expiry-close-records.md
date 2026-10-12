# Plan0407 | Durable lease-expiry close records (#253)

State: CLOSED
Owner: primary agent; no delegation or live provider request.
Branch: fix/issue253-retirement-close-audit
Base: 89fe733d43bd2e0e1df47745ac0aa524f7850a6b
Integration: main through exact-head PR merge.
Authority: user clarified that AuraCall itself must record a tab closed due to lease expiry; this is software instrumentation, not an operator-attribution note.

## Current State

Shared expiry retirement persists a final lease snapshot but had no durable close-request/outcome history. Configured maintenance suppresses the underlying close logger; aggregate close counts lack actor/target/reason correlation. The exact previous target snapshot has idle-expired/already-missing/closes0 at02:08:32.070Z; owned-browser lifecycle contains only its launch event. This is an attribution gap, not evidence that another actor or AuraCall did not close it.

## Packet and acceptance

Emit append-only retirement-events.v1.jsonl in the existing private tab-lease storage. Await the record before an expiry close request; record confirmed outcome separately from request and from CAS finalization. Bind actorPID/start ticks, exact lease/revision/target, canonical runtime/service and hashed account/managed browser scope, expiry reason/deadlines and endpoint/browserPID when known. Do not log account, prompt or response contents.

Wire ordinary and lost-lease expiry paths in configured maintenance plus affinity, utility and live-follow cleanup. Preserve existing target/activity/ownership admission. Failed pre-close audit must preserve the tab; failed close/inspection must not claim confirmed closure. Already-missing observations must have no close-request event. Retain unknown historical exit actor; no synthetic past events or provider retry.

Matt TDD: existing real retirement seam RED9ms on missing audit; implement smallest shared event/sink then file-backed runtime and actual maintenance caller tests. Validate configured maintenance, generic/provider retirement, active/unknown protection and affinity/utility boundaries. Source review/commit/build, staged install, exact compiled parity and compiled durable audit proof are separate gates.

Definition of done: source integrated and installed, append-only mode600 journal verified before fixture close and with confirmed result after; no live close or new prompt needed for this instrumentation packet. Full Issue253 native collection acceptance stays separately gated and unproven.

Packet CLOSED: PR299 integrated/installed e953a8771 /validated6cc7ae97e;41source tests7files,5installedcompiledmaintenance cases,592compiledparity, lint/typecheck/build and API15114 /desktops200. No forced live close ornewprompt. Full Issue253 native collection gate remains open and original historical closer remains unproven.
