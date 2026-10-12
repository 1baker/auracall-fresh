# Issue253 provider process handoff

The renewed native attempt failed before Send with provider_session_provenance_missing and browser process unknown. A provider-free regression now reproduces that exact symptom through submitChatgptDeveloperApp → runBrowserMode → legacy affinity → provisioner → remote account authorization. Browser transport, service discovery and storage are hermetic fixtures; the actual authority and lifecycle run. No provider submission or new wake occurred.

## Feedback loop and minimization

Command: `pnpm vitest run tests/browser/chatgptDeveloperAppLifecycle.test.ts -t 'carries managed browser provenance'`.

Initial red29ms/2.87s total; reduced red25ms/2.51s total. Remove inherited model/project/conversation/composer configuration: same provenance_missing/pre_effect/processunknown. The minimal case retains one configured account, tab affinity, a qualified loopback endpoint/process, one target and missing legacy PID metadata. Full original configuration is retained as a green regression variant. See red.log and green.log.

Ranked predictions, shown before probes: (1) qualified service PID is discarded by affinity; carrying it should restore authorization without PID metadata, (2) missing fallback metadata triggers failure; supplying it should pass unchanged code, (3) independent account failure would remain after restoring provenance. Single-variable live PID-file fixture made unchanged code pass; restoring absent metadata failed again. Carrying service provenance then passed with absent metadata. Wrong-account fixture remains pre_effect/dimension_conflict; unknown browser process remains pre_effect/provenance_missing.

## Cause and repair

BrowserService already returns browserProcessId from qualified managed browser discovery. Affinity endpoint projection omitted it; provisioner reduced endpoints to host/port; legacy runner did not carry updated authorization. Remote execution therefore relied on legacy PID metadata instead of the service's known process. Preserve PID and managed browser directory through provisioned endpoints, bind authorization to that endpoint and leased target, and pass it to the real remote runner. Never substitute the CLI lease-owner PID. Authority, account checks and arbitrary-remote-host fallback restrictions remain unchanged.

This reproduces and repairs the source failure pattern. Historical PID-file state for the native failure was not captured, so that particular fallback cause remains unproven. No claim of installed/native response acceptance follows.

## Validation and bounded review

Focused:44 tests5files passed, including original/reduced successful fixture, absent process, wrong account, existing arbitrary remote host and original affinity/provisioner ownership cases. Scoped biome lint, typecheck and full build passed. No debug logging added. No temporary production instrumentation or browser recovery.

Fixed comparison:9cfea5931983522054c6f1891297ef23702f4710 to this patch. Standards review: narrow ownership-preserving handoff, no accepted blockers. Spec review: exact missing-provenance symptom caught and corrected; no accepted source blockers. Installed runtime is unchanged at87a779dac; Issue253 and Plan0405 remain OPEN pending promotion and a separately authorized native completion. Both prior native intents remain exhausted; never retry them.

Memory disposition:forbidden, no general memory-write authorization,0writes.
