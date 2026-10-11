# Plan0403 | Runtime browser launch precedence

State: CLOSED
Authority: operator agreed runtime overrides > browser-profile settings > global
defaults after Plan0402 characterization. Baseline 813651d951c6560b3d0c74cb370a45db618239bd.

## Current State

Source implementation and provider-free acceptance are complete. PR delivery is recorded below; merge and runtime adoption are separate.

PR260 is merged; Plan0402 is CLOSED. Launch-plan convergence was parked until the
precedence choice. This successor implements that accepted choice; Plan0402 raw
evidence remains historical. Owner: primary agent, serialized code/test/review.

## Contract and scope

Canonical launch fields use the selected runtime browser override, then explicitly
selected browser-profile setting, then global browser fallback. Canonical source
name/cookie fields win over aliases within each layer. Blank strings are absent.
Source root follows the same layers; source identity remains separate from managed
identity and directory. An explicit selected runtime/service managed directory
remains valid; stale foreign/default provider directories are discarded.
Keep source-cookie copying opt-in; explicit bootstrap path remains explicit intent.
Session-config launch sources retain their already explicit session options.

Centralize the policy in BrowserLaunchPlan; stored executor consumes one launch
projection for both emitted options and affinity configuration. Source authorization
uses the selected source identity, including legacy runtime aliases. Preserve
model/effort/tools, mutable authorization, recovery/evidence/artifact behavior.
No lease rewrite, provider request, installation or live canary.

## Acceptance

Public launch-plan and stored-executor seams, literal conflicting fixtures:
runtime > browser > global, canonical/legacy aliases, blank fallback, explicit
browser selection and stale directory, source/managed separation, cookie opt-in,
mutable authorization. Retain red and green runs, focused adjacent suites,
typecheck/lint, serial Standards/Spec review, and source PR delivery. Source
integration and installed/live adoption are separate. Memory forbidden.

## Implementation and acceptance

The plan resolves seven named launch fields plus cookieSync before normalization.
Stored execution deletes its independent six precedence chains and source-name
chain; actual options and affinity configuration use one plan projection. Explicit
runtime managed directories and existing service managed bindings remain valid.
Provider binding manual-login false is preserved before defaults apply.

Historical Plan0402 expected divergences remain in captured baseline receipts;
current public tests express the newly agreed policy. Source root can derive cookies
only at the chosen root/name; source copying requires opt-in, with a separately
configured bootstrap request preserved. Non-launch execution preferences and
mutable authorization remain outside the projection.

Retained red/green: resolver precedence (one red), stored affinity/source origin
(three red), explicit runtime directory (one red), cookie mode (two red), and manual
login preference (one red). Intermediate full executor run found two explicit
service-directory regressions, fixed before final acceptance. First compile errors
are preserved separately from final passing output.

Final gates: 207 tests across 13 focused/adjacent files, typecheck, targeted lint,
diff hygiene, serial Standards/Spec review and source PR delivery. No live/provider,
installed, cancellation/crash/TTL acceptance or Issue226 closure claimed. Sources
and exact commands are bound in evidence/plan0403/validation.json.

Outcome: source convergence completed under the agreed contract. Seven named launch fields and cookieSync resolve centrally; duplicate stored launch/source chains removed. Final207 tests, typecheck/lint and two-axis source review pass. Source PR delivery recorded separately; no installation or provider work.
