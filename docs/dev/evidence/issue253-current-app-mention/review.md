# Serial primary review

Fixed base cb16db41b (installed PR285 checkpoint). Spec: Issue253/Plan0405 current mention identity revision plus captured trigger app URI. Standards: AGENTS, architecture/testing/documentation/validation and Matt smell baseline. Axes reviewed separately by primary, no independent reviewer claim.

## Standards

PASS. Existing provider-local composer module owns shared mention-selector shape; app workflow reuses it for readiness, readback and empty/clear guards. No generic page pill matching, text-only identity, alternate submission, caller scope expansion or control bypass. Current app URI is parsed as a complete ASCII identity token, not a label alias. No accepted blocking findings.

## Spec

PASS for source. Correct native selection no longer waits exclusively for old inline-pill attrs. Current app-mention-name/path readback retains exact canonical app ID before Send. Foreign app, custom-GPT URI, malformed suffix, empty path and trailing newline fail exact pre-Send verification; multiple/unknown mentions fail qualification. Legacy shape remains supported. Existing general prompt protection already retains modern app mention elements. Original prompt is still unsent; installed/native acceptance required. No accepted blocking findings.

Observed140 focused tests across9 files pass; final affected17tests pass after URI edge hardening. Typecheck/scoped lint pass. Final build PASS, compiled current modernName/modernMatch guard verified. The earlier compilation read source before last injected URI-string change; compiled freshness is not inferred from a successful stale build. Host contention made full run231s vs prior9s, preserved without retry-erasure; no host cleanup.
