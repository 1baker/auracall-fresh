# Issue253 coordinated response observation

Native attempt3 sent once and completed a provider response; the CLI failed with Desktop control busy after effect_observed. The original process subsequently disappeared; its exit actor remains unknown. This source repair does not turn that failed receipt into success.

The real waitForAssistantResponse / guarded CDP / DesktopControlGate seam reproduces the error without a browser, network, human owner or second client. An awaited renderer observer holds automation admission while its parallel snapshot watchdog tries to acquire the same display. A 3500 ms transport observation produces the exact busy error; changing only that observation to immediate completion passes on unchanged production source. This isolates overlapping command admission rather than a foreign owner in the fixture; it does not establish historical actor attribution.

Transport records which client/domain actually has command admission using a WeakSet. Response collection on that Runtime uses existing bounded polling instead of a long awaited renderer observer. All commands still pass through the existing admission gate. Uncoordinated Runtime retains the existing observer/watchdog path; human ownership still excludes observation. Response boundary, completion stability, passive probe and response incoming callbacks remain in the existing poller.

Validation: 6 files, 103 passed, 1 skipped; typecheck, scoped lint, full production build and diff whitespace check passed. Standards review: no accepted blockers, canonical transport owns coordination fact, no ownership bypass. Spec review against Plan0405: actual response seam is red before the repair and green after, ordinary observation and human exclusion tested. Review performed serially by primary agent, no independent reviewer claimed.

Installed promotion and fresh native collection are separate gates. No new prompt, provider retry, or wake is authorized. The app-test path also has a fixed 120000 ms response deadline; attempt3 completed later. That separate duration limitation is recorded for diagnosis, not silently changed or claimed as the cause of the observed busy failure.
