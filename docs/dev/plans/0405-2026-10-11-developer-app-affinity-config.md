# Plan0405 | Developer-app affinity configuration (#253)

State: OPEN
Lane: P90
Integration: merge
Work items: #253
Owner: ecochran76; primary agent, serialized implementation.
Branch: fix/issue253-startup-close-settlement
Target: main through PR merge
Base: 9b324b3dc7d3f8f1ec50e3888f02e71c39047e02

## Current State

PR286 current composer/picker/mention repairs installed055e69d26. Latest no-submit stops earlier at immediate startup close confirmation; replacement lease retained, no prompt. Later only replacement page remains, but original startup ID was not captured, so historical cause unproven. Public coordinator regression reproduces exact failure on acknowledged asynchronous close. One close request now followed by at most2s read-only confirmation; absent target succeeds, present/changed/stalled confirmation retains replacement idle custody.47 focused +2 production-boundary tests/typecheck/lint/build/serial review pass; installed/native acceptance pending. Original once-only prompt remains gated.

## Scope and seams

Pass full selected resolved configuration from submitChatgptDeveloperApp to BrowserRunOptions affinity admission when the launch plan selects tab-affinity. Preserve fresh Chat/current posture, exact app/account checks, provider governor, desktop control and structured effect outcomes. Public seams: submitChatgptDeveloperApp and its supported runBrowser injection; the real guard reproduction is retained separately. No lease/control redesign.

## Acceptance and definition of done

- Hermetic red/green proves exact selected configuration despite a conflicting default; no browser/provider effects.
- Non-affinity lifecycle, app/account and conservative failure evidence tests pass; typecheck/build and scoped lint pass.
- Serial Standards and Spec review against frozen base and accepted issue brief.
- PR integrates exact source; installed runtime identity and feature preservation verified.
- Coordinate one bounded installed test with LitScout; record actual result and exact incomplete gates rather than treating removal of one error as full success.
- Close issue only when its configuration outcome and coordinated test are qualified; separate unrelated readiness/governor/control incidents.

## Non-goals and boundaries

No app recreation, OAuth reset, implicit prompt retry, ownership-file edits, browser restart or bypass of gates. Do not attribute unknown exits. No memory-write authorization. LitScout selects safe existing app/account and guards its drafts; provider submission waits for the coordinated bounded acceptance handoff.

## Revision | Browser opening independent of input control

Operator clarified that AuraCall must grow/shrink available desktops and wrap at the configured maximum without input-control ownership blocking browser opening. Existing allocation already implements configurable growth/wrap; the downstream launch and Target.New gates incorrectly imposed input ownership on opening. This revision removes only those opening gates. Pool/profile custody, explicit target-acquisition authority and subsequent existing-page interaction gates remain intact. Installed corrupt ownership and transition files are preserved; cleanup is not this source repair.

Fresh browser opening and new-target creation each failed red against a malformed input record. The six focused native/control/app files pass25 tests after separation, including configurable pool capacity2/4, wrap and shrink guards. Installed acceptance remains separate and must distinguish opening from subsequent input admission.

## Installed opening readback

PR278 merged as ae2d56422. CLI wrappers use user-runtime-issue253-opening; compiled parity is590 files with0 mismatches. API reloaded to the new wrapper, active/running PID47468. Existing managed browser PID96300 retains OS start35926802; the zero-byte input ownership record retains its exact mtime. LitScout has begun one bounded no-submit acceptance, with opening and subsequent input admission reported separately. Full Issue253 native acceptance remains pending.

### Native opening outcome

LitScout performed one original installed no-submit app test. Primary independently inspected its readback and stderr: one new ChatGPT page was observed, total CDP targets4 to8, no original target removed, browser PID preserved. The command exited1 at subsequent DesktopControlGate.owner JSON parsing of the retained empty input ownership record. No submission intent/result exists. Opening accepted for this bounded check; full app automation and Issue253 remain unaccepted. No retries or ownership recovery performed.

## Revision | Ownership record validation and publication

Repair raw parser crashes through the public gate seam: malformed, structurally invalid and missing-owner-in-existing-lock states preserve custody and reject with explicit recovery guidance. Publish newly acquired ownership through a private pending file and atomic rename. This prevents visible partial records; it does not attribute or recover the installed unknown owner/transition. Native app acceptance remains separate.

### Installed ownership repair

