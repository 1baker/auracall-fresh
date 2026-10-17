# Provider login and qualification ownership repair

User report: two LitScout sessions and an IM Receipts session could not qualify
ChatGPT because AuraCall refused browser ownership. Current installed doctor
reproduced the exact missing-native-receipt failure. A read-only Remote View
window census found no window for the current process on either ready desktop.
A local-only doctor result of missing provider proof was not sign-out evidence.

Manual login discarded the native desktop selection from the immutable browser
launch plan. Its generic launcher could create a live process outside the selected
desktop and omit the native receipt expected by ordinary work. Login option
resolution and browser-tools now carry the selected browser configuration into
manual login; the package helper accepts the selected launcher. Native login uses
launchNativeDesktopBrowser, preserves configured desktop placement, and never
falls back to the generic launcher after a native failure. Ordinary login retains
its existing launcher. Native handles expose no child-process object; the adapter
uses the existing launcher-handle contract consumed by the package helper.

Direct ChatGPT getProviderSessionProof also skipped the utility-affinity boundary
used by identity reads. Once ownership was restored, the installed doctor reached
that path and failed its required traffic-governor check. The ChatGPT service now
wraps an unscoped proof request in the existing read-only utility operation; an
explicit caller target remains on its existing path without another acquisition.
The change supplies custody and admission rather than disabling either guard.

Two public-seam regressions went red before these repairs. Final validation:
48 tests across9files passed; full typecheck and compiled TypeScript exited0;
affected lint and diff checks pass. Exact-target preservation and no generic
fallback are covered. Primary serial Standards and Spec review against527016b74:
no accepted blocking findings; no claim of a general runtime-adoption redesign.
Agent Browser source was inspected for census and generation-bound recovery,
including runtime_adoption.rs and runtime_owner_transfer.rs. Its installed browser
inventory currently returns protected_browser_owner_observation_invalid; source
mechanisms alone are not proof that all installed recovery surfaces are healthy.

Runtime: five narrow compiled module replacements have prior bytes and SHA256
rollback records; the API process was not restarted or the full branch promoted.
Fresh quiet checks found no active profile leases/operations before the previously
authorized exact-browser restart. Managed profile data/cookies were retained.
A new native process verifies against current process and desktop evidence.
Installed BrowserAutomationClient.getProviderSessionProof then returned verdict
match, with expected identity and observation present, in11542ms. No prompts,
OAuth reconnections, cookie reseeding or scheduler controls. Main API retains
paused scheduler,17paused completions and0queued/running.

Private evidence is under
~/.auracall/diagnostics/plan0411/native-login-repair-20261017/: installed-delta.json,
qualification-installed-delta.json, relaunch-qualified.json, installed-doctor.json,
and installed-qualification.json. The reused legacy relaunch helper contained
hardcoded old PID fields and overwrote an earlier receipt filename; its raw output
is retained, and relaunch-qualified.json explicitly separates current facts from
those stale fields. Earlier measured recovery facts remain in the committed ledger.

Stored PIDs/ports remain locators to revalidate, never independent ownership proof.
These fixes stop two paths from bypassing shared setup. They do not establish
authority to adopt an arbitrary process merely because its profile directory
matches, and do not prove the blocked client tasks have already retried. Next:
retry qualification through the installed AuraCall path in each affected session.
Persistent processes that imported old modules need a fresh invocation to load
the patch. Broader source integration/issue closeout remains separate.
Memory disposition forbidden: no explicit memory-update authorization.
