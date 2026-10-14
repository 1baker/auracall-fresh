# Plan0411 project-budget yield review

Primary serial review, no delegation. Source checkpoint eadaf2448 is preserved;
comparison base is integrated b021592252951a335438a10bf8f5384df82f3658 after
reconciling the context repairs. Journal conflict was resolved by retaining both
dated histories; no code conflict or acceptance-history rewrite occurred.
Spec: Plan0411 checkpoint9 and current discovery/continuation scope.

## Standards

Apply AGENTS.md, CONTEXT.md and architecture, testing, documentation, integration
and validation policies plus Matt's smell baseline. The owning collector uses
existing shouldYield and governor snapshot interfaces; no public API or budget
setting is added. Caller yield remains authoritative, and absent navigation
budget preserves existing behavior. Only index/page_navigate exhaustion yields;
other phase/kind counters are not conflated. Adjacent work-key formatting changes
have no semantic effect. The new fixture uses synthetic account identity.

Public collector and actual governor/traffic plan are exercised; the provider
client models external transport and emits one physical navigation admission per
project. Serialization/reload of previous evidence verifies continuation instead
of a private helper's option shape. No accepted blockers.

## Spec

At the existing one-navigation index budget, a second project attempt must not
become an over-budget failure that discards collected progress. Yield preserves
first-project rows, truncated=true and nextProjectIndex=1. A fresh bounded cycle
resumes only the second project and completes the cursor. The test fixes budget1
and retains maxPageReads4; it does not raise native or logical budgets.

This source loop proves a between-project continuation defect. The historical
native exception was not conclusively localized to that loop; reviewed installed
replay remains the attribution gate. A successful partial refresh alone will not
prove whole-account completeness or changed-frontier/materialization acceptance.
Current original context/terminal acceptance is a separate already-passing gate.
No accepted blockers.

## Validation

Fresh pre-merge122checks/five files; reconciled91checks/five files, focused
physical-navigation case after synthetic identity cleanup, typecheck, full build
and touched Biome pass. Journal merge preserves renewed bounds, failed receipts
and prior counters. Raw provider/cache evidence remains private outside Git.
One paced installed discovery replay follows integration/promotion, with all
unrelated pauses preserved and only production-qualified new custody observed.

Accepted findings: Standards0 / Spec0; no accepted severity on either axis.
