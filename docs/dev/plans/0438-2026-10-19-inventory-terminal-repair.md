# Plan0438 — Repair terminal app inventory

State: OPEN
Owner: ecochran76
Issue: https://github.com/ecochran76/auracall/issues/325
Branch: fix/issue325-attachment
Target: origin/main

## Current State

User explicitly requested fixing the remaining workflow after Plan0437.
Base36bcd6175; active CLI runtime856276cdb. Existing fine debug output proves
attachment completes. One full-deadline read instead failed at identity after
29.86s with Provider observer cleanup failed and unknown cleanup. Nested-cause
capture is in progress; no root-cause hypothesis has been accepted.

## Scope and acceptance

Reproduce and minimize the actual failure at a public seam, rank falsifiable
hypotheses, observe regression red then green, validate affected tests and native
composition, integrate through PR and verify an attributable installed terminal
inventory outcome. Do not weaken request limits, admission, native ownership,
cleanup uncertainty, or CAPTCHA/human boundaries. No prompt, scheduler control,
browser restart or guard/owner reset. PR335's broader lane stays separate.

## Execution

Serial primary-agent work. Private diagnostics stay under the user-scoped
acceptance directory. The current capture records error names/messages only;
no cookies, request bodies or browser content in Git. Stop blind probes after
the targeted cause capture; continue with provider-free regression work.

## Definition of done

Original failure loop green, meaningful regression and affected checks pass,
temporary instrumentation removed, published and merged source, installed
readback, journal/fix log/domain/operator docs consistent, and truthful issue
state. Any unqualified remaining gate stays explicit.

## Diagnosis and regression evidence

Actual terminal errors: observer cleanup unknown at identity (29.86s), followed
by a provider-interaction ledger lock timeout during inventory. Attachment does
complete; the earlier external25s cutoff did not identify a hung attachment.
Private replay copies the retained24MBsnapshot to an isolated directory, calls
32public list operations, reports sanitized counts/errors and removes the copy.
Installed baseline fails6–7reads in4–5s twice; one-read control passes0.19s.

Ranked predictions: same-instance read self-contention; external lock holder;
corrupt snapshot. Isolated replay removes external holders; single read rules
out parse corruption. A minimized controlled-slow-load regression fails2of3reads
before repair and passes after. Original32-read replay now passes0.23s with zero
failures. No account identifiers or private snapshot included in the repository.

Implementation queues read operations with durable mutations, coalesces their
snapshot load, and skips persistence for pure-read batches. Extended existing
blocked/failed-commit tests cover mixed reads without early publication.

Broader validation found two existing developer-app tests broken by Plan0437's
plain Error wrapper. Preserve original errors and track JSON stage metadata in
a WeakMap; original AggregateError/nested causes and governor identity survive.
Those3focused ownership cases now pass. Final affected selection, typecheck,
scoped lint/build, review, integration and installed acceptance are in progress.

## Source verification and review

Focused provider-free selection:161tests across5suites pass in51.79s. Final
typecheck and full build pass. Scoped Biome checks pass; package source is
excluded by the repo's includes, so the same lint rules were also applied using
an external config that only expands includes. A preexisting void forEach
callback was made explicit in the touched hunk;20ledger tests still pass.

Review fixed point36bcd6175be65a57d636c3de9036e1a35e9431fa; issue325 and this plan
are the spec. Serial Standards review: no accepted blocker after lint repair.
Serial Spec review: original Error/aggregate preservation was accepted blocking,
repaired and covered by the3existing ownership cases. Mixed commit failure and
read-only non-persistence are covered. No unrelated PR335 changes are included.
Source is ready for published-diff review and integration; installed acceptance
remains a separate gate.
