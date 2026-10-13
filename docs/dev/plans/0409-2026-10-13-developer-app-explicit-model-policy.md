# Issue253 explicit submitted-page model policy

State: OPEN
Parent: Plan0405 / Plan0406-1. Additional submissions1/10 consumed; packet1 native exit124; original provider completion verified; native acceptance failed.

## Current State

Packet1 actual backend model_slug gpt-6-pro and primary screenshotPro contradict the prior utility-tab5.6Instant setup. Source submitChatgptDeveloperApp unconditionally forced current strategy and cleared thinking selection on its fresh page. Preparation-tab model does not establish submitted-page model.

## Scope and contract

Honor the existing explicit CLI --browser-model-strategy on developer-app submission. Without an explicit CLI flag preserve current-model behavior. Select retains the canonical launch policy's desired model/thinking time on the actual submitted page; current/ignore leave thinking selection unset as before. Preserve Chat mode, exact account/app and ecosystem mention, authority, one Send and no-retry evidence. No new flags, wakes or general memory writes.

## Feedback loop and acceptance

Existing public lifecycle test went red on explicit select: observed current and undefined thinking time. CLI-forwarding test proves inventory adapter receives no selection override and only submission adapter receives explicit select. Focused lifecycle/CLI/terminal tests pass; 65 focused tests pass across lifecycle/forwarding/actual CLI registration and terminal checks; final typecheck passes. Production build passes. Initial typecheck caught untyped fixture callback, corrected to explicit callback contract, not production behavior.

Review Standards and Spec independently before integration. Install only after packet1 original terminal reconciliation; no API restart or runtime promotion during the active request. Packet2, if needed, uses --model chatgpt:fast --browser-model-strategy select --browser-thinking-time light on the repaired native path and an actually-ready exact-packet observer gate. Record selected model on actual submitted conversation/backend; one frozen prompt/Send, ten-minute guard. Stop on unsafe/unknown state or completed objective.

PR303 integrated6a247d967 / validatedf7ccec1fe; staged user-runtime-issue253-app-model-policy,592compiledparity and2actualcompiledCLI→submissionpolicy cases pass0provider effects. Not promoted; API/browser left intact while originalprovider pending. Future runner itself validates immutable observer readiness snapshot SHA, fresh heartbeat and process generation; six fail-closed negative cases reported by LitScout, primaryreview pending.

Primary runner-gate review corrected false fixture coverage:5/6originalcases failed at unrelated prefix mismatch. Full-prefix fixture plus exact per-case error assertions now exercises6intended guards, and1valid-handshake mocked-spawn control reaches fast/select/light exactly once;7cases pass0real effects. Futureobserver filters new-conversation owner leases, not utility inventory leases, before binding target/CID. Runner/observer remain prepared, not launched.

## Installed checkpoint

2026-10-13T02:47:41Z: promoted PR303 runtime after original provider completion and fresh OS census. All592 compiled files match validated source; API77641 exact model-policy prefix, KillModeprocess and /desktops200. Original browser28993 was absent before this software restart. Packet1 plain-text final23744chars SHA2566e101327eb250f598808540974c64cd6cfdebcf831d4a20c88b2ad8a5f70f8cf; one frozen user prompt,51/65 workflow admissions,7KEEP entries in newSession166, priorSessions152–163/165 unchanged. Native exit124/emptyreceipt, Pro model and launch-observer violation remain failures.

Expiry audit attributes a guarded tab-close request to API25715/start214747 at02:44:05.206Z for the exact packet1 lease/target; result02:44:05.451Z preserved/target-still-live-after-close. It does not establish browser-process exit actor. Do not infer ordering from approximate operator timing. Packet2 preparation authorized, but no submission until fresh account/app/browser/observer gates pass. Memory disposition forbidden by current task boundary.
