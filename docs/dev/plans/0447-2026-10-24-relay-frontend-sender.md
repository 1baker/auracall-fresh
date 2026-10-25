# P447: Automatic foreground relay-to-frontend sender

State: CLOSED — source implementation and native validation complete;
actual runtime/frontend binding and live acceptance remain pending.
Owner: AuraCall, thread01a16096-da12-7753-8d44-e299c2172cef.
Parent: P445/P446; private personal work-tracker81; existing selected ChatGPT
and linked-replies tickets.

## Authority and current state

The human explicitly requested implementing the missing automatic frontend
sender and added500000 tokens on2026-10-24. Same objective5.1M/source5068600,
fixed native baseline143981; carry all spending, grants and existing holds.
OAuth relay9516 is deployed separately; FIRST is queued but unclaimed. This
source change does not mutate that live request or activate a runtime.

## Outcome and architecture

Add a foreground `auracall-relay dispatch REQUEST_ID ROUTE_ID` operation. It
reads the original relay request, validates an explicitly configured existing
ChatGPT frontend, persists an exclusive route-bound claim before Send, calls the
existing FrontendTools sender once, and saves the entire completed answer in the
same relay store. A linked request uses the original previousRequestId and the
actual saved preceding reply. A repeated invocation only reconciles status;
uncertain input never produces another Send.
Reconcile the complete preceding answer across frontend and relay storage
before claiming a follow-up; a matching request ID alone is insufficient.

Reuse FrontendTools and its retained-browser binding, draft, conversation and
complete-answer guards. Native consumer callers can supply their already
acquired facade; JSON startup does not manufacture native admission. CLI uses
the existing explicit frontend configuration factory. It creates no browser,
profile, service, OAuth registration or provider API. The HTTP relay remains
relay-only; no new public browser-control tool or widget polling is added.

## Scope and boundaries

- Own relay store/sender/CLI/tests/docs only; preserve AGENTS.override.md.
- An immutable sender binding prevents a second caller or changed route from
  turning a prior claim into a new dispatch. Legacy/panel claims are not adopted
  as sender authority. Failure between writes remains conservative.
- Require observed ChatGPT model and Pro effort before the first claim. Native
  intelligence that is unverified must refuse, not become expected evidence.
- Bounded foreground status checks retain the original transport's native
  counters/expiry. Invocation limits are not a renewed provider/read allowance.
- Existing shared2Send/6control/20read/deadline/PD/Pro/upload/custody and all
  other holds stay binding. No actual provider, Browser or Windows effects in
  source validation; no source ownership takeover or runtime activation.
- The current real frontend binding still needs owner-qualified runtime
  admission. Tests do not prove that binding or actual live model replies.

## Verification

1. Observe RED for automatic original-request submission and full saved reply.
2. GREEN the smallest sender, then verify linked follow-up, immutable route
   binding, concurrent callers, preexisting claims, uncertainty and status-only
   process recovery through public interfaces.
3. Exercise the real compiled CLI with synthetic frontend transport and fresh
   process readback. Retain original relay/OAuth/frontend regressions.
4. Production compile/typecheck/scoped lint and separate native Standards/Spec
   review. Publish one current result on the existing AuraCall progress page.

## Definition of done

Source sender and CLI pass affected checks and native review. Report actual
runtime transport/binding and live two-linked-reply acceptance separately; do
not call this full goal complete until those real outcomes are verified.

## Source result

181 affected checks across17 test files pass on a byte-verified Linux copy using
the existing same-lockfile cached dependencies, with production compilation,
full types, scoped lint and formatting. The compiled CLI fixture automatically
submits two linked synthetic turns, preserves the entire Unicode answer and
recovers both replies in a fresh process after the bridge closes, without another
Send. Native Standards PASS. Native Source Spec PASS after the one accepted G1
cross-store preceding-answer finding was reproduced RED, fixed and verified in
closed-world review; the11 core checks pass. No dependency installed.

The actual FIRST remains queued/unclaimed on the separate deployed9516 relay.
No new runtime, private frontend binding, browser custody or provider effect was
admitted or executed by this source result. Full goal Spec remains PARTIAL.
