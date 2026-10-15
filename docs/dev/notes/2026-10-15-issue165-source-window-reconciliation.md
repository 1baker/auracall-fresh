# Issue165 source-window acceptance reconciliation

## Focused caller-capability repair — 2026-10-15

User authorized one focused fix after the diagnostic below. Review base 9a74cd5d9;
the commit containing this section also contains implementation and tests.
Configured factories report `backendRequestAdmissionEnabled` without acquiring
leases. Collector context reads resolve options through existing buildListOptions
(ensurePort false), inside the existing timeout. A shared capability check respects
explicit-governor precedence without attaching or borrowing governors. Collector
and inner LlmService use it for bounded cancellation drain. Cancelled option
resolution cannot start a late read. Production ceilings remain omitted/inactive.

Vertical evidence: collector factory-only case failed pending vs returned (2.58s),
then passed (2.80s). Two inner factory-only abort/deadline cases independently
returned cached context under cleanup uncertainty before the same capability fix.
Logs: `/tmp/issue165-capability-red.log`, `/tmp/issue165-capability-green.log`,
`/tmp/issue165-capability-inner-red.log`. Actual collector/configured authority/
guard/stores use synthetic provider/SDK; inner tests use actual LlmService/cache
with a synthetic provider and declared factory capability. These are separate
fixtures, not one combined native collector/public-service/materialization proof.

Validation: initial five-file selection174 passed; after final preflight guard,
affected collector/owned-client/shared-governor selection146 passed (3files,50.03s).
Unchanged inner-context21, traffic-plan13 and configured-authority5 from the first
run remain applicable. Final typecheck passes. Logs:
`/tmp/issue165-capability-validation.log`, `/tmp/issue165-capability-final-tests.log`,
`/tmp/issue165-capability-final-typecheck.log`. Reproduce with the original handoff's
four-file command plus tests/browser/llmServiceContext.test.ts and
tests/browser-service/providerTrafficGovernor.test.ts (six unique files).
Pre-fix diagnostic patch below is historical; do not reapply to repaired source.

Final preflight-only rerun passed1/70skipped (3.26s); final typecheck exit0 and
six affected app/test files pass Biome. Repository Biome includes exclude packages;
supplemental shared-governor lint through stdin passes with unchanged output when
formatter/assist are disabled. Supplemental formatting identifies only unchanged
pre-existing blocks outside this patch; retained rather than expanding scope.
Diffcheck passes. Logs `/tmp/issue165-capability-preflight-final.log`,
`/tmp/issue165-capability-final-biome.log`; shared lint output/errors are
`/tmp/issue165-providerTrafficGovernor-linted.ts` and
`/tmp/issue165-capability-shared-lint-errors.log` (empty). Total185unique tests across
six scoped files; not one full-suite run or full GateB.

Serial Standards review: existing resolution seam, read-only capability, exact
authority precedence, no borrowed lease/governor, no activation or unrelated
refactor; no accepted blocking finding. Serial Spec review: factory-only timeout
failure, parent abort, five-second expiry/late close, disabled/no-factory and
explicit-no-hook deadlines, plus cancelled option resolution are covered. Inner
cached-success finding accepted blocking and repaired within this same slice;
no bounded blocking finding remains. Combined/native composition stays unqualified.

Checkpoint: source slice CLOSED; issue165 OPEN. Classification blocker_reduction,
not materialization acceptance. Full GateB retains the inherited planning failures
below. Production ceiling, genuine changed-B, wider participants, integration,
install and native acceptance remain open. No successor work or live effect.
Memory disposition forbidden: no explicit memory-update request.

## Bounded caller diagnostic — 2026-10-15

User resumed only the capped diagnostic slice after the fresh-agent handoff.
Two executions completed; no production implementation, activation, installation,
provider action or scheduler change. The goal tool returned no current goal in
this session; no new goal or allocation reset was created. This checkpoint ends
the diagnostic slice, not issue165. Progress: evidence gap reduced; no acceptance
gate closed and no defect repaired.

At unchanged implementation bf2a9bf2d / checkout 1ad31aa97, the existing actual
collector/configured-authority/guard/store fixture demonstrates a factory-only
cancellation gap. The new `detail-cancel-factory-only` case removes the outer
collector governor while the owned client retains its factory-issued governor.
Collection returns before the fixture allows provider cleanup to finish:
expected `pending`, received `returned`. A differential control restoring only
the collector governor passes, including preservation of failed transport-close
cause and idle/outcome-unknown lease state. SDK/provider behavior is synthetic;
this is prerequisite cancellation-contract evidence, not native materialization
proof or proof of the original user-visible failure's cause.

