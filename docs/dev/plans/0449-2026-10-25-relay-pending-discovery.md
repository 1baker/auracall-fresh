# P449: Discover approved relay requests without copying IDs

State: CLOSED — bounded discovery source complete; reviewed runtime activation
and actual ChatGPT discovery remain pending.
Owner: AuraCall thread01a16096-da12-7753-8d44-e299c2172cef.
Parent: selected connection/ChatGPT tickets, personal work-tracker81; current
human request to fix the six-tool communication limitations. Base d9f0fcec.

## Current State

The six-tool relay requires a request ID, so ChatGPT cannot find already-approved
queued work without a human copying it. Actual manual two-linked replies passed;
Codex independently retrieved both complete saved answers. `liveVerified:false`
retains the separate native-browser/model boundary; it does not mean Codex
readback was absent. Automatic Pro source exists under P448; real browser binding
and file transfer remain unqualified. No new Send allowance is granted here.

## Bounded outcome

Add `relay_pending` under existing `relay:read` on the existing OAuth MCP server.
It lists this authenticated owner's approved ready/claimed/held requests with ID,
state and optional predecessor ID, without prompt text, replies, claim IDs or
other owners' metadata. Replied work is excluded. Use deterministic ID ordering,
page size1..20(default10), an opaque request-ID cursor and bounded directory scan.
Validate private POSIX storage and refuse corrupt/symlinked state rather than
manufacturing readiness. The listing is read-only and never stages, claims,
renews, dispatches, edits workspace files or reads arbitrary Codex sessions.
Existing request/claim/reply semantics and scopes remain unchanged.

## Acceptance and implementation

1. RED/GREEN through RelayStore public behavior: owner isolation, pending states,
   completed exclusion, restart and deterministic pagination; reject invalid
   bounds/cursors, storage corruption and symlinked entries.
2. Real signed-token loopback HTTP MCP: the seventh tool is model-visible,
   requires relay:read, finds approved work, and returns no private payload.
   Wrong subject/scope remains refused. Full linked response path still passes.
3. Affected source checks, compile/types/lint/format and separate native grades.
4. Exact source checkpoint and artifact handed through Chief for reviewed runtime
   admission; no live service/Authelia/client/Browser restart or deployment here.

## Continuity and definition of done

Own source only; preserve foreign AGENTS.override.md, source d9, actual4/6=66%,
exhausted2Send cap, PD/files/Pro/custody and all other holds. Same5.1M objective,
source5068600/native baseline143981; carry all actuals/overruns, combinedUNKNOWN.
No duplicate Browser writer or capacity transfer. Source completion requires the
bounded discovery tests and native review. Actual ChatGPT discovery is pending
until an exact reviewed deployment and supported client refresh qualify it.

## Source result

Public store RED failed because pending discovery did not exist; the signed-token
HTTP RED failed because the tool was absent. Both pass with the implementation.
All85 unique affected checks pass across10 files:84 passed in the initial run;
one normal-CLI process case failed deterministically because the validation copy
omitted production config/assets. Copying those unchanged build assets corrected
the fixture, and that original process case passed. The first failure is retained;
no application fix or live retry was made. Compile/types/targeted Biome check PASS.
Separate native Standards and bounded Source Spec PASS on the nine owned pins.
Full goal remains PARTIAL with actual4/6=66%; no provider prompt or runtime change.
