# Issue253 current app composer diagnosis

Original installed PR283 no-submit run: browser survives, native command exits1 before any prompt at editor-not-found. Captured private DOM shape (no text/auth) is at ~/.local/share/litscout/research-notes/live-demo-campaign-20261011/demo10/composer-fixture-shape-private.json, observed2026-10-11T22:16:44.722Z.

Fast command: pnpm vitest run tests/browser/chatgptAppComposer.test.ts. First run red exact editor-not-found;1failed/1passed,1.80s. Adding only legacy ID is passing control. Minimal load-bearing distinction is missing legacy ID on current rich composer.

Ranked predictions shown before fixing: obsolete ID (rich shape fixes), wrong visible/modal targeting (reject hidden/dialog), ambiguity (multiple candidates must stop). Existing code failed captured rich shape; new precise shared lookup qualifies it and rejects negative shapes. Injected expressions execute in VM DOM fixtures; no browser/provider effects.

Source repair extends clear plus app mention selection/readback on same flow; current conversation read uses same existing rich selector authority. Missing clear readback cannot pass or cause a second clearing attempt. No prompt retry, OAuth/config/gate changes or exit attribution.
