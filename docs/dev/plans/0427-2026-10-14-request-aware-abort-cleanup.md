# Plan 0427 — request-aware abort cleanup

State: CLOSED (bounded source packet; issue165 remains OPEN)
Parent: Plan0426 / Plan0425 / Plan0411 / issue165
Branch: fix/issue165-owned-backend-request-admission
Target: main
Base: 3b840f014451630315a52f66889a5949976d5754
Owner: primary, serial

## Current State

Normal request-aware cleanup is qualified. Abort-triggered retained-session close
still uses separate bounded cleanup, and public context reads race provider work
against the abort signal. Public rejection is insufficient proof of final custody.
Extend the existing public fixture and observe actual utility completion explicitly.

## Acceptance and bounds

A request-aware abort retains its aborted/timed-out public outcome and preserves
cleanup uncertainty through eventual utility settlement. Failed/unconfirmed close
must retain unknown lease/desktop custody and must not become normal cached success.
No overflow sends, duplicate close attempt or automatic retry. Keep legacy deadline
behavior compatible when no request hook is active. Retained-session eviction must
remove the caller's stale session and drain owned request cleanup before releasing
its lease. Use actual public service/utility/adapter/annotation/guarded CDP with
synthetic SDK/provider output and real isolated stores.

Write surface: relevant provider/context/utility request cleanup seam and existing
fixture, plus supporting docs. Vertical TDD, serial Standards/Spec review against
the base, closed-world accepted findings only; no delegation. Source checkpoint only.
Other retained/background lifetimes, bootstrap callers, compatible participants,
production ceiling selection and full Plan0386 native acceptance remain open.
No activation, provider probe, build/install, scheduler change or clearance. Goal
resources/review controls remain inherited without renewal.


## Diagnosis, review and validation

Public retained-abort failure red: lease was idle/settled instead of unknown.
Preserving retained close rejection alone remained red, confirming the separate
service abort race. The completed repair drains the provider promise at most five
seconds only with request admission; pending drain becomes typed uncertainty.
Fresh abort error retains the public code/outcome and carries cleanup cause
without forming a cycle. Classification follows aggregate leaves and causes with
cycle protection. Unknown cleanup excludes cached fallback. Abort listener has a
rejection observer while read cleanup still awaits the original promise.
Retained close removes stale session, bounds three seconds and preserves failed/
unconfirmed close. Confirmed close permits known settlement and existing fallback.

Serial primary Standards and Spec passes against base3b840f014; no delegation or
fresh broad drift pass. Accepted blocking findings were swallowed retained-close
failure, service abort race losing cleanup evidence, and false cached success on
unknown cleanup; all closed-world verified. A falsey rejection sentinel in the
new retained-close seam was corrected with an explicit failure flag. No remaining
blocking finding within the frozen packet. Other lifetime gates stay open.

Primary validation:118tests/7files pass (backendRequestAdmission,
chatgptContextReadDeadline, llmServiceContext, chatgptTabLifecycle,
chatgptContextAffinityRoute, configuredProviderTrafficAuthority,
liveFollowTabCoordinator). Three retained-abort cases pass again after adding
explicit stale-session eviction assertion. Nine selected adapter close/abort cases
pass (185other cases excluded). Total distinct focused checks127/8files. Typecheck,
scoped Biome and diff checks pass. The stalled-provider test uses the actual finite
five-second drain; deadline case preserves timed_out and rejects stale cache.
All provider/SDK output simulated, real public service/utility/adapter/guard/stores.
No live/manual/install proof, retry loops, activation or provider effects.

Remaining: other retained/background lifecycle and bootstrap callers, compatible
participants, production ceiling and full Plan0386 native acceptance. The pending
changed-B locator and production ceiling questions remain unanswered. Next bounded
source work should qualify a retained connection across separate utility calls
before considering any request-hook activation. Progress classification: progress.
Final typecheck found callback-assigned abort-error narrowing to never; capture the
validated terminal context error before awaiting the drain. This changes no
runtime outcome; the focused drain cases and typecheck were rerun after repair.
Memory disposition: forbidden by session developer instructions; no memory write.
