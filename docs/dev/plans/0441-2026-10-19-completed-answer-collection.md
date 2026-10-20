# Plan0441 — Diagnose completed-answer collection timeout

State: OPEN
Owner: ecochran76
Issue: https://github.com/ecochran76/auracall/issues/311
Branch: fix/issue311-completed-answer
Target: origin/main

## Current State

The original conversation is qualified by a contemporaneous private readback.
Current installed collection returns its original answer with only rendered-table
whitespace differences. Historical completion versus deadline remains unproven.
A separately confirmed passive-progress defect (557-char snapshot but zero text
reported) is reproduced in19ms and locally repaired with a sanitized regression.
Affected127tests/8suites, typecheck and scoped lint pass; build, integration and
installed progress proof remain pending. Issue311 remains open for historical
timing evidence; Plan0440/issue317 is a separate blocked diagnosis.

## Scope and acceptance

Serial primary-agent diagnosis using Matt's process. Identify original read-only
conversation evidence, construct a deterministic red-capable public collector loop,
minimize, then show ranked falsifiable hypotheses before testing. Repair only a
verified collector/completion failure; retain response boundaries and distinguish
execution from collection and deadline outcomes. Use TDD and source checks, primary
Standards/Spec review, PR integration and exact installed proof where justified.
Keep private prompt/account/conversation data outside Git; sanitize any fixtures.

No sends or new prompts, provider retry, timeout increase, auth reset, browser
replacement, profile takeover, warning/owner reset or copying private transcript
into repo. Read candidate metadata only within the original launch window and
qualify identity before original-conversation attribution. Do not infer completion
before the deadline from a later completed state. Stop with an exact evidence gate
if a trustworthy reproducer cannot be built. No memory save request.

## Verified evidence and bounded repair refinement

The exact original source artifact and contemporaneous diagnostics identify the
original route. At16:04:24 Stop is present; at16:04:38 the later final answer is
absent. Session terminal error is16:05:05; completion is first observed16:05:21,
with a persisted answer proof at16:05:58. Completion before the deadline remains
unproven. Current public collector returns that original answer in10192ms with
exact non-whitespace content equivalence; first oracle was too strict about table
whitespace and is retained as a false positive, not bug evidence.

A separate diagnostic contradiction is verified on the same qualified page:
snapshot557chars, but progress reports assistant-turn-no-text and zero chars.
A sanitized public expression fixture reproduces it in19ms. Bound this repair to
accurate passive progress for a role-bearing plain answer without a markdown
wrapper. Preserve existing content preference, excluded/tool-card checks and
response-boundary qualification. No historical timeout root-cause or full incident
repair claim. Three ranked hypotheses (wrapper dependence, role recognition,
boundary rejection) are stated before one-variable controls. Wrapper-child addition
passes; role and boundary controls retain failure. Original test is restored.

Source repair, regression controls, affected checks, separate Standards/Spec
review, exact merged installed progress readback and docs remain pending. Keep
issue311 open for historical timing uncertainty even after the bounded diagnostic
correction lands. Original timeouts and failed diagnostic reads remain preserved.

The initial root-class control did not model CSS union matching in the fixture;
retain it as an invalid control, not hypothesis evidence. The wrapper-child control
passes with restored source. The repair is a single passive candidate fallback,
not collector extraction, timeout or retry behavior. Existing tool-only and parent
chrome fixtures are strengthened; the plain-prose regression also checks its
response boundary. No new interface, alias, provider data or diagnostic logging.

## Source validation and review

Affected collector/progress/recovery:127pass,1existing skip,8suites in10.93s.
CLI/browser session runner:37pass,2suites in3.19s, including explicit overall
timeout persistence. Total164passed; this is a focused selection, not full suite.
Typecheck, build, scoped Biome and diff checks pass. Planning audit retains33
preexisting findings, none for Plan0441. Fixed comparison80d7caf0d: primary
Standards review finds no blocking convention, privacy, passive-read or ownership
change; Spec review accepts the bounded diagnostic correction and records
historical timeout attribution as unfulfilled. Installed proof remains pending.
