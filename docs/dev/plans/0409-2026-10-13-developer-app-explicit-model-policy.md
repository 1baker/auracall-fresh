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
