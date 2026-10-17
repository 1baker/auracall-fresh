# Plan0411 new-chat live-follow check

State: FAILED live acceptance; one measured pass complete. Primary serial, installed canonical
23969f469, documentation branch docs/plan0411-frontier-acceptance. User explicitly
redirected continuation to live-follow after the new chat was located. Existing
scheduler and unrelated subscriptions remain paused. No prompt submission.

## Fixture and method

A new IM Receipts chat created around20:56UTC is independently located in the
managed browser history and Plan0156 operator-private submission/response receipts.
Its saved final response reports connector INVALID_ARGUMENT/RuntimeException;
context overflow is not established. Exact private candidate ID/URL and saved
response are retained under diagnostics/plan0411, not inserted as requested scope.
The before mirror catalog has364rows and does not contain that candidate.

One normal unscoped steady_follow completion, maxPasses1, materializationPolicy
metadata_only, maxItems1/forcefalse, ten-minute observation bound. No cold cache,
seeded catalog, direct target read or forced root refresh is substituted for
automatic discovery. This no-artifact chat tests discovery/message capture; file
transfer acceptance remains separate. Metadata-only is explicit because normal
artifact-job cleanup currently terminates the whole managed browser, which has
other clients' tabs. Do not relax that cleanup or close their tabs for this proof.

Private harness /tmp/plan0411-newchat-follow.mjs derives from the previous measured
frontier harness, retains current persistent state, snapshots up to10000catalog
rows, observes exact owned targets, and pauses after one pass. Main status before
execution: scheduler/17subscriptions paused,0queued/running/warnings.

## Local decision replay

The installed chooseLiveFollowCyclePhase replay against the exact before snapshot
selects detail-inventory, reason: detail inventory cursor or remaining detail
surfaces pending. Source completionService.resolveStatusRequestedCollectorPhase
uses this persisted-state decision before its bounded/live_follow distinction.
Collector honorRequestedDetailPhase then omits the root-conversation list and
uses retained known conversations. This establishes the causal route for one
pass missing the new chat while historical backfill remains; it does not claim
permanent starvation or rule out eventual discovery after backfill completes.
The collector also emits a newly dated providerIndexEpoch on this retained-detail
path, so that timestamp alone cannot prove a fresh account-index observation.
No source fix or new discovery cadence has been implemented in this test slice.

Raw and derived private evidence: measured-newchat-follow-* receipt and sibling
mirror-before/after snapshots; newchat-phase-decision-replay.json (snapshot hash);
new-im-chat-discovery-20261017.json; history-discovery-20261017/recent.json;
IM Receipts Plan0156 chatgpt-submit-intent/response-observation/test-error records.
No raw private message or connector payload is copied to Git.

Memory disposition: forbidden; no explicit memory-update request.

## Terminal result

Raw measured-newchat-follow-2026-10-17T21-00-53-565Z.json:148897ms,
136backend requests/136responses,peak69per rolling minute;2document navigations,
4same-document route changes. Categories:66background-ui,59other-backend,
6conversation-list,3conversation-content,2file-related. Page-Network coverage is
complete for the exact newly owned target from before product navigation; no
browser-wide/worker claim. No warning,hard stop or controller error. One parent
pass completed, no child/materialization/prompt. Candidate absent before AND after.

The selected historical conversation's context read failed with messages not
found after137142ms in collector diagnostics. The parent nevertheless ended
completed/passCount1/errornull; collectorProgress says complete. Do not grade
that coarse status as successful capture. The persisted detail cursor changed3→1;
no context was returned to the observer. Quiet-repeat acceptance is NOT_RUN because
this first pass never discovered/captured the actual new chat. No direct scoped
read or force-refresh workaround was substituted to make the acceptance green.

Cleanup: controller exited0; exact newly created probe target closed by its
captured target hash after ownership reconciliation. All non-probe targets present
at cleanup remained present afterward. Shared native browser20905 remains verified;
no process-wide kill or restart. The original candidate URL was not present in the
post-cleanup target inventory; no actor or disappearance cause is inferred from
that observation. Its independent saved history and response proof remain intact.

Main final readback: scheduler and17subscriptions paused,0queued/running/warnings.
No runtime/source change. This proves a missed new-chat discovery in one normal
persisted-backfill pass, not permanent starvation or eventual-discovery failure.
The phase replay and collector source explain why the root list was omitted;
nested error→coarse completion additionally needs a regression at the public
completion seam. The metadata-only policy means artifact transfer was not tested.
Source tests from the preceding slice remain unchanged; no fresh test-suite pass
is claimed here. This live result and pure installed decision replay are the new
verification. Standards/Spec serial readback: preserve the FAIL, no accepted
capture/quiet gate. Plan0411 remains OPEN, issue165 remains CLOSED.

Next implementation target: let due discovery observe new index rows while
persisted detail backlog remains, retaining the old cursor and existing pacing;
ensure failed detail evidence remains visible at parent completion. Reproduce at
the production completion/collector seam before choosing a cadence or deploying.
Private newchat-follow-cleanup.json retains exact-tab cleanup evidence.
