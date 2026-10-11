# Plan0402 launch precedence characterization

Baseline: `e3d6d94c1388ce0b1640efeacdc90ba33d484508`.
Public seams: `createConfiguredStoredStepExecutor` with injected browser execution,
and `resolveBrowserLaunchPlan` using the exact captured affinity configuration and
step intent. Expectations are fixture literals, not recomputed resolver output.
No browser launch or provider request.

## Result and disposition

The approved decision was to preserve current behavior first. No proposed field
has a generally equivalent replacement in the existing immutable plan. The
maintenance refactor is parked; characterization is complete. This is the plan's
stopping rule, not an implementation of launch-plan convergence. Production code
is unchanged. A future convergence decision must explicitly choose precedence and
source-cookie/managed-profile semantics; this packet does not authorize it.

| Field | Stored options in conflicting fixture | Existing launch plan |
| --- | --- | --- |
| executable | `/runtime/chrome` | `/browser/chrome` |
| source name, canonical runtime field | `Runtime Source` | `Global Source` |
| source name, legacy runtime alias | `Runtime Legacy` | `Global Source` |
| source name, runtime source absent | `Browser Source` | `Global Source` |
| source cookie, canonical runtime field | `/runtime/Cookies` | launchPolicy `/browser/Cookies`; typed source cookie null |
| source cookie, legacy runtime alias | `/runtime/legacy/Cookies` | launchPolicy `/browser/Cookies`; typed source cookie null |
| bootstrap cookie | `/runtime/bootstrap` | launchPolicy `/browser/bootstrap`; typed source bootstrap null |
| display | `:72` | `:73` |
| managed root | `/runtime/managed` | `/browser/managed` |
| managed directory | `/browser/managed/selected-browser/chatgpt` | same; already consumed from plan |
| source root | absent from stored options | `/browser/source` |

The selected runtime is `selected`, selected browser profile is `selected-browser`,
and provider is ChatGPT despite default Grok and a stale global Grok directory.
The existing provenance regression additionally checks that stale directory is
absent from the complete emitted options. New cases cover canonical-over-legacy
source intent, legacy aliases, and browser-profile fallback.

Authorization remains outside the immutable snapshot and is mutable. Its source
name is `Runtime Source` for canonical input, but `Browser Source` for legacy
runtime input: authorization does not currently use runtime `chromeProfile` as a
source-name alias. Preserve this discrepancy rather than silently changing account
provenance during launch cleanup. Model/tool, recovery, runtime evidence and
artifact semantics remain covered by the existing executor suite and untouched.

The relevant resolution path is runtime affinity configuration flattening, then
launch-plan resolution. Browser-profile executable/cookie/display/root defaults
can win during flattening, while the preexisting global source name can remain.
Stored option reconstruction independently gives runtime values precedence.
Typed plan cookie paths are separately gated by cookieSync. Environment overrides,
automatic discovery, effective display/root normalization and managed subprofile
selection also belong to resolved launch policy; replacing raw options with that
policy would move these decisions earlier. These are reasons to require an explicit
convergence contract, not additional behavior changed here.

## Validation

- Focused baseline: `pnpm vitest run tests/runtime.configuredExecutor.test.ts tests/browser/browserLaunchPlan.test.ts tests/browser/browserLaunchPlanStructure.test.ts`.
  39 passed in three files, including three new characterization cases.
- An initial characterization expectation incorrectly predicted Browser Source;
  observed output was Global Source. Corrected the expectation to the unchanged
  baseline. This was a discovery correction, not a product defect or TDD red.
- Six independent temporary projections replaced one emitted field at a time with
  its launch-plan value. Each fails at least one new case; see `mutation-results.json`
  and `mutation-*.txt`. Original source is restored in a finally block.
- Typecheck and targeted lint are recorded in the adjacent validation receipt.
- No live/soak run, installation, lease acceptance, wake, or provider submission.

## Standards

Pinned review: `git diff e3d6d94c1388ce0b1640efeacdc90ba33d484508...HEAD`.
Standards: AGENTS.md, CONTEXT.md and repository architecture/testing/documentation
policies. Primary review is serial; no delegation. Literal fixture values exercise
public seams; no production wrapper or unrelated cleanup. Accepted findings: none.

## Spec

Spec: Plan0402, including accepted preserve-behavior decision and stopping rule.
All launch-owned fields mapped; provenance/source-vs-managed separation and
mutable authorization protected. No equivalent duplication can be removed without
changing at least one supported fixture; park the refactor rather than relocate
the chain. Accepted findings: none. No production convergence claim.

Repository `docs/agents/issue-tracker.md` is absent; review used the supplied plan
and repository forge policies. `/setup-matt-pocock-skills` can restore that optional
skill-routing document separately.

Memory disposition: forbidden; no explicit user request to update durable memory.
