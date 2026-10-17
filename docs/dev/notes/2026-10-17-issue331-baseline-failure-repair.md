# Issue331 — baseline failure repair

Base:822369207c4f7a0c4dd78ec5f37ac2d7221f318e.
Source:5d28e280d81b776aa21b665876c22c3fc76f6084.
Issue:https://github.com/ecochran76/auracall/issues/331.
PR:https://github.com/ecochran76/auracall/pull/332.
Owner:ecochran76. Plan0434. No deployment or provider interaction.

## Diagnosis and retained failures

The five-file current-main baseline passed248 and failed3 in65.77s. The fast three-file loop failed3 and passed9 in1.75s. Original comprehensive failures and the earlier four-failure baseline remain in issue316 presubmit evidence; current passes do not erase them.

| Failure | Finding and repair |
| --- | --- |
| Work preparation expected navigation | Fixture changed URL by read count. Added legitimate reads made it appear already at target. Location now changes only on simulated navigation; original navigation/model/no-Send expectations remain. |
| Mention lifecycle source guard | Guard assumed options.ecosystemMention was the first beforeSend statement. Library verification and selectedComposerMention resolution are now valid predecessors. Check bounded beforeSend region for exact mention assertion before unknown-effect notification on both local and remote paths. |
| Desktop navigation guard | Wake bypassed shared control point. Route acknowledgement through navigateAndSettle with10s bound, preserving provider redirects and existing conversation preservation. |
| Drain status sampling | Delayed status consumer reproducibly observes idle, correctly, where test assumed running. Gate drain execution until running status is observed; release and wait for completion evidence. |
| Rolling budget elapsed minimum | Fixed30ms minimum is not a rolling-window invariant. Controlled clock reproduces25ms wait. Original three-call case never exceeded previous weight2, so it tested quiet time. Four real service instances now prove admission at156ms, after second record expires, rather than131ms. |

A protocol error regression exposed resolved Chrome errorText being ignored by shared navigation. Reject it before fallback, preserving Wake's previous rejection semantics. The new UI test went red before this fix. An intermediate affected run failed6 mock cases returning undefined acknowledgements; optional result handling restored compatibility and all96 affected checks pass.

## Focused evidence

- `pnpm vitest run tests/browser/browserMutationControlPlane.test.ts tests/browser/chatgptPromptAdapter.test.ts tests/browser/llmServicePromptStructure.test.ts --maxWorkers=2`:3 failed,9 passed before repair.
- `pnpm vitest run tests/http.responsesServer.test.ts -t 'reports live background drain state'`: late-consumer probe failed idle-vs-running; repaired gate passes1 with222 skipped.
- `pnpm vitest run tests/browser/llmServiceRateLimit.test.ts -t 'rolling write budget'`: controlled old expectation fails25ms-vs30ms; repaired full file passes16.
- Budget sensitivity: bypass actual budget-wait branch, verify mutated bytes, run repaired case: fails131ms-vs156ms. Restore original bytes in finally. Guard source remains unmodified in delivered diff.
- `pnpm vitest run tests/browser-service/ui.test.ts -t 'protocol navigation error'`: new regression failed before helper fix.
- Six affected browser/helper files:96 passed. Build and changed-file lint pass; lint retains warnings. Full lint caught a TypeScript cast mismatch in the controlled test timer stub; corrected with the existing explicit unknown bridge. Final typecheck/lint and comprehensive validation remain pending.

## Standards self-review

Fixed comparison:`git diff 822369207c4f7a0c4dd78ec5f37ac2d7221f318e...HEAD`.
Standards:AGENTS, CONTEXT, policies0008/0009/0010/0012/0018/0020/0029/0031/0032 and configured discovery/testing guides. No accepted blocking findings. Shared control point owns protocol semantics; no new abstraction, alias, endpoint, global warning suppression or live effects. Tests retain explicit public service/helper seams; source guard stays an architectural check. Timers/clock and gates clean up in finally. Unrelated root edits preserved.

## Spec self-review

Spec:issue331 and Plan0434. No accepted blocking findings. All five retained failure modes are explained and corrected without weakening account/mention/effect/navigation contracts. The helper protocol error change is required to preserve Wake rejection behavior during migration. No unrelated provider behavior, browser interaction or installation. Full-suite acceptance remains a gate, not assumed from focused checks.

## First comprehensive run and bounded remediation

The original five cases pass. Two additional timing flakes appear in touched suites:waitForDownloadCapture's20ms real timeout and ChatGPT mutating-operation quiet-time's25ms measured minimum. Replace only those timing dependencies: fake timers for capture polling, and an explicit20ms caller/storage interval within a36ms quiet period. The second operation must execute at36ms across service instances. Share the controlled clock with the budget fixture; restore spies in finally.84 helper/guard/Wake checks pass. First comprehensive failure remains retained, and a final comprehensive run is required after this bounded remediation. No production repair beyond the reviewed navigation changes.

Full lint after the timer type fix passed243warnings/17infos. The four new naming warnings are CDP fixture fields and a local Page variable; local protocol-casing suppressions and camelCase naming remove them. Final lint must confirm the original239warnings/17infos baseline.

The first comprehensive run finishes3950passed/2failed/65skipped across438files in345.49s. Quiet case observed22ms against25ms; polling returned no capture after the real deadline expired. Both tests were repaired only after their first-run cases finished; report line excerpts may reflect later working-file positions, while the assertion text and result remain retained. Final comprehensive run will start from a clean committed source after remediation.

Final lint passes with the original239warnings/17infos. Closed-world remediation review:two accepted timing findings repaired; no accepted Standards or Spec blockers remain in the source diff. Final comprehensive acceptance is still required.