PR279 integrated bdade2d5f14af972b74e0b4b05157f61b804ec71, validated source212f3ef489f3574172bb1c9129b4c0698f319e47. New CLI/API runtime user-runtime-issue253-control has590 compiled files with0 mismatches. Installed isolated repro passes: explicit invalid-ownership error, effects0 and original bytes preserved. API active/running PID43910; managed browser PID96300 OS start35926802 unchanged. Live owner remains0 bytes with originalmtime and retained transition. No live app retry or provider submission performed; recovery still requires qualifying unknown ownership, so full Issue253 acceptance is open.

### Explicit installed control recovery

Operator authorized continuation after identifying recovery as the remaining boundary. Fresh checks found unchanged empty owner/transition, no native control receipts or LitScout app-test process, and no visible response/tool-wait indicators on the retained page. Original human/automation owner remains unknown. Quiesced API and moved only the exact unchanged gate and transition to private diagnostics by rename, retaining original owner inode10851505 and transition inode10801107. Browser PID96300/start35926802 preserved. API resumed active/running PID18375. LitScout is running one no-submit native app acceptance; provider submission stays on hold.

### Recovered native outcome

Single original installed no-submit command terminal exit1: Developer mode switch timeout after280ms. Ownership parser failure is no longer the first boundary. One new ChatGPT page, no original target removed, native JSON0 bytes and no submission intent/result. Account/app selection unverified. Primary inspected stderr and postreadback independently. Read-only current UI evidence requested; no repeated native test or provider submission. Source requests8000ms at Developer-mode wait, so observed280ms remains an unqualified deadline/runtime boundary rather than proof that the setting is absent. Full Issue253 acceptance remains open.

## Revision | Optional Developer-mode observation timeout

Fast public adapter readState reproduction captures complete fixture inventory then times out its last Developer-mode evaluation. Treat only the shared typed predicate-evaluation timeout as unknown Developer mode, preserving inventory and transport/navigation/cancellation errors. Existing-app test still requires exact account/app and complete inventory; create/refresh still require confirmed enabled mode. Native acceptance will first verify no-submit selection, then one bounded once-only prompt with LitScout if prerequisites pass. No implicit retry or uncertain resubmission.

Goal execution budget starts2026-10-11T21:50:44Z; stop with durable checkpoint before2026-10-11T23:50:44Z or1MM tokens.

### Installed optional-mode repair

PR281 integrated cd02026d147fcfe7e1923b0532d2c4e1dbbffc63, CLI/API user-runtime-issue253-mode,590 compiled files0 mismatches. Installed readState harness retains complete inventory/mode unknown across39 polls and restores route without provider effects. API activePID54798. Prior browser PID96300 is now absent and registry no longer binds its managed browser; exit actor unknown. LitScout confirms no pending submission intent/result. One native no-submit run authorized with fresh managed opening and120s outer guard; exact new process/receipt qualification required before once-only prompt acceptance.

## Revision | Opening custody without an existing window

PR281 installed and hermetic mode deadline qualified. Fresh native no-submit and one instrumented reproduction failed at current native window/PID join; no prompt effect. A real wire fixture reproduces rejection of createTarget after an exactly retained scrubbed process has no current window. Opening now qualifies retained profile/PID/start/boot/executable and current assignment launch environment/display. Existing-page commands still require current window proof and input ownership. Reuse and root-placement interlock retain process custody even with no current window.29 tests in7 files pass, including changed process/native generation rejection. Build/install/native acceptance pending.

### Installed opening custody

PR282 integrated fd15308b4eba42d5c97cb4d08b499dff52afd53d,590 compiled files0 mismatches at user-runtime-issue253-custody. Installed actual-wire harness passes opening without current window, preserves interaction window requirement and rejects changed process. API PID27316 active. One native no-submit original app/account test authorized with120s outerguard; no tracer or prompt effects. Once-only original frozen Demo10 prompt waits on verified prerequisites.

## Revision | Replacement-first cold-start handoff

One PR282 native run and one diagnostic repro were terminal without submission. Selective trace confirms live exact process becomes zombie before environ EACCES/exe ENOENT; no scoped nonzero kill call observed. Public coordinator fixture reproduces close-before-open browser exit. Open, reserve and account the replacement first, then revalidate/retire the selected incompatible startup target. Creation failure leaves startup intact; retirement failure retains replacement under idle settled lease. Do not interpret historical process exits as attributed to this source path without exact evidence.

