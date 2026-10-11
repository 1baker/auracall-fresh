# Plan0393 installed inventory acceptance

Issue: https://github.com/ecochran76/auracall/issues/225
Source: PR248, integrated c629aeb0ca666ee633bd7ff0e1475e6cf29f00b8.

The current ChatGPT settings surface omits the labeled Developer-mode switch. Requiring that separate UI observation discarded complete authenticated app inventory. A public adapter readState regression reproduced the error in 2.26 seconds before the fix. One bounded observation now returns null (text: unknown) when the control is absent. Genuine navigation/transport failures remain errors; create and replace still require affirmative Developer mode and existing account/inventory guards.

Validation passed 53 focused and 26 adjacent tests, typecheck, build, scoped lint and diff hygiene. Four lint warnings concern canonical external CDP method names. Independent Standards and Spec review accepted the source and installed inventory with zero findings. GitHub reported no CI checks or runs; remote CI is not claimed as passing.

Only the two changed compiled provider/CLI modules were promoted into the existing AuraCall0.1.1 user runtime, with before hashes and rollback copies retained privately. This is a scoped module installation, not a claim that the entire runtime matches the integration commit. Dependencies, wrappers and services were preserved.

The original installed `auracall --profile wsl-chrome-3 apps list --json` exited 0: complete inventory, 26 apps, Developer mode null, expected account match and the exact enabled Im Receipts app retained. Independent review checked raw output and both installed artifact hashes. No provider prompt or app mutation ran. Create/replace live acceptance and complete linked-auth status are not established.

Private diagnostic, installation and qualification receipts remain outside the repository under the operator state diagnostics/issue225 directory. They include exact artifact hashes and rollback custody; account and app identifiers are omitted here.
