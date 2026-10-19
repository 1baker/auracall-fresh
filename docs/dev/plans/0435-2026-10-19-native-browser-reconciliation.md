# Native browser custody and reconciliation | Plan0435

State: CLOSED
Owner: ecochran76
Issue: https://github.com/ecochran76/auracall/issues/326
Branch: fix/issue326-native-recovery
Target: origin/main

## Current State

CLI login option resolution drops native desktop configuration. Regression at the
actual CLI option resolver is being verified before repair. Existing live mismatch
is reporter evidence; its historical cause remains unproven.

## Scope and seams

Serialize work: CLI login launch-options seam preserves selected native custody;
explicit recovery seam qualifies a replacement against retained assignment and
current Linux process/window/endpoint evidence before publishing its receipt.
Provider-free tests use actual child processes and a local Remote View fixture.
They cannot prove installed provider acceptance. No delegated work.

## Acceptance and definition of done

- Red/green regression for CLI login using the native desktop launch plan.
- Explicit recovery qualifies exact managed directory, process birth, executable,
  endpoint and current assignment/window; stale/ambiguous proof refuses unchanged.
- Ordinary reuse remains fail closed; no process kill, rehome or prompt retry.
- Targeted tests, typecheck, review and operator docs pass, with published custody.
- Installation and live recovery are separately reported; no unknown submission retry.

## Non-goals

Selectors, app mutations, cookies, warning clearance, issue325 and unrelated lanes.
PR335 overlaps shared documentation only; source changes are disjoint. Existing
main checkout dirt is preserved in its original checkout.

## Validation and review

- `pnpm vitest run tests/cli/browserLoginLaunch.test.ts`: RED, missing browserConfig
  at the extracted actual CLI resolver; GREEN after canonical policy propagation.
- `pnpm vitest run tests/browser/nativeDesktopRecovery.test.ts -t wrong-display`:
  RED, wrongly accepted conflicting DISPLAY; GREEN with final retained-opening
  ownership verification.
- Ten focused modules: 35/35 PASS, including actual stale-receipt refusal before
  reconciliation and ordinary native reuse after it; process/socket, generation,
  executable, profile, window and display refusals preserve receipts.
- `pnpm typecheck`: PASS. Scoped Biome lint and `git diff --check`: PASS.
- `pnpm tsx bin/auracall.ts login --help`: PASS; recovery is exposed only on login.
- Review baseline: 8bbe3b0dc. Standards and Spec reviewed serially using Matt's
  code-review process; no delegation. Accepted blocking DISPLAY gap repaired and
  regression verified. No remaining source blocker; installed acceptance unrun.

Historical incident attribution remains unproven. This packet proves prevention
of the identified CLI handoff defect and the explicit recovery contract in source.

- Full production build: PASS. Planning-library audit: FAIL with 33 existing
  errors (32 missing AGENTS policy targets and Plan0406-1 missing State header).
  None of those files changed from 8bbe3b0dc; Plan0435 is accepted by the audit.
- Published source PR: https://github.com/ecochran76/auracall/pull/336.

## Source closeout

Source repair complete; 162 additional browser/configuration contract tests passed
(197 total across 17 modules), and the production build passed. Integration uses
PR336. Existing installed incident remains a separate operational acceptance gate;
this plan does not authorize unknown submission retries or provider warning clears.