### Installed cold-start handoff

PR283 integrated e6199c06c485484e97b03ac74bd3ff5bfb0c65b9, user-runtime-issue253-handoff CLI/API with590 compiled files0 mismatches. Installed public coordinator fixture proves replacement lease/accounting precedes startup retirement and browser remains alive. API PID7026 active. One original no-submit native acceptance authorized with120s outerguard, no trace instrumentation; once-only submission remains gated on exact app/account/composer/process qualification.


## Revision | Current rich app composer

No-submit native fixture at2026-10-11T22:16:44Z records one empty rich DIV, contenteditable true, role textbox, aria-label Ask ChatGPT, data-composer-markdown, FORM ancestor, no id/testid, outside dialogs. Clear readiness and app mention path incorrectly require legacy prompt-textarea ID. Regression executes actual injected expressions at public clear/mention seams; adding only legacy ID is passing differential control. Share the existing precise rich selector with conversation reads. Require one visible enabled composer-owned editor outside dialogs, reject missing clear readback, preserve trusted input, exact app identity and fresh-chat guard. No new prompt, implicit retry or broad editor fallback.


### Installed rich composer repair

PR284 integrated b188ae01493209fce88f9ad3da4ce2248f078844, validated806c968c12f426531efff01684aa0ddc5e5edb49. CLI/API use user-runtime-issue253-composer;591 dist files0 mismatches/extra. Installed public clear/mention fixture verifies current no-ID shape, trusted clearing and exact app identity without provider effects. API PID50673 active, KillModeprocess preserved. Before promotion browser8872 was already absent with stale registry retained and CDP unavailable; actor unknown, retained draft unknown, last observed empty22:16:44Z. LitScout confirms original intent/result absent. One canonical no-submit native test authorized with120s guard; no manual stale-state recovery or provider submission.


### Native rich composer outcome and picker diagnosis

Original PR284 no-submit terminal exit1/session15675, JSON0bytes: Visible selector not found .popover .__menu-item[tabindex] after native @LitScout insertion. Composer clearing advanced; exact app selection remains unqualified. Fresh browser53930/start39054099 alive. Current target5B927463445DE29431D89B1CB3DE050A screenshot/DOM at22:29:27Z shows empty editor, no picker, zero app pills. Source selectForTest finally clears the native-created mention draft; current absence does not prove trigger-time absence. No original Demo10 intent/result. One scoped no-submit reproduction with bounded read-only observer authorized under active diagnosis goal after account/empty composer/prior-unsent checks; never submit or bypass control.


## Revision | Current app-picker row qualification

Trigger-time observer captured exact native mention draft plus app row at22:32:20.139Z, then same-name custom GPT22:32:21.792Z. Actual current row BUTTON has CSS --app-menu-item-height marker, no legacy menu role/id/tabindex. Source old selector deterministically cannot qualify it. Preserve current rich editor qualification; wait for exactly one visible enabled current row matching installed name+description, or one exact-label legacy row, then click only marked choice and verify app pill identity. Current row without installed description is unqualified because a same-name GPT can arrive first. Carry description through both no-submit and submission paths; never replace exact plugin identity with text proof. Browser-native acceptance still required.


### Installed current picker qualification

PR285 integrated b68bec2408caa08b4694d2473ff5e9f4c131a0a5, validated284943b9b2905c928ea2ecbfbb77c65db291a3ba. CLI/API user-runtime-issue253-picker,591files0mismatches/extra. Installed public submission boundary verifies selected full config plus installed description,1invocation/0provider effects. Original browser53930 absent before API promotion, actor unknown. API KillModeprocess preserved. LitScout one original no-submit test authorized with bounded read-only trigger observer to capture selected pill before finally cleanup; no original prompt until account/app/composer/process/native receipt qualifies.


## Revision | Current app mention identity

Native trigger22:46:04.310Z target66C68BA235702AD0CCD94FAF886FC3A8 shows exact original app pill SPAN with app-mention-name and canonical app:// app-mention-path; no legacy inline-selection/data-symbol. Post-terminal22:48:18.998Z proves original target retained, browser9470/start39172750 alive, empty composer and no app pills; original Demo10 intent/result absent. Captured post-selector/readback regression catches old selector despite successful exact app click. Recognize current semantic attributes, parse only a complete canonical app URI token, preserve exact accepted identity before Send and count both modern/legacy mentions in pristine/clear guards. No mixed/unknown mention acceptance or implicit retry.


