# Plan 0391 inactivity checkpoint

Stopped at the user-requested three-hour boundary; the goal is incomplete. Fresh budget read: 1,448,062 tokens and 10,701 active seconds, against limits of 2,000,000 tokens and 10,800 seconds. Budgets were not reset.

AuraCall source is committed and pushed on `feat/issue240-named-desktops`, checkpoint `3a91ee213f8e9ebc9908f43edc4ed2e68dcd0e4b`; PR 244 remains draft. RemoteView PR 346 merged at `c988cf624da81dfdb03abd08283279ff9a50614d`; its source checkpoint `28baf0359378d5ff369e3401c2cf0f8282c7effa` is an ancestor of canonical main. Planning PR 243 was merged earlier.

The implementation pauses automation during actual admitted external keyboard/mouse input and requires provider-confirmed inactivity revocation after 120 seconds before releasing the automation gate. The client then mounts an observe-only viewer; taking control again requires an explicit action. Uncertain provider state retains the gate. Multiple named desktops remain independently scoped.

Validation: AuraCall typecheck, build, focused lint and 20 tests across 11 files passed. RemoteView final offline suite passed 372 tests with 10 ignored, strict Clippy and formatting passed. The rendered native fixture exercised HTTP and WebSocket input and provider-clock expiry. This fixture advances the test clock; it does not establish a real installed two-minute wait. See `2026-10-09-plan0391-input-inactivity-source-validation.json`.

No inactivity revision was installed. Fresh installed AuraCall metadata still identifies `cdb767f86942c57af03579604028ee5f2f647da5`, and auracall-api.service is active. The existing Research PID 16248 and Writing PID 17293 matched their retained manifest process identities and were preserved. The task-owned fixture Chrome root 58799 and its eight attributed processes were removed and absence verified; shared daemon and other browsers were preserved. Private runtime and cleanup receipts are `/tmp/auracall391-inactivity-runtime-checkpoint.json` and `/tmp/rv391-inactivity-browser-cleanup.json`.

Next packet: install exact integrated provider and AuraCall source while preserving existing desktops, markers, account state and unrelated work. Prove a real 120-second idle transition and automation admission on both named desktops, including continued-input pause and explicit re-take behavior. Obtain independent root-view acceptance. Only then qualify and integrate PR 244 and close the outstanding tickets/plans. Do not repeat preparation, reset markers, or infer runtime acceptance from source tests.

Memory disposition: forbidden. Developer instructions allow memory writes only when explicitly requested; no such request was made.
