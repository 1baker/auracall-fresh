# Active ChatGPT response protection during maintenance | 0392

State: CLOSED
Owner: primary
Work item: Issue #226
Branch: fix/issue226-active-chat-retirement
Target: main

## Current State

Installed retirement replay closes a simulated active externally submitted chat whose lease is settled. Exact prior incident leases report already-missing with zero closes; actual disappearance remains unattributed. Regression at production maintenance seam is running, file-backed under build/issue226.

## Bounded outcome

Prevent maintenance from closing an active ChatGPT response, including expired lost leases and untracked/CDP-submitted chats. Probe failures preserve the target. Keep cleanup of positively inactive tabs. Add focused regressions, document contract, review and publish a bounded repair. Preserve unrelated root edits and existing worktrees. No new provider submission until source and installed repair qualification.

## Acceptance

Actual maintenance replay must fail before the fix and pass afterward for active and unknown provider activity. Ordinary inactive cleanup still works. Read-only provider activity probe never navigates or clicks. Retained incident artifacts remain unchanged. A later installed ChatGPT/LitScout run must distinguish protection proof from incident attribution.

## Qualification checkpoint

Code575076e29; PR250 open.40 selected checks, typecheck and TypeScript build pass. Three-module overlay installed only after both existing modules matched source base, preserving unrelated runtime updates; rollback backup retained. API restarted from idle/no foreground work, fresh PID30054. Installed guard recognized a real active ChatGPT response and refused close. Installed maintenance on that real tab with an isolated expired fixture lease preserved it with zero close calls; canonical registry untouched. This is not an elapsed canonical-TTL close experiment.

Single post-repair ChatGPT/LitScout prompt is running in conversation6aca6b7e-97f8-83ea-87f4-7975f1bbefd9, targeting the unresolved WO patent numerical tables. Wake wake_20261010_164603_0d11 watches recovery-attention.json and distinguishes intervention from answer completion. Observer session21192, private research-notes/3hp-retirement-smoke. Do not submit another prompt. Final research outcome, automatic continuation and source integration remain pending.

## Final outcome

PR250 merged as f9c5d675466df7c46b367c576f5ccefe9680d0bd. Selected integration checks pass40/40 against5fc4b69c4. Installed three-module overlay retains code575076e29 behavior; unrelated runtime preserved. ChatGPT post-repair run completed and observer captured its answer: original WO numeric tables remain unavailable, honestly disclosed; Session152 is byte-identical to pre-run membership evidence. Workflow admitted6/40 calls (not success count). Wake cancelled after foreground completion review; no automatic delivery claim. Active-response cleanup protection is qualified; unexplained browser/process disappearance remains open in Issue226.