### Installed current mention identity

PR286 integrated055e69d2684c620a49ca0d8a84745dc1272043aa, validatedcb3097b4ad75ecbed4ee30d43b264969c7dba6e2. CLI/MCP/API user-runtime-issue253-mention with591files0mismatches/extra. Installed clear/readback/pre-Send boundary passes legacy/current identity and foreign rejection, no provider effects. Prior browser9470 already absent before API promotion, exit actor unknown. KillModeprocess preserved. One original no-submit test with read-only observer authorized after fresh readiness/account/empty/unsent checks; original once-only prompt remains gated.


## Revision | Bounded startup close confirmation

Latest native run holds replacement under lease9e66ce7c-cce5-406b-a04d-1a9fc7613402 after immediate old-target inspection remains present. Browser39770/start39272889 survives; later replacement4073D410C78617F45F8AFB6204FB8D8B is sole page. Startup ID was not recorded, so later state is not exact close-attribution proof. Strengthened existing public coordinator fixture goes red in372ms when close acknowledges and physical removal occurs50ms later. Wait at most2s for removal with per-read deadline and100ms poll, never resend close. Never-disappearing, changed URL and stalled inspector fail conservatively while replacement/browser custody is preserved. Native original acceptance still required.


### Installed bounded close confirmation

PR287 integrated f83205d4d1650fe600ddd7e1a25f6eeb77fc0945, validated a1d17c61f88ab9a061f6393e644ac694858bc90e. CLI/MCP/API use user-runtime-issue253-settlement;591 compiled files match exactly, no extras. Installed public coordinator boundary verifies50ms asynchronous removal, one close request, replacement leased/accounted before retirement, browser alive and zero provider effects. API active/running PID93031, KillMode=process after software-only restart. Browser39770 was already absent before promotion/restart; exit actor unknown. One original native no-submit acceptance with120s guard and bounded read-only observer handed to LitScout at23:15Z. Original frozen once-only submission remains gated on primary verification; no resubmission or new wakes. Stop/checkpoint before23:50:44Z.


### Native no-submit qualification and original once-only acceptance

Original native receipt completed app selection/clear, exact accepted URI captured before cleanup; fresh same process/account/home empty composer and zero pills verified. CLI remained alive until120s outer timeout; cause unknown, final no active app-test. Lease lost/restart-unverified with settled effects and null owners; no manual recovery. See [native no-submit evidence](../evidence/issue253-startup-close-settlement/native-no-submit.md). Primary independently verified evidence and authorized original frozen Demo10 once-only native submission with fresh governed prerequisites; monitor until completion or23:45Z and checkpoint before23:50:44Z. Full Issue253 acceptance remains open.


## Revision | Inventory-to-submission lease handoff

Original once-only native submit failed pre_effect/process-owned, null conversation and no Send; intent preserved and no retry. Public CLI/real utility/real provisioner fixture reproduces exact failure13ms with matched scope/currentTTL. Observe inventory under utility lease, close and await successful settlement, then execute shared validation/submission outside utility callback. Ownership rules unchanged; failed settlement/account/confirmation/incomplete/ambiguous gates stop submission. Original live invocation exhausted; full native completion remains open. See [diagnosis](../evidence/issue253-submit-lease-handoff/diagnosis.md).

Source lease handoff verification:61tests4files pass, scoped lint/typecheck/fullbuild pass. Serial Standards and Spec review each0 accepted blockers. Original native once-only acceptance exhausted beforeSend; no retry. Installation checkpoint pending.


### Installed handoff and bounded checkpoint

PR288 integrated87a779dac/validatedf4b0b8282; CLI/MCP/API user-runtime-issue253-submit-handoff,591files exactparity; installed real CLI/utility/provisioner fixture0provider effects. API56928 active/processKillMode/argv binds prefix. Browser95651 absent before restart, actorunknown. Finallease released/settled with restart-unverified reason; no manualtransition. Scoped Session152–163 membership unchanged, not wholeDB equivalence. Original once-only submit exhaustedpre_effect; full native completion OPEN. See [restart-safe checkpoint](../handoffs/2026-10-11-issue253-native-submit-checkpoint.md).
