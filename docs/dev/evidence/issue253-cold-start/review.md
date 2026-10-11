# Primary serial Standards and Spec review

Diff: cold-start handoff patch againstd01087a09. Spec: Issue253/Plan0405 practical native acceptance and original browser opening semantics. Standards: existing coordinator ownership/lease accounting and repo architecture, validation/testing policies.

Standards PASS: physical replacement is opened, reserved and creation-accounted before old startup target retirement. Revalidates selected retirement URL; cleanup failure idles qualified replacement and does not destroy the browser. No prompt retry, broad cleanup, provider control bypass or automatic process recovery.

Spec PASS for source: existing test was strengthened to model browser exit on closing its sole page. It fails red in old sequence. New source passes success, replacement failure and retirement failure preserving browser/lease custody.46 tests across5 files pass; typecheck and scoped lint pass. Two additional production-boundary fixture tests and build pass; native acceptance remains required.

Correct hypothesis: default cold-start coordinator closed its only incompatible startup page before opening replacement. Live process trace shows zombie state before EACCES, not a live permission problem. Historical exit attribution remains unknown.
