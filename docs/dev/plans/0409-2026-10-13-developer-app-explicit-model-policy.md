# Issue253 explicit submitted-page model policy

State: OPEN
Parent: Plan0405 / Plan0406-1. Additional submissions1/10 consumed; packet1 native exit124; original provider terminal reconciliation pending.

## Current State

Packet1 actual backend model_slug gpt-6-pro and primary screenshotPro contradict the prior utility-tab5.6Instant setup. Source submitChatgptDeveloperApp unconditionally forced current strategy and cleared thinking selection on its fresh page. Preparation-tab model does not establish submitted-page model.

## Scope and contract

Honor the existing explicit CLI --browser-model-strategy on developer-app submission. Without an explicit CLI flag preserve current-model behavior. Select retains the canonical launch policy's desired model/thinking time on the actual submitted page; current/ignore leave thinking selection unset as before. Preserve Chat mode, exact account/app and ecosystem mention, authority, one Send and no-retry evidence. No new flags, wakes or general memory writes.

## Feedback loop and acceptance

Existing public lifecycle test went red on explicit select: observed current and undefined thinking time. CLI-forwarding test proves inventory adapter receives no selection override and only submission adapter receives explicit select. Focused lifecycle/CLI/terminal tests pass; 65 focused tests pass across lifecycle/forwarding/actual CLI registration and terminal checks; final typecheck passes. Production build passes. Initial typecheck caught untyped fixture callback, corrected to explicit callback contract, not production behavior.

Review Standards and Spec independently before integration. Install only after packet1 original terminal reconciliation; no API restart or runtime promotion during the active request. Packet2, if needed, uses --model chatgpt:fast --browser-model-strategy select --browser-thinking-time light on the repaired native path and an actually-ready exact-packet observer gate. Record selected model on actual submitted conversation/backend; one frozen prompt/Send, ten-minute guard. Stop on unsafe/unknown state or completed objective.

PR303 integrated6a247d967 / validatedf7ccec1fe; staged user-runtime-issue253-app-model-policy,592compiledparity and2actualcompiledCLI→submissionpolicy cases pass0provider effects. Not promoted; API/browser left intact while originalprovider pending. Future runner itself validates immutable observer readiness snapshot SHA, fresh heartbeat and process generation; six fail-closed negative cases reported by LitScout, primaryreview pending.

Primary runner-gate review corrected false fixture coverage:5/6originalcases failed at unrelated prefix mismatch. Full-prefix fixture plus exact per-case error assertions now exercises6intended guards, and1valid-handshake mocked-spawn control reaches fast/select/light exactly once;7cases pass0real effects. Futureobserver filters new-conversation owner leases, not utility inventory leases, before binding target/CID. Runner/observer remain prepared, not launched.