Reproducer is preserved beside this note as
`2026-10-15-issue165-factory-only-cancellation-reproducer.patch`; it applies to
1ad31aa97. In a disposable checkout, apply it with `git apply`, then run:
`pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t detail-cancel-factory-only`.
Red: one failed / 62 skipped, 2.97s total, 90ms test; log
`/tmp/issue165-factory-only-diagnostic-red.log`. For the control remove only
` || factoryOnly` from the collector's `providerTrafficGovernor` condition.
Same command: one passed / 62 skipped, 2.42s total, 97ms test; log
`/tmp/issue165-factory-only-diagnostic-control.log`. Logs are intentionally
temporary; the source-bound patch and procedure preserve reproducibility.
All diagnostic edits to the executable test were restored afterward.

Next recommendation: one bounded fix using existing option-resolution seams to
make this cancellation contract reflect exact factory-owned admission capability;
do not attach foreign/stale governors or activate a production ceiling. Qualify
factory-only cancellation and late settlement plus no-hook controls, then one
serial Standards/Spec review. This diagnostic did not inspect or select that
implementation. Full GateB, production activation, genuine changed-B, integration,
installed/native materialization and effect-authority gates remain open.
Memory disposition: forbidden; no explicit user request for a memory update.

## Prior source-window record

Source audited: bf2a9bf2d02049c079d355c6c4d7816cc1593170.
Issue165 OPEN; PR323 OPEN/DRAFT at that source. This read-only audit changes no
implementation, installed runtime, provider, scheduler or warning state.

| Requirement | Evidence and disposition |
| --- | --- |
| Request-aware source boundaries | Plans0420–0432 document bounded source qualification. Latest148focused tests/4files, typecheck/scopedBiome/diff checks pass. Synthetic SDK/provider; actual collector/authority/guard/stores. This is subset source evidence. |
| Production request admission | Inactive: LlmService.buildListOptions factory call and ChatgptService utility invocation omit backendRequestLimit. Literal scan across src and browser-service finds declarations/implementation only, no production activation. Ceiling selection and capability propagation remain open. |
| Plan0386 GateA surface contract | Latest packet is not a complete adapter/control normalization or discovery/activation equivalence audit. Historical receipts remain provenance, not fresh whole-gate proof. |
| Plan0386 GateB | Latest focused selection is not full adapter/materialization/guard/endpoint selection, production build, affected lint and plan/lane audit. Full gate unproven at audited source. |
| Plan0386 GateC | PR draft/unmerged; this source not canonically integrated or installed by this window. Runtime parity, pause state and installed identity require new authorized readback at integration boundary. |
| Plan0386 GateD and Plan0411 automatic acceptance | No new installed positive control or automatic worker acceptance. Readable artifact bytes, file/type/hash/manifest/archive/local-copy agreement, completeA/independentchangedB/quietrepeat, warning/reload recovery, paced exact wsl-chrome-3 cleanup and dependent scheduler/resource acceptance remain open. Do not substitute direct reads/downloads or fixtures. |

Caller locators: src/browser/llmService/llmService.ts factory construction near959;
src/browser/llmService/providers/chatgptService.ts utility invocation near69.
Production hook availability depends on both optional-ceiling entry points. Current
source qualification does not prove bootstrap/background/compatible-participant
coverage or collector/public-service native composition. Factory-only cancellation
without exposed caller admission capability remains unqualified. These are
implementation/acceptance gates, not permission to activate them.

Issue readback retains provider-free diagnosis scope and expressly withholds
retry/prompt/refresh/warning dismissal/scheduler resume. User genuine changed-B
locator and production backend ceiling questions remain unanswered. No new native
journey allowance, installation, promotion or clearance is inferred.

Next bounded work, in a sufficient execution window: map exact caller capability
propagation and remaining participants; reproduce a caller-level failure before
fixing. Keep integration/fullGateB and installed/native acceptance distinct. Preserve
historical failures and all raw acceptance receipts. Goal remains ACTIVE and
incomplete; resource checkpoint does not renew allowance or close the objective.
Memory disposition forbidden by session developer instruction; no memory write.


## Planning audit follow-up

Ran `pnpm plans:audit` across429candidates: initial exit1/39errors. Six introduced
findings were State headers0427–0432 with explanatory suffixes; normalize to
canonical `State: CLOSED` and separate Scope lines. Rerun exit1/33errors, no
remaining findings for those six plans. FullGateB planning validation now has
concrete failing evidence, not a pass or waived baseline.

Residual33:32missing AGENTS policy targets0035–0066 and the older0406-1 plan's
missing canonical State header. AGENTS.md, docs/dev/policies and that older plan
have empty diff from inherited basecb9330a6666161ee98ad485fe0a450642c033ec9, so
these are pre-existing branch findings. Keep them visible; do not remove policy
references or invent baseline exemptions in issue165 closeout reserve. Governance
adoption is a separate lane per restart handoff. Logs /tmp/issue165-source-window-
plans-audit.log and /tmp/issue165-source-window-plans-audit-final.log. Diffcheck
passes; no implementation or runtime change, no source tests rerun.
