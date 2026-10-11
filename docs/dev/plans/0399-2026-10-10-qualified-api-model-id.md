# Plan0399 | Preserve qualified API model IDs

State: CLOSED
Baseline: 97f5638ef5a75cc5c26620096cd86ea441aff2ba.
Branch: fix/qualified-model-id; isolated worktree auracall-model-id.
Authority: user approved diagnosing and fixing the survey's model-ID defect.

## Scope and acceptance

Slash-qualified API IDs must retain their exact trimmed spelling and case through
CLI options and effective model identity. Existing shorthand, canonical known
names, durable colon aliases and browser display-label inference retain behavior.
No provider calls, installed runtime changes, lease changes or architecture refactor.
Done when regression observed red, public dry-run reproduces before/after, focused
caller coverage/typecheck/lint pass and primary standards/spec review completes.

## Evidence

First command: pnpm vitest run tests/runOptions.test.ts -t 'qualified API model'.
RED: expected vendor/claude-sonnet-custom-v1, received claude-4.5-sonnet.
Tight deterministic CLI resolution seam; no provider dependencies.
Ranked hypotheses: fuzzy alias precedence, later catalog mapping, normalization.
Source at options.ts confirms fuzzy substring branch precedes custom passthrough.
Minimal correction: preserve slash-qualified ID before lowercase/alias handling.

Actual CLI differential (same prompt, API engine and --dry-run):
pnpm tsx bin/auracall.ts --engine api --model vendor/claude-sonnet-custom-v1
  --prompt 'Verify qualified model identity without contacting a provider.' --dry-run
Baseline output: would call claude-4.5-sonnet.
Fixed output: would call vendor/claude-sonnet-custom-v1.
Baseline temporarily replayed from HEAD, restored fixed bytes in finally.

Focused: pnpm vitest run tests/runOptions.test.ts tests/cli/options.test.ts
  tests/schema/resolver.test.ts — 96 passed across3 files, no retries/live tests.
Helper table covers Claude/Gemini/Grok/Codex substring collisions, casing and trim;
caller regression covers single and multi-model effective identities and aliases.
pnpm typecheck — PASS.
pnpm exec biome lint src/cli/options.ts tests/cli/options.test.ts
  tests/runOptions.test.ts — PASS,3 files, no fixes.
Primary review against frozen baseline and this contract: Standards PASS (small
existing public helper, no new abstractions); Spec PASS (qualified identity,
alias compatibility, browser inference untouched). No blocking findings.
No installed runtime acceptance or provider transport call claimed.
Memory disposition forbidden: no explicit memory-update request.

## Explicit review and PR preparation

Frozen comparison: git diff 97f5638ef5a75cc5c26620096cd86ea441aff2ba...a161b29e55e361e5db127c0843c628cd0240c751.
One implementation commit; clean worktree. Primary serial review, no delegation.

### Standards

Architecture guardrails0008, testing policy0029, documentation control0009 and
Fowler smell baseline reviewed separately. No accepted violations or smell
findings. Existing resolver owns classification; no parallel registry or wrapper.

### Spec

Plan0399 scope is the frozen contract. Slash-qualified IDs bypass fuzzy aliases
and lowercase normalization; single/multi-model caller regressions preserve
transport-facing effective identity. Existing alias and schema tests stay green;
browser-label inference is untouched. No accepted missing requirements or scope
creep. No additional validation run: prior checks remain bound to unchanged source.

Summary: Standards0 accepted findings; Spec0 accepted findings.
Tracker setup file docs/agents/issue-tracker.md absent; skill recommends
/setup-matt-pocock-skills. Existing explicit repo target and spec suffice here.
No PR template present. PR preparation does not authorize merging or installation.
