# Primary serial Standards and Spec review

Compare opening-custody patch against2fb6f4a33. Spec: Issue253/Plan0405 and operator requirement that desktop interaction ownership must not prevent opening. Standards: architecture guardrails, browser custody/runtime-proof and testing discipline.

Standards PASS: separate process/assignment proof for opening from current window proof for interaction. Shared process parser retains exact profile matching; current boot/start/executable and assignment/display qualified. No unguarded endpoint fallback on failed native custody. No input gate bypass or automatic record reclamation.

Spec PASS for source packet: real CDP wire regression red when retained scrubbed process loses current window; green permits exactly one createTarget, rejects Page.reload until window returns, rejects changed native generation and process receipt.29 tests in7 files pass. Pool growth/wrap and prior control protections remain covered.

Correct hypothesis: requiring a current window before creation of its replacement made opening depend on interaction proof. Historical browser exit actors remain unknown; live native acceptance is pending.
