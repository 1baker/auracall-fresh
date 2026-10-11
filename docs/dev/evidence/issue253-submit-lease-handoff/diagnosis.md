# Issue253 inventory-to-submission custody handoff

Original native once-only invocation on installed f83205d4d failed before Send with `ChatGPT process tab acquisition failed: process-owned.` Exact receipt effectState pre_effect/retrySafe true and null conversation/current/terminal URLs; observer had zero user/assistant messages. No retry. Native inventory owned the new target during the nested submission call. Historical lifecycle evidence alone does not identify every transient lease revision.

One fast regression calls the real CLI entry, real utility coordinator/registry and real submission provisioner with hermetic transport. It reproduces the exact process-owned failure in13ms; total test command2.68s. Scope and TTL fixed, so it isolates overlapping phases rather than account mismatch or expiry. Removing active inventory custody before provisioning makes the same seam green11ms.

Ranked falsifiable hypotheses shown before changes: (1) active inventory ownership overlaps nested submission; settling first removes conflict; (2) scope mismatch; matching scope removes conflict; (3) TTL expiry; clock withinTTL removes conflict. Fixture already matches scope/currentTTL, leaving1.

Repair observes inventory under its existing exact utility lease, closes its adapter and awaits successful utility settlement. Only then does a separate submission adapter run existing confirmation/account/inventory/exact-app/prompt validation against that observation and enter the unchanged shared submission lifecycle with selected full config. Shared lifecycle revalidates live account and exact app before Send. Inventory settlement failure blocks submission; process ownership rules are unchanged. No actual provider effect in source fixtures.

Negative cases: failed settlement, wrong account, missing confirmation, incomplete inventory and ambiguous app all block the submission seam. Native original invocation remains exhausted; source proof does not authorize a live retry or prove native submission completion.

Private originals stay in original LitScout demo10 campaign directory. The legacy observer `providerPromptSubmissionAttempted=true` denotes command attempt, not actual Send; its `intentExists=false` checked an old filename. The real native-submission-intent.json exists. Attributable native-submit-audit-correction.json preserves the correction without replacing originals. No process-exit actor inferred.
