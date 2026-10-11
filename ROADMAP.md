- Completed P88: [Plan0394](docs/dev/plans/0394-2026-10-10-memory-routing.md) makes AuraCall Graphiti routing discoverable and distinguishes unresolved routes from service failure; atlas publication and original-query retrieval verified.

- Completed P87: [Plan0393](docs/dev/plans/0393-2026-10-10-developer-app-inventory.md) repairs issue225 app inventory independently of missing Developer-mode UI; PR248 integrated; original installed inventory passes with 26 apps and independent review.

# Aura-Call Roadmap

- OPEN P86: [Plan 0391](docs/dev/plans/0391-2026-10-08-auracall-remote-view-client.md)
  and [its spec](docs/dev/plans/0392-2026-10-08-auracall-remote-view-client-spec.md) govern the dedicated AuraCall remote-view client with multiple configured
  desktops, independent root desktop and explicit coordinated control handoff.
  Current State: PR243 and provider PR346 are merged. Both runtimes are installed;
  two-minute never-used idle expiry passes. Compact real runtime-profile rail and
  canonical dormant Wake pass source and rendered validation; source d6d047f86
  is installed with seven real runtime profiles; real default/Grok Wake succeeds.
  Full native toolbar and single coordinated native mode switch remain open.
  Operator reports viewing works. Actual gateway input renewal, rendered idle
  transition, independent signed-in root viewing and PR244 integration remain open.
  Approved tickets stay #240 → #241 → #242.


- Completed P78 / issue 131: [Plan 0378](docs/dev/plans/0378-2026-09-29-chatgpt-rate-limit-terminal-reconciliation.md)
  adds bounded terminal reconciliation for delayed account-wide ChatGPT rate
  limits on the leased or sibling same-profile target. The source packet is
  provider-free and preserves non-retryable post-effect semantics; installation
  and live provider acceptance remain separately gated. PR 132 integrated the
  provider-free repair at `ec5c30030146f9622a2fe31fae73881330bf21de`.

- Completed P76 / issue 125: [Plan 0376](docs/dev/plans/0376-2026-09-28-root-chat-composer-mode.md)
  integrated the control-less root Chat composer repair through PR 126 at
  canonical `2321ab9a2`, preserving explicit Work evidence and Chat/Work
  selector separation. Issue 121 retains the separately governed fresh
  connector-plus-wake acceptance.

- Completed P75 / issue 123: [Plan 0375](docs/dev/plans/0375-2026-09-28-tab-affinity-workload-coexistence.md)
  integrated exact-tab coexistence through PR 124 at canonical `1398eadd7`.
  The installed smoke proved distinct foreground and history-materialization
  targets, then stopped pre-Send on the separate issue-125 composer drift.
- Open P55 / issues 93-98 and 100: [Plan 0362](docs/dev/plans/0362-2026-09-27-declarative-chatgpt-agent-workflows.md)
  governs the declarative, resumable ChatGPT agent-workflow campaign. Current
  state: explicit `wsl-chrome-3` provenance for issue 94 is integrated and
  installed-proven; terminal receipts, connected-capability selection, exact
  Library references, the published codex-wake continuation, soak attribution,
  effort-selector integration, and combined installed acceptance remain open.

- Provider-free accepted P73 / reopened issue 107: [Plan 0373](docs/dev/plans/0373-2026-09-28-library-cli-cache-persistence-bypass.md)
  makes the exact one-shot Library CLI return its completed provider inventory
  before account-cache context resolution or persistence. Account Mirror and
  general account-file listing retain their existing persistent path; no
  deadline, target, navigation, or retry semantics changed. One installed
  read-only acceptance returned promptly but produced an incomplete zero-file
  inventory. Full acceptance remains unresolved even though the live GitHub
  issue is currently closed.

- Provider-free accepted P72 / reopened issue 107: [Plan 0372](docs/dev/plans/0372-2026-09-28-library-lifecycle-diagnostics.md)
  carries a privacy-bounded stage and cleanup timeline through the exact CLI,
  configured-affinity, service, and adapter path. A whole-operation timeout can
  now distinguish affinity, duplicate service option construction, provider,
  cache, abort cleanup, and settlement waits without another budget change.
  Installed localization is separately gated.

- Provider-free accepted P71 / reopened issue 107: [Plan 0371](docs/dev/plans/0371-2026-09-28-library-provider-session-close-bound.md)
  applies the existing three-second CDP close bound to abort-driven borrowed
  provider-session close. A session that never closes can no longer keep the
  abort cleanup join pending until the later CLI watchdog masks the named
  provider-stage error; retained target semantics remain unchanged. Installed
  acceptance is separately gated.

- Provider-free accepted P70 / reopened issue 107: [Plan 0370](docs/dev/plans/0370-2026-09-28-library-single-read-deadline-margin.md)
  gives one exact-target Library read a 54-second shared operation deadline,
  five-second cleanup bound, and later 60-second watchdog. Explicit no-retry
  semantics prevent connection-shaped failures from repeating the provider
  read. Installed acceptance is separately gated.

- Provider-free accepted P69 / reopened issue 107: [Plan 0369](docs/dev/plans/0369-2026-09-28-library-deadline-composition.md)
  makes the 49-second shared operation deadline, five-second cleanup bound,
  and later 55-second watchdog explicitly ordered. Preflight plus provider and
  settlement latency can no longer let the outer watchdog mask a named inner
  result. Installed acceptance is separately gated.

- Provider-free accepted P68 / reopened issue 107: [Plan 0368](docs/dev/plans/0368-2026-09-28-library-terminal-result-cleanup.md)
  separates the provider result from bounded CLI client cleanup and caps
  configured utility governor/lease settlement at five seconds. A stalled
  settlement preserves the original provider-stage error and retains the
  unresolved lease fence. Installed acceptance is separately gated.

- Provider-free accepted P67 / reopened issue 107: [Plan 0367](docs/dev/plans/0367-2026-09-28-library-provider-inventory-liveness.md)
  bounds named provider stages and the complete Library provider operation
  beneath the CLI's 45-second deadline. A stalled CDP promise is raced against
  abort, the command-owned client is closed independently, and the exact page
  target remains unmodified. Installed acceptance is separately gated.

- Provider-free accepted P66 / reopened issue 107: [Plan 0366](docs/dev/plans/0366-2026-09-28-library-lease-recovery.md)
  closes the entire post-acquisition lease lifecycle and safely reconciles
  dead/expired prior ownership before adopting the verified exact Library
  target. Live owners and uncertain effects remain fenced; target creation,
  closure, refresh, and navigation remain forbidden. Installed acceptance is
  separately gated.

- Provider-free accepted P65 / reopened issue 107: [Plan 0365](docs/dev/plans/0365-2026-09-27-library-existing-target-exit.md)
  adopts one exact existing ChatGPT Library target without creating,
  refreshing, or unnecessarily navigating a page; closes exact-target CDP
  attachments that fail before handoff; and terminates the one-shot CLI after
  terminal output. Installed `wsl-chrome-3` acceptance remains separately gated.

- Provider-free accepted P64 / issue 110: [Plan 0364](docs/dev/plans/0364-2026-09-27-library-lifecycle-clock-ordering.md)
  keeps each ledger-backed browser interaction governor's reservation, start,
  and settlement timestamps nondecreasing when the host wall clock moves
  backward. The persistence ledger remains strict, and Library timeout,
  cancellation, cleanup, exact-profile, tab-affinity, and target semantics are
  unchanged. Installed `wsl-chrome-3` acceptance remains separately gated.

- Provider-free accepted P63 / issue 107: [Plan 0363](docs/dev/plans/0363-2026-09-27-library-cli-lifecycle.md)
  bounds the complete read-only ChatGPT Library CLI inventory to 45 seconds,
  forwards timeout and operator cancellation through the existing exact-profile
  and tab-affinity path, and boundedly joins resource cleanup before returning
  structured terminal failures. Provider-free fixtures, typecheck, build,
  scoped lint, and diff hygiene pass; installed `wsl-chrome-3` acceptance is
  deliberately withheld for a separately authorized effect packet.

- Completed P54 / issue 90: [Plan 0361](docs/dev/plans/0361-2026-09-27-chatgpt-composer-selector-drift.md)
  repairs the current ChatGPT add-context root, trigger, row, and connected-app
  mention shapes while preserving legacy fallbacks and retained-draft
  rejection. Provider-free acceptance and one bounded installed
  `wsl-chrome-3` run pass; PR 91 integrated the repair at canonical
  `54d747f6b`. The lane overlaps Plan 0360 only at shared ChatGPT composer
  source and does not change affinity, crawler, scheduler, or soak behavior.

- Active P53 / issue 49: [Plan 0360](docs/dev/plans/0360-2026-09-25-chatgpt-tab-affinity-rollout.md)
  operationalizes Plan 0359 for a guarded ChatGPT rollout. It adds sanitized
  Browser Ops/CLI/MCP affinity posture, explicit serialized rollback, durable
  soak receipts, and a real 24-48 hour acceptance window before any ChatGPT
  default enablement. Gemini and Grok remain serialized. GitHub Actions are
  skipped by operator direction while unavailable; local validation remains
  mandatory.

- Active P52 / issue 46: [Plan 0359](docs/dev/plans/0359-2026-09-23-browser-tab-affinity-multitasking.md)
  replaces managed-browser-profile-wide serialization of ordinary provider
  work with exact tab leases: one tab per conversation and one dedicated
  crawler tab per live-follow operation. It also unifies aggregate
  tenant/provider interaction accounting while preserving provider-warning,
  identity, CAPTCHA, uncertain-effect, and browser-profile control-plane hard
  stops. Packet 1 provider-free is owned on
  `feat/issue-46-browser-tab-affinity`; provider-free contracts precede ChatGPT
  integration and any installed/live acceptance. The lane is now closed and
  integrated; P53 owns guarded rollout and default-enablement evidence.

- P16 / issue 6 revision-8 recovery implements developer-app terminal response
  through the real shared local/remote lifecycle, with exact app selection,
  one Send and honest answer/identity/effect evidence. Provider-free validation
  and local commits only; integration, installation and live proof remain open.

- Active decomposition lane P46: [Plan 0353](docs/dev/plans/0353-2026-09-16-mixed-branch-decomposition.md)
  registers the process-owned mixed historical branch under GitHub issue 5.
  Its 24 unique commits route to issues 6, 7, and 9 or explicit historical
  dispositions; the branch must never be proposed as one pull request.

- Provider-free accepted and integrated P45: [Plan 0352](docs/dev/plans/0352-2026-09-12-chatgpt-app-security-approval.md)
  detects ChatGPT's single-`Allow` suspicious-instruction app-security dialog.
  Its historical developer-app shared-routing claim did not cross the real
  low-level boundary; issue 6/P16 owns that recovery. PR 13 integrated the replay at
  `61548857a`; installation and live acceptance remain separate.

- Live-accepted integrated P44: [Plan 0351](docs/dev/plans/0351-2026-09-11-chatgpt-current-latest-selection.md)
  recognizes ChatGPT's checked `Latest` row during read-only current-model
  observation. Exact install and one zero-retry LitScout app attempt reached and
  stopped at the real `approve_search_plan` product gate with no approval,
  provider, retry, or canonical DB effect.
  Canonical integration is `a47801d6a`.

- Live-accepted integrated P43: [Plan 0350](docs/dev/plans/0350-2026-09-11-final-live-acceptance.md)
  proves exact installed parity, unpiped identity, compact `6Pro` one-Send
  success, and a genuine distinct PDF with zero retries; canonical integration
  is `a8739e127`.

- Completed-with-terminal-evidence-finding P42: [Plan 0349](docs/dev/plans/0349-2026-09-11-installed-plan0348-live-acceptance.md)
  passed install parity, but piped identity JSON was truncated before parsing;
  prompt and artifact budgets remained unspent. Evidence is integrated at
  `ec538abd5`.

- Integrated P41: [Plan 0348](docs/dev/plans/0348-2026-09-11-chatgpt-compact-option-row-repair.md)
  reproduces the current compact `6Pro` row's submenu-like attribute shape and
  repairs terminal option selection provider-free at `c6b839c1e`, integrated
  at `96ed036b3`.

- Completed-with-terminal-finding P40: [Plan 0347](docs/dev/plans/0347-2026-09-11-installed-plan0346-live-acceptance.md)
  passed install parity and identity, but the only compact `6Pro` prompt stopped
  before Send in option selection. The artifact fetch remained unspent, and the
  terminal receipt is integrated at `f30107bad`.

- Integrated P39: [Plan 0346](docs/dev/plans/0346-2026-09-11-chatgpt-current-live-findings-repair.md)
  accepts compact `6Pro` semantically while preserving the raw label and
  requires fresh expected-variant binary proof for Deep Research exports.
  Published topic `4fd2d1a99` is integrated at `db527e0c9`; one successor
  installed/live recheck remains.

- Completed-with-terminal-findings P38: [Plan 0345](docs/dev/plans/0345-2026-09-11-installed-plan0344-live-acceptance.md)
  installed exact Plan 0344 bytes and passed identity. Live acceptance failed:
  the current `6Pro` label did not match exact `6 Pro` before Send, and the
  claimed PDF was byte-identical DOCX content. Neither finding was retried.

- Integrated P37: [Plan 0344](docs/dev/plans/0344-2026-09-11-chatgpt-selector-artifact-live-findings.md)
  repairs P36's explicit `6 Pro` selector timeout and later-variant artifact
  transfer failures provider-free. Installation and live adoption remain
  outside the lane.

- Completed-with-terminal-findings P36: [Plan 0343](docs/dev/plans/0343-2026-09-11-installed-plan0342-live-acceptance.md)
  installed exact published P35 bytes and proved normal identity-smoke exit.
  Live acceptance was rejected: explicit `6 Pro` selection timed out before
  Send, and the one artifact fetch again settled Markdown only while DOCX/PDF
  returned `Promise was collected`. No retries or control effects ran.

- Completed P35: [Plan 0342](docs/dev/plans/0342-2026-09-11-chatgpt-live-findings-provider-free-repair.md)
  repairs four P34-owned failures provider-free: identity-smoke exit, current
  `6 Pro` trigger discovery, ordinary Session observed-model persistence, and
  complete sequential artifact settlement. P08 aggregate status and every
  installed/live/provider effect remain outside the lane.

- Completed-with-findings P34: [Plan 0341](docs/dev/plans/0341-2026-09-11-installed-plan0340-live-acceptance.md)
  installed source-identical Plan 0340 bytes and completed the bounded live
  packet. One current-model attachment turn passed with one Send and zero
  retries; the recovered conversation was not mutated and its artifacts remain
  intact. Full acceptance was rejected by API restart churn, CLI exit failure,
  selector/provenance gaps, and partial fresh artifact materialization.

- Completed P33: [Plan 0340](docs/dev/plans/0340-2026-09-11-chatgpt-deep-research-reliability.md)
  repairs current `6 Pro` provenance, one-run inherited-depth omission,
  attachment-aware prompt commitment, post-effect failure reconciliation, and
  artifact-fetch cleanup provider-free. Implementation and validation are
  accepted, overlap-reconciled, and integrated provider-free at `30c9d927f`.
  The recovered
  September 10 Deep Research conversation is authoritative and may not be
  retried.

- P16 exact-selection reconciliation is integrated, but issue 6 records a
  provider-free terminal-response contract gap hidden by a mocked `runPrompt`
  seam. Its branch-local authority is
  `docs/dev/plans/0323-2026-08-30-chatgpt-developer-app-submit-selection.md`
  at `refs/remotes/origin/fix/plan0323-developer-app-mention`; current main owns exact
  ecosystem-mention selection; the reconciled delta removes inherited generic
  tool routing, preserves current-model submission, and safely clears an
  unwrapped app mention. The obsolete provider-local response watcher was
  rejected by the prompt-lifecycle architecture gate. The next bounded slice
  must use the shared high-level lifecycle; response/live acceptance remains open.

- Completed P32: [Plan 0339](docs/dev/plans/0339-2026-09-09-installed-runtime-and-git-maintenance.md) proves current-main installed-runtime parity and closes the newly eligible P27 worktree while preserving its downstream verification ref and every unfinished lane.

- Completed P31: [Plan 0338](docs/dev/plans/0338-2026-09-06-upload-composer-validation.md) rejects inactive upload composers and retains both explicit and omitted handoff-model coverage; published with 69 passing tests.

- Completed Git maintenance: [Plan 0337](docs/dev/plans/0337-2026-09-06-git-maintenance.md) (P30) removed 11 eligible worktrees; Plan 0339's follow-up closed newly unblocked P27, so three linked worktrees now remain intentionally.

- P29 implementation installed; actual Skill execution unaccepted: [Plan 0336 Skill prompt invocation](docs/dev/plans/0336-2026-09-05-skill-prompt-invocation.md). Exact-ID selection and submission are proven in one tab; the responding model reported the selected resource inaccessible.

- Plan 0334 Skills selection is installed/live accepted: iteration 1/5 verified exact-ID selection and cleanup, no prompt. Merged to main through PR #1 (`697dc668`).

- Installed/live-accepted Plan 0335: [Chat mode preflight](docs/dev/plans/0335-2026-09-05-chat-mode-preflight.md), based on installed P27 source; require mode-control proof before a new prompt.


## P01 | Active Initiatives

### Current Execution Board

Status: P08 installed accepted; P46 decomposition active
Lanes: P01-P15, P17, P19-P28, P30-P45 (completed/accepted); P16, P18, P29, P46 (open)

- Completed-with-terminal-evidence installed/live successor:
  [Plan 0349](docs/dev/plans/0349-2026-09-11-installed-plan0348-live-acceptance.md)
  failed closed on truncated piped identity JSON. Prompt and artifact fetch were
  not attempted.

- Integrated provider-free repair:
  [Plan 0348](docs/dev/plans/0348-2026-09-11-chatgpt-compact-option-row-repair.md)
  proves terminal classification of the current compact `6Pro` option row.

- Integrated provider-free repair:
  [Plan 0346](docs/dev/plans/0346-2026-09-11-chatgpt-current-live-findings-repair.md)
  proves compact premium-label matching and fresh expected-extension plus
  binary-signature download admission at published checkpoint `40f2cecf9`,
  integrated at `db527e0c9`. Installation and live proof remain a successor
  gate.

- Completed-with-terminal-finding installed/live successor:
  [Plan 0347](docs/dev/plans/0347-2026-09-11-installed-plan0346-live-acceptance.md)
  passed install and identity. Its only prompt stopped before Send because the
  live option path still rejected listed `6Pro`; artifact fetch was withheld.

- Completed-with-terminal-findings installed/live adoption:
  [Plan 0345](docs/dev/plans/0345-2026-09-11-installed-plan0344-live-acceptance.md)
  P38 spent one install, one identity smoke, one prompt attempt with zero Sends,
  and one artifact fetch. Identity and installation passed; current label drift
  and false PDF materialization are terminal. No retry or unrelated runtime
  control ran. The evidence is integrated at `62b056005`; clean local topic
  custody is closed with its remote recovery ref retained.

- Integrated provider-free repair:
  [Plan 0344](docs/dev/plans/0344-2026-09-11-chatgpt-selector-artifact-live-findings.md)
  P37's deterministic explicit-selector and independent transfer-lifecycle
  fixtures and fixes merged at `a827fc83a`. No installed/live/provider effect
  was accepted; adoption remains separately gated. The unexpectedly launched
  blank managed Chrome tree was terminated under later exact authority, and
  clean local P37 topic custody is closed with its remote recovery ref retained.

- Completed-with-terminal-findings installed/live adoption:
  [Plan 0343](docs/dev/plans/0343-2026-09-11-installed-plan0342-live-acceptance.md)
  P36 spent one install, one identity probe, one effect-capable explicit
  `chatgpt:premium` attempt with zero Sends, and one read-only recovered-
  conversation artifact fetch. Identity passed; selector and complete fresh
  artifact settlement failed terminally. Unrelated controls stayed preserved.

- Completed provider-free repair:
  [Plan 0342](docs/dev/plans/0342-2026-09-11-chatgpt-live-findings-provider-free-repair.md)
  P35 has provider-free acceptance for all four P34 foreground findings and is
  integrated at `d80613c4f`. It does not reopen P34's live effect budget or
  absorb P08.

- Completed-with-findings installed/live verification:
  [Plan 0341](docs/dev/plans/0341-2026-09-11-installed-plan0340-live-acceptance.md)
  P34 installed exact published Plan 0340 main and spent exactly one prompt,
  one attachment upload, one Send, zero retries, and one read-only artifact
  fetch. The successful current-model turn does not override the rejected
  restart, exit, explicit-selector, observed-model, and fresh export findings.

- Completed ChatGPT Deep Research reliability repair:
  [Plan 0340](docs/dev/plans/0340-2026-09-11-chatgpt-deep-research-reliability.md)
  P33 starts from current main and treats the completed September 10 provider
  conversation and recovered artifacts as authoritative. The isolated source
  packet is accepted and integrated provider-free, retaining exact new-turn
  and no-duplicate-submit fences. Install and live proof remain separately
  gated.

- Completed installed-runtime and Git maintenance:
  [Plan 0339](docs/dev/plans/0339-2026-09-09-installed-runtime-and-git-maintenance.md)
  P32 binds the installed service to current published `main`, re-audits local
  branch/worktree custody, and closes P27 after clean-state, ancestry,
  remote-custody, and process-owner gates pass. It preserves divergent P08/P16,
  paused P18, open P29, and recovery custody without provider effects.

- Integrated ChatGPT tool and Skill inventory/selection:
  [Plan 0334](docs/dev/plans/0334-2026-09-05-chatgpt-tool-skill-inventory-selection.md)
  P27 updates current drawer identities, root-tab discovery, and guarded
  exact-account/exact-ID Skill selection. All 11 Skills were inventoried;
  iteration 1/5 selected Codebase Investigator and restored an empty composer.
  No prompt was submitted and actual Skill execution remains untested.
  The earlier domain-filter attribution to ChatGPT was unsupported and is
  superseded by successful installed/live evidence. PR #1 merged at `697dc668`.

- Integrated installed durable-model survey:
  [docs/dev/plans/0333-2026-09-05-installed-durable-model-survey.md](docs/dev/plans/0333-2026-09-05-installed-durable-model-survey.md)
  P26 installed source-identical durable-schema bytes and integrated the repair
  for remaining operational legacy-label defaults. Current tool/upload and
  horizontal-slider surfaces are directly proven without provider mutation.
  An older conversation proved the distinct `gpt-5-6-thinking` High/2 surface
  versus current Pro/4. Exact cleanup left one healthy home and the unchanged
  project conversation; P26 is closed with no prompt, upload, model selection,
  retry action, or provider mutation.

- Provider-free accepted durable model schema migration:
  [docs/dev/plans/0332-2026-09-05-durable-model-schema.md](docs/dev/plans/0332-2026-09-05-durable-model-schema.md)
  P25 replaces advertised version/codename ChatGPT selectors with capability
  intents, retains old spellings as aliases, and adds GPT-6 Pro/Astra plus the
  durable `openai:frontier` API default. Checkpoint `c96a472f` is integrated
  through `a0361f66`; this lane did not install or operate the retained browser.

- Active ChatGPT composer intelligence-picker repair:
  [docs/dev/plans/0331-2026-09-03-chatgpt-composer-intelligence-picker.md](docs/dev/plans/0331-2026-09-03-chatgpt-composer-intelligence-picker.md)
  P24 scopes model selection to the active composer, excludes assistant-turn
  retry controls, and supports the live five-position horizontal Power slider.
  Source and installed canaries passed with original Pro state restored. The
  installed attachment probe also accepts the composer-local unrestricted
  input without uploading; P24 is closed and integrated through `cd3e6b68`.

- Integrated ChatGPT Skill CRUD:
  [docs/dev/plans/0329-2026-09-02-chatgpt-skill-crud.md](docs/dev/plans/0329-2026-09-02-chatgpt-skill-crud.md)
  P22 provides guarded exact-account, exact-ID list/show/create/update/delete.
  Installed/live acceptance recovered the one authorized Create, updated the
  same stable ID once with exact v2 hash readback, and deleted it once with
  fresh complete-inventory absence. No skill invocation or prompt occurred;
  Chrome/API identities remained stable. P16 remains a separate unfinished
  developer-app lane and must preserve both CLI blocks when later integrated.

- Active installed long-observation recovery canary:
  [docs/dev/plans/0328-2026-09-02-installed-long-observation-canary.md](docs/dev/plans/0328-2026-09-02-installed-long-observation-canary.md)
  P21 is installed/live accepted. Pre-answer expiry remains resumable, exact
  progress identity overrides a stale synthetic runtime route, and the
  remedial read-only attach recovered the same 1,800-line turn with zero
  resend. PID/port, API restart count, and empty operation-lock state remained
  stable. Skill CRUD may now open as a separate bounded lane.

- Integrated ChatGPT skill lifecycle discovery:
  [docs/dev/plans/0327-2026-09-02-chatgpt-skill-lifecycle-discovery.md](docs/dev/plans/0327-2026-09-02-chatgpt-skill-lifecycle-discovery.md)
  P20 corrects label-only capability evidence. After explicit operator transfer
  of the exact pre-existing `wsl-chrome-3` Chrome, one read-only attempt proved
  separate skill/plugin routes, stable detail identity, inventory grouping,
  owner/file/review surfaces, and separate invocation. All skill mutations and
  invocation remain gated.

- Integrated ChatGPT long-prompt observation recovery:
  [docs/dev/plans/0326-2026-09-02-chatgpt-long-prompt-observation-recovery.md](docs/dev/plans/0326-2026-09-02-chatgpt-long-prompt-observation-recovery.md)
  P19 separates observation-lease expiry from provider/model terminal state,
  preserves exact active-turn evidence for read-only reattachment, and adds a
  provider-free 15-minute same-conversation recovery guard. Provider-free
  verification and non-forced main integration are accepted; installed/live
  proof remains separate. It does not overlap P08's aggregate-status source
  surface.

- Integrated Git maintenance closeout:
  [docs/dev/plans/0322-2026-08-29-git-maintenance-closeout.md](docs/dev/plans/0322-2026-08-29-git-maintenance-closeout.md)
  P15 preserves the unfinished P08 and P14 lanes while removing only exact
  clean, integrated worktree and branch custody. Final acceptance requires a
  passing catalog audit and clean local/remote main parity.

- Integrated ChatGPT timeout-unit and turn-control acceptance:
  [docs/dev/plans/0321-2026-08-28-chatgpt-timeout-unit-and-turn-control-acceptance.md](docs/dev/plans/0321-2026-08-28-chatgpt-timeout-unit-and-turn-control-acceptance.md)
  P14's strict duration parser, installed-runtime parity, authenticated app
  inventory, exact same-turn canary, and owned-browser cleanup are accepted.
  Non-forced `main` integration is complete at `1659bdbb`.

- Integrated ChatGPT terminal-output selection repair:
  [docs/dev/plans/0320-2026-08-27-chatgpt-terminal-output-selection.md](docs/dev/plans/0320-2026-08-27-chatgpt-terminal-output-selection.md)
  P13 froze Plan 0319's recovered writing-block versus interruption-banner
  evidence as a provider-free regression. It changes only the final response
  representation selector, preserves ordinary substantive-DOM mismatch safety,
  and proved installed-runtime parity before integration.

- Integrated ChatGPT composer replacement and exact-turn proof:
  [docs/dev/plans/0319-2026-08-27-chatgpt-composer-replacement.md](docs/dev/plans/0319-2026-08-27-chatgpt-composer-replacement.md)
  P12 resolved the live-reproduced stale-draft concatenation defect. It replaces
  user-authored text on the exact focused composer while preserving connected-app
  pills, then requires exact pre-send and newly committed user-turn equality.
  Provider-free repair and installation preceded one distinct fresh
  Frakktal/LitScout experiment. P08 remains isolated and non-overlapping.

- Completed CDP-observed ChatGPT approval recovery:
  [docs/dev/plans/0318-2026-08-27-cdp-observed-chatgpt-approval-recovery.md](docs/dev/plans/0318-2026-08-27-cdp-observed-chatgpt-approval-recovery.md)
  P11 instrumented the exact connected-app approval control and directly
  observes/manipulates it through the real `wsl-chrome-3` DevTools port. It
  resumes LitScout Project 15 / Session 73 rather than reconnecting OAuth or
  creating new research state. P11 merged through `af13ca5a`; P08 remains
  isolated and non-overlapping.

- Completed durable ChatGPT approval acknowledgment repair:
  [docs/dev/plans/0317-2026-08-27-durable-chatgpt-approval-acknowledgment.md](docs/dev/plans/0317-2026-08-27-durable-chatgpt-approval-acknowledgment.md)
  P10 is installed and live-accepted. One Sol/High turn completed
  `auth_session`, exact `Always allow`, and one deliberately nonexistent
  mutation call without app reconnect, OAuth failure, or canonical write.
  The overlapping provider-provenance lane and P09 were explicitly reconciled;
  P10 then merged through `79a57806` without changing P08.

- Completed urgent ChatGPT Project-slug Work-marker repair:
  [docs/dev/plans/0316-2026-08-25-chatgpt-project-slug-work-marker.md](docs/dev/plans/0316-2026-08-25-chatgpt-project-slug-work-marker.md)
  P09 owns the exact provider-local route normalization needed when ChatGPT's
  loaded Project conversation URL includes a human-readable slug but its active
  sidebar link uses the canonical project-ID-only route. Exact Project ID,
  conversation ID, active-link, and Work-badge proof remain fail-closed. The
  slice merged through `79a57806` after explicit reconciliation with
  `fix/plan0444-provider-provenance` and does not overlap P08's aggregate-status
  source surface.

- Completed aggregate status latency repair:
  [docs/dev/plans/0315-2026-08-25-aggregate-status-latency.md](docs/dev/plans/0315-2026-08-25-aggregate-status-latency.md)
  P08 repaired aggregate `/status` exceeding the default five-second client
  budget. Issue `ecochran76/auracall#9` integrated the provider-free recovery
  through PR 17 at `1fdd4d088`; installed acceptance on 2026-09-23 proved
  source/install byte parity, three 2.52-2.62 second aggregate calls, responsive
  narrow reads, preserved failure semantics, healthy ChatGPT scheduler resume,
  exact browser cleanup, and the disabled Gemini manual-clear hard stop.

- Completed bounded live-follow recovery:
  [docs/dev/plans/0314-2026-08-24-bounded-live-follow-recovery.md](docs/dev/plans/0314-2026-08-24-bounded-live-follow-recovery.md)
  P07 replaces the failed-live-follow zero-retry terminal with explicit
  one-pass re-arm semantics, then owns current-runtime installation, no more
  than three diagnosis-driven attempts, and one conditional scheduler resume.
  Provider-free checkpoint `776556bf` merged through `af17fa89`. One installed
  controlled pass advanced the retained completion from pass 1 to pass 2,
  cleared its force ceiling/error, and cleaned exact browser ownership. One
  scheduler resume then completed a normal `chatgpt/wsl-chrome-3` pass with no
  backpressure; P07 is closed and live accepted.

- Completed provider-free live-follow predicate and cleanup repair:
  [docs/dev/plans/0313-2026-08-24-live-follow-predicate-cleanup-repair.md](docs/dev/plans/0313-2026-08-24-live-follow-predicate-cleanup-repair.md)
  P06 owns the two source defects exposed by Plan 0312: the bounded ChatGPT
  sidebar readiness timeout must enter its existing recovery path, and an
  explicitly forced terminal live-follow pass must request managed-browser
  cleanup. Exact RED/GREEN contracts, the affected tests, the 135-test ChatGPT
  provider-free gate, typecheck, build, and scoped lint pass. Scheduler remains
  paused; install, restart, browser/provider work, completion control, and
  another canary remain excluded. Validated checkpoint `0bab4710` merged
  through `a8a9f96e`.

- Terminal scheduler-isolated live-follow cooldown canary:
  [docs/dev/plans/0312-2026-08-24-scheduler-isolated-live-follow-canary.md](docs/dev/plans/0312-2026-08-24-scheduler-isolated-live-follow-canary.md)
  Scheduler isolation succeeded and prevented fanout. The sole frozen control
  instead failed at pass 1 on a 587 ms predicate timeout before creating a
  fresh child, then retained its API-owned browser past the observation bound.
  Exact orphan cleanup succeeded; scheduler remains paused and no retry ran.
  Terminal checkpoint `193fd1e8` merged through `f133601e`.

- Terminal installed live-follow cooldown canary:
  [docs/dev/plans/0311-2026-08-24-installed-live-follow-cooldown-canary.md](docs/dev/plans/0311-2026-08-24-installed-live-follow-cooldown-canary.md)
  The one install and API restart reached byte-exact current-build parity, but
  the enabled scheduler created a different `wsl-chrome-3` completion before
  the frozen manual control. P04 stopped under `C4_hard_stop`: no manual
  control, retry, scheduler mutation, substitute-target use, or browser cleanup
  ran. A successor requires explicit scheduler-isolation authority.
  Terminal checkpoint `725b0433` merged through `0a54b7b5`.

- Completed live-follow cooldown-abort repair:
  [docs/dev/plans/0310-2026-08-24-live-follow-cooldown-abort-repair.md](docs/dev/plans/0310-2026-08-24-live-follow-cooldown-abort-repair.md)
  Exact installed evidence proves a 120-second context deadline collides with
  a 120-second fallback-renavigation cooldown, while history materialization's
  custom governor sleep drops cancellation and can mutate shared pacing after
  timeout. Plan 0310 is provider-free accepted and integrated:
  per-read cancellation prevents late pacing state, and all snapshot/artifact/
  file reads preserve the acquisition budget after their pacing allowance.
  Validated checkpoint `c1da8609` merged through `828bb3f8`; installed-runtime
  adoption and any exact live canary remain separate effect work.

- Completed Oracle-native reliability adaptation campaign:
  [docs/dev/plans/0309-2026-08-23-oracle-native-reliability-adaptations.md](docs/dev/plans/0309-2026-08-23-oracle-native-reliability-adaptations.md)
  Oracle remains a non-authoritative research source. Plan 0309 accepts only
  current AuraCall gaps with explicit tests: strict duration parsing, bounded
  OpenRouter caching, atomic owner-only session storage, bounded Answer Now
  placeholder recognition, explicit headless semantics, WSL loopback routing,
  and unavailable thinking-tier handling. Cookie copying now requires explicit
  opt-in; the Oracle MCP output-containment patch was not applicable because no
  AuraCall MCP-controlled path reaches a write sink. Validated checkpoint
  `b412b0bc` merged through `9c3486ad` with no installed or live effect.

- Completed repository Git true-up and Oracle reference review:
  [docs/dev/plans/0308-2026-08-22-repository-git-true-up-oracle-reference-review.md](docs/dev/plans/0308-2026-08-22-repository-git-true-up-oracle-reference-review.md)
  Fresh fetches of `origin` and the Oracle-reference remote prove clean
  `main == origin/main`, seven clean linked worktrees, 14 merged topic branches,
  and three non-ancestral local branches. The historical Oracle remote is now
  named `oracle-archive`; Oracle is no longer treated as an AuraCall upstream.
  Its 517
  Oracle-only commits are research input, not synchronization debt. The bounded
  plan first restores the missing active-lane catalog and adjudicates exact
  custody. A separate reference review may identify narrow cherry-pick
  candidates or ideas worth adapting through AuraCall's own architecture.
  Cleanup and Oracle-derived implementation remain separately gated actions.
  Execution on `chore/plan0308-repository-true-up` has now published the full
  custody/Oracle receipt, mapped the runtime-foundation commits, and resolved
  the selector family by porting only the missing compact model-control
  semantics. The catalog passed at `14104c21`, and validated feature checkpoint
  `47d5e330` merged without conflict through `bdb15952`. A subsequent
  authorized local cleanup removed seven auxiliary worktrees and 17 local
  cleanup/archival branches. Remote refs and the historical compatibility ref
  remain; Oracle-derived ideas remain separate future packets.

- Completed installed ChatGPT Work-marker semantic repair:
  [docs/dev/plans/0299-2026-08-21-chatgpt-work-marker-semantic-repair.md](docs/dev/plans/0299-2026-08-21-chatgpt-work-marker-semantic-repair.md)
  Read-only live evidence proved ordinary Chat's `High` thinking control shares
  `[data-animated-slider-trigger=true]`, while established Work is positively
  marked by the active current-route conversation's exact `Work` badge. The
  provider-local repair is pushed and installed byte-exact. Separate installed
  no-prompt probes accept ordinary Chat and enter explicit Work; exact cleanup
  preserved the authenticated browser.

- Completed ChatGPT tool-approval acknowledgment repair:
  [docs/dev/plans/0300-2026-08-21-chatgpt-tool-approval-acknowledgment.md](docs/dev/plans/0300-2026-08-21-chatgpt-tool-approval-acknowledgment.md)
  LitScout Plan 0434 and retained DOM prove sequential approval cards in one
  assistant turn collapsed to the same turn-prefix fingerprint: the first
  action succeeded, then AuraCall mistook the next card for the old one. This
  bounded successor fingerprints the exact current card without weakening
  paired-action, one-click, ambiguity, manual, or `Answer now` safeguards, then
  is pushed and installed byte-exact. Its real LitScout acceptance passed Send
  but exposed a separate profile-lock lifetime defect before tool approval;
  Plan 0301 owns that successor and Plan 0300 is not reopened.

- Completed ChatGPT post-submit profile-lock repair:
  [docs/dev/plans/0301-2026-08-21-chatgpt-post-submit-profile-lock.md](docs/dev/plans/0301-2026-08-21-chatgpt-post-submit-profile-lock.md)
  The Plan-0435 foreground run released its shared managed-profile lock after
  Send while still waiting for the response and connected-app approval. API
  account-mirror refresh then acquired the same live Chrome profile and the CLI
  lost CDP. This bounded successor keeps the existing lock until terminal
  cleanup. The exact RED/GREEN, `77/77` affected tests, typecheck, lint, build,
  full provider-free `2,944 passed / 65 skipped`, and current CodeGraph are
  source-accepted. Pushed `736556d4` is installed byte-exact at
  `53a9f3ed...c6ea`; API PID 23839 is healthy after the plan's sole restart.
  A real browser lifecycle run held and terminally released the exact profile
  operation, and the installed dispatcher blocked the exact account-mirror
  owner until release. The separate LitScout acceptance live-proved that guard
  and executed its action once, then exposed a distinct overall-timeout and
  signal-cleanup defect. Plan 0302 owns terminalization; Plan 0301 is not
  reopened.

- Closed split-result ChatGPT overall-timeout and signal-cleanup repair:
  [docs/dev/plans/0302-2026-08-21-chatgpt-overall-timeout-signal-cleanup.md](docs/dev/plans/0302-2026-08-21-chatgpt-overall-timeout-signal-cleanup.md)
  LitScout Plan 0436 proved the foreground lock remained correct, but AuraCall
  outlived `--timeout 60m` and normal SIGINT left its exact session, model,
  managed Chrome, and browser-operation state nonterminal. This bounded
  successor repaired one overall deadline plus one awaited, idempotent
  terminal-cleanup seam and safely reconciled only the exact residue. Source,
  installed byte parity, deterministic probes, and real 900-second cleanup are
  accepted. The one no-write LitScout call executed exactly once, but AuraCall
  returned no terminal assistant answer; Plan 0302 closes without integration
  and Plan 0303 owns that distinct post-tool response failure.

- Closed split-result ChatGPT post-tool terminal-response repair:
  [docs/dev/plans/0303-2026-08-21-chatgpt-post-tool-terminal-response.md](docs/dev/plans/0303-2026-08-21-chatgpt-post-tool-terminal-response.md)
  Plan 0302 live-proved safe timeout cleanup but the exact read-only LitScout
  tool request was followed by no captured terminal assistant answer. This
  source-first successor preserves the one-call/zero-write evidence, builds
  deterministic post-tool fixtures, and adds bounded passive terminal-state
  evidence without accepting tool or approval text as an answer. Pushed source
  `28da74e5` is accepted: focused `10/10`, affected `1,030/1,030`, serial full
  provider-free `2,952/2,952`, typecheck, lint, build, and current CodeGraph
  pass. One idle-boundary install and one API restart are byte-exact and healthy;
  corrected installed positive/no-answer fixtures pass. The distinct live
  prompt made exactly one read-only LitScout call and terminalized cleanly, but
  returned no answer. Its diagnostic proved an absolute turn floor of 15 while
  ChatGPT later mounted only 12 virtualized turn nodes. Plan 0304 owns that
  stable-boundary defect; Plan 0303 closes without integration.

- Closed split-result ChatGPT virtualized turn-boundary repair:
  [docs/dev/plans/0304-2026-08-21-chatgpt-virtualized-turn-boundary.md](docs/dev/plans/0304-2026-08-21-chatgpt-virtualized-turn-boundary.md)
  Plan 0303 live-proved exactly one LitScout request, zero canonical mutation,
  exact timeout cleanup, and a durable `12 < 15` boundary classification. This
  source-first successor replaces count-only eligibility with stable pre-submit
  assistant identity across DOM shrink/reindex, while keeping positional fast
  paths and all stale/tool/approval exclusions fail-closed. Pushed source
  `571514c9` is provider-free accepted: deterministic virtualization `13/13`,
  focused browser `76/76`, serial full `2,956/2,956`, typecheck, lint, build,
  CodeGraph, and diff hygiene pass. Installed byte parity and fixtures passed.
  The one live prompt completed in 26.6 seconds with exactly one LitScout call
  and clean terminalization, proving the stable boundary, but returned an
  incorrect `1 keep` against canonical `12 keep`. Plan 0304 closes without
  integration and Plan 0305 owns terminal representation fidelity.

- Closed split-result ChatGPT terminal-response representation fidelity repair:
  [docs/dev/plans/0305-2026-08-21-chatgpt-terminal-representation-fidelity.md](docs/dev/plans/0305-2026-08-21-chatgpt-terminal-representation-fidelity.md)
  Plan 0304 proved tool execution and fresh terminal capture, then exposed a
  smaller final-DOM/copied-Markdown disagreement that the local path ignores
  unless the DOM is at least 12 characters longer. This source-first successor
  now reconciles semantically equivalent formatting while preferring the final
  stable DOM whenever substantive text differs. Pushed source `149d5bd1` is
  accepted: focused `124/124`, affected `1,547/1,547`, serial full provider-free
  `2,965/2,965`, typecheck, scoped lint, build, CodeGraph, planning audit, and
  diff hygiene pass. Installed byte parity and fixtures pass. The sole live
  submission failed safe when an account-mirror history-materialization cleanup
  killed the adopted managed Chrome after its earlier refresh lock released.
  Canonical LitScout state remained unchanged and no retry ran. Plan 0306 owns
  the missing shared-operation fence; Plan 0305 closes without integration.

- Closed accepted history-materialization managed-browser ownership repair:
  [docs/dev/plans/0306-2026-08-21-history-materialization-browser-ownership.md](docs/dev/plans/0306-2026-08-21-history-materialization-browser-ownership.md)
  Plan 0305 live-proved a false-idle window: account-mirror completion retained
  provider work after its refresh operation file released, while history
  materialization cleanup later killed all matching profile PIDs without the
  shared file-backed browser-operation fence. This source-first successor must
  serialize provider work and cleanup with foreground use of the exact profile.
  Pushed product `929aec97` is source-accepted: exact-profile provider work and
  cleanup now share one durable file-backed operation, busy foreground and
  stale-recovery paths fail safe, the affected set is `372/372`, and the serial
  full suite is `2,970/2,970`. Installed parity and the ownership fixture pass.
  Its sole real browser run completed in 15.2 seconds without Chrome/CDP loss
  and with exact cleanup. The frozen prompt made no LitScout call because it
  prohibited the lazy transport-discovery call required to expose
  `research_continue`; zero retry is preserved and only the readback criterion
  carries forward.

- Closed accepted LitScout discovery-aware readback acceptance:
  [docs/dev/plans/0307-2026-08-21-litscout-discovery-aware-readback.md](docs/dev/plans/0307-2026-08-21-litscout-discovery-aware-readback.md)
  Plan 0306 accepted the actual browser-ownership repair but exposed a narrower
  gate-contract contradiction. This no-code successor explicitly permits only
  transport discovery before exactly one read-only `research_continue` call.
  It authorizes zero install/restart, one distinct submission, zero retries,
  and requires exact `150 = 12 + 138`, one new LitScout request, zero canonical
  mutation, and exact terminal cleanup.
  The sole submission passed in 20.6 seconds: exact `150/12/138`, one LitScout
  request (`50 -> 51`), unchanged receipts/actions/membership, completed
  session/model state, and no browser/operation/history residue. The carried
  AuraCall/LitScout reliability goal is accepted at installed product
  `929aec97`; the accepted stack fast-forwarded to `main` at `f7e1aa73`.

- Completed reused-browser provider-provenance repair:
  [docs/dev/plans/0298-2026-08-21-reused-browser-provider-provenance-pid.md](docs/dev/plans/0298-2026-08-21-reused-browser-provider-provenance-pid.md)
  A local ChatGPT run can reuse the exact live managed browser while its launch
  handle omits PID, causing provider-session proof to fail despite a matching
  account and target. The repair recovers only an exact-profile-validated
  persisted PID; account/target proof and stale rejection remain fail-closed.
  Pushed product `86ebba3e` is installed byte-exact and the installed resolver
  recovers live exact-profile PID `58728`.

- Source/install-completed but live-rejected ChatGPT implicit-Chat repair:
  [docs/dev/plans/0297-2026-08-21-chatgpt-implicit-chat-conversation-mode.md](docs/dev/plans/0297-2026-08-21-chatgpt-implicit-chat-conversation-mode.md)
  LitScout's enrichment-resume successor reached the exact existing
  conversation but stopped before Send because that ready route omitted the
  Chat/Work control. The provider-free repair recognizes only a visible,
  enabled ChatGPT prompt editor with no explicit mode control and no Work
  marker as implicit Chat; Work remains explicit and fail-closed. The first
  installed acceptance exposed a second pre-Send race: the predicate ran before
  the React composer mounted. The bounded 10-second exact-composer wait is
  source-green, installed byte-exact, and verified by an installed delayed-mount
  probe. Plan 0299 supersedes its rejected Work-marker assumption; any LitScout
  successor remains separately governed.

- Closed installed ChatGPT visible composer-target binding repair:
  [docs/dev/plans/0296-2026-08-20-chatgpt-visible-composer-target-binding.md](docs/dev/plans/0296-2026-08-20-chatgpt-visible-composer-target-binding.md)
  The installed upload repair cleared its original gate, but LitScout's sole
  successor stopped before Send because AuraCall could focus a broad selector
  candidate and then verify a different exact composer node. This bounded
  repair makes one visible composer-owned node authoritative across focus,
  fallback, and pre-Send verification. Any further Experiment 9 attempt remains
  separately governed. Source and installed runtime are byte-exact at
  `ddabb138`; the installed target-binding probe passes and the API is healthy.

- Active ChatGPT local-upload surface independence repair:
  [docs/dev/plans/0295-2026-08-20-chatgpt-local-upload-surface-independence.md](docs/dev/plans/0295-2026-08-20-chatgpt-local-upload-surface-independence.md)
  LitScout Experiment 9 reached the authenticated workbench but AuraCall
  stopped before transfer because local-upload readiness incorrectly required
  the unrelated provider-library row. This bounded repair keeps the exact
  local action and unrestricted input fail-closed while making library-row
  metadata optional. No retry is authorized until pushed, installed acceptance
  returns control to LitScout's fresh successor gate.

- Closed accepted browser-launch runtime-authorization clone repair:
  [docs/dev/plans/0294-2026-08-20-browser-launch-runtime-authorization-clone.md](docs/dev/plans/0294-2026-08-20-browser-launch-runtime-authorization-clone.md)
  LitScout Experiment 9 exposed a pre-browser `structuredClone` failure when
  the immutable launch-plan seam received live provider-session authorization
  methods. The bounded repair keeps authorization on the runtime config,
  excludes it only from the immutable launch snapshot, and passed pushed
  provider-free acceptance plus one installed-runtime convergence. Source and
  installed hashes match, the exact completion and browser owner survived the
  restart, and the experiment remains unrun because its retry belongs to
  LitScout's separate fresh request/activation gate.

- Closed provider-free acceptance-main coverage closure:
  [docs/dev/plans/0292-2026-08-15-provider-acceptance-main-tests.md](docs/dev/plans/0292-2026-08-15-provider-acceptance-main-tests.md)
  This bounded successor closed Plan 0291's retained Medium by exercising
  ChatGPT and Grok provider-main PASS, FAIL, cleanup, and ChatGPT
  CLI-over-resume behavior through provider-local test adapters. The shared
  harness remains a mechanics module. The focused packet passes 11/11 plus
  typecheck, build, scoped lint, help smokes, CodeGraph, plan audit, and diff
  hygiene.

- Closed accepted sequential architecture deepening campaign:
  [docs/dev/plans/0291-2026-08-15-architecture-deepening-campaign.md](docs/dev/plans/0291-2026-08-15-architecture-deepening-campaign.md)
  The operator selected all four architecture-review candidates in order and
  delegated detailed planning, execution, testing, and one independent audit
  to an orchestrated subagent workflow. The campaign permits one audit/repair
  cycle total; only unresolved High-severity findings block completion and all
  lower-severity unresolved findings become durable notes. Candidate 1,
  browser launch resolution, is provider-free accepted after one independent
  High routing defect was repaired and closed-world reverified. Candidate 2,
  provider prompt execution, is also provider-free accepted after URL-routing
  and attachment fail-closed defects were repaired and independently
  reverified. Candidate 3, one materialization attempt, is provider-free
  accepted with durable receipt-first accounting and fail-closed evidence
  persistence. Candidate 4 is provider-free accepted: ChatGPT and Grok now
  share one locally substitutable process/deadline/output/JSON/state/evidence
  harness while their phases, assertions, guard/retry, and cleanup policies
  remain provider-local. The sole integrated audit found zero High findings;
  its retained Medium C4 dynamic-orchestration coverage gap was subsequently
  closed by Plan 0292. The full provider-free suite passed 2,922 tests, and the
  campaign remains closed.

- Closed failed-safe two-sequential-approval LitScout live proof:
  [docs/dev/plans/0289-2026-08-15-chatgpt-two-sequential-litscout-approvals.md](docs/dev/plans/0289-2026-08-15-chatgpt-two-sequential-litscout-approvals.md)
  The sole prompt reached the first approval, but its trusted pointer sequence
  did not dismiss the still-enabled surface within the confirmation window.
  AuraCall failed closed before connector dispatch or a second approval. Zero
  LitScout effects and exact cleanup passed; a provider-free pre-click
  settle/fresh-coordinate repair is required before a successor canary.

- Closed provider-free accepted ChatGPT approval settle; live proof inconclusive:
  [docs/dev/plans/0290-2026-08-15-chatgpt-approval-pre-click-settle.md](docs/dev/plans/0290-2026-08-15-chatgpt-approval-pre-click-settle.md)
  A provider-free public-seam regression will require a stable exact re-probe
  and fresh coordinates before one trusted pointer sequence. After the repair
  is green and pushed, one fresh zero-retry LitScout prompt may prove two
  sequential `Allow once` actions with zero canonical effects.
  Repair `d949935d` is pushed after 143/143 affected tests plus typecheck,
  build, scoped lint, current CodeGraph, and diff hygiene. The sole live prompt
  confirmed one exact `Allow once` and returned the expected token, but its
  singular provider trace and absent rendered target evidence did not prove a
  second call or approval. Zero LitScout effects and exact cleanup passed; no
  retry ran.

- Closed accepted browser-context liveness repair and LitScout approval proof:
  [docs/dev/plans/0288-2026-08-15-browser-context-liveness-litscout-approval-proof.md](docs/dev/plans/0288-2026-08-15-browser-context-liveness-litscout-approval-proof.md)
  Pushed repair `da7961be` removes live provider probes from optional pre-run
  cache context while preserving the actual browser identity gate. The second
  bounded source-direct canary logged exact `Allow once`, confirmed approval
  disappearance, returned the expected LitScout token, and left zero exact
  target, cancellation, operator-action, or canonical-write rows. Exact tab,
  lease, service, and browser cleanup passed.

- Closed failed-safe one-shot LitScout `allow-once` live canary:
  [docs/dev/plans/0287-2026-08-15-litscout-tool-approval-live-canary.md](docs/dev/plans/0287-2026-08-15-litscout-tool-approval-live-canary.md)
  The sole source-direct run timed out before `runBrowserMode`, prompt
  submission, approval detection, or connector use. Cleanup passed with the
  retained API/browser unchanged and every downstream effect zero. CodeGraph
  localizes the blocker to unbounded pre-run cache identity/feature discovery;
  the approval handler remains provider-free only.

- Closed accepted provider-free ChatGPT third-party tool approval policy:
  [docs/dev/plans/0286-2026-08-15-chatgpt-tool-approval-policy.md](docs/dev/plans/0286-2026-08-15-chatgpt-tool-approval-policy.md)
  AuraCall detects exact paired `Allow once` / `Always allow` pauses during
  post-submit response waiting and takes only the operator-configured action.
  Manual remains fail-closed. The 238-test affected gate, typecheck, build,
  scoped lint, CodeGraph, planning audit, and diff hygiene pass at source
  candidate `4ce634c5`; live DOM proof remains a separately authorized canary.

- Closed accepted provider-free ChatGPT developer-app exact auth binding repair:
  [docs/dev/plans/0285-2026-08-14-developer-app-exact-auth-binding.md](docs/dev/plans/0285-2026-08-14-developer-app-exact-auth-binding.md)
  LitScout governance proved a replacement app inherited `ACTIVE` only because
  AuraCall joined a retained same-name OAuth link. The bounded source slice
  removes display-name auth joining and fails closed on missing or ambiguous
  exact identity. The 221-test affected gate, typecheck, build, lint, and
  CodeGraph pass at pushed source candidate `0c9110e4`; every install, browser,
  provider, and canonical effect remained zero.

- Closed accepted installed DevTools attachment inventory replay:
  [docs/dev/plans/0284-2026-08-14-devtools-attachment-installed-inventory-replay.md](docs/dev/plans/0284-2026-08-14-devtools-attachment-installed-inventory-replay.md)
  The sole user-runtime install reached exact four-module parity without an API
  restart. The sole instrumented `wsl-chrome-3` inventory exited 0 in 10.52
  seconds after reporting every attachment stage and returned a complete
  16-app inventory. No retry or downstream effect ran; LitScout P3 remains for
  its own governance and Experiment 6 remains blocked.

- Closed accepted provider-free DevTools attachment liveness repair:
  [docs/dev/plans/0283-2026-08-14-devtools-attachment-liveness.md](docs/dev/plans/0283-2026-08-14-devtools-attachment-liveness.md)
  LitScout Plan 0411 proved identity and then stalled inside generic attachment.
  The shared path now carries abort/deadline/stage evidence through target
  resolution and CDP connection, closes late clients, and independently bounds
  developer-app Runtime/Page enablement. Provider-free red/green, affected
  callers, typecheck, build, lint, CodeGraph, and planning audits pass at pushed
  candidate `c8a54364`. Installed validation remains a separately authorized
  boundary; P3 is not accepted and Experiment 6 remains blocked.

- Active agent-browser RDP migration for AuraCall-owned managed profiles:
  [docs/dev/plans/0281-2026-08-12-agent-browser-rdp-managed-profile-migration.md](docs/dev/plans/0281-2026-08-12-agent-browser-rdp-managed-profile-migration.md)
  AuraCall will retain the exact managed profile directories while
  agent-browser owns remote-headed Chrome/Chromium processes and Guacamole/RDP
  routes. The first slice is provider-free and fail-closed on executable
  family, browser build, operator-visible proof, and CDP endpoint evidence;
  that source/config/docs slice is now green. Profile registration and
  installed activation remain withheld behind current runtime and route
  readiness.
  The same P01 browser-service maintenance lane now also owns bounded
  `Page.navigate` acknowledgements and bounded `Runtime.evaluate` predicate
  calls after LitScout Goal 0411 exposed both ways an `apps list` probe could
  outlive its settle deadline and hold the managed-profile lease.

- Closed accepted ChatGPT developer-app submitted-test current-model repair:
  [docs/dev/plans/0282-2026-08-13-developer-app-test-current-model.md](docs/dev/plans/0282-2026-08-13-developer-app-test-current-model.md)
  The provider-free slice closed the reproduced `apps test --submit` failure
  by preserving the active Chat model rather than inheriting generic
  `select` / `Instant`. Exact candidate `620f43f0` is pushed; runtime install
  and any new LitScout subject remain a separate activation boundary.

- Closed accepted ChatGPT attachment drawer focus-order repair and installed canary:
  [docs/dev/plans/0280-2026-08-12-chatgpt-attachment-drawer-focus-order-canary.md](docs/dev/plans/0280-2026-08-12-chatgpt-attachment-drawer-focus-order-canary.md)
  The opener now foregrounds retained tabs before measuring the plus trigger
  and retains a bounded fallback. Provider-free gates, one install with exact
  six-module parity, and one zero-retry canary passed; the canary uploaded one
  tracked file and returned the exact expected token.

- Closed exact reattach-target fence and failed-safe attachment canary:
  [docs/dev/plans/0279-2026-08-12-reattach-target-fence-and-attachment-canary.md](docs/dev/plans/0279-2026-08-12-reattach-target-fence-and-attachment-canary.md)
  Exact stale-target recovery now fails closed and installed parity/API health
  passed. The sole canary passed identity, Chat, and current-model gates, then
  stopped before upload/prompt because foreground focus occurred after trigger
  measurement; exact cleanup preserved the retained browser.

- Active ChatGPT current-model strategy repair and attachment canary:
  [docs/dev/plans/0278-2026-08-12-chatgpt-current-model-strategy-attachment-canary.md](docs/dev/plans/0278-2026-08-12-chatgpt-current-model-strategy-attachment-canary.md)
  Closed with the `current` strategy installed and model-menu traversal
  removed. Its canary was locally blocked by stale duplicate state; supported
  reattach then exposed unrelated-tab capture, so no provider prompt ran.

- Active installed ChatGPT workbench attachment canary:
  [docs/dev/plans/0277-2026-08-12-chatgpt-workbench-attachment-installed-canary.md](docs/dev/plans/0277-2026-08-12-chatgpt-workbench-attachment-installed-canary.md)
  Closed failed-safe after one canonical install: the canary passed identity
  and Chat-mode preflight but `current` entered model-menu retry diagnostics
  before upload/prompt. Exact tab/lease cleanup preserved the retained browser.

- Closed provider-free ChatGPT workbench tool-selector and attachment-drawer repair:
  [docs/dev/plans/0276-2026-08-12-chatgpt-workbench-tool-selector-attachment-drawer.md](docs/dev/plans/0276-2026-08-12-chatgpt-workbench-tool-selector-attachment-drawer.md)
  Exact live DOM evidence distinguishes the mixed searchable selector from the
  provider-library dialog and generic local upload input. Local and remote
  `--file` paths now require the current two file-source rows plus unrestricted
  `#upload-files`; composer-tool selection excludes both file rows. The 179-test
  adjacent gate, type/build/lint/CodeGraph/planning checks, and cleanup pass;
  installed upload/send proof remains separate.

- Closed failed-safe installed Chat LitScout read canary:
  [docs/dev/plans/0275-2026-08-11-chatgpt-chat-litscout-read-canary.md](docs/dev/plans/0275-2026-08-11-chatgpt-chat-litscout-read-canary.md)
  Installed parity and the sole explicit-Chat canary passed. Chat invoked the
  LitScout connector and returned the correct read-only Session 57 projection,
  but its tool list showed `list_resources` plus `auth_session`; the latter
  returned a `research_continue` payload without a distinct
  `research_continue` call. No generic search or mutation occurred. Exact-tool
  acceptance remains fail-closed pending connector metadata reconciliation.

- Closed provider-free ChatGPT Chat/Sol Configure live localization:
  [docs/dev/plans/0274-2026-08-11-chatgpt-chat-sol-configure-live-localization.md](docs/dev/plans/0274-2026-08-11-chatgpt-chat-sol-configure-live-localization.md)
  Exact no-prompt inspection found the current compact `EffortPro` submenu
  trigger and no Configure item. One executable red/green repair now supports
  that structurally bounded trigger; 311 adjacent tests plus type/build/lint/
  CodeGraph/planning validation pass. No prompt or runtime install ran.

- Closed fail-safe ChatGPT Chat/Sol integrated thinking-selector repair:
  [docs/dev/plans/0273-2026-08-11-chatgpt-chat-sol-thinking-selector-repair.md](docs/dev/plans/0273-2026-08-11-chatgpt-chat-sol-thinking-selector-repair.md)
  The provider-free fix, 310-test adjacent gate, install, and exact parity
  passed, but the sole zero-retry canary reproduced `menu-not-found` before
  prompt submission. No connector or LitScout effect occurred and no retry is
  authorized by the closed plan.

- Closed provider-free ChatGPT Chat/Work docs and skill update:
  [docs/dev/plans/0272-2026-08-11-chatgpt-chat-work-docs-skills-update.md](docs/dev/plans/0272-2026-08-11-chatgpt-chat-work-docs-skills-update.md)
  The repo-local skill, quick-start examples, provider-free test reference,
  manual regression, and browser-service guidance now preserve Chat as the
  default and Work as an explicit, separately selected mode. The skill and 111
  focused tests validate; no live or runtime control effect ran.

- Closed accepted scheduler pause/scope repair and live-follow reactivation:
  [docs/dev/plans/0269-2026-08-11-scheduler-pause-scope-repair-and-live-follow-reactivation.md](docs/dev/plans/0269-2026-08-11-scheduler-pause-scope-repair-and-live-follow-reactivation.md)
  The provider-free repair is pushed at `8000fdd5`. One installed paused-
  scheduler canary selected only `chatgpt/wsl-chrome-3`, completed cleanly with
  no cross-lane work, preserved all completion IDs/pass counts, and cleaned its
  exact browser owner. The sole resume then settled an effect-free delayed pass
  and remained unpaused/scheduled through four stable readbacks; live follow
  is active.

- Closed failed-safe one-pass account-mirror scheduler resume canary:
  [docs/dev/plans/0268-2026-08-11-one-pass-scheduler-resume-canary.md](docs/dev/plans/0268-2026-08-11-one-pass-scheduler-resume-canary.md)
  The sole pass was promptly re-paused but selected raw-eligible
  `wsl-chrome-2`, despite operator status projecting it paused, then post-pass
  reconciliation independently started default. Its pause did not join the
  in-flight collector: default advanced once and its sole child skipped
  `0/7/0` on attempt 1 with no downloads. Two owned trees were exactly cleaned,
  the child-owned third browser exited itself, and no second scheduler pass
  ran. The C5 mechanism is split scheduler/operator eligibility plus unscoped
  reconciliation and uncancelled paused-completion work.

- Closed accepted `wsl-chrome-3` pass-57 one-pass live-follow canary:
  [docs/dev/plans/0267-2026-08-11-wsl-chrome-3-pass-57-one-pass-live-follow-canary.md](docs/dev/plans/0267-2026-08-11-wsl-chrome-3-pass-57-one-pass-live-follow-canary.md)
  The sole control advanced exactly 56 -> 57. Its sole child succeeded on
  attempt 1 with six materialized PNGs, one skip, zero failures, six verified
  checksums, and matching provider-session identity. Parent absorption, API
  health/parity, zero exact ownership, unchanged wider passes 9/2/34, and the
  scheduler's paused/paused posture are all verified. No retry or wider resume
  ran.

- Closed accepted `wsl-chrome-3` route-bound payload one-canary gate:
  [docs/dev/plans/0266-2026-08-11-wsl-chrome-3-route-bound-payload-one-canary-gate.md](docs/dev/plans/0266-2026-08-11-wsl-chrome-3-route-bound-payload-one-canary-gate.md)
  The sole install established exact adapter parity and healthy API PID 1886.
  The sole zero-retry canary was accepted as exact terminal unavailability at
  attempt 1, without timeout, pending operation, or the prior
  payload-missing/home-route stage. Exact cleanup restored zero owners/jobs and
  an unbound port. Pass 56 and scheduler pause remain unchanged;
  materialization and scheduler/completion controls did not run.

- Closed provider-free ChatGPT route-bound payload reacquisition repair:
  [docs/dev/plans/0265-2026-08-11-chatgpt-route-bound-payload-reacquisition-provider-free-repair.md](docs/dev/plans/0265-2026-08-11-chatgpt-route-bound-payload-reacquisition-provider-free-repair.md)
  The sole public-seam red proved the fallback reloaded ChatGPT home. The
  adapter now arms exact response listeners and uses the shared governed
  navigation primitive for one forced exact-route reacquisition. Focused and
  adjacent tests pass 255/255, wider tests pass 144 with one intentional skip,
  and typecheck/build are green. Every live/runtime effect remained zero.

- Closed accepted `wsl-chrome-3` payload-route-class one-canary gate:
  [docs/dev/plans/0264-2026-08-11-wsl-chrome-3-payload-route-class-one-canary-gate.md](docs/dev/plans/0264-2026-08-11-wsl-chrome-3-payload-route-class-one-canary-gate.md)
  The sole install produced parity and healthy API PID 21763. The sole
  zero-retry canary was accepted as a classified diagnostic at attempt 1:
  payload missing, route home, no timeout, and no pending operation. Exact
  cleanup restored zero ownership. Pass 56 and scheduler pause are unchanged;
  no retry, materialization, or scheduler/completion control occurred.

- Closed provider-free ChatGPT post-payload route-loss localization:
  [docs/dev/plans/0263-2026-08-11-chatgpt-post-payload-route-loss-provider-free-localization.md](docs/dev/plans/0263-2026-08-11-chatgpt-post-payload-route-loss-provider-free-localization.md)
  Plan 0262's sole canary again ended at generic post-payload predicate failure
  while exact owned inspection found ChatGPT home. This provider-free slice
  binds that failure to a closed payload-shape and safe route class without
  changing behavior or retaining provider content. The exact red failed 2/2;
  198/198 focused/adjacent tests plus typecheck, build, scoped Biome, dry-run,
  and plan audit are green. Installation and browser work remained zero.

- Closed `wsl-chrome-3` terminal-unavailable one-canary gate without
  acceptance:
  [docs/dev/plans/0262-2026-08-11-wsl-chrome-3-terminal-unavailable-one-canary-gate.md](docs/dev/plans/0262-2026-08-11-wsl-chrome-3-terminal-unavailable-one-canary-gate.md)
  The provider-free repair is green and built but not installed. One fresh
  same-route, zero-retry canary is specified to accept either current context
  or the exact terminal-unavailable stage. The harness now makes that
  distinction from sanitized receipt fields only and rejects timeout, retry,
  pending-operation, and ambiguous-receipt near misses. The live packet is now
  frozen to one combined install/service restart, one exact canary, and
  ownership-checked cleanup; a second restart or unrelated-process kill is a
  hard stop. The unrelated AuraCall parent exited and left its exact-profile
  Chrome orphaned; the operator authorized closing it, and one attributed
  port-scoped close restored zero ownership. Fresh admission is green at Git
  `06bb93d1`, API PID 81249, scheduler paused/paused, target pass 56, and zero
  active work. The sole install reached exact parity and the sole zero-retry
  canary reproduced `postPayloadReadiness.failed.predicate_unsatisfied` rather
  than context or terminal unavailability. Exact inspection found ChatGPT home;
  cleanup restored zero ownership. Plan 0262 is exhausted without retry, while
  materialization and scheduler/completion control remained excluded.

- Closed ChatGPT exact-fallback terminal-unavailable provider-free repair:
  [docs/dev/plans/0261-2026-08-11-chatgpt-fallback-terminal-unavailable-provider-free-repair.md](docs/dev/plans/0261-2026-08-11-chatgpt-fallback-terminal-unavailable-provider-free-repair.md)
  The exact red proved fallback 404 was ignored. Exact fallback 404/410 now
  settles with a canonical sanitized terminal error before post-payload
  readiness, while direct-404/fallback-200 recovery remains green. Cached
  artifact/file history is retained and online-terminal rows are skipped before
  provider work or `maxItems=1`. All live/runtime effects were zero.

- Closed `wsl-chrome-3` evaluation-class one-canary gate:
  [docs/dev/plans/0260-2026-08-11-wsl-chrome-3-evaluation-class-one-canary-gate.md](docs/dev/plans/0260-2026-08-11-wsl-chrome-3-evaluation-class-one-canary-gate.md)
  Installed parity and API health passed. The one zero-retry canary failed at
  post-payload predicate readiness; exact owned inspection found the provider
  page on ChatGPT home rather than the admitted conversation route. Cleanup
  restored zero owners/jobs and the unbound port while pass 56 and scheduler
  pause remained unchanged. No retry or materialization ran.

- Closed provider-free first `Runtime.evaluate` diagnosis:
  [docs/dev/plans/0259-2026-08-11-chatgpt-first-runtime-evaluate-provider-free-diagnosis.md](docs/dev/plans/0259-2026-08-11-chatgpt-first-runtime-evaluate-provider-free-diagnosis.md)
  Plan 0258 cleared native launch but its sole canary failed with only a broad
  CDP method marker. Plan 0259 reproduced that ambiguity twice, added
  allowlisted completed failure classes, and fixed the ignored
  post-payload-readiness result. Focused and adjacent provider-free validation
  are green; browser/provider, install, scheduler/completion, and
  materialization effects remained zero.

- Closed `wsl-chrome-3` bounded-launch one-canary gate at first CDP evaluation:
  [docs/dev/plans/0258-2026-08-10-wsl-chrome-3-bounded-launch-one-canary-gate.md](docs/dev/plans/0258-2026-08-10-wsl-chrome-3-bounded-launch-one-canary-gate.md)
  The operator approved one install/restart and one zero-retry context read.
  Installed parity and API health passed; the launch repair advanced the sole
  canary from the former native-launch timeout into provider attempt 1, where
  it failed at `cdp:Runtime.evaluate` with no pending operation. Exact cleanup
  restored zero owners/jobs and an unbound port. The target remains pass 56
  and scheduler remains paused; materialization, completion/scheduler controls,
  prompts, downloads, retries, and wider profiles remained zero.

- Closed provider-free native Chrome launch localization:
  [docs/dev/plans/0257-2026-08-10-native-chrome-launch-provider-free-localization.md](docs/dev/plans/0257-2026-08-10-native-chrome-launch-provider-free-localization.md)
  Plan 0256's sole canary made zero provider attempts and stopped in native
  Chrome launch. Plan 0257 decomposes that broad stage, reproduces the pending
  await with fakes, bounds and aborts the launcher socket probe, joins launch
  settlement after cleanup, and exposes exact substages. Full validation is
  green. Its e2e suite accidentally launched one exact test-owned Chrome; that
  process was attributed and cleaned, and scheduler/materialization stayed
  paused.

- Closed `wsl-chrome-3` selector inspection and one-canary gate at native
  launch timeout:
  [docs/dev/plans/0256-2026-08-10-wsl-chrome-3-abort-repair-one-canary-gate.md](docs/dev/plans/0256-2026-08-10-wsl-chrome-3-abort-repair-one-canary-gate.md)
  The operator approved one shared exact-profile browser lifecycle: fresh
  agent-browser inspection of ChatGPT's changed model menu, provider-free
  selector mapping repair, one install/restart, one zero-retry context canary,
  and exact cleanup. Model selection, prompts, materialization,
  completion/scheduler control, retry, and wider profiles remain excluded.
  Inspection proved the nested Advanced -> Model/Effort structure and the
  selector repair is installed with exact parity. The sole canary timed out at
  `preflight:browserChromeLaunch` with `attemptCount=0`; cleanup returned exact
  owner/job counts to zero. No retry, provider extraction, materialization,
  completion/scheduler control, prompt, or download ran.

- Closed provider-free context-preflight abort and receipt-envelope repair:
  [docs/dev/plans/0255-2026-08-10-context-preflight-abort-and-receipt-envelope-repair.md](docs/dev/plans/0255-2026-08-10-context-preflight-abort-and-receipt-envelope-repair.md)
  The sole Plan 0254 canary made zero provider attempts and timed out in
  `preflight:buildListOptions`. Plan 0255 threads cancellation into managed
  browser launch, joins cleanup before rejection, and corrects cache-envelope
  receipt selection. Full provider-free validation is green; provider, browser,
  runtime, materialization, completion, scheduler, and guard effects were zero.

- Closed `wsl-chrome-3` installed one-canary gate at its preflight hard stop:
  [docs/dev/plans/0254-2026-08-10-wsl-chrome-3-governed-payload-one-canary-gate.md](docs/dev/plans/0254-2026-08-10-wsl-chrome-3-governed-payload-one-canary-gate.md)
  The install/restart achieved exact parity, but the sole zero-retry context
  command timed out before provider attempt 1 while resolving its managed
  browser target. Exact cleanup succeeded; no retry, materialization,
  completion control, scheduler control, or wider profile ran.

- Closed provider-free repair of governed ChatGPT payload reload settlement:
  [docs/dev/plans/0253-2026-08-10-chatgpt-governed-payload-reload-settlement-repair.md](docs/dev/plans/0253-2026-08-10-chatgpt-governed-payload-reload-settlement-repair.md)
  Deterministic reds proved the fallback body window began before the governor
  released the reload and per-read Network subscriptions survived settlement.
  The repair governs first, disposes both subscriptions, closes reload audit
  from exact response evidence, and joins abort cleanup. Provider-free focused
  and integrated validation is green; live/runtime effects remained zero.

- Closed direct agent-browser falsification of default pass-9 context stalls:
  [docs/dev/plans/0252-2026-08-10-default-context-timeout-agent-browser-falsification.md](docs/dev/plans/0252-2026-08-10-default-context-timeout-agent-browser-falsification.md)
  The control and all four failed routes are currently healthy in direct
  agent-browser inspection: direct 404s settle in under 0.4 seconds, exact
  fallback 200 bodies parse in 0.33-3.80 seconds, and all message pages are
  readable. Pass 9's pending payload receipt is therefore an AuraCall
  retained-client/callback/reload-settlement defect, not conversation or auth
  unavailability. Installed mutation evidence additionally proves a
  fire-and-forget reload can outlive its job and later fail on the closed
  retained WebSocket; whether that is cause or downstream cleanup symptom now
  needs a two-sequential-read provider-free red before repair or another
  canary.

- Stopped default pass-9 canary; scheduler remains paused:
  [docs/dev/plans/0251-2026-08-10-default-pass9-canary-and-scheduler-resume.md](docs/dev/plans/0251-2026-08-10-default-pass9-canary-and-scheduler-resume.md)
  The sole control advanced default exactly to pass 9, but child
  `hmj_22f3b386babb424fa0fc46e3a254f6bb` failed `0/3/4` after four exact
  `conversation_context_timeout` receipts at
  `provider:chatgpt.skipSameRouteNavigation`. Identity matched and cleanup is
  complete, but scheduler acceptance failed; resume did not run.

- Closed provider-free zero-asset evidence reconciliation:
  [docs/dev/plans/0250-2026-08-10-default-zero-asset-evidence-reconciliation.md](docs/dev/plans/0250-2026-08-10-default-zero-asset-evidence-reconciliation.md)
  The two Plan 0247 retryable rows are synthetic conversation-context timeout
  entries with no asset identity. Plan 0250 projected the two successful cached
  reads into current account-mirror evidence as routeable, detail-complete,
  zero-asset rows. Pre/post callback-disabled broad selection excluded both as
  `noSelectedAssetEvidence`; provider callbacks and selected candidates were
  zero. Historical job SHA-256 stayed unchanged, scheduler stayed paused, and
  materialization/completion/browser effects remained zero.

- Stopped default DOCX installed one-canary gate:
  [docs/dev/plans/0249-2026-08-10-default-docx-installed-one-canary-gate.md](docs/dev/plans/0249-2026-08-10-default-docx-installed-one-canary-gate.md)
  The sole install/restart produced exact adapter parity, but the exact
  `maxItems=1` job `hmj_42389669c0f141e9be2b83134cf9c80e` failed its running
  stale threshold at 120 seconds before transfer. A late manifest selected one
  DOCX but materialized zero with connection refused, downloads `0/0/0`, and
  no repaired label counter. The visible cached DOCX/archive row predates the
  canary. Plan 0249 is closed at its hard stop; completion and scheduler
  controls remain zero. The next work must be provider-free timeout/cleanup
  ordering diagnosis, not a retry.

- Closed default DOCX candidate-chat inspection and provider-free retrieval repair:
  [docs/dev/plans/0248-2026-08-10-default-docx-chat-inspection-and-retrieval-repair.md](docs/dev/plans/0248-2026-08-10-default-docx-chat-inspection-and-retrieval-repair.md)
  Both inspected candidate chats expose generated DOCX files through JavaScript buttons
  with no anchor URL. The current nested native-download control is labelled
  `Download file`, but the viewer fallback accepted only exact `Download`.
  The narrow matcher repair is covered by a deterministic red/green and a
  sanitized current-label counter; 278 focused and 2,766 full provider-free
  tests pass. No install, canary, completion, or scheduler effect ran.

- Stopped ChatGPT staged wider recovery and scheduler-last resume:
  [docs/dev/plans/0247-2026-08-09-chatgpt-staged-wider-recovery-and-scheduler-resume.md](docs/dev/plans/0247-2026-08-09-chatgpt-staged-wider-recovery-and-scheduler-resume.md)
  Plan 0246 proved the structured-exception repair with six materialized
  external images. Plan 0247 now owns one serialized bounded pass for each of
  the three paused ChatGPT lanes, one paused scheduler run-once canary, and
  scheduler resume only after every direct proof is green. The first default
  control advanced only pass 7 to 8, matched identity, then its sole child
  failed `0/5/2`; therefore the later lanes and every scheduler action stayed
  withheld. A provider-free successor must localize the two retryable failures
  before another canary. Gemini/Grok remain
  disabled and excluded. Fresh admission corrected the browser precondition:
  default and `wsl-chrome-2` each have one healthy exact retained browser that
  may be reused, while duplicate exact-profile ownership remains a hard stop.

- Completed ChatGPT file-retrieval provider-free repair iterations:
  [docs/dev/plans/0181-2026-08-01-chatgpt-file-retrieval-provider-free-repair-iterations.md](docs/dev/plans/0181-2026-08-01-chatgpt-file-retrieval-provider-free-repair-iterations.md)
  Five deterministic red/green repairs now preserve bounded response-shape
  evidence, classify structured availability, retain the strongest failure, and
  bound capture/fetch waits. Commits through `91fd08da` are pushed and installed
  at API PID `66696`; full validation and paused-runtime parity pass. No
  browser/provider work ran, and this closure does not re-enable the scheduler
  or continuous live follow.

- Completed ChatGPT same-route mutation and staged re-enablement repair:
  [docs/dev/plans/0180-2026-08-01-chatgpt-same-route-mutation-and-staged-reenablement.md](docs/dev/plans/0180-2026-08-01-chatgpt-same-route-mutation-and-staged-reenablement.md)
  Supporting execution campaign:
  [docs/dev/plans/0182-2026-08-03-chatgpt-live-follow-collision-suffix-repair-and-bounded-proof.md](docs/dev/plans/0182-2026-08-03-chatgpt-live-follow-collision-suffix-repair-and-bounded-proof.md).
  Closed terminal successor packet:
  [docs/dev/plans/0183-2026-08-03-chatgpt-installed-native-identity-decision-proof.md](docs/dev/plans/0183-2026-08-03-chatgpt-installed-native-identity-decision-proof.md).
  Closed provider-free successor:
  [docs/dev/plans/0184-2026-08-03-chatgpt-intercepted-response-identity-parity.md](docs/dev/plans/0184-2026-08-03-chatgpt-intercepted-response-identity-parity.md).
  Closed explicitly authorized two-gate live successor:
  [docs/dev/plans/0185-2026-08-04-chatgpt-two-gate-live-acceptance.md](docs/dev/plans/0185-2026-08-04-chatgpt-two-gate-live-acceptance.md).
  Closed staged re-enablement successor:
  [docs/dev/plans/0186-2026-08-04-chatgpt-default-two-pass-continuous-activation.md](docs/dev/plans/0186-2026-08-04-chatgpt-default-two-pass-continuous-activation.md).
  Closed backlog-policy review:
  [docs/dev/plans/0187-2026-08-04-chatgpt-default-backlog-policy-review.md](docs/dev/plans/0187-2026-08-04-chatgpt-default-backlog-policy-review.md).
  Closed controlled inventory-closure successor:
  [docs/dev/plans/0188-2026-08-04-chatgpt-default-controlled-detail-inventory-closure.md](docs/dev/plans/0188-2026-08-04-chatgpt-default-controlled-detail-inventory-closure.md).
  Closed provider-free selection diagnosis:
  [docs/dev/plans/0189-2026-08-04-chatgpt-materialization-selection-diagnosis.md](docs/dev/plans/0189-2026-08-04-chatgpt-materialization-selection-diagnosis.md).
  Closed observability/install/default-proof successor:
  [docs/dev/plans/0190-2026-08-04-chatgpt-materialization-candidate-observability-and-default-proof.md](docs/dev/plans/0190-2026-08-04-chatgpt-materialization-candidate-observability-and-default-proof.md).
  Closed provider-free candidate-funnel diagnosis:
  [docs/dev/plans/0191-2026-08-05-chatgpt-reconciliation-candidate-funnel.md](docs/dev/plans/0191-2026-08-05-chatgpt-reconciliation-candidate-funnel.md).
  Plan 0191 kept asset and conversation units separate and explained the
  contradiction: all 31 cached conversation rows fail exact bound-identity
  comparison because the request carries a plain account identity while the
  catalog carries a composite account-binding identity. The 14 retrievable
  missing-local assets therefore have zero admitted conversation owners under
  the current contract. Identity canonicalization or request-key propagation is
  the next separately reviewed semantic gate; install and live/control actions
  remain excluded.
  Closed canonical identity-admission successor:
  [docs/dev/plans/0192-2026-08-05-account-mirror-canonical-identity-admission.md](docs/dev/plans/0192-2026-08-05-account-mirror-canonical-identity-admission.md).
  Plan 0192 replaces reconciliation's raw identity equality with the existing
  provider-aware tenant-binding semantics. Equivalent plain and composite
  ChatGPT identities now match, while conflicts, missing identities, malformed
  composites, and incomparable Grok identity classes remain excluded. The
  current cached catalog advances from 31 false identity mismatches to 1
  eligible conversation plus 30 rows with no selected asset evidence. This
  packet closed provider-free; install and all live/control actions remain
  excluded.
  Closed installed-canary successor:
  [docs/dev/plans/0193-2026-08-05-canonical-identity-installed-canary.md](docs/dev/plans/0193-2026-08-05-canonical-identity-installed-canary.md).
  The operator explicitly authorized one installation of the pushed Plan 0192
  build followed by one `chatgpt/default` artifacts+files reconciliation
  canary at `maxItems=1`, no refresh, no force, and no retry. The sole canary
  admitted and selected one of 31 conversations, materialized one canvas text
  artifact, and failed/skipped nothing. Scheduler and completions remain
  paused; no unattended continuation is authorized.
  Closed fail-closed provider-free post-canary reassessment:
  [docs/dev/plans/0194-2026-08-05-post-canary-provider-free-inventory-reassessment.md](docs/dev/plans/0194-2026-08-05-post-canary-provider-free-inventory-reassessment.md).
  The raw catalog and exact Plan 0193 archive row support a derived 61 missing /
  13 retrievable / 48 metadata-only expectation, but both the public planner
  and in-memory funnel stop on an unrelated unavailable `/mnt/h` archive
  source before returning current classifications. No live/control action ran.
  The next gate is a provider-free archive/search filtering repair, not another
  materialization job.
  Completed archive-scope and moved-path repair:
  [docs/dev/plans/0195-2026-08-05-archive-scope-hydration-and-moved-path-repair.md](docs/dev/plans/0195-2026-08-05-archive-scope-hydration-and-moved-path-repair.md).
  Stable archive filters now apply before filesystem hydration, the exact moved
  transcript path is repaired across its three durable records, and the
  installed provider-free proofs pass. Current default recovery is 62 missing /
  14 retrievable / 48 metadata-only; the conversation funnel is 31 discovered,
  one eligible, zero selected under `maxItems=0`. Scheduler and six completions
  remain paused; no further materialization is authorized.
  Completed availability-metadata normalization goal:
  [docs/dev/plans/0196-2026-08-05-archive-availability-metadata-normalization.md](docs/dev/plans/0196-2026-08-05-archive-availability-metadata-normalization.md).
  The deterministic contract is red under the prior behavior and green with a
  one-helper source repair that clears only refresh-owned unavailable evidence
  after successful hydration. The pushed runtime is installed with exact hash
  parity; the known row is available and its persisted stale keys are absent.
  Recovery remains 62 missing / 14 retrievable / 48 metadata-only. Scheduler
  and six completions remain paused, jobs remain zero, and no provider/browser
  or control action ran.
  Closed provider-free next-conversation/asset resolution and one-canary gate:
  [docs/dev/plans/0197-2026-08-06-provider-free-next-asset-resolution-and-one-canary-gate.md](docs/dev/plans/0197-2026-08-06-provider-free-next-asset-resolution-and-one-canary-gate.md).
  Two in-memory `maxItems=1` simulations with provider callbacks disabled bind
  conversation `67ccf9d7-9310-8004-b5e1-478dba6eab3a` and canvas
  `canvas:67ccf9fbca7c81918873702a1d607c72`. That canvas is already readable from
  Plan 0193, but current terminal evidence calls its family `unknown` while the
  catalog calls it `canvas`; the one-canary gate is therefore prepared but
  `NOT_READY_DUPLICATE_ASSET_SELECTION`. Scheduler and six completions remain
  paused, and no materialization job or provider/browser/control action ran.
  Closed provider-free terminal-family successor:
  [docs/dev/plans/0198-2026-08-06-terminal-asset-family-canonicalization-and-provider-free-reselection.md](docs/dev/plans/0198-2026-08-06-terminal-asset-family-canonicalization-and-provider-free-reselection.md).
  Plan 0198's one-line namespace repair is green across 73 focused history
  tests, 314 adjacent tests, typecheck, lint, the serialized 304-file / 2,716-
  test suite, and the sole build. Installed hash parity is exact. Provider-free
  reselection now skips the canvas, but the exact next image is also already
  readable locally; raw plain-versus-composite identity comparison excludes its
  archive evidence. The gate closes `NOT_READY_DUPLICATE_ASSET_SELECTION` with
  scheduler and six completions paused and no durable job, provider/browser
  contact, or materialization.
  Completed provider-free archive identity-admission successor:
  [docs/dev/plans/0199-2026-08-06-archive-terminal-identity-admission-and-provider-free-reselection.md](docs/dev/plans/0199-2026-08-06-archive-terminal-identity-admission-and-provider-free-reselection.md).
  Plan 0199 applies the existing positive provider-aware identity matcher only
  to readable archive family evidence. Installed provider-disabled `maxItems=1`
  now suppresses the canvas and Generated-image duplicates, then resolves the
  exact cone cross-section download. The one-canary contract is frozen at
  `READY_EXPLICIT_APPROVAL_REQUIRED`; historical jobs, account-library
  admission, selection order, and all live/control surfaces remain unchanged,
  and no canary ran.
  Completed exact one-canary successor:
  [docs/dev/plans/0200-2026-08-06-exact-cone-cross-section-one-canary.md](docs/dev/plans/0200-2026-08-06-exact-cone-cross-section-one-canary.md).
  Sole job `hmj_36a5e33bebda40b7961cba2750a8ac9a` matched every frozen field
  and settled `skipped` on attempt 1. Provider identity matched all four
  dimensions, but the exact artifact yielded zero download attempts and no
  local/archive asset. Plan 0200 closes `COMPLETE_TERMINAL_NO_MATERIALIZATION`;
  no retry, substitute target, refresh, force, browser-tools, control action,
  or loop resume ran.
  Completed provider-free diagnosis successor:
  [docs/dev/plans/0201-2026-08-06-cone-sandbox-live-control-provider-free-diagnosis.md](docs/dev/plans/0201-2026-08-06-cone-sandbox-live-control-provider-free-diagnosis.md).
  The fresh context retained the payload-only cone while exposing only two
  unrelated later DOCX controls; unmatched payload downloads receive no
  non-actionable state, so the cone consumed `maxItems=1` and timed out in
  control tagging before download accounting. Plan 0201 closes
  `COMPLETE_DIAGNOSED_REPAIR_WITHHELD`; source/test changes, live retry,
  provider/browser contact, materialization, and loop/control actions remain
  withheld.
  Completed provider-free live-control admission successor:
  [docs/dev/plans/0202-2026-08-06-chatgpt-payload-live-control-admission-provider-free-repair.md](docs/dev/plans/0202-2026-08-06-chatgpt-payload-live-control-admission-provider-free-repair.md).
  Plan 0202 installs one shared payload-to-DOM control resolver, explicit
  `missing_live_control` admission before item budgeting/provider callback,
  positive canonical identity enrichment, and exact provider-free fixtures.
  Installed `maxItems=1` proof classifies the cone as unavailable and invokes
  zero provider callbacks. The prior cone canary is therefore invalidated, not
  approved; scheduler and six completions remain paused and no job or
  materialization ran.
  Completed exact fresh-control read successor:
  [docs/dev/plans/0203-2026-08-06-exact-cone-fresh-live-control-read-and-canary-readjudication.md](docs/dev/plans/0203-2026-08-06-exact-cone-fresh-live-control-read-and-canary-readjudication.md).
  Its sole exact-conversation refresh remained silent for more than thirty
  minutes and was interrupted once with exit 130; no complete fresh cache
  receipt appeared. Provider-free adjudication therefore closes
  `STOPPED_FAIL_CLOSED`, with the one-canary gate withheld and zero jobs,
  downloads, materializations, retries, substitutes, or loop/control actions.
  Completed provider-free timeout/receipt successor:
  [docs/dev/plans/0204-2026-08-06-bounded-conversation-context-read-timeout-and-terminal-receipt.md](docs/dev/plans/0204-2026-08-06-bounded-conversation-context-read-timeout-and-terminal-receipt.md).
  Plan 0204 installs one shared 120-second deadline, composed cancellation,
  non-retryable timeout/abort errors, and a bounded durable last-stage receipt.
  The never-promise regression and installed provider-free proof both terminate
  once with propagated abort; source/runtime hashes match. API PID 16737 is
  healthy with scheduler and six completions paused, default pass 4, idle
  foreground, clear ChatGPT guards, and zero active history jobs. Provider/
  browser contact, another live refresh, canary, materialization, and loop or
  control action remain withheld.
  Closed bounded exact-read successor:
  [docs/dev/plans/0205-2026-08-06-bounded-exact-cone-context-refresh-and-canary-readjudication.md](docs/dev/plans/0205-2026-08-06-bounded-exact-cone-context-refresh-and-canary-readjudication.md).
  The sole installed exact-conversation refresh exited 1 without retry on
  `provider_session_provenance_missing`. Its terminal receipt records one
  failed attempt and the cached context remains unchanged, so the cone still
  lacks current live-control evidence. Plan 0205 closes `STOPPED_FAIL_CLOSED`;
  no browser-tools follow-up, canary, job, materialization, download, prompt,
  scheduler/completion/guard action, or loop resume ran.
  Closed provider-free provenance repair:
  [docs/dev/plans/0206-2026-08-06-provider-session-provenance-provider-free-repair.md](docs/dev/plans/0206-2026-08-06-provider-session-provenance-provider-free-repair.md).
  It proved double normalization erased already-resolved ownership fields and
  now reuses provenance only for the exact same browser-service and authority
  objects. Source and installed provider-free proofs are green with exact hash
  parity. Provider/browser contact, another context refresh, canary, job,
  materialization, download, prompt, and scheduler/completion/guard or loop
  action remain withheld.
  Closed post-repair exact-read successor:
  [docs/dev/plans/0207-2026-08-06-post-repair-bounded-context-read-and-canary-gate.md](docs/dev/plans/0207-2026-08-06-post-repair-bounded-context-read-and-canary-gate.md).
  Its sole installed context refresh reached outer-ceiling exit 124 after
  143.90 measured seconds and did not preserve a fresh receipt or context. The
  stale payload-only cone is not promoted to current evidence, so Plan 0207
  closes `STOPPED_FAIL_CLOSED`; no retry, canary, job, materialization, prompt,
  download, or scheduler/completion/guard/loop action ran.
  Closed provider-free command-lifecycle repair successor:
  [docs/dev/plans/0208-2026-08-07-context-read-command-lifecycle-timeout-receipt-repair.md](docs/dev/plans/0208-2026-08-07-context-read-command-lifecycle-timeout-receipt-repair.md).
  It installs one command-lifecycle deadline across pre-provider target/session
  and cache-identity setup plus provider work. Provider-free preflight hangs
  terminate with attempt count zero, propagated abort, durable stage-specific
  receipts, and zero provider callbacks; source/runtime hashes match. The
  browser remains healthy, scheduler and six completions remain paused, and
  active history jobs are zero. Provider/browser contact, another context
  refresh, canary, job, materialization, download, prompt, and scheduler/
  completion/guard/loop action remain withheld.
  Closed fail-closed bounded live-follow re-enablement successor:
  [docs/dev/plans/0209-2026-08-07-bounded-live-follow-reenablement.md](docs/dev/plans/0209-2026-08-07-bounded-live-follow-reenablement.md).
  Version 2 records the successful 17.24-second post-repair exact read and a
  provider-free successor gate after the frozen cone disappeared from current
  context. Two callback-disabled simulations select exactly one current file
  in the same conversation and leave the durable 1,863-job index unchanged.
  Its sole no-retry `maxItems=1` canary for provider file
  `file-JDW8WW7tqtwQu1gF1S4kWP` matched the exact tile and all four account
  dimensions, but ChatGPT returned terminal `file_not_found` /
  `GetDownloadLinkError`. Materialized output is zero, so staged completion
  and scheduler resume did not run and require a new explicit canary gate.
  Gemini, Grok, guarded, disabled, and unconfigured targets remain excluded.
  Closed fail-closed bounded successor:
  [docs/dev/plans/0210-2026-08-07-live-follow-successor-canary-and-staged-reenablement.md](docs/dev/plans/0210-2026-08-07-live-follow-successor-canary-and-staged-reenablement.md).
  Goal governance treats Plan 0209's hard stop as the end of that bounded
  execution window, not revocation of the operator-approved re-enablement
  objective. Version 2 rejects the next file because retained history carries
  the same missing-download-URL invariant as the terminal ROMP file, then
  provider-free selection freezes one never-attempted generated-image pointer
  in the same conversation. Its exact archive/job/filesystem readbacks are
  zero and the durable index is unchanged; only this audited/pushed
  `maxItems=1` artifact gate may create one canary. That canary succeeded on
  attempt 1 with one 218,312-byte PNG, matching checksum/manifest/archive
  evidence, and zero skipped/failed items. Its one default pass advanced
  metadata and matched identity, but retained-policy materialization captured a
  neighboring `.docx` response for a requested `.txt`. The late identity guard
  prevented wrong bytes, blocked the default completion, and stopped all wider
  target/scheduler resume.
  Closed capture-repair successor:
  [docs/dev/plans/0211-2026-08-07-chatgpt-cross-asset-capture-repair-and-live-follow-recovery.md](docs/dev/plans/0211-2026-08-07-chatgpt-cross-asset-capture-repair-and-live-follow-recovery.md).
  It moves exact/collision/provider-ID validation into the signed-content
  candidate loop so an unrelated successful response cannot win the capture
  race. Installed parity and the exact repaired-lane proof are green; default
  pass 6 also settled cleanly. The next `wsl-chrome-2` resume failed before
  materialization with missing provider-session observation, so default was
  re-paused and wider resume stopped.
  Closed identity-observation successor:
  [docs/dev/plans/0212-2026-08-07-wsl-chrome-2-provider-session-observation-recovery.md](docs/dev/plans/0212-2026-08-07-wsl-chrome-2-provider-session-observation-recovery.md).
  It permitted one read-only inspection of the exact existing managed browser.
  The human login gate was cleared, exact authenticated Pro UI was observed,
  and replacement `wsl-chrome-2` plus default produced four clean child
  receipts with matching identity and zero failures. The staged
  `wsl-chrome-3` child then stopped on two 120-second context-read timeouts with
  downloads `0/0/0`; full receipt evidence classifies both as retryable rather
  than terminal asset families. Version 2 permits exactly one blocked
  `wsl-chrome-3` `run_one_pass` recovery while every other completion and the
  scheduler remain paused. The retry made one useful asset but repeated the
  same visible-file context timeout, so Plan 0212 closed fail-closed.
  Closed local-repair successor:
  [docs/dev/plans/0213-2026-08-07-chatgpt-visible-file-scan-timeout-repair.md](docs/dev/plans/0213-2026-08-07-chatgpt-visible-file-scan-timeout-repair.md).
  It narrows repair to the injected 20-pass full-DOM visible-file scan, requires
  red/green provider-free proof and installed parity, and permits one exact
  post-repair `wsl-chrome-3` pass before any wider completion/scheduler resume.
  The provider-free repair is green and installed with exact source/runtime
  hash parity: the injected reader now performs exactly one collection after
  its existing readiness gate; adapter tests pass 141/141, adjacent suites
  183/183, and typecheck/lint/build pass. The sole post-repair pass advanced
  `wsl-chrome-3` to pass 41 and its child matched identity and made useful yield
  `2/4/1`, proving the visible-file stage no longer owns the timeout. The same
  large conversation now exhausts the context deadline later at
  `provider:chatgpt.readConversationMessages`, whose single CDP expression
  reads and returns every message's complete `innerText`. Plan 0213 therefore
  closes fail-closed; no wider completion or scheduler resume ran.
  Closed provider-free message-extraction successor:
  [docs/dev/plans/0214-2026-08-07-chatgpt-message-extraction-chunking-and-canary-gate.md](docs/dev/plans/0214-2026-08-07-chatgpt-message-extraction-chunking-and-canary-gate.md).
  It replaces the single all-message `innerText` evaluation with ordered pages
  of eight `textContent` reads. Every page carries both a DevTools execution
  timeout and a transport timeout, while non-advancing or oversized scans fail
  closed. Adapter tests pass 144/144; adjacent context/materialization/
  completion suites pass 195/195; typecheck, touched lint, build, and plan audit
  pass. Install, restart, provider work, completion controls, and scheduler
  controls did not run. The exact pass-42 `wsl-chrome-3` canary is frozen for a
  later explicit install/effect gate.
  Closed installed pass-42 canary successor:
  [docs/dev/plans/0215-2026-08-07-chatgpt-message-reader-installed-pass-42-canary.md](docs/dev/plans/0215-2026-08-07-chatgpt-message-reader-installed-pass-42-canary.md).
  The sole install and API restart produced exact source/runtime adapter hash
  parity and a healthy service. The sole `wsl-chrome-3` control advanced pass
  41 to 42 and created exactly one identity-matched child, but that child
  failed conversations/materialized/skipped/failed `6/0/3/4`. Full retained
  evidence shows four distinct 120000-ms conversation-context timeouts after
  one successful refresh. The parent is blocked/pass 42 with its force ceiling
  cleared, no pass 43, active jobs zero, other completions unchanged, and the
  scheduler paused. Plan 0215 closes fail-closed with no retry or wider resume.
  Closed iterative provider-free live-follow repair successor:
  [docs/dev/plans/0216-2026-08-07-live-follow-context-deadline-iteration.md](docs/dev/plans/0216-2026-08-07-live-follow-context-deadline-iteration.md).
  It uses the retained per-conversation receipts to separate one successful
  16490-ms read, one timeout at `cdp:Runtime.evaluate`, and three later
  timeouts at `provider:chatgpt.skipSameRouteNavigation`. Across at most ten
  goal turns including authority setup, it first promotes those receipts into
  full job evidence, then provider-free reproduces and repairs only proven
  unbounded payload/cleanup stages. Install, restart, provider/browser work,
  completion controls, materialization starts, and scheduler controls remain
  excluded; a pass-43 canary may only be prepared for a separate effect gate.
  Packet A is now provider-free green: caller receipt emission and complete-job
  retention pass on both success and timeout/failure paths, resolving F01
  without adding raw conversation content or account identity to job evidence.
  Packets B-D then proved and repaired F02/F03: payload fetch/evaluation now has
  browser, protocol, and transport deadlines, and abort evicts and awaits a
  retained provider session before the next read. The integrated provider-free
  gate passes `303/303`; F04 has no remaining evidence-backed blocker. Plan
  0216 is closed with no live effect. Prepared installed pass-43 canary gate:
  [docs/dev/plans/0217-2026-08-07-chatgpt-context-deadline-installed-pass-43-canary.md](docs/dev/plans/0217-2026-08-07-chatgpt-context-deadline-installed-pass-43-canary.md).
  Closed fail-closed after its unchanged packet: the sole install and restart
  produced exact parity and healthy API PID 81696, and the sole control advanced
  `wsl-chrome-3` pass `42 -> 43` with exactly one child. That child matched all
  provider identity dimensions but failed `4` of `6` conversations; all four
  retained receipts timed out once near 110 seconds at
  `provider:chatgpt.skipSameRouteNavigation`. The parent is blocked/pass 43
  with no force ceiling, jobs are zero, other passes remain `7/2/34`, and the
  scheduler remains paused. No retry or wider resume is authorized.
  Closed provider-free same-route diagnosis successor:
  [docs/dev/plans/0218-2026-08-08-chatgpt-same-route-context-stall-provider-free-repair.md](docs/dev/plans/0218-2026-08-08-chatgpt-same-route-context-stall-provider-free-repair.md).
  It requires a deterministic fake-CDP red sequence before any repair, permits
  one proven source seam plus integrated provider-free validation, and may only
  prepare a fresh `wsl-chrome-3` canary behind separate approval. Install,
  restart, provider/browser work, materialization starts, completion controls,
  and scheduler controls remain excluded.
  The exact fake-CDP regression was red on a fifth redundant readiness
  evaluation after successful same-route settle and is now green with four
  evaluations. Integrated adapter/lifecycle/context/history/completion tests
  pass `304/304`; typecheck, touched lint, build, plan audit, and diff hygiene
  pass. Plan 0218 closes provider-free. Prepared pass-44 installed canary gate:
  [docs/dev/plans/0219-2026-08-08-chatgpt-same-route-repair-installed-pass-44-canary.md](docs/dev/plans/0219-2026-08-08-chatgpt-same-route-repair-installed-pass-44-canary.md).
  The operator has explicitly authorized its unchanged frozen packet. Fresh
  preflight is exact at clean pushed commit `d5844da1`, source/installed hashes
  `688442b5...ef0b7` / `1ccee21f...a7ed667`, API PID 81696, jobs zero,
  scheduler paused, and passes `7/2/34/43`. No live effect has run at this
  authority checkpoint.
  Plan 0219 is now closed fail-closed. The sole install/restart produced exact
  adapter parity and healthy API PID 9910; the sole control advanced pass
  `43 -> 44` with exactly child `hmj_fbbe8fa545fd4589b505706053b31f4d`.
  Identity matched, but the child again failed `4` of `6` contexts after four
  one-attempt timeouts near 109.5 seconds at
  `provider:chatgpt.skipSameRouteNavigation`. Parent is blocked/pass 44 with no
  force ceiling, active jobs zero, wider passes `7/2/34`, and scheduler paused.
  No retry or wider resume is authorized.
  Open provider-free post-navigation diagnosis successor:
  [docs/dev/plans/0220-2026-08-08-chatgpt-post-navigation-context-stall-diagnosis-and-repair.md](docs/dev/plans/0220-2026-08-08-chatgpt-post-navigation-context-stall-diagnosis-and-repair.md).
  Structural evidence narrows the unobserved zone after the same-route marker
  to a bounded payload read followed by an unconditional post-payload
  readiness wait whose individual CDP evaluation is not interruptible. The
  plan requires a tight red sequence before accepting that candidate, permits
  one provider-free repair seam, and keeps all installed/browser/control
  effects excluded.
  Plan 0220 now closes provider-free at pushed repair commit `435b1cd8`. The
  corrected eighth-call regression is red in 14 ms and green in 9 ms; the
  post-payload readiness request now carries protocol and transport bounds and
  emits its own stage marker. Integrated validation passes `387/387`, plus
  typecheck, build, lint, plan audit, and diff hygiene. Prepared pass-45 gate:
  [docs/dev/plans/0221-2026-08-08-chatgpt-post-payload-readiness-installed-pass-45-canary.md](docs/dev/plans/0221-2026-08-08-chatgpt-post-payload-readiness-installed-pass-45-canary.md).
  Its sole install/restart produced parity and a healthy API, but the sole pass
  `44 -> 45` child failed `6/0/3/4`; four one-attempt contexts again timed out
  near 109 seconds after the same-route marker. Plan 0221 is fail-closed with
  no retry; scheduler and wider completions remain stopped.
  Closed provider-free pending-operation observability diagnosis:
  [docs/dev/plans/0222-2026-08-08-chatgpt-post-navigation-pending-operation-observability.md](docs/dev/plans/0222-2026-08-08-chatgpt-post-navigation-pending-operation-observability.md).
  Its real adapter/receipt fake-CDP sequence is red twice because the receipt
  can name only the last completed marker, then green after one bounded
  telemetry seam separately records the pending payload operation. Focused
  tests pass 235/235 and the adjacent gate passes 390/390 with typecheck,
  build, touched lint, plan audit, and diff hygiene. Installed runtime,
  browser/provider work, materialization, completion controls, and scheduler
  controls remain excluded; repair commit `77b8057b` is pushed while source and
  installed adapter hashes intentionally differ. A fresh canary requires a
  separate effect gate.
  Closed up-to-three-canary successor:
  [docs/dev/plans/0223-2026-08-08-chatgpt-pending-operation-installed-up-to-three-canaries.md](docs/dev/plans/0223-2026-08-08-chatgpt-pending-operation-installed-up-to-three-canaries.md).
  One install/restart produced exact parity and three serialized canaries
  advanced only passes 45-48. All three children failed `6/0/3/4`; across 12
  timeout receipts, nine name the pending payload read and three remain
  CDP-localized. Plan 0223 closes attempts-exhausted fail-closed at pass 48;
  scheduler and wider completions remain paused and no fourth canary is
  authorized.
  Authorized bounded direct diagnostic:
  [docs/dev/plans/0224-2026-08-08-chatgpt-payload-direct-agent-browser-diagnostic.md](docs/dev/plans/0224-2026-08-08-chatgpt-payload-direct-agent-browser-diagnostic.md).
  It permits one exact AuraCall-profile launch, one agent-browser attachment,
  and one raw-content-free milestone probe against one repeatedly failing
  payload. It excludes conversation navigation, reload, materialization,
  completion/scheduler controls, install, restart, and retry.
  Plan 0224 stopped before attachment when the exact browser selected live port
  45044 instead of configured port 45015. Closed zero-additional-launch successor
  [docs/dev/plans/0225-2026-08-08-chatgpt-payload-live-port-agent-browser-continuation.md](docs/dev/plans/0225-2026-08-08-chatgpt-payload-live-port-agent-browser-continuation.md)
  bound the already-launched PID/port and completed one raw-content-free probe.
  The initial direct request returned JSON 404 in 312 ms, rejecting standalone
  fetch/body/parse/transfer as the long stall and proving entry into the later
  reload/network-capture fallback. That fallback clears its body timer before
  an unbounded `Network.getResponseBody`; a provider-free red is next.
  Closed provider-free successor:
  [docs/dev/plans/0226-2026-08-08-chatgpt-fallback-response-body-deadline.md](docs/dev/plans/0226-2026-08-08-chatgpt-fallback-response-body-deadline.md).
  Its exact fake-CDP sequence remained pending after 10001 ms, then resolved
  null at 9001 ms after one response-body deadline seam preserved the outer
  fallback guard. Adapter tests pass 150/150 and the integrated gate passes
  306/306 with typecheck, build, touched Biome, audit, and diff hygiene.
  Closed unsuccessful one-canary successor:
  [docs/dev/plans/0227-2026-08-08-chatgpt-fallback-body-installed-pass-49-canary.md](docs/dev/plans/0227-2026-08-08-chatgpt-fallback-body-installed-pass-49-canary.md).
  One install/restart reached exact parity; the sole pass `48 -> 49` child
  failed `6/0/3/4`. Four timeouts near 115.1 seconds again named the pending
  payload read. Closed mandatory direct successor:
  [docs/dev/plans/0228-2026-08-08-chatgpt-fallback-sequence-agent-browser-emulation.md](docs/dev/plans/0228-2026-08-08-chatgpt-fallback-sequence-agent-browser-emulation.md).
  Its sole direct request returned JSON 404 in 177 ms, while the sole reload
  emitted exactly one 200 response for the conversation API, rejecting both
  direct-path drift and the no-response hypothesis. The raw network listing
  exposed sensitive authentication headers, so execution hard-stopped before
  response-detail/body retrieval and the browser was closed. Credential
  rotation plus a provider-free redaction-pipeline proof are prerequisites to
  any separately authorized continuation; source, scheduler, wider completion,
  materialization, and further canary effects remain withheld.
  Closed provider-free prerequisite:
  [docs/dev/plans/0229-2026-08-08-agent-browser-network-metadata-redaction-harness.md](docs/dev/plans/0229-2026-08-08-agent-browser-network-metadata-redaction-harness.md).
  Its exact-envelope red exposed every synthetic secret-bearing field. The
  final 10/10 suite proves internally captured exact-URL request discovery plus
  bounded detail reduction, including real child timeout/output-cap behavior,
  without public request IDs, URLs, headers, bodies, stderr, or child errors.
  Closed operator-risk-accepted continuation:
  [docs/dev/plans/0230-2026-08-08-chatgpt-post-rotation-response-detail-discrepancy.md](docs/dev/plans/0230-2026-08-08-chatgpt-post-rotation-response-detail-discrepancy.md).
  On 2026-08-09 the operator explicitly accepted reuse of the unrotated session,
  waived reauthentication for this packet, and approved one live diagnostic;
  its `OPEN` authority was pushed at `3dff37f1`. The exact session repeated the
  direct JSON 404 in 313 ms, then the safe helper timed out at its 5004-ms
  discovery boundary with no candidate selected, before response detail or
  `Network.getResponseBody`. This is D8: the 5-second discovery child deadline
  is below the roughly 8.7-10.5-second process latency observed for ordinary
  agent-browser commands in that session. The browser is closed and stopped
  runtime boundaries are unchanged. Any successor is provider-free first;
  retry, source, canary, materialization, completion, scheduler, and wider
  resume remain prohibited.
  Plan 0190 added explicit eligible/selected candidate observability, passed the
  full provider-free gate, installed the pushed runtime with exact parity, and
  consumed its sole default-account proof. The job reported eligible 0,
  selected 0, materialized 0, skipped 0, and failed 0, so the plan closed
  `COMPLETE_AUTHORITY_WITHHELD`. Scheduler and six completions remain paused;
  any further live or unattended action requires new explicit authority.
  Plan 0188 used two of three permitted one-at-a-time controls and stopped early
  at zero detail surfaces with metadata complete. Both jobs were clean but
  materialized nothing; combined with Plan 0186, four jobs total 0 materialized
  / 28 skipped / 0 failed while 62 known remote assets remain missing locally.
  The next gate is routeability/materializer-selection diagnosis, not another
  live-follow pass. Automatic cadence and scheduler resume remain excluded.
  Plan 0187 rejects unattended continuation from the current evidence. Ten
  detail surfaces remain while 62 known remote assets are missing locally, and
  two clean materialization jobs produced zero downloads. The next eligible
  packet is at most three individually observed `run-one-pass` controls on the
  existing default completion, stopping early at zero detail surfaces before
  reclassifying materialization convergence. It is proposed, not authorized.
  Plan 0186 proved exactly two cadence-driven `chatgpt/default` passes and two
  clean owned-job settlements, then paused the exact completion before its
  third-pass gate. The pause persisted across that gate with no third job;
  scheduler and six retained completions are paused and active work is zero.
  Ten detail surfaces remain. Global scheduler resume, other target resumes,
  and indefinite leave-running authority remain excluded.
  Plan 0185 preserves the two prior failures as history. Its sole fresh direct
  proof materialized byte-identical TXT plus valid, content-verified DOCX at
  2/0. Its conditional default canary then completed exactly one pass; the
  owned job settled with 0 failures and zero duplicate same-route mutations.
  Plans 0185 and 0180 are complete. Scheduler and retained completions remain
  paused; continuous re-enablement is a separate operator decision.
  Plan 0184 repaired, validated, pushed, and installed the separate
  intercepted-response collision-suffix boundary without live work. Both
  filename gates now share one strict classifier and preserve provider-file URL
  authority; 2,714 provider-free tests pass. The goal-wide 2/2 failure ceiling
  was not reset. The operator supplied new explicit authority on 2026-08-04
  through Plan 0185's distinct one-shot direct-proof and conditional-canary
  ledger; this does not erase or relabel the prior failures.
  Plan 0183 proved the native collision-suffix scenario through built and
  installed public adapter boundaries and installed sanitized decision
  telemetry. Its sole direct proof then failed before that branch: the separate
  intercepted-response validator rejected catalog `...(7).txt` versus the
  unsuffixed response, leaving no `nativeIdentity.*` counter. The DOCX passed;
  the TXT was not published. The goal-wide live-failure ceiling is exhausted
  at 2/2 and the Plan 0183 conditional canary did not run. Closed Plan 0185
  later supplied distinct explicit authority and completed the remaining M5
  gates without rewriting that history.
  Plan 0182 is closed at its configured first-live-failure stop. Its repair is
  pushed, validated, and installed byte-identically, but the sole fresh direct
  job again ended 1 materialized / 1 failed on catalog `...(6).txt` versus
  native `....txt` identity despite the installed symmetric helper. The DOCX
  passes exact structural/content/visual QA; no TXT was published. W5 did not
  run, no retry is authorized, and the next gate is provider-free evidence at
  the installed decision branch. Scheduler/continuous re-enablement remains
  out of scope.
  Red regressions reproduced redundant physical navigation on an already-ready
  conversation route and ungoverned recovery reloads. The deep browser-service
  repair now suppresses canonical same-route mutations and routes every actual
  navigation/reload through the existing interaction governor. Commit/install
  parity and exact asset-identity repair are green. The latest authorized
  default-profile canary proved zero duplicate same-route mutations, then its
  owned job failed one transcript as `retrieval_failed` after HTTP 200 JSON
  omitted a download URL. Direct CDP inspection on the correct `default` browser
  profile has now confirmed that exact visible tile is stale: its authenticated
  endpoint returns `file_not_found` / `GetDownloadLinkError`. Commit `ff45b48f`
  normalizes ChatGPT's live snake-case error envelope so future observations are
  terminal `provider_unavailable`, not ambiguous retrieval failures. The canary
  also exposed a bounded-parent status defect: it reported completed before the
  failed job settled. Commit `fd5587c2` repairs that provider-free lifecycle boundary and
  is pushed and installed at API PID `77948` with source/installed parity,
  scheduler pause, five paused completions, and zero active jobs intact. M5
  remains open because the consumed canary materialized 0 and failed 1.
  Provider-free commit `bd69437f` now accepts bounded alternate signed-URL JSON
  shapes from ChatGPT `files-download` and is installed at API PID `91466` with
  hash parity and the paused posture intact. This repairs a retrieval defect but
  does not make the exact transcript retrievable. It is provider-confirmed
  unavailable, the historical receipt remains unchanged, and M5 stays open
  because the consumed canary materialized 0/1. Any successful replacement live
  proof and scheduler/continuous live-follow re-enablement require separate
  explicit authority.
  The next authorized exact-file positive control failed closed because the
  catalog-item route selected a different conversation file before applying
  `maxItems = 1`. Job `hmj_4295f645a45a4cfd881bdc6c4d7c871a` attempted the
  Introduction transcript instead of the requested Exam DOCX and correctly
  classified that different file as `provider_unavailable`. Commit `eccb3780`
  preserves exact catalog ID/name/provider-file identity through transfer
  selection and is installed at API PID `29769`. No retry ran; M5 and all
  scheduler/continuous live-follow gates remain open.
  The next authorized one-attempt job
  `hmj_50e7aa9598be44fc950ddb1b89d4ca2f` proved that repair live by selecting
  only the requested Exam DOCX and its exact provider file ID. Its matched
  endpoint returned HTTP 403 `Forbidden`, which remains truthfully
  `retrieval_failed` because it does not prove deletion, expiry, or provider
  unavailability. The job materialized 0/1 without retry, so M5 and all
  re-enablement gates remain open.
  The operator subsequently verified working links near the end of the same
  chat. They download a later generated-output DOCX as
  `ChE_4470_5470_Exam_2_Spring_2025_Problem_3_updated_fresh-1.docx` at about
  99.48 KB. Local checksum verification disproved the earlier identity shortcut:
  the requested catalog-named blob is 108,667 bytes at `a6ef6841...`, while a
  distinct generated-output blob is 99,476 bytes at `480b6881...`; the operator
  download itself remains unchecksummed. The `480b...` bytes also retain the
  quarantined January transcript alias, so blob aliases cannot supply provider
  identity. The active question is whether the later control is safely related
  to the requested catalog asset. Fresh-agent
  provider-free diagnosis now starts from
  `docs/dev/notes/0001-2026-08-02-plan-0180-chatgpt-download-route-handoff.md`;
  Packet A confirmed the two routes are separate and existing response identity
  fails closed. It also found that exact artifact catalog identity is not
  carried into provider work before `maxItems`. Packet B now filters raw
  eligible artifacts by exact catalog identity before ChatGPT same-title dedup
  and the item budget. Direct ID, URI-only, shared-URI, shared-message/turn,
  ambiguous-title, and exact `download-dom` paths are provider-free covered;
  final independent audit passed. Packet B is installed byte-identically at API
  PID `81726`, but the first authorized fresh positive-control command resolved
  its unspecified model to `grok-4.20` and submitted to Grok despite
  `--browser-target chatgpt`. Read-only inspection confirmed the wrong-provider
  upload and DOCX generation, but no ChatGPT request or materialization ran.
  The packet is consumed without retry; M5 plus every scheduler/continuous-live-
  follow gate remains open pending a separately authorized, explicitly model-
  bound ChatGPT attempt. Commit `1fda7598` now rejects explicit target/model
  conflicts before browser work and is installed with byte parity. The next
  authorized corrected command reached the right ChatGPT profile but stopped
  before upload or submission because canonical provider-session authorization
  was missing. No conversation or materialization job was created; that packet
  is also consumed and M5 remains open. Provider-free repair now constructs the
  canonical authorization for root inline, detached, and setup-verification
  execution and injects it only at the browser boundary, with configured
  identity redacted from logs and session metadata. The focused packet passes
  60/60 and the full suite passes 2,704 tests with 65 skips, plus typecheck,
  build, lint, plan audit, and diff hygiene; install and the single newly
  authorized live control were gated on commit/parity.
  Commit `068608e7` is now pushed and installed byte-identically at API PID
  `96156`. The newly authorized ChatGPT turn passed canonical identity proof,
  uploaded the sole fixture, completed, and generated the requested DOCX in
  fresh conversation `6a6fa606-9870-83ea-9bdd-090d134ec58f`. The sole bounded
  job materialized and fully validated that DOCX, but the exact uploaded TXT
  failed its provider route with HTTP 403 JSON `Forbidden`. Metrics are 1
  materialized / 1 failed despite a `succeeded` job envelope. The packet is
  consumed without retry. The operator subsequently proved the exact uploaded
  source is available by opening its tile preview and downloading the
  upper-right aria-labeled control; the 505-byte result is byte-identical to
  the submitted fixture. Preview repair `004eaf25` and aggregate-truth repair
  `8cca7962` are now pushed and installed with exact parity. The single
  authorized fresh ChatGPT proof produced one upload and the requested DOCX.
  Sole job `hmj_f4fde42cd30644699e534d5568a6f914` successfully materialized and
  validated the 38,509-byte DOCX through the current artifact preview, but the
  uploaded TXT still yielded no captured preview binary and its bounded direct
  fallback returned 403 JSON `Forbidden`. The repaired envelope correctly
  terminated `failed`, metrics 1 materialized / 1 failed. No retry ran. M5 and
  all re-enablement gates remain open. Provider-free diagnosis now confirms the
  source preview used Chrome's native download manager, while AuraCall only
  accepted in-page fetch/anchor/direct bytes. The repaired source path configures
  an isolated per-transfer download directory and accepts only one stable,
  nonempty exact-name file, allowing Chrome's numeric collision suffix and
  rejecting mismatch or ambiguity. Commit `9c7691e5` was installed and a fresh
  default-ChatGPT turn produced exactly one uploaded fixture plus one requested
  DOCX. Job `hmj_8c9d2cc271954129a1d4fdf247999cf7` materialized the DOCX and
  failed the source 403. One evidence-based reused-preview-control hypothesis
  was validated, installed, and consumed by the sole authorized retry
  `hmj_dfb704142a694f5b9f0a10db96d457ed`; it reproduced the same truthful 1/1
  failure and emitted no source native-download success. The hypothesis was
  reverted and the pushed runtime restored byte-identically. M5 and every
  re-enablement gate remain open. Retained-browser inspection has now proven the
  source preview is an exact filename-labelled `screen-threadFlyOut`, not a
  dialog, and that its sole upper-right Download control can be reused rather
  than newly mounted. A bounded manual click returned the exact 505-byte
  fixture. The provider-free adapter now scopes only to that exact flyout,
  requires one Download control, and records identity plus surface/control
  counts. Commit `ec81ed0d` was then installed byte-identically and exercised by
  exactly one fresh two-asset packet. Conversation
  `6a70a15a-b390-83ea-912b-bf1af667e1d3` contained the sole upload and requested
  DOCX; job `hmj_91cf0b1e4b2744f78324a51b11f0da11` matched all four account
  dimensions and materialized the valid 38,752-byte DOCX, but the exact source
  flyout exposed zero scoped Download controls and its fallback returned 403
  `Forbidden`. The job failed truthfully at metrics 1/1 without retry. M5 and
  every re-enablement gate remain open. Provider-free diagnosis recovered
  manual DOM proving the exact control can be scoped inside the exact flyout and
  confirmed the production expression already polls for 20 seconds, leaving a
  lifecycle/state ambiguity rather than a universal selector or missing-wait
  defect. The adapter now preserves pre-click preview presence, observation
  count, and scoped/global total-versus-visible control counts without widening
  click authority. Commit `69f11a35` is now installed byte-identically. The sole
  fresh proof produced and fully validated the requested 37,202-byte DOCX, but
  source materialization still failed, so job
  `hmj_2aa3edc177a6425c8d89e4539ebf3f76` ended truthfully 1 materialized / 1
  failed without retry. The new receipt observed the exact post-click flyout
  587,217 times while every scoped/global total/visible Download-control count
  stayed zero. Structural review isolated an empty-capture-list polling defect:
  the already-settled promise branch defeats and cancels the timer, starving the
  preview loop of a real renderer/macrotask yield. A deterministic fake-timer
  regression now fails at virtual time 0 before the repair and passes only after
  the helper awaits its bounded timer when no capture promise exists. Nonempty
  capture lists retain early-progress behavior. Adjacent tests pass 246/246 and
  the full provider-free suite passes 2,708 tests. Commit `9381182b` is pushed
  and installed byte-identically at adapter SHA-256 `d31e46a7...` under active
  API PID `94356`; scheduler and five completions remain paused and queued/
  running jobs are 0/0. M5 and all re-enablement gates remain open, and another
  live proof requires separate explicit authority. That one fresh no-retry
  proof is now consumed: conversation `6a714cfe-6068-83ea-a196-aec283440fa9`
  and sole job `hmj_f9d3b3ef5dc649b6aadd53b286f1d944` again ended 1 materialized /
  1 failed. The renderer-yield repair reached a native source capture, but the
  catalog title carried provider collision suffix `(5)` while the response
  filename used the original unsuffixed name, so strict identity validation
  failed closed and persisted no source bytes. The generated 38,520-byte DOCX
  passes OOXML, requested-content, and rendered visual checks. M5 remains open;
  next work is provider-free collision-suffix identity normalization, not a
  retry or scheduler/continuous-live-follow re-enablement.

- Completed provider-session authority unification:
  [docs/dev/plans/0179-2026-07-31-provider-session-authority-unification.md](docs/dev/plans/0179-2026-07-31-provider-session-authority-unification.md)
  Replace distributed runtime/browser/provider identity reconstruction with one
  canonical provider-session proof used by collectors and all materializers.
  Browser profiles remain provenance only. Final bounded installed proof
  completed exactly one collection and materialized 3 assets with no guard or
  retry. Collector and materializer receipts persist matching canonical
  four-dimension provider-account proof; Plan 0179 is closed while the global
  scheduler remains paused.

- Completed forced-pass failure and identity-evidence repair:
  [docs/dev/plans/0177-2026-07-31-forced-pass-failure-and-identity-evidence-repair.md](docs/dev/plans/0177-2026-07-31-forced-pass-failure-and-identity-evidence-repair.md)
  Provider-free regressions preserve strict explicit identity conflicts,
  accept same-email sessions when detected qualifier evidence is absent, and
  keep a forced pass responsible for its owned materialization through terminal
  success or failure. Commit `6d8fddcb` is pushed and installed byte-identically;
  all live provider work remains paused.

- Completed repaired default live-follow single-pass proof, with follow-up required:
  [docs/dev/plans/0178-2026-07-31-repaired-default-live-follow-single-pass-proof.md](docs/dev/plans/0178-2026-07-31-repaired-default-live-follow-single-pass-proof.md)
  One installed default-ChatGPT pass advanced 36 -> 37 with 5/8 interactions
  and no guard. Forced materialization ownership now works live: the failed job
  blocked the completion before another pass. The distinct materialization
  browser-auth preflight still rejects the same-email qualified binding, so
  provider work remains stopped pending a provider-free follow-up.

- Completed default live-follow single-pass proof, with follow-up required:
  [docs/dev/plans/0176-2026-07-31-default-live-follow-single-pass-proof.md](docs/dev/plans/0176-2026-07-31-default-live-follow-single-pass-proof.md)
  One authorized pass advanced 35 -> 36 with 5/8 active interactions, enforced
  pacing, and no rate-limit observation. Its materialization job truthfully
  failed 6 assets instead of reporting a skip, but the forced-pass runner
  returned before that asynchronous failure could block the completion. The
  safety pause restored all six completions and the scheduler to paused; a
  provider-free propagation/identity-evidence repair is required before any
  second live pass.

- Completed ChatGPT developer-app keyboard recreation:
  [docs/dev/plans/0174-2026-07-25-chatgpt-developer-app-keyboard-recreation.md](docs/dev/plans/0174-2026-07-25-chatgpt-developer-app-keyboard-recreation.md)
  Live non-submitting evidence proved the current Radix connection radio
  requires focus plus Space rather than AuraCall's trusted mouse activation.
  Accepted commit `b116b902` recreated exactly one private `Corel33t` with new
  identity `asdk_app_6a658c7c4c8c81918f6ddd378d5ebf16` and stopped at the
  visible OAuth sign-in gate. No delete or connector prompt occurred.
- Completed live-follow materialization truth and churn repair:
  [docs/dev/plans/0175-2026-07-31-live-follow-materialization-truth-and-churn-repair.md](docs/dev/plans/0175-2026-07-31-live-follow-materialization-truth-and-churn-repair.md)
  Provider-free regressions repair confirmed failed-as-skipped aggregate
  results, and all-failed completion-owned materialization now blocks before
  another provider pass. Commit `a2b34924` is installed byte-identically;
  provider work remains paused.
- Completed ChatGPT developer-app recreation retry:
  [docs/dev/plans/0173-2026-07-25-chatgpt-developer-app-recreation-retry.md](docs/dev/plans/0173-2026-07-25-chatgpt-developer-app-recreation-retry.md)
  Its corrected trusted-pointer attempt also stopped before submission. A
  non-submitting keyboard diagnostic isolated the provider contract; Plan 0174
  owns the final exact recreation.
- Active ChatGPT developer-app replacement refresh:
  [docs/dev/plans/0172-2026-07-25-chatgpt-developer-app-replacement-refresh.md](docs/dev/plans/0172-2026-07-25-chatgpt-developer-app-replacement-refresh.md)
  The safe replacement contract is accepted, committed, installed, and the old
  exact identity is deleted. Its sole create attempt stopped pre-submit on
  ChatGPT connection-radio drift; Plan 0174 owns the recreation-only retry.
- Completed refreshed-snapshot file materialization repair:
  [docs/dev/plans/0170-2026-07-25-refreshed-snapshot-file-materialization.md](docs/dev/plans/0170-2026-07-25-refreshed-snapshot-file-materialization.md)
  Completion-owned materialization consumes the already-refreshed file
  inventory without a redundant scoped listing. Bounded pass 38 and organic
  job `hmj_a65695afe9704af6b6716bb4c9f063b4` proved a refreshed one-file
  conversation is classified as `known-files-excluded` when terminal-local,
  with zero failures and no provider guard.
- ChatGPT composer/apps implementation and installed proof complete; live
  follow remains blocked:
  [docs/dev/plans/0167-2026-07-24-chatgpt-composer-apps-reinspection.md](docs/dev/plans/0167-2026-07-24-chatgpt-composer-apps-reinspection.md)
  Current selection, prompt association, and installed/link discovery are
  repaired, installed, and live-validated. The API is active, but routine
  live-follow restoration remains paused after all-operation resume reproduced
  unsafe Node memory growth; a single-profile bounded observation stayed
  guard-clear and below the diagnostic stop threshold.
- Completed live-follow startup memory fan-out repair:
  [docs/dev/plans/0169-2026-07-24-live-follow-startup-memory-fanout-repair.md](docs/dev/plans/0169-2026-07-24-live-follow-startup-memory-fanout-repair.md)
  Same-provider startup hydration is inside provider ownership, completion
  reads are capped at 16, and broad status uses one archive/job snapshot per
  request. The final installed PID keeps all four ChatGPT lanes active and
  guard-clear; memory remained near 1.3-1.4 GiB after restart with more than
  32 GiB host memory available.
- Completed ChatGPT developer-app lifecycle:
  [docs/dev/plans/0168-2026-07-24-chatgpt-developer-app-lifecycle.md](docs/dev/plans/0168-2026-07-24-chatgpt-developer-app-lifecycle.md)
  Source CLI and live SoyLei proof now cover guarded inventory,
  creation/OAuth gating, refresh, non-submitting/submitted test separation,
  and exact-target uninstall semantics. The validated package is installed in
  the user runtime; Corel33t remained installed, active, and
  development-scoped after installed readback.
- Completed live-follow provider fair-serialization plan:
  [docs/dev/plans/0166-2026-07-23-live-follow-provider-fair-serialization.md](docs/dev/plans/0166-2026-07-23-live-follow-provider-fair-serialization.md)
  One FIFO provider-work lease now spans scheduler and independent completion
  loops; routine multi-tenant scheduling is live under guard observation.
- Completed live-follow settlement cadence and Business tenant isolation plan:
  [docs/dev/plans/0165-2026-07-23-live-follow-settlement-cadence-and-business-tenants.md](docs/dev/plans/0165-2026-07-23-live-follow-settlement-cadence-and-business-tenants.md)
  Terminal materialization now establishes the next collector quiet boundary;
  same-email ChatGPT Business and Personal targets use distinct cache keys.
- Completed ChatGPT single-session file materialization repair:
  [docs/dev/plans/0164-2026-07-23-chatgpt-single-session-file-materialization.md](docs/dev/plans/0164-2026-07-23-chatgpt-single-session-file-materialization.md)
  Provider-free implementation now also captures and suppresses synthesized
  signed anchor/window downloads inside the retained page, including the
  preview viewer Download step. The live 12-file proof used one page and one
  attachment with no new rate warning; the remaining 403 responses reproduced
  in ChatGPT's native UX and are provider-side.
- Active plan:
  [docs/dev/plans/0114-2026-06-05-end-to-end-cross-service-handoff.md](docs/dev/plans/0114-2026-06-05-end-to-end-cross-service-handoff.md)
- Completed ChatGPT hard-stop retry-propagation repair plan:
  [docs/dev/plans/0163-2026-07-22-chatgpt-hard-stop-retry-propagation.md](docs/dev/plans/0163-2026-07-22-chatgpt-hard-stop-retry-propagation.md)
- Completed live-follow status-memory and immediate-rate-stop repair plan:
  [docs/dev/plans/0162-2026-07-22-live-follow-status-memory-and-rate-stop.md](docs/dev/plans/0162-2026-07-22-live-follow-status-memory-and-rate-stop.md)
- Completed live-follow materialization asset-family idempotency plan:
  [docs/dev/plans/0161-2026-07-20-live-follow-exact-id-materialization-idempotency.md](docs/dev/plans/0161-2026-07-20-live-follow-exact-id-materialization-idempotency.md)
- Completed live-follow cross-phase churn/pacing repair plan:
  [docs/dev/plans/0160-2026-07-19-live-follow-cross-phase-churn-and-pacing.md](docs/dev/plans/0160-2026-07-19-live-follow-cross-phase-churn-and-pacing.md)
- Completed live-follow restart/backoff repair plan:
  [docs/dev/plans/0159-2026-07-18-live-follow-restart-pause-and-rate-limit-backoff.md](docs/dev/plans/0159-2026-07-18-live-follow-restart-pause-and-rate-limit-backoff.md)
- Completed live-follow detail-continuation repair plan:
  [docs/dev/plans/0156-2026-07-15-live-follow-detail-continuation-timeout.md](docs/dev/plans/0156-2026-07-15-live-follow-detail-continuation-timeout.md)
- Completed ChatGPT rate-limit propagation/cycle-stop plan:
  [docs/dev/plans/0157-2026-07-15-chatgpt-rate-limit-propagation-and-cycle-stop.md](docs/dev/plans/0157-2026-07-15-chatgpt-rate-limit-propagation-and-cycle-stop.md)
- Completed ChatGPT persistent-warning census-stop plan:
  [docs/dev/plans/0158-2026-07-16-chatgpt-persistent-warning-census-stop.md](docs/dev/plans/0158-2026-07-16-chatgpt-persistent-warning-census-stop.md)
- Completed live-follow identity-timeout follow-up plan:
  [docs/dev/plans/0155-2026-07-15-chatgpt-identity-timeout-follow-up.md](docs/dev/plans/0155-2026-07-15-chatgpt-identity-timeout-follow-up.md)
- Completed live-follow diagnostic/repair plan:
  [docs/dev/plans/0154-2026-07-14-live-follow-development-mode-rca-and-repair.md](docs/dev/plans/0154-2026-07-14-live-follow-development-mode-rca-and-repair.md)
- Completed live-follow follow-up plan:
  [docs/dev/plans/0153-2026-07-06-live-follow-target-resume-readiness.md](docs/dev/plans/0153-2026-07-06-live-follow-target-resume-readiness.md)
- Completed live-follow operating model plan:
  [docs/dev/plans/0152-2026-07-05-live-follow-operating-model.md](docs/dev/plans/0152-2026-07-05-live-follow-operating-model.md)
- Completed live-follow inspection plan:
  [docs/dev/plans/0151-2026-07-05-live-follow-frontier-retention-inspection.md](docs/dev/plans/0151-2026-07-05-live-follow-frontier-retention-inspection.md)
- Completed live-follow supporting plan:
  [docs/dev/plans/0150-2026-06-28-live-follow-cycle-phase-ledger.md](docs/dev/plans/0150-2026-06-28-live-follow-cycle-phase-ledger.md)
- Completed live-follow supporting plan:
  [docs/dev/plans/0145-2026-06-27-live-follow-reverse-mtime-frontier.md](docs/dev/plans/0145-2026-06-27-live-follow-reverse-mtime-frontier.md)
- Completed live-follow supporting plan:
  [docs/dev/plans/0146-2026-06-27-live-follow-detail-completeness-guard.md](docs/dev/plans/0146-2026-06-27-live-follow-detail-completeness-guard.md)
- Completed API reliability supporting plan:
  [docs/dev/plans/0147-2026-06-28-open-notebook-recoverable-run-polling.md](docs/dev/plans/0147-2026-06-28-open-notebook-recoverable-run-polling.md)
- Completed live-follow supporting plan:
  [docs/dev/plans/0148-2026-06-28-chatgpt-targeted-conversation-artifact-scrape.md](docs/dev/plans/0148-2026-06-28-chatgpt-targeted-conversation-artifact-scrape.md)
- Completed live-follow proof plan:
  [docs/dev/plans/0149-2026-06-28-single-chat-artifact-scrape-instrumented-proof.md](docs/dev/plans/0149-2026-06-28-single-chat-artifact-scrape-instrumented-proof.md)
- Completed supporting handoff plan:
  [docs/dev/plans/0144-2026-06-26-handoff-attachment-zip-packaging.md](docs/dev/plans/0144-2026-06-26-handoff-attachment-zip-packaging.md)
- Latest completed live-follow supporting plan:
  [docs/dev/plans/0140-2026-06-10-large-chat-resumable-context-sync.md](docs/dev/plans/0140-2026-06-10-large-chat-resumable-context-sync.md)
- Completed browser-control cutover proof:
  [docs/dev/plans/0142-2026-06-20-agent-browser-remote-headed-service-request-proof.md](docs/dev/plans/0142-2026-06-20-agent-browser-remote-headed-service-request-proof.md)
- Previous completed live-follow supporting plan:
  [docs/dev/plans/0139-2026-06-08-chatgpt-live-follow-detail-cursor-resume.md](docs/dev/plans/0139-2026-06-08-chatgpt-live-follow-detail-cursor-resume.md)
- Previous completed live-follow supporting plan:
  [docs/dev/plans/0138-2026-06-07-account-mirror-failure-backoff-recovery-override.md](docs/dev/plans/0138-2026-06-07-account-mirror-failure-backoff-recovery-override.md)
- Completed supporting plan:
  [docs/dev/plans/0136-2026-06-07-handoff-tranche-review-and-commit.md](docs/dev/plans/0136-2026-06-07-handoff-tranche-review-and-commit.md)
- Previous completed live-follow supporting plan:
  [docs/dev/plans/0137-2026-06-07-oracle-identity-mismatch-self-healing.md](docs/dev/plans/0137-2026-06-07-oracle-identity-mismatch-self-healing.md)
- Previous completed plan:
  [docs/dev/plans/0135-2026-06-07-chatgpt-project-sources-materialization.md](docs/dev/plans/0135-2026-06-07-chatgpt-project-sources-materialization.md)
- Previous completed plan:
  [docs/dev/plans/0134-2026-06-07-handoff-source-materialization-queue-unblock.md](docs/dev/plans/0134-2026-06-07-handoff-source-materialization-queue-unblock.md)
- Previous completed plan:
  [docs/dev/plans/0133-2026-06-07-handoff-original-source-cache-proof.md](docs/dev/plans/0133-2026-06-07-handoff-original-source-cache-proof.md)
- Previous completed plan:
  [docs/dev/plans/0132-2026-06-07-handoff-chatgpt-live-target-proof.md](docs/dev/plans/0132-2026-06-07-handoff-chatgpt-live-target-proof.md)
- Previous completed plan:
  [docs/dev/plans/0131-2026-06-07-handoff-chatgpt-browser-recovery-surface.md](docs/dev/plans/0131-2026-06-07-handoff-chatgpt-browser-recovery-surface.md)
- Previous completed plan:
  [docs/dev/plans/0130-2026-06-07-handoff-chatgpt-prompt-attachment-adapter.md](docs/dev/plans/0130-2026-06-07-handoff-chatgpt-prompt-attachment-adapter.md)
- Previous completed plan:
  [docs/dev/plans/0129-2026-06-07-handoff-provider-native-file-upload-proof.md](docs/dev/plans/0129-2026-06-07-handoff-provider-native-file-upload-proof.md)
- Previous completed plan:
  [docs/dev/plans/0128-2026-06-07-handoff-provider-native-submit-readback-proof.md](docs/dev/plans/0128-2026-06-07-handoff-provider-native-submit-readback-proof.md)
- Previous completed plan:
  [docs/dev/plans/0127-2026-06-07-handoff-provider-native-adapter-composition.md](docs/dev/plans/0127-2026-06-07-handoff-provider-native-adapter-composition.md)
- Previous completed plan:
  [docs/dev/plans/0126-2026-06-07-handoff-live-provider-recovery.md](docs/dev/plans/0126-2026-06-07-handoff-live-provider-recovery.md)
- Previous completed plan:
  [docs/dev/plans/0125-2026-06-07-handoff-console-operator-ux.md](docs/dev/plans/0125-2026-06-07-handoff-console-operator-ux.md)
- Previous completed plan:
  [docs/dev/plans/0124-2026-06-07-handoff-repair-resume-export.md](docs/dev/plans/0124-2026-06-07-handoff-repair-resume-export.md)
- Previous completed plan:
  [docs/dev/plans/0123-2026-06-07-handoff-target-submit-and-readback.md](docs/dev/plans/0123-2026-06-07-handoff-target-submit-and-readback.md)
- Previous completed plan:
  [docs/dev/plans/0121-2026-06-07-handoff-approval-and-target-upload.md](docs/dev/plans/0121-2026-06-07-handoff-approval-and-target-upload.md)
- Completed live-follow supporting plan:
  [docs/dev/plans/0122-2026-06-06-live-follow-stale-materialization-recovery.md](docs/dev/plans/0122-2026-06-06-live-follow-stale-materialization-recovery.md)
- Previous completed plan:
  [docs/dev/plans/0120-2026-06-06-handoff-analysis-package-preview.md](docs/dev/plans/0120-2026-06-06-handoff-analysis-package-preview.md)
- Previous completed plan:
  [docs/dev/plans/0119-2026-06-05-account-library-cooldown-clear-rerun.md](docs/dev/plans/0119-2026-06-05-account-library-cooldown-clear-rerun.md)
- Previous completed plan:
  [docs/dev/plans/0118-2026-06-05-post-0117-account-library-automatic-rerun.md](docs/dev/plans/0118-2026-06-05-post-0117-account-library-automatic-rerun.md)
- Previous completed plan:
  [docs/dev/plans/0117-2026-06-05-account-library-scheduler-noop-observability.md](docs/dev/plans/0117-2026-06-05-account-library-scheduler-noop-observability.md)
- Previous completed plan:
  [docs/dev/plans/0116-2026-06-05-handoff-source-job-orchestration.md](docs/dev/plans/0116-2026-06-05-handoff-source-job-orchestration.md)
- Previous completed plan:
  [docs/dev/plans/0115-2026-06-05-handoff-run-ledger-and-status.md](docs/dev/plans/0115-2026-06-05-handoff-run-ledger-and-status.md)
- Completed supporting plan:
  [docs/dev/plans/0113-2026-06-05-browser-process-owner-attribution.md](docs/dev/plans/0113-2026-06-05-browser-process-owner-attribution.md)
- Previous completed plan:
  [docs/dev/plans/0112-2026-06-05-handoff-source-materialization-readback.md](docs/dev/plans/0112-2026-06-05-handoff-source-materialization-readback.md)
- Previous completed plan:
  [docs/dev/plans/0111-2026-06-05-cross-service-context-handoff.md](docs/dev/plans/0111-2026-06-05-cross-service-context-handoff.md)
- Previous completed plan:
  [docs/dev/plans/0110-2026-06-05-scheduler-foreground-work-attribution.md](docs/dev/plans/0110-2026-06-05-scheduler-foreground-work-attribution.md)
- Previous completed plan:
  [docs/dev/plans/0109-2026-06-05-chatgpt-account-library-automatic-mode-capped-smoke.md](docs/dev/plans/0109-2026-06-05-chatgpt-account-library-automatic-mode-capped-smoke.md)
- Previous completed plan:
  [docs/dev/plans/0108-2026-06-04-account-mirror-readback-latency-attribution.md](docs/dev/plans/0108-2026-06-04-account-mirror-readback-latency-attribution.md)
- Previous completed plan:
  [docs/dev/plans/0107-2026-06-04-chatgpt-account-library-automatic-mode-isolation.md](docs/dev/plans/0107-2026-06-04-chatgpt-account-library-automatic-mode-isolation.md)
- Previous completed plan:
  [docs/dev/plans/0106-2026-06-02-gemini-automatic-resume-gating.md](docs/dev/plans/0106-2026-06-02-gemini-automatic-resume-gating.md)
- Previous completed plan:
  [docs/dev/plans/0105-2026-06-02-gemini-left-rail-artifact-live-follow.md](docs/dev/plans/0105-2026-06-02-gemini-left-rail-artifact-live-follow.md)
- Previous completed plan:
  [docs/dev/plans/0104-2026-06-02-gemini-live-follow-repair.md](docs/dev/plans/0104-2026-06-02-gemini-live-follow-repair.md)
- Previous completed plan:
  [docs/dev/plans/0103-2026-06-02-gemini-live-follow-resume-safety.md](docs/dev/plans/0103-2026-06-02-gemini-live-follow-resume-safety.md)
- Previous completed plan:
  [docs/dev/plans/0102-2026-06-02-chatgpt-account-library-scheduler-health.md](docs/dev/plans/0102-2026-06-02-chatgpt-account-library-scheduler-health.md)
- Previous completed plan:
  [docs/dev/plans/0101-2026-06-02-chatgpt-library-capped-materialization-proof.md](docs/dev/plans/0101-2026-06-02-chatgpt-library-capped-materialization-proof.md)
- Previous completed plan:
  [docs/dev/plans/0100-2026-06-02-live-follow-account-library-scheduling.md](docs/dev/plans/0100-2026-06-02-live-follow-account-library-scheduling.md)
- Previous completed plan:
  [docs/dev/plans/0099-2026-06-01-chatgpt-account-library-reconciliation.md](docs/dev/plans/0099-2026-06-01-chatgpt-account-library-reconciliation.md)
- Parent completed lane:
  [docs/dev/plans/0098-2026-06-01-chatgpt-account-library-retrieval.md](docs/dev/plans/0098-2026-06-01-chatgpt-account-library-retrieval.md)
- Previous completed plan:
  [docs/dev/plans/0097-2026-06-01-complete-chatgpt-materialization.md](docs/dev/plans/0097-2026-06-01-complete-chatgpt-materialization.md)
- Previous completed plan:
  [docs/dev/plans/0096-2026-06-01-chatgpt-raised-cap-catch-up-pass.md](docs/dev/plans/0096-2026-06-01-chatgpt-raised-cap-catch-up-pass.md)
- Previous completed plan:
  [docs/dev/plans/0095-2026-06-01-chatgpt-live-follow-post-file-fetch-observation.md](docs/dev/plans/0095-2026-06-01-chatgpt-live-follow-post-file-fetch-observation.md)
- Previous completed plan:
  [docs/dev/plans/0094-2026-06-01-chatgpt-conversation-file-fetch.md](docs/dev/plans/0094-2026-06-01-chatgpt-conversation-file-fetch.md)
- Previous completed plan:
  [docs/dev/plans/0093-2026-06-01-live-follow-full-artifact-retrieval-readiness.md](docs/dev/plans/0093-2026-06-01-live-follow-full-artifact-retrieval-readiness.md)
- Previous completed plan:
  [docs/dev/plans/0092-2026-05-31-chatgpt-catalog-hygiene-and-asset-eligibility.md](docs/dev/plans/0092-2026-05-31-chatgpt-catalog-hygiene-and-asset-eligibility.md)
- Previous completed plan:
  [docs/dev/plans/0091-2026-05-31-chatgpt-wsl-chrome-3-bounded-materialization-catch-up.md](docs/dev/plans/0091-2026-05-31-chatgpt-wsl-chrome-3-bounded-materialization-catch-up.md)
- Previous completed plan:
  [docs/dev/plans/0090-2026-05-31-gemini-cached-uploaded-file-salvage.md](docs/dev/plans/0090-2026-05-31-gemini-cached-uploaded-file-salvage.md)
- Previous completed plan:
  [docs/dev/plans/0089-2026-05-31-gemini-bounded-artifact-catch-up.md](docs/dev/plans/0089-2026-05-31-gemini-bounded-artifact-catch-up.md)
- Previous completed plan:
  [docs/dev/plans/0088-2026-05-31-gemini-materialization-health.md](docs/dev/plans/0088-2026-05-31-gemini-materialization-health.md)
- Previous completed plan:
  [docs/dev/plans/0087-2026-05-31-gemini-conversation-asset-retrieval.md](docs/dev/plans/0087-2026-05-31-gemini-conversation-asset-retrieval.md)
- Previous completed plan:
  [docs/dev/plans/0086-2026-05-30-full-live-follow-artifact-retrieval.md](docs/dev/plans/0086-2026-05-30-full-live-follow-artifact-retrieval.md)
- Previous completed plan:
  [docs/dev/plans/0085-2026-05-30-live-follow-artifact-materialization-recovery.md](docs/dev/plans/0085-2026-05-30-live-follow-artifact-materialization-recovery.md)
  made live-follow artifact recovery truthful and operator-actionable across
  API, CLI, MCP, and the greenfield Runs console.
- Previous completed work:
  [docs/dev/plans/0084-2026-05-30-api-readback-memory-runner-compaction.md](docs/dev/plans/0084-2026-05-30-api-readback-memory-runner-compaction.md)
  [docs/dev/plans/0083-2026-05-29-runs-safe-controls.md](docs/dev/plans/0083-2026-05-29-runs-safe-controls.md)
  added the first state-gated Runs controls to the greenfield console.
  [docs/dev/plans/0082-2026-05-29-transcribe-audio-app-intelligence-integration.md](docs/dev/plans/0082-2026-05-29-transcribe-audio-app-intelligence-integration.md)
  made AuraCall the source of truth for the agent, tenant, binding, model
  selector, project binding, and dispatch-pool choices consumed by downstream
  `transcribe-audio` first-pass/App Intelligence workflows.
- Completed console sequence: Agents, Providers, Projects, Overview/Health,
  read-only Runs workbench, and first state-gated Runs controls.
- Current posture: Plan 0116 is closed as the source job orchestration slice
  under Plan 0114. Handoff preview can now read existing source
  materialization job ids, explicitly create one bounded source job when
  requested and no prior source job evidence was supplied, persist source job
  orchestration evidence, and keep target upload/submit impossible. Plan 0115
  closed the first implementation slice: handoff packets have a
  handoff-specific ledger/status readback by id, so later approvals, upload,
  submit, readback, and repair can hang off a replayable owner. Plan 0114
  remains the active end-to-end cross-service handoff blueprint. Plan 0112
  closed the handoff source-materialization readback slice. Plan 0113 closed the
  browser-process owner attribution gap found
  during the guarded Plan 0109 rerun: browser-state and browser-process status
  now expose optional `owner`, `operation`, and `lease` metadata for history
  materialization browser work, including job id, provider, AuraCall runtime
  profile, source type/key, reason, and cleanup policy. Plan 0122 closed the
  stale-running recovery gap for ordinary history reconciliation jobs and
  proved the follow-on capped `chatgpt/wsl-chrome-3` account-library rerun:
  stuck job `hmj_69d02e4bdc9f48e1ad91c412d6a4e39f` was recovered to terminal
  `failed`, active target jobs returned `0`, and capped account-library job
  `hmj_2b8b215db3794a5980181f3a455e4e6f` succeeded with 3 files
  materialized before config restore to `preview_only`.
- Plan 0109 is closed as **Automatic Account-Library Smoke No-Go**. The smoke
  did not mutate user-scoped config because preflight scheduler diagnostics
  still reported foreground AuraCall work pending after a retry window. Scoped
  status/browser readbacks were responsive, active account-library jobs were
  `0`, browser health was idle, and Gemini remained paused, but attribution was
  not clean enough to temporarily flip `chatgpt/wsl-chrome-3` to `eligible`.
  A later isolated rerun killed retained `wsl-chrome-4` browser work,
  temporarily flipped only `wsl-chrome-3` to `eligible`, and crossed the
  scheduler retry boundary cleanly, but the completion only advanced
  `nextAttemptAt` without creating an account-library materialization job,
  launching a managed browser, or surfacing an explicit blocker. The remaining
  risk is scheduler/account-library eligibility observability, not browser
  process isolation.
- Plan 0117 is closed as **Account-Library Scheduler No-Op Explained**.
  Completion-owned live-follow passes now either queue/reuse capped
  account-library reconciliation when `liveFollow.accountLibrary.mode=eligible`,
  or persist `accountLibraryCursor.status=skipped` with a lifecycle reason.
  Installed proof on `chatgpt/wsl-chrome-3` pass `101` recorded
  `reason="liveFollow.accountLibrary.mode is preview_only"` instead of silently
  advancing through the restored preview-only posture.
- Plan 0118 is closed as **Automatic Account-Library Smoke Blocked With
  Evidence**. The rerun killed retained managed Chrome work, including
  `wsl-chrome-4`, proved a clean browser/process preflight, temporarily flipped
  only `chatgpt/wsl-chrome-3` account-library mode to `eligible`, and started
  one bounded metadata-only completion. Completion
  `acctmirror_completion_d7bd7cbd-4ae4-4ac4-b35e-f051adfde4f5` completed one
  pass with `accountLibraryCursor.status=skipped` and
  `reason="account-library failure cooldown is active until 2026-06-05T14:09:00.065Z"`.
  Original config was restored, `wsl-chrome-3` returned to `preview_only`,
  active materialization jobs were `0`, and legacy Gemini remained paused.
  The next rerun should wait until the cooldown clears and then repeat the same
  bounded command path without reopening browser-isolation work.
- Plan 0119 is closed as **Automatic Account-Library Queue Proven**. After the
  Plan 0118 cooldown cleared, the first cooldown-clear attempt was blocked by
  ordinary `wsl-chrome-3` reconciliation job
  `hmj_d2c0f30e71bc466bb5a0c03a631e60e7`, which drained as `skipped`. The
  second bounded metadata-only completion
  `acctmirror_completion_7c75c623-d260-4a91-9abc-09d8e8017899` completed one
  pass and recorded `accountLibraryCursor.status=queued` for
  `hmj_9d67f1345a7d4c909c82455caebadd73`. That job ran as
  `account_library_reconciliation` for `chatgpt/wsl-chrome-3` with
  `assetSource=account-library`, `assetKinds=["files"]`, `maxItems=3`,
  `providerWorkTimeoutMs=120000`, and completed `succeeded`. Original config
  was restored to `preview_only`, active jobs returned to `0`, no managed
  browser process remained live, and legacy Gemini remained paused.
- Plan 0110 is closed as **Scheduler Foreground Attribution Fixed**. The
  foreground-pressure guard no longer treats an idle background-drain cadence
  timer as active foreground work. Installed proof showed scheduler
  `posture=scheduled`, `backpressureReason=null`, and
  `foregroundWork.active=false` while `backgroundDrainScheduled=true` and
  `backgroundDrainState=idle`; account-library mode remained `preview_only`,
  active account-library jobs were `0`, and legacy Gemini remained paused.
- Plan 0111 is closed as **Dry-Run Handoff Packet Builder Installed**.
  `auracall handoff prepare --dry-run` now writes provider-neutral handoff
  packets under user-scoped runtime storage, including source context,
  manifest, omissions, deterministic analysis preview, compact context, target
  primer, target submission plan, and explicit zero-target-mutation evidence.
  The next bounded slice should connect the packet builder to real source
  cache/materialization jobs before adding approval-gated target submission.
- Plan 0112 is closed as **Handoff Source Materialization Readback Installed**.
  The handoff command now accepts repeatable existing source materialization
  job readback JSON inputs, merges materialized/duplicate entries into the
  source manifest, merges failed/skipped entries into omissions, records
  imported job ids in packet input evidence, and keeps target upload/submit
  impossible.
- Plan 0114 is open as **End-To-End Cross-Service Handoff**. App Intelligence
  owns the deterministic supervisor, run ledger, decision validation,
  approvals, target mutation gates, replay log, and repair state; provider
  adapters own bounded source/target capabilities. The current deterministic
  path covers source job orchestration, schema-validated analysis/package
  assembly, approval-gated upload, approval-gated submit/readback, explicit
  ChatGPT browser recovery selection, and a live SoyLei ChatGPT target proof.
  Plan 0133 closed the original ChatGPT Business source cache/import proof and
  executed the real-source SoyLei ChatGPT Pro target handoff. The source ref
  resolved to a SoyLei project URL; the selected conversation cache provided
  `15` messages, `16` conversation files, `23` source refs, and `1` artifact.
  The widened materialization retry produced the Fresh Roof source DOCX,
  duplicate aliases were deduped by checksum/path, provider-file HTTP 404s
  were classified as deterministic omissions, and the approved ChatGPT browser
  recovery path uploaded two selected attachments and submitted the handoff to
  SoyLei target conversation
  `https://chatgpt.com/c/6a250296-65d4-83ea-930b-c5658ed7435a` with cached
  readback. Plan 0135 closed the project-source depth slice: ChatGPT project
  `Sources` rows now retain backend `file_...` ids, hrefs, DOM/action
  evidence, MIME/size hints where exposed; `provider=chatgpt` plus `projectId`
  can create `project_sources` history-materialization jobs; successful
  project source files archive through the existing materialization path; and
  non-downloadable rows become deterministic omissions imported by handoff
  packets. The live original Business project-source smoke
  `hmj_5927c197d6d6453bb23b90f980e14619` completed `skipped` with
  `materialized=0` and `failed=3` for visible rows
  `SoyLei Knowledge - Main 20251208.md`, `SIP-1111.md`, and `SIP-1119.md`;
  each lacked a backend provider file id in the current ChatGPT DOM. The next
  bounded action imported that readback into dry-run packet
  `/tmp/auracall-plan0135-project-source-import/handoffs/plan0135-project-source-import`:
  source completeness is still `partial`, but now has `manifestItemCount=3`,
  `omissionCount=20`, and `retryableOmissionCount=0`. New package digest is
  `6876fc1565d469e70c1a7a1e18c2f6cea47856ecdbdb7da37ca0be3bb7342d12`.
  Fresh digest-bound upload and submit approvals were recorded, target upload
  completed with `uploadedFileCount=2` and `uploadFailureCount=0`, target submit
  completed with provider message id
  `handoff-message-dbd77d872c589e1d37711316b7f7c191`, and final status for
  refreshed packet `plan0135-project-source-import` is `complete` with cached
  readback at `https://chatgpt.com/c/6a250296-65d4-83ea-930b-c5658ed7435a`.
  Plan 0136 closed the review/cleanup/commit tranche for Plans 0133-0135:
  the active dirty worktree was audited, separate Plan 0137 account-mirror
  work was kept out of the handoff checkpoint, formatter-owned churn was
  retained rather than manually unwound, targeted validation passed, and the
  handoff code/docs landed as one coherent local commit.
- Plan 0115 is closed as **Handoff Run Ledger And Status Installed**.
  `auracall handoff prepare --dry-run` now writes `ledger.json`, and
  `auracall handoff status <id>` reads run, ledger, event count, packet
  digest, source completeness, analysis selection, and target preview attempts
  from user-scoped handoff runtime storage. Source job creation, approvals,
  target upload, and submit remain future slices.
- Plan 0116 is closed as **Handoff Source Job Orchestration Installed**.
  `auracall handoff prepare --dry-run` now reads/imports existing source
  materialization jobs before explicit create, can create one bounded source
  job when requested and no prior source evidence exists, persists source job
  evidence in packet/status, and keeps target mutation disabled.
- Plan 0120 is closed as **Handoff Analysis Package Preview Installed**.
  `auracall handoff prepare --dry-run` now writes
  `auracall.handoff-analysis-input.v1`, schema-validated
  `auracall.handoff-analysis-decision.v2`,
  `analysis/validation-report.json`, target package artifacts,
  `target/upload-manifest.json`, a stable package digest, and status readback
  while preserving preview-only zero target upload/submit behavior.
- Plan 0121 is closed as **Handoff Approval And Target Upload Installed**.
  `auracall handoff approve-upload <id>` records digest-guarded upload
  approval, `auracall handoff upload <id>` writes deterministic target upload
  result rows from the staged package, and status reports approval/upload
  metrics while target submit/readback remain disabled. The next implementation
  slice is target submit and readback.
- Plan 0123 is closed as **Handoff Target Submit And Readback Installed**.
  `auracall handoff approve-submit <id>` records a separate submit approval
  bound to package, primer, compact context, and uploaded-file-set digests.
  `auracall handoff submit <id>` writes deterministic
  `target/submission-result.json` and `target/readback.json`, and status now
  reports submit/readback evidence without live provider mutation by default.
  The next bounded handoff slice is repair/resume and operator UX.
- Plan 0124 is closed as **Handoff Repair Resume Export Installed**.
  `auracall handoff resume <id>` writes `target/resume-plan.json`,
  `auracall handoff repair <id>` restores missing derived
  submission/readback artifacts and writes `repair/report.json`, and
  `auracall handoff export <id>` writes `target/manual-handoff-export.json`
  for manual target completion. The next bounded handoff slice is console
  operator UX and live-provider recovery integration.
- Plan 0107 is closed as **ChatGPT Account-Library Automatic
  Mode Remains Preview-Only**. The preflight found
  foreground-work backpressure, active `wsl-chrome-3` live-follow completion
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84`, an existing
  managed ChatGPT browser process for `wsl-chrome-3/chatgpt`, and timeout of
  full status/browser-process readback. Automatic account-library mode was not
  enabled.
- Plan 0107 installed proof: active account-library materialization jobs for
  `chatgpt/wsl-chrome-3` returned `0`, the target's completion readback still
  showed `liveFollow.accountLibrary.mode=preview_only`, and legacy Gemini
  completion `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402`
  remained paused with `error.code=gemini_live_follow_resume_blocked`.
- Plan 0106 is closed as **Gemini Automatic Resume Gated**.
  Startup recovery and plain operator resume now block unsafe legacy Gemini
  live-follow completions before browser work. The old indefinite Gemini
  completion `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402`
  remains paused at `passCount=10`; an installed operator resume attempt
  returned `status=paused`, `nextAttemptAt=null`,
  `error.code=gemini_live_follow_resume_blocked`, lifecycle event
  `operator_resume_blocked`, and no managed Gemini browser process.
- Plan 0106 installed proof: `auracall-api.service` restarted on installed
  runtime PID `74408`; scheduler diagnostics stayed on ChatGPT completion
  `acctmirror_completion_445ecb7e-f853-4bab-8672-c08b16c46109` with
  `browserMutations.total=0`; process scans showed no managed Gemini browser
  process.
- Plan 0105 is closed as **Bounded Rail Retrieval Enabled**.
  Gemini live-follow repair now treats `/app` as a shell/reattach surface, not
  progress; the collapsed-left-rail false-ready bug is fixed, shell-only churn
  is explicit evidence, and bounded Gemini materialization does not queue from
  stale shell-only metadata.
- Plan 0105 installed left-rail proof: completion
  `acctmirror_completion_c96ff20c-c1d2-4299-8209-f5ab76652351` selected four
  real Gemini conversations from the left rail, reported
  `conversationCandidates=67`, `selectedConversationIds=4`,
  `artifactBearingConversationIds=3`, `materializationAttempts=3`, and
  `churnDetected=false`. Mirror counts reached `conversations=71`,
  `artifacts=7`, `files=2`, and `media=6`.
- Plan 0105 installed materialization/cleanup proof: job
  `hmj_e4b7007b8ff142438c77d41449dc1ff3` materialized `Midnight At The
  Harbor` from Gemini conversation `62dd6ff9d85218b1` as
  `midnight_at_the_harbor.mp4` (`video/mp4`, `3247266` bytes,
  checksum
  `81384741e358b6a3f618085bf459130614320a38eb192671cefac17d33460807`).
  Post-terminal process scan showed no managed Gemini browser process.
- Plan 0105 timeout hardening: `history-materialization-create` now exposes
  `--provider-work-timeout-ms`, and HTTP parsing preserves
  `providerWorkTimeoutMs`; zero-item proof
  `hmj_4f39d63352734b56b7d4c9ae37d672e4` persisted
  `providerWorkTimeoutMs=45000` and reached terminal `skipped` without opening
  Gemini.
- Automatic broad Gemini live-follow remains a separate future plan. The old
  indefinite Gemini live-follow completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remains paused.
- Current posture: Plan 0104 is closed as the Gemini live-follow repair slice.
  Gemini is **Bounded-Only Enabled** for explicit one-pass operator work. Do
  not resume the old indefinite Gemini live-follow completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402`; it remains
  paused at `passCount=10`. Future Gemini automatic live-follow work needs a
  separate plan to narrow or replace indefinite resume semantics.
- Plan 0104 installed proof: completion
  `acctmirror_completion_21a7a85d-4f30-48fd-b5df-3ed478dcd085` ran exactly
  one `gemini/auracall-gemini-pro` steady-follow metadata-only pass and
  completed at `2026-06-03T01:29:30.205Z` with `passCount=1`, `projects=0`,
  `conversations=71`, `artifacts=0`, `files=0`, and `media=0`. The proof
  recorded `browserLifecycle.cleanupRequested=true`,
  `browserLifecycle.status=terminated`, and PID `2327`; the post-terminal
  process scan showed no managed Gemini browser process. Scheduler diagnostics
  before and after proof showed no active completions, `providerGuard=null`,
  and `browserMutations.total=0`.
- Plan 0104 root cleanup bug: the first installed repair proof
  `acctmirror_completion_cc8b99ce-5f44-4031-a13a-32c300130590` completed but
  left Chrome running because bounded cleanup was skipped by runtime
  `keepBrowser`. The fix makes `cleanupManagedBrowserAfterRefresh=true`
  authoritative for the bounded account-mirror cleanup path.
- Plan 0104 Gemini read-path hardening: read-only bounded Gemini completion
  now requests final-pass managed-browser cleanup, system Gem IDs
  `chess-champ`, `brainstormer`, and `storybook` are rejected before editable
  project treatment, and the bounded path stays metadata-only with no automatic
  materialization.
- Plan 0103 is closed as the Gemini live-follow resume-safety
  slice. Operating posture is **Paused**: do not resume the old indefinite
  Gemini live-follow completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402`; future Gemini
  provider work should start from an explicit bounded operation until
  live-follow resume semantics are narrowed.
- Plan 0103 bounded proof: completion
  `acctmirror_completion_95f9e4af-cd01-402f-bc5c-0141a1e3a927` ran exactly
  one `gemini/auracall-gemini-pro` steady-follow metadata-only pass and
  completed at `2026-06-02T22:37:57.316Z` with `passCount=1`,
  `projects=0`, `conversations=71`, and no materialization. DevTools observed
  only `https://gemini.google.com/app` and
  `https://gemini.google.com/gems/view`; it did not show
  `/gem/chess-champ`, `/gem/brainstormer`, or `/gem/storybook`. The old
  live-follow completion remained paused at `passCount=10`, and the managed
  Gemini browser PID `79889` was stopped after the bounded proof so no Gemini
  browser process remained.
- Plan 0103 code fix: `api scheduler-diagnostics` now uses the local API auth
  retry path instead of bare `fetch`, so installed diagnostics can read the
  authenticated local API after the user runtime is reinstalled.
- Gemini churn proof: AuraCall API PID `18774` owned the managed Gemini
  Chromium PID `32153`, and DevTools port `45019` showed
  `https://gemini.google.com/app` and `https://gemini.google.com/gems/view`
  targets. After the patch/install/restart, `auracall-api.service` is active
  as PID `30880`, the Gemini completion remains `status=paused`, and process
  scans showed no managed Gemini browser process or `gemini.google.com`
  process.
- Plan 0102 is closed. Scheduler health and manual
  account-library materialization are installed and proven: job
  create/read/list expose scheduler diagnostics, `/status` projects
  `accountLibraryCatchup.activeJobScheduler`, duplicate active requests reuse
  one running source instead of creating hidden browser work, and the
  ChatGPT Library download-capture blocker is fixed through authenticated
  backend file-download capture before UI fallback.
- Plan 0102 installed proof: duplicate creates for
  `chatgpt/wsl-chrome-3`/account-library/files/`maxItems=1` produced
  `hmj_c92fb4d717504e539f982ab4e9817ba0`; the immediate replay returned
  `reused=true`, `reuseReason="active sourceKey is already running"`, and
  `queuedToStartLatencyMs=93`. `/status` while active reported
  `activeJobCount=1`, `activeJobScheduler.state=running`, and
  `stale=false`; post-terminal `/status` returned `activeJobCount=0`.
- Plan 0102 materialization proof: installed job
  `hmj_84685715fc4d489683a98e10bdf3598a` succeeded with `materialized=1`,
  `failed=0`, provider id `86252cdb-9827-5faa-880a-b962936e12c7`, size
  `64339`, checksum
  `240dc883402f537c5fbe62106baedeb4aa9e536b3dee11a085514bf38329be36`, and
  archive item
  `history-file:chatgpt:eric.cochran_soylei.com:account-library:86252cdb-9827-5faa-880a-b962936e12c7`.
  Same-flags replay job `hmj_3af768aaf46540a88f75993fdd43690c` selected a
  different provider id, `cb2c2ccf-5069-520d-a4ea-c9a1e6234339`, and also
  succeeded with `materialized=1`, `failed=0`, proving terminal replay skips
  the archived family before browser work.
- Plan 0102 decision: keep `chatgpt/wsl-chrome-3` account-library live follow
  `preview_only`; do not attempt narrow automatic account-library queueing in
  this plan. The manual proof passed, but the operator observed unrelated
  Gemini `/app` page launching/refreshing during the continuation. Later
  process/DevTools audit proved AuraCall was the source through a resumed
  Gemini live-follow completion, so Plan 0103 isolates Gemini provider/browser
  activity before any live-follow resume or automatic queueing decision.
- Plan 0101 is closed as the bounded ChatGPT Library capped materialization
  proof slice. Browser health for `chatgpt/wsl-chrome-3` no longer blocks
  solely because the Chrome launch command contains an `about:blank` startup
  argument; installed `/status` now reports `browserHealth.status=observed`,
  `reason=null`, `launchCommandHasBlankArg=true`, and
  `openBlankPageCount=0`. Account-library live follow remains `preview_only`.
- Plan 0101 completion: installed manual/operator account-library
  materialization proved route-authorized ChatGPT Library rows are retrievable
  files, not metadata-only. Job
  `hmj_0391838191ce4bfebe5f5001ecb68cee` (`maxItems=1`) materialized one
  file via `chatgpt-library-file-row-click` with `failed=0`,
  `skipped=0`, and `duplicateAliases=0`. A same-budget follow-up job
  `hmj_02ccb145fd024c85a56919aad71ca731` selected the next unarchived family
  rather than redownloading the first file, but sat queued for about 98 seconds
  before starting. The planned widened job
  `hmj_d1cf6ea905864ff9b3259e026d95cff5` (`maxItems=3`) materialized three
  additional files with `failed=0`, `skipped=0`, and `duplicateAliases=0`.
  Final installed `/status` readback reported `activeJobCount=0`,
  `catalogFiles=60`, `eligibleCandidates=21`, `selectedCandidates=3`,
  `archivedFamilies=13`, `unresolvedStale=11`,
  `unsupportedOrTerminal=12`, and `duplicateFamilies=3`.
- Plan 0101 decision: keep automatic account-library live-follow queueing
  disabled/preview-only. The next milestone should harden scheduler/job
  lifecycle health before moving to eligible mode: queued-job latency,
  active-source reuse expectations, and continued archived-family skip proof
  must be explicit acceptance criteria.
- Plan 0100 is closed as the bounded live-follow scheduling
  hardening slice for ChatGPT account-library retrieval. Plans 0098 and 0099
  are closed for the manual/operator ChatGPT account-library retrieval lane.
  Plan 0097 remains the
  history-materialization baseline: `chatgpt/wsl-chrome-3` has no current
  retrievable missing-local history backlog, and account-library rows are
  handled by a separate explicit job lane rather than conversation-history
  materialization.
- Plan 0100 target: make account-library materialization safe for live-follow
  scheduling without enabling broad automatic catch-up prematurely. The plan
  adds a separate account-library scheduling mode, candidate preview, small
  per-target cap, provider-work timeout/recovery behavior, scheduler health
  gates, and installed proof before choosing disabled, preview-only, or
  eligible as the final operating mode.
- Plan 0100 completion: readback-only cooldown and browser/service
  health-gate status is implemented and installed. `/status` can now show
  `cooling_down`, next permitted attempt time, active account-library job count
  versus `maxActiveJobs`, and safe browser/process health observations without
  enqueueing account-library materialization jobs. Installed
  `chatgpt/wsl-chrome-3` readback reports `mode=preview_only`,
  `activeJobCount=0`, browser health `idle`, and preview counts
  `catalogFiles=60`, `eligibleCandidates=0`, `selectedCandidates=0`,
  `unsupportedOrTerminal=60`. Bounded no-op proof jobs
  `hmj_c06476c35bd448d7acba18e5b958a23e` (`maxItems=1`) and
  `hmj_87e4c71ee43e425fb8c488afdb9193c2` (`maxItems=3`) both reached terminal
  `skipped` with `materialized=0`, `failed=0`, and active jobs returning to
  `0`.
- Plan 0100 post-close correction: operator evidence showed ChatGPT Library
  rows expose a real `Download` menu item. Installed catalog readback now
  distinguishes stable-hash/title-only duplicates from route-authorized
  Library rows. Mason's route-authorized row
  `d4670fc4-15d9-5ca7-b48f-026a8e33f87a` reports
  `remoteUrl=chatgpt://file/file_00000000730071fbaf48666ad6bf5ca3`,
  `materializationSurface=chatgpt-library-file-row-click`, and
  `eligibility=null`, while the stable-hash duplicate
  `d7e7b360-4a37-5d81-9293-ffaf1c94e05a` still reports
  `unsupported_account_library_asset`. Installed `/status` for
  `chatgpt/wsl-chrome-3` now reports `eligibleCandidates=26` and
  `selectedCandidates=3`, but browser health blocks catch-up because the
  managed browser was launched with an `about:blank` argument.
- Plan 0100 guardrails: automatic account-library catch-up remains disabled or
  preview-only by default; no broad multi-tenant catch-up; no history-lane cap
  raise; no retired frontend changes; no model-selector or feature-signature
  browser churn; and no account-library rows may re-enter conversation-history
  recovery.
- Plan 0099 completion: the explicit account-library reconciliation request
  mode is implemented as `assetSource=account-library` with source
  `account_library_reconciliation`, separate from history reconciliation.
  Focused runtime coverage proves request validation, route-authorized broad
  selection, archived-family skip before budget, stale-row resolution from
  current account-file inventory, stale-unresolved-row skip before download
  work, and archive-link propagation. Installed first proof
  `hmj_667837d8f947468494b7587e31d21e0c` exposed the stale-row bug: broad
  reconciliation selected catalog item
  `e112c9ba-ec50-5ae6-81a7-bfbb77f324bd` without a current provider file id.
  The fix now resolves stale rows against current ChatGPT Library account-file
  inventory before selection and skips only rows that remain unresolved.
  Installed `maxItems=1` job `hmj_ccaea15cb28242feb56ae4c9b52424ff`
  materialized one file with archive linkage, and installed `maxItems=3` job
  `hmj_cf164b2171d34df79bd625fe7e2b45d8` materialized three files with
  archive linkage. Both runs completed with `failed=0`, `duplicateAliases=0`,
  and active jobs returning to `0`.
- Plan 0099 live-follow decision: account-library catch-up remains
  manual/operator-only. Explicit operator jobs can retrieve selected or capped
  account-library files, but live follow must not enqueue account-library
  catch-up until a separate account-library cap, retry policy, provider-work
  timeout posture, and scheduler guard are implemented and proven.
- Plan 0099 guardrails: no broad multi-tenant catch-up, no retired frontend
  changes, no model-selector or feature-signature browser churn, no repeat
  downloads for archived account-library families, and no regression of
  history-lane recovery truth.
- Plan 0098 target: define account-library candidate identity and recovery
  counts separately from history recovery, discover the lowest-churn ChatGPT
  account-library retrieval surface, prove one selected installed retrieval
  before capped reconciliation, and keep live-follow account-library catch-up
  disabled until installed idempotence proof exists.
- Plan 0098 progress: the read-only recovery contract now exposes an
  `accountLibrary` lane with recovery counts and inventory authority buckets
  (`stableIdentity`, `directDownload`, `needsBrowserDetail`, and
  `unsupportedNoAuthority`). Installed proof server `18097` for
  `chatgpt/wsl-chrome-3` preserved history-lane
  `retrievableMissingLocal.total=0`, reported
  `accountLibrary.remoteKnownMissingLocal.total=120`,
  `accountLibrary.inventory.total=152`, `stableIdentity=152`,
  `directDownload=0`, `needsBrowserDetail=152`, and kept
  `createRequest=null` with active history-materialization jobs at `0`.
  The route-kind contract is now implemented for fresh account-library
  inventory and recovery readback: ChatGPT `/library/files/*`,
  `/library/artifacts/*`, `/library/canvas/*`, `/c/*`, external/inline
  assets, and unknown rows are split under `accountLibrary.inventory.detailRoutes`.
  `/c/*` and `/library/*` routes are navigation/detail evidence, not
  direct-download authority.
  Post-install proof server `18102` preserved
  `retrievableMissingLocal.total=0`, `accountLibrary.remoteKnownMissingLocal.total=122`,
  `accountLibrary.inventory.total=154`, `directDownload=0`,
  `needsBrowserDetail=154`, `detailRoutes.conversationDetail=10`,
  `detailRoutes.unknown=144`, `createRequest=null`, and active
  history-materialization jobs at `0`.
  A live Browser proof then found the supported ChatGPT Library retrieval path:
  row-level `file_...` ids are exposed in Library table `data-testid` values,
  row-title click triggers the authenticated
  `/backend-api/files/download/<file_id>?inline=true` JSON response, and the
  returned signed `/backend-api/estuary/content` body contains the file bytes.
  Installed list proof now writes 50 account-library rows with
  `providerFileId` and `chatgpt://file/...` remote URLs, and installed selected
  CLI proof downloaded
  `file_00000000fa5871fbaa5ba6f3e05d99f6` to a verified 492,700 byte, 10-page
  PDF at `/tmp/auracall-chatgpt-library-proof.pdf`. Account-library rows still
  do not create history-lane recovery requests. The next implementation slice
  added the selected account-library catalog-item job path: `materializeAccountFiles`
  writes account-file bytes, checksums, cache rows, and a file-fetch manifest,
  and explicit ChatGPT `chatgpt://file/...` catalog-item materialization now
  upserts archive-linked entries with archive item ids and asset routes in
  focused runtime coverage. The post-output CLI lifecycle hang observed after
  list/download success is fixed in the installed user runtime: rerun selected
  download exited `0` and reproduced the 492,700 byte PDF with SHA-256
  `6629baf1bbfcb550b0e94e6338688e312fd7a99e2c09172c29f05c893955a25e`.
  Installed archive-linked proof job `hmj_e3a49eca13f64788a4065f9adeaf9b9a`
  then materialized stale account-library catalog item
  `325dcf29-906e-55c2-a5e3-797c5c50e2e0` by resolving current account-file row
  `c3584433-36a3-5919-a347-bfea83f07343`; it wrote archive item
  `history-file:chatgpt:eric.cochran_soylei.com:account-library:c3584433-36a3-5919-a347-bfea83f07343`
  with an asset route that returned HTTP `200`, `492700` bytes, PDF prefix,
  and the same SHA-256. Active jobs returned to `0`. Plan 0099 then closed the
  explicit capped account-library reconciliation lane/proof for `maxItems=1`
  and `maxItems=3`, and chose manual/operator-only for live-follow
  integration; recovery still keeps account-library rows out of automatic
  history recovery with `retrievableMissingLocal.total=0` and
  `createRequest=null`.
- Plan 0098 guardrails: no broad multi-tenant catch-up, no model-selector or
  feature-signature browser churn during read-only discovery, no retired
  frontend changes, and no regression of the Plan 0097 history-lane recovery
  truth.
- Previous completed work: Plan 0097 closed ChatGPT history materialization.
  ChatGPT materialization for `chatgpt/wsl-chrome-3` now has a truthful
  recovery/materialization contract across candidate identity,
  same-source/same-checksum duplicate normalization, archive linkage, recovery
  readback, bounded installed proof, and live-follow consumption. There is no
  current retrievable missing-local backlog for this target; remaining
  account-level `chatgpt-library` rows are explicit unsupported metadata-only
  rows for the current history lane.
- Plan 0097 completion update: installed selected-conversation proof
  `hmj_b723f1ae9961480aa62216e03f5a8863` passed for the Mason duplicate
  conversation. It materialized four assets with archive item ids and asset
  routes: two generated artifacts via `captured-anchor-fetch` and two
  conversation files via `chatgpt-file-tile-default-action`. The duplicate
  Mason base-name alias no longer spent a budget slot. Capped reconciliation
  proof `hmj_244032853e0343e9a933049e8e1c401e` with `maxItems=3` then
  succeeded with one materialized PDF and no failures. The allowed
  `maxItems=5` proof `hmj_c9426dc2d9684dada145cdb50a84a009` succeeded with
  four routeable materialized file assets and one terminal `tile_not_found`
  file failure. Active jobs returned to `0`. Follow-up installed readback on
  proof server `18084` now separates the raw `118` remote-known missing local
  assets (`50` artifacts, `68` files) into `93` retrievable missing local
  assets, `3` unsupported metadata-only file rows, `3` static false-positive
  artifact rows, `19` terminal failures, and `0` currently outstanding
  duplicate aliases. Under explicit operator instruction, cap-10 proof job
  `hmj_409703ca757843c6830e46f60989db68` then succeeded with
  `conversations=3`, `materialized=10`, `failed=0`, and active jobs `0`, but
  recovery moved only to `90` retrievable missing assets because stale catalog
  rows could still reselect archive-backed families. A runtime fix now seeds
  reconciliation skip signatures from materialized run-archive assets and
  reads top-level catalog `source` fields; follow-up cap-10 job
  `hmj_7dbcf7f1cb8c495eb5ae25e221a1ee49` also succeeded with
  `materialized=10` and `failed=0`, confirming retrieval health while exposing
  the top-level source-signature gap that is now fixed and installed. The plan
  then proved one more id-source fallback and refresh-only skip: installed job
  `hmj_bfcf83058fd94c59bee86940474761e1` skipped immediately with
  `conversations=0`, `materialized=0`, `failed=0`, and no entries, so it did
  not re-download already archived TTP/Nacu/Mason families or spend browser
  work on empty refresh-only rows. Final recovery-truth proof on server
  `18092` moved account-level `chatgpt-library` rows into unsupported
  metadata-only classification and capped classification buckets to the raw
  missing-local inventory: `remoteKnownMissingLocal.total=109`,
  `retrievableMissingLocal.total=0`, `unsupportedMetadataOnly.total=87`,
  `staticFalsePositive.total=3`, `failedTerminal.total=19`,
  `createRequest=null`, and active history-materialization jobs `0`. Next
  recommended bounded milestone: ChatGPT account-library retrieval design if
  those `chatgpt-library` rows must become downloadable rather than
  metadata-only.
- Previous completed work: Plan 0096 ran one raised-cap
  `chatgpt/wsl-chrome-3` reconciliation pass with `maxItems=5`,
  `assetKinds=[artifacts, files, media]`, `force=false`, and snapshot refresh.
  Job `hmj_afb9cc1b8d7441f28215350ce034a66b` succeeded with
  `conversations=3`, `materialized=5`, `skipped=0`, and `failed=0`; active
  history-materialization jobs returned to `0`. Four durable archive items
  were created, including file rows `2026-05-27-cochran-full-cv.pdf` and
  `_AHS 2026-2027 Application for Acceleration (for courses at AHS) .pdf`,
  plus two Mason PreCalculus generated-artifact PDFs. The pass also produced
  one problematic materialized artifact entry:
  `Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut.pdf` shared the
  same remote content and SHA-256
  `7275c5d08508b22855a8ad36bc06d7cc6e3476f5ab84620814381b09b037e767` as
  `Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf`,
  but had no archive item or asset route. Post-pass recovery only moved from
  `121` to `120` remote-known missing local assets, with files moving from
  `71` to `70` and artifacts unchanged at `50`. The log scan found no SoyFuze,
  model-selector/model-control, feature-signature, static-favicon, `/simple`,
  or `download_url` stub-saving hits. The next bounded milestone should be a
  duplicate artifact budget/archive-linkage fix, not another cap increase.
- Previous completed work: Plan 0095 closed the post-file-fetch live-follow
  observation for `chatgpt/wsl-chrome-3`. The scoped target was
  `idle_waiting`, phase `backfill_history`, pass count `19`, with no latest
  failure and active completion
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84`. Recovery
  readback remained eligible under `full_missing_assets` with `121`
  remote-known missing local assets: `50` artifacts and `71` files. No
  duplicate provider work was enqueued; the active live-follow completion
  already had a recent capped outcome from
  `hmj_ff2d7546059f42d38ebc7f6d89ad183b`, which ran
  `reconcile=true`, `assetKinds=[artifacts, files, media]`, `maxItems=3`, and
  `force=false`, then materialized one ChatGPT conversation file from three
  routeable conversations. The materialized file
  `resp_dc3501c9c2b4412db047ed54995f33bb_step_1-auracall-request.txt` used
  provider file id `file_0000000022c8720c8e43e32bdc51da70`, method
  `chatgpt-file-tile-default-action`, size `138994`, and SHA-256
  `c6d811db58b23658e0100ce091f72dd7b69c356c035e18ab5ccccb32718157f0`.
  Active history-materialization jobs returned to `0`, archive readback
  confirmed the Plan 0093 DOCX and Plan 0094 PDF remain available, and the log
  scan found no SoyFuze, model-selector/model-control, feature-signature,
  static-favicon, `/simple`, or `download_url` stub-saving hits. The next
  scale step should be another capped `maxItems=3` observation/catch-up batch,
  not broad multi-tenant catch-up.
- Previous completed work: Plan 0094 closed ChatGPT conversation-file fetch.
  The ChatGPT adapter now reads provider file ids from React tile metadata,
  uses `chatgpt://file/<providerFileId>` as the retrievable URL, scopes tile
  clicks to the selected conversation, scrolls through virtualized DOM before
  clicking, skips `/simple` metadata responses, follows JSON `download_url`
  responses, and writes the signed content body. History materialization now
  passes the full `FileRef` to provider downloads, records
  `chatgpt-file-tile-default-action` in file-fetch manifests, and preserves
  provider file ids plus method metadata in archive/search rows. Installed
  proof `hmj_01f43d3485984d61ba2ba62059a89f6d` materialized both audited
  files from conversation `6a092419-33c0-83ea-bca8-27c694312842`: PDF SHA-256
  `e5a22b52330b24428b653684a9cbe9d2c1a1accd9f817989235ddb1d767e952a` and ZIP
  SHA-256
  `6eaab4a76ae855163e84ef38e79e2bbc674cf55a61450ee74668f4cba07c6a39`.
  Final installed proof `hmj_b63d3d35fc554a30bd846e694a6fc23b` confirmed the
  PDF archive row carries provider file id
  `file_000000004a0c71f89172ec251ae22c52`, method
  `chatgpt-file-tile-default-action`, a 7-page PDF body, and active
  history-materialization jobs returned to `0` with no SoyFuze,
  model-selector, feature-signature, or static-favicon regressions in the
  proof log window.
- Previous completed work: Plan 0093 is closed. `chatgpt/wsl-chrome-3` is now bounded
  full-retrieval capable for eligible retrievable artifacts, with installed
  proof through the durable history-materialization lane. The timeout root
  cause was a too-small ChatGPT full-sweep collector budget; ChatGPT
  full-sweep completions now use `900_000` ms. Two additional catch-up blockers
  were fixed during proof: static-image favicon rows using `artifactId` are
  skipped before fetch work, and same-title DOM download-button artifacts now
  take precedence over non-actionable sandbox download duplicates before
  `maxItems` is applied. Final installed proof
  `hmj_13c5108693104ae0833942a49fac3993` materialized
  `Download the revised DOCX` from conversation
  `6a092419-33c0-83ea-bca8-27c694312842`, wrote
  `Earthline_PCG_Mutual_Confidentiality_Agreement_revised.docx`, and recorded
  SHA-256
  `7a7f8de11b1ca3f537f694397018db3112d9e490d0f718db55146f9de65f1c71`.
  Active history-materialization jobs returned to `0`, no SoyFuze or
  model-selector regressions appeared in the proof log window, and the stale
  duplicate live-follow completion was cancelled so one active
  `chatgpt/wsl-chrome-3` completion remains. The next bounded milestone should
  be either a small live-follow catch-up observation window or a separate
  provider implementation for unsupported ChatGPT conversation-file rows; it
  should not be broad multi-tenant catch-up.
- Completed work before Plan 0093: Plan 0092 closed ChatGPT catalog hygiene and asset-kind
  eligibility before another catch-up batch. The target remains
  `chatgpt/wsl-chrome-3`, bound to `eric.cochran@soylei.com`, with
  `132` remote-known missing local assets split as `50` artifacts and `82`
  files. Plan 0091 is closed for one bounded materialization catch-up pass. The initial
  `maxItems=25` installed job exposed an unsafe duplicate-download loop across
  stale ChatGPT Deep Research rows, especially `SoyFuze Chemical Composition
  Dossier`. The concrete bug was a stale OOPIF identity leak: ChatGPT Deep
  Research discovery enumerated all DevTools `iframe` targets on the browser
  port, not only iframes embedded in the active conversation page, then stamped
  the visible report with the current target conversation id. The service was
  stopped, the job recovered as failed, reconciliation now deduplicates
  asset-family signatures while carrying a remaining asset budget, and the
  ChatGPT adapter now filters Deep Research OOPIFs by active-page iframe URL
  before discovery/export. The pass also exposed an interactive read-path
  defect: cache feature-signature detection opened the ChatGPT model control
  during artifact fetches; history materialization now sets
  `skipFeatureSignature=true`. The guarded installed proof job
  `hmj_7305d6ad022249ceaf8016ec920df832` reached terminal `skipped` with
  four entries and no repeat SoyFuze downloads. Target recovery moved from
  `133` to `132` remote-known missing local assets and local materialized
  assets moved from `25` to `26`; active history-materialization jobs returned
  to `0`. A follow-up smoke job
  `hmj_6dee6359cc264789a495047d27c167ca` proved the patched installed path did
  not repeat SoyFuze downloads or log model-selector / feature-signature hits,
  but it selected a favicon/static-image row as the next generated-image
  candidate. Plan 0092 therefore classifies stale Deep Research duplicates,
  static-image false positives, and unsupported ChatGPT conversation-file rows
  before any larger materialization run. Track 1 read-only classification found
  the flat `132` missing-local count is not a clean retrievable queue:
  account-library files are mirrored as both file and artifact inventory,
  three `image-dom:*` generated-image rows are actually Google favicon/static
  chrome URLs, three SoyFuze Deep Research rows share one logical report
  family, and thirteen ChatGPT conversation-file rows have no retrievable URL
  or provider file id. Plan 0092 now adds catalog readback eligibility reasons
  and reconciliation preselection guards so static image false positives,
  unsupported conversation-file rows, and stale duplicate Deep Research
  families stay visible but do not spend repeated browser materialization
  budget. Final installed proof job
  `hmj_596774a0d81b4d82bf2bef831c232990` skipped the favicon/static-image
  class, selected a retrievable Deep Research markdown artifact, materialized
  it with SHA-256
  `76cc6e2faf9a4157e778544a4becdb1056baf5c52e299935e23da5157d0378c8`, and
  left active history-materialization jobs at `0`. Follow-up installed smoke
  `hmj_323fbf35352044799e28989e08400313` proved the next capped
  reconciliation pass did not reselect stale SoyFuze duplicate rows; it
  refreshed conversation `6a092419-33c0-83ea-bca8-27c694312842`, skipped one
  non-downloadable sandbox DOCX artifact, wrote no new SoyFuze files, logged no
  model-selector / feature-signature hits after byte offset `1151339`, and
  left active jobs at `0`. Broad ChatGPT catch-up is
  still a separate scale decision because the target-level recovery count
  remains inflated by account-library duplication and unsupported
  conversation-file rows.
  Plan 0090 is closed for Gemini cached uploaded-file salvage.
  Plan 0087 closed the first Gemini conversation-level retrieval proof:
  installed readback still shows
  `gemini/auracall-gemini-pro` project manifests at `0`, with
  `retainedFromCache.projects=0` and no stale Google catalog Gems. The bounded
  selected-conversation run `hmj_19f26f2121ff40a285642beb2bfc96b5`
  refreshed routeable conversation `8e8e58b57ae544ea` and materialized
  `Before The Tide Returns` as a checksum-bearing local MP4 archive item. Plan
  0088 then fixed the health gates needed before broader Gemini catch-up:
  - API-created and reused queued history-materialization jobs are now
    scheduled through the normal API/background path.
  - Gemini materialization candidates now reject Google sign-in redirect rows,
    static app/download/settings/Gem routes, and query/fragment-contaminated
    ids before provider browser work starts.
  - archive/search materialization freshness now projects back onto matching
    account-mirror conversation rows, so materialized conversations no longer
    read as metadata/deferred-only in search readback.
  - installed proof job `hmj_f276983d378c494a83a5d685b683fbf7` advanced
    unattended through the installed API path and materialized
    `Before The Tide Returns` with SHA-256
    `8ef8f814f7d17908d8186048b3dc8021fae211f4cc1f4aa340059e19cdfdc544`.
  Plan 0089 then ran one capped installed API catch-up batch for three
  canonical Gemini conversations. Job
  `hmj_df40643c30aa45a3b29651e11d379046` reached terminal `succeeded`,
  materialized two assets, terminally classified one failed file surface, and
  showed one routeable no-downloadable-assets conversation. Archive rows
  increased from `1` to `3`; search rows increased from `72` to `74`; search
  materialized conversation rows increased from `1` to `3`; active history
  materialization jobs remained `0`. The next scale gate should be another
  capped selected-conversation batch, not broad Gemini catch-up, because
  recovery readback is still target-level `needs_detail_refresh` while the
  active Gemini live-follow completion remains metadata-only/deferred.
  Plan 0090 closed the `AGENTS.md` false-negative from Plan 0089 with an
  auditable cached uploaded-file salvage path. Installed API proof job
  `hmj_730bf520b4b746b88d8d3d0ecf44dac5` refreshed routeable Gemini
  conversation `ab30a4a92e4b65a9`, materialized `AGENTS.md` from the verified
  local provider cache with SHA-256
  `913744155dc7310f2072ca4d2989f53dbed12e0b757e1d2e0c868b641142ede2`, and
  archive/search readback showed `materialization.method=cached-provider-file`.
  The next Gemini scale gate can return to another capped selected-conversation
  batch, not broad catch-up.
- Deferred AuraCall lanes: broad retry/launch, Search/archive, and API Access
  remain future bounded plans unless explicitly selected.

Current State:
- canonical active execution authority now lives under
  `docs/dev/plans/0001-2026-04-14-execution.md`
- low-signal loose execution pointers now live under
  `docs/dev/plans/legacy-archive/`
- planning-authority migration is complete
- roadmap governance hygiene closed in
  [docs/dev/plans/0075-2026-05-27-roadmap-governance-hygiene.md](docs/dev/plans/0075-2026-05-27-roadmap-governance-hygiene.md):
  - stale absolute old-checkout links were replaced with repo-relative links,
    noncanonical `Status:` plan headers were normalized, stale `Now` guidance
    was removed, and `plans:audit` now fails on missing/legacy state headers
    or stale absolute workspace paths
  - this was a docs/tooling cleanup slice only; no provider browser work or
    product behavior changed
- the current roadmap reconciliation lane is closed in
  [docs/dev/plans/0081-2026-05-29-roadmap-priority-reconciliation.md](docs/dev/plans/0081-2026-05-29-roadmap-priority-reconciliation.md)
  after Plans 0077 through 0080 closed the first greenfield `/console`
  sequence; the next implementation lane is a new bounded
  `transcribe-audio` App Intelligence integration plan rather than extending
  Plan 0063 or treating the legacy frontend as a product target
- downstream `transcribe-audio` App Intelligence integration is now closed in
  [docs/dev/plans/0082-2026-05-29-transcribe-audio-app-intelligence-integration.md](docs/dev/plans/0082-2026-05-29-transcribe-audio-app-intelligence-integration.md):
  - AuraCall owns provider execution choices through the
    `GET /v1/config/agent-choices` contract, including effective
    registry-backed teams
  - `transcribe-audio` now prefers stable `AURACALL_AGENT_ID` and optional
    dispatch-pool team ids rather than copying provider-specific
    tenant/browser/model/project internals
  - `transcribe-audio` prepare/enqueue manifests and `/api/intelligence/config`
    expose redacted AuraCall readiness for selected agents/teams without
    exposing secrets
  - transcript payloads, readout schemas, App Intelligence ledgers,
    materialization, and quality gates remain in `transcribe-audio`
  - no raw transcript text, prompt packets, readout bodies, or private
    transcript paths should be stored in AuraCall docs or config
  - installed-runtime proof after rebuilding/restarting `auracall-api.service`
    showed the scoped transcribe key can read the
    `transcribe-audio-chatgpt-pro-pool` dispatch team with three ready members;
    live provider submit/materialize was skipped because the first-pass queue
    was empty
- safe Runs controls are now closed in
  [docs/dev/plans/0083-2026-05-29-runs-safe-controls.md](docs/dev/plans/0083-2026-05-29-runs-safe-controls.md):
  - the target product surface is only the greenfield `/console?view=runs`
    workbench
  - first controls are implemented for state-gated live-follow
    pause/resume/cancel, background drain pause/resume, and one
    local-runner-owned targeted-drain path when backend readback proves
    eligibility
  - broad launch and retry controls remain deferred
  - each exposed action has a documented state gate, confirmation copy, result
    readback, and blocked-state reason from `/status.controlReadiness`
- API readback memory and stale-runner compaction is now closed in
  [docs/dev/plans/0084-2026-05-30-api-readback-memory-runner-compaction.md](docs/dev/plans/0084-2026-05-30-api-readback-memory-runner-compaction.md):
  - default `/status.accountMirrorCompletions` keeps exact completion metrics
    but hydrates materialization status only for current active rows and the
    bounded recent window
  - completion summaries expose `limits.recent: 10` and
    `omitted.recent` metadata for capped default readback
  - stale runner retention is the newest `100` stale runner records, compacted
    at local API runner registration without removing the active runner
  - installed runtime proof on port `18095` reduced runner topology from
    `1761` total / `1760` stale to `101` total / `100` stale while preserving
    `runnerTopology=full` for retained runner detail and CLI completion
    readback for protected `/v1/*` routes
- 2026-05-30 live-follow/materialization audit concerns now have their first
  closed recovery slice, but remaining fleet catch-up still requires bounded
  follow-up plans:
  - service-health/readback pressure: the first service-health follow-up is
    complete in
    [docs/dev/plans/0084-2026-05-30-api-readback-memory-runner-compaction.md](docs/dev/plans/0084-2026-05-30-api-readback-memory-runner-compaction.md)
    for bounded completion hydration and stale-runner retention; continue to
    treat future unbounded status/readback growth as a release blocker
  - live-follow truthfulness: current target rollups can recover to
    `healthy` after replacement completions enter `idle_waiting`, even while
    historical ChatGPT retry churn, high consecutive-failure counts, and
    pass-count-zero replacement loops remain important operator signals
  - artifact materialization gap: live-follow completions may run
    `materializationPolicy: metadata_only`, and several tenants still report
    `remoteKnownMissingLocal` assets; the explicit recovery lane is now closed
    for planner/readback/proof mechanics in
    [docs/dev/plans/0085-2026-05-30-live-follow-artifact-materialization-recovery.md](docs/dev/plans/0085-2026-05-30-live-follow-artifact-materialization-recovery.md)
    while full live-follow artifact retrieval is now closed in
    [docs/dev/plans/0086-2026-05-30-full-live-follow-artifact-retrieval.md](docs/dev/plans/0086-2026-05-30-full-live-follow-artifact-retrieval.md).
    - 2026-05-30 closeout: installed
      `auracall api mirror-recovery-candidates --port 18095 --limit 20 --json`
      returned `8` candidates, `436` remote-known missing local assets, and
      `6` unknown/deferred assets. API/CLI/MCP planner readback is implemented;
      bounded execution succeeded once through
      `hmj_27003a79e9a6416381aa8d37666e215a`, materializing `3` assets with
      local paths and checksums while recording `4` fetch failures and `1`
      skip. Run-archive evidence now reconciles into recovery-candidate
      readback: `chatgpt/wsl-chrome-3` dropped from `147` to `145`
      remote-known missing local assets, and global installed readback dropped
      from `436` to `434`. The remaining `434` remote-known missing local
      assets and `6` unknown/deferred assets are not automatic live-follow
      catch-up; they require future explicit recovery/detail-refresh work.
    - 2026-05-30 full-retrieval audit: installed config has
      `liveFollow.mode: metadata-first` for enabled targets but no
      `sweepMode` or `materializationPolicy`; active completions remain
      `steady_follow` plus `metadata_only`; dry-run reconciliation selects no
      targets because active completions are classified as `already_active`.
      Plan 0086 must persist full-retrieval policy and upgrade active
      metadata-only completions before broad catch-up is expected.
    - 2026-05-30 Plan 0086 closeout: configured live-follow reconciliation now
      upgrades active metadata-only completions in place and emits
      `live_follow_policy_upgraded`; history materialization no longer uses a
      hard wrapper timeout that can mark a job failed while provider work keeps
      materializing in the background. Installed `chatgpt/wsl-chrome-3`
      readback shows the full-retrieval policy, and search/archive proof
      reports `24` available artifacts with local paths and checksums. The
      remaining `123` remote-known missing local assets on that target require
      continued bounded catch-up, not metadata-only polling.
  - Gemini detail confidence: first proof closed in
    [docs/dev/plans/0087-2026-05-31-gemini-conversation-asset-retrieval.md](docs/dev/plans/0087-2026-05-31-gemini-conversation-asset-retrieval.md).
    `auracall-gemini-pro` no longer has project/Gem pollution, and a selected
    routeable conversation now has full local artifact materialization proof.
  - Gemini materialization health: closed in
    [docs/dev/plans/0088-2026-05-31-gemini-materialization-health.md](docs/dev/plans/0088-2026-05-31-gemini-materialization-health.md).
    This slice made queued materialization unattended again, rejected malformed
    Gemini conversation candidates before browser work, and reconciled
    archive/search materialization freshness back into conversation readback.
    Broad Gemini retrieval can now be planned as a bounded catch-up batch, but
    should still be proven with caps and before/after counts before claiming
    every retrievable Gemini artifact has caught up.
  - Gemini bounded artifact catch-up: closed in
    [docs/dev/plans/0089-2026-05-31-gemini-bounded-artifact-catch-up.md](docs/dev/plans/0089-2026-05-31-gemini-bounded-artifact-catch-up.md).
    This slice ran exactly one capped installed Gemini materialization batch
    after baseline readback. The recommended next Gemini gate is a repeat
    capped selected-conversation batch with `maxItems=3` to `5`, using
    routeable/stale or missing-assets rows with cached asset signals.
  - Gemini cached uploaded-file salvage: closed in
    [docs/dev/plans/0090-2026-05-31-gemini-cached-uploaded-file-salvage.md](docs/dev/plans/0090-2026-05-31-gemini-cached-uploaded-file-salvage.md).
    This slice fixed the `AGENTS.md` false-negative by trusting existing
    local cache only when current provider detail and cache evidence agree on
    stable identity fields.
  - ChatGPT WSL Chrome 3 bounded materialization catch-up: closed in
    [docs/dev/plans/0091-2026-05-31-chatgpt-wsl-chrome-3-bounded-materialization-catch-up.md](docs/dev/plans/0091-2026-05-31-chatgpt-wsl-chrome-3-bounded-materialization-catch-up.md).
    This slice ran a capped installed-runtime catch-up pass, stopped an unsafe
    duplicate Deep Research download loop, added reconciliation
    asset-family/budget guards, scoped ChatGPT Deep Research OOPIF harvesting
    to active-page iframe URLs, suppressed feature-signature model-control
    probing during history materialization, and proved the patched path with a smaller
    terminal installed job. Further ChatGPT scale requires catalog hygiene
    before another catch-up batch.
  - operator audit parity: protected `/v1/*` materialization routes can block
    direct read-only inspection from local curl, so the next operator-facing
    plan should confirm CLI/MCP/console parity for materialization and
    reconciliation readback before adding more controls
- supporting maintenance work is allowed only when it directly protects that
  lane or fixes a newly reproduced mismatch
- closed browser reliability exception:
  - the earlier profile-scoped dispatcher ownership proof is still closed in
    [docs/dev/plans/0021-2026-04-21-browser-operation-dispatcher.md](docs/dev/plans/0021-2026-04-21-browser-operation-dispatcher.md)
  - the concrete mismatch reopened and then closed the browser reliability lane
    in
    [docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md](docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md)
  - browser-service mutation audit now covers navigation/reload/target-reuse
    control points, providers and legacy product flows route through those
    helpers, diagnostics can report recent mutation history, and raw mutating
    CDP scripts are explicitly allowlisted/guarded escape hatches
- parked lanes should not resume from inertia:
  - response-shape normalization is parked unless a new public routing or
    readback mismatch is reproduced
  - service-state/passive monitoring is maintenance-only unless a new
    provider-owned evidence seam appears
  - config/browser/provider work stays bounded maintenance or side-track work
    unless explicitly selected as the primary lane; Plans 0061 and 0062 closed
    the current browser-first Grok/ChatGPT media provider slices
- account-aware agents and lazy account mirroring are now closed in
  [docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md](docs/dev/plans/0063-2026-04-29-agent-roles-and-lazy-account-mirroring.md)
  as a service-mode planning lane:
  - default ChatGPT is the first mirror source because it has the richest
    account history
  - agent roles may specialize purpose and routing, but account identity stays
    bound to the referenced AuraCall runtime profile
  - lazy mirroring must be metadata-first, identity-gated, and routed through
    the browser operation dispatcher
  - lazy live follow now wakes the existing mirror scheduler after API-served
    media settles or response-run drain completes, while routine refreshes keep
    zero browser queue wait; `/status.accountMirrorScheduler` reports
    `lastWakeReason`, `lastWakeAt`, and `operatorStatus.posture` for operator
    audit; MCP `api_status` exposes the same local API posture for agent
    assertions
  - cooperative yield now classifies queued browser work by owner command, so
    routine mirrors yield to response/media browser work without preempting
    themselves for another routine mirror refresh
  - compact scheduler history is available at
    `/v1/account-mirrors/scheduler/history`; `api_status` also reports the
    latest lazy-yield summary from `/status`
  - mirror completion is now a nonblocking service operation exposed through
    API, CLI, and MCP; by default it runs as unbounded live follow, backfilling
    history and then staying in steady follow; operation records are persisted
    under the account-mirror cache, hydrated on API/MCP startup, and listable
    for operator dashboards without knowing the id; `/status` and
    `/ops/browser` now surface active/recent live-follow posture directly, and
    `/status.liveFollow`, CLI/MCP status, and `/ops/browser` now share the
    same derived live-follow severity (`healthy`, `backpressured`, `paused`, or
    `attention-needed`); API/CLI/MCP/dashboard controls can pause, resume, or
    cancel a live-follow operation by id;
    `/v1/browser/processes` and `/ops/browser` now separate Chrome launch
    `about:blank` arguments from actual open DevTools blank page targets;
    Gemini lazy live-follow now uses slower default cadence and a
    six-interaction-per-minute browser-read pacer after bot-gate clearance;
    ChatGPT conversation inventory must scroll the infinite left rail when
    `includeHistory` and `historyLimit` are requested before claiming mirror
    completeness
  - ChatGPT live-follow refresh is no longer hard-coded to the default runtime
    profile: installed `wsl-chrome-2` Pro dogfood matched
    `consult@polymerconsultinggroup.com`, completed one mirror pass, cached
    three projects, 55 conversations, and nine files, then paused with 52
    remaining detail surfaces
  - installed `wsl-chrome-3` Pro dogfood matched
    `eric.cochran@soylei.com`, completed one mirror pass, cached one project,
    17 conversations, and 12 artifacts, then paused with 12 remaining detail
    surfaces; after restarting the long-lived patched service on port `18095`,
    resuming the same completion advanced it to `passCount: 2` and reduced the
    remaining detail surfaces to eight; the same service then continued without
    another manual resume to `passCount: 4`, entered `steady_follow`, and
    marked the mirror complete with one project, 17 conversations,
    194 artifacts, and zero remaining detail surfaces
  - the long-lived `18095` service then resumed installed `wsl-chrome-2`;
    `chatgpt/wsl-chrome-2` advanced to `passCount: 2` and reduced remaining
    detail surfaces from 52 to 46, then woke again without manual resume to
    `passCount: 3` and reduced remaining detail surfaces to 40, then reached
    `passCount: 4` and reduced remaining detail surfaces to 34
  - live-follow desired state now starts from
    `runtimeProfiles.<profile>.services.<provider>.liveFollow`: status entries
    report enabled, disabled, unconfigured, missing-identity, and unsupported
    accounts, MCP `account_mirror_status` carries the same projection, and
    `api serve` reconciles enabled configured accounts into one durable live-follow
    completion without duplicating existing active operations
  - routine lazy scheduler passes now choose among all enabled live-follow
    accounts instead of the original `chatgpt/default` bootstrap target; the
    scheduler still uses politeness gates and in-progress mirror priority before
    attempting any browser work
  - every scheduler pass now re-runs configured-account live-follow
    reconciliation, so terminal enabled completions can be recreated on a
    cadence without restarting the API service
  - `/status.liveFollow.targets.accounts[]` now separates
    `routineEligibleAt` from `activeCompletionNextAttemptAt`; `nextAttemptAt`
    is the effective operator wake and prefers the active completion when one is
    running
  - Gemini live follow treats the `/gems/view` project index as opportunistic:
    transient Gem manager route-settle failures no longer fail the whole mirror
    pass or trigger a second `location.assign` re-navigation
  - default Gemini and Grok dogfood now runs browser-backed, read-only
    live-follow collectors through the same provider dispatcher path:
    `gemini/default` cached 12 projects and 54 conversations, while
    `grok/default` cached 9 projects and 43 conversations; non-ChatGPT
    attachment/media detail inventory remains deferred until provider-specific
    detail surfaces are proven
  - `/status.liveFollow.targets` now includes explicit `desired` and `actual`
    rollups; CLI `api status`, MCP `api_status`, and `/ops/browser` expose the
    same current-target health and desired-vs-actual signal so operators can
    distinguish configured
    intent from current mirror activity without raw status entry inspection;
    `/ops/browser` also includes the first one-page AuraCall UX navigation
    scaffold, local controls for background drain pause/resume and mirror
    scheduler run-once/dry-run/pause/resume, and per-account live-follow
    targets as a compact table, an operator attention queue, and an active
    completion operations table while preserving the raw JSON block for
    debugging; active rows expose the matching
    completion id, can inspect the persisted completion detail from either a
    row or a typed id, fill the shared control input, provide state-aware direct
    row actions, and show immediate operator feedback for each control request;
    `/account-mirror` now serves the same read-only account mirror catalog
    browser backed by cache-only `/v1/account-mirrors/catalog`, with provider,
    runtime profile, kind, search, and limit controls for cached projects,
    conversations, artifacts, files, and media; catalog filters persist in the
    page URL and rows open stable cache-backed item-detail URLs through
    `/v1/account-mirrors/catalog/items/{item_id}` without starting browser
    work; conversation rows show cached transcript availability and message
    count before click-through, with a persisted `withTranscript=1` filter for
    transcript-backed rows; conversation item-detail reads hydrate any existing
    cached conversation context and render cached turns as a chat dialog when
    available, with raw JSON retained as the debug fallback and a local
    transcript search/download action plus cached related item navigation;
    file/artifact/media detail now renders a compact cached metadata inspector,
    browser-safe cached previews, cache-owned local asset serving, and catalog
    row preview/materialization badges with previewability filtering/sorting
    plus direct row-level and visible-batch preview URL inspect/session-review
    with catalog metadata/selection/open/copy/download/manifest export and
    manifest load/save actions
    before the raw JSON fallback;
    CLI/MCP `api_ops_browser_status` surfaces the configured canonical
    dashboard URL for operator handoff, with `http://auracall.localhost/ops/browser`
    as the stable local dashboard endpoint
  - service restart dogfood exposed a shutdown cleanup gap: `api serve` now
    terminates same-port orphan `api serve` processes before binding and
    parks active account-mirror completions as persisted `queued` work during
    graceful shutdown; startup also prunes stale browser-operation locks so
    forced restart recovery does not leave live-follow targets blocked by dead
    owner PIDs, and completion records now carry a bounded lifecycle trail for
    `parked_for_shutdown` / `resumed_after_restart` operator evidence; the
    headline live-follow health line now reports current target counts instead
    of historical failed/cancelled completion totals when target rollups are
    available
  - the 2026-05-27 service-mode count-parity slice is complete: completion
    metrics now use uncapped operation lists, `idle_waiting` is an active
    state consistently, and installed port `18095` readback matched six active
    completions across `/status`, CLI `api status`, MCP `api_status`, and
    `/ops/browser` with live-follow severity `healthy`
  - the 2026-05-27 closure audit verified ChatGPT Library/account-file
    inventory, Grok account-file/media derivation, and Gemini conversation
    detail inventory through targeted collector/adapter tests; future saved
    gallery, materialization, or search breadth should use new bounded plans
- OpenAI-compatible agent API access and semantic model selectors are now scoped
  in
  [docs/dev/plans/0064-2026-05-10-openai-agent-api-and-semantic-model-selectors.md](docs/dev/plans/0064-2026-05-10-openai-agent-api-and-semantic-model-selectors.md):
  - `/v1/responses` accepts `model: "agent:<agent_id>"` as single-agent routing
    shorthand
  - agent config can bind service, raw model pins, semantic model selector
    intent, project/conversation ids, knowledge references, and pre/post prompt
    fields
  - semantic selectors are the stable default posture; exact provider versions
    remain compatibility escape hatches
  - ChatGPT semantic selectors now execute through current browser model and
    thinking controls; Grok/Gemini semantic execution remains the next provider
    follow-through
  - local API and MCP tools can now configure agents and teams without
    hand-editing the user config file
  - optional scoped API-key policy now protects `/v1/*` routes when configured
  - non-streaming `/v1/chat/completions` now adapts OpenAI-style chat requests
    into the same configured-agent `/v1/responses` runtime path and drains
    synchronously before returning; streaming remains deferred until basic
    client dogfooding is proven
- Agent tenant/binding semantics are now closed in
  [docs/dev/plans/0076-2026-05-28-agent-tenant-binding-semantics.md](docs/dev/plans/0076-2026-05-28-agent-tenant-binding-semantics.md):
  - agent identity should be service plus tenant plus role, while
    `runtimeProfile` is the current execution binding for that tenant
  - effective agent catalog entries now expose
    `tenantKey`, `bindingId`, `bindingKey`, and structured `projectBinding`
    while preserving compatibility with existing `runtimeProfile`-based agents
  - `GET /v1/config/agent-choices` now exposes services, tenants, execution
    bindings, model selectors, provider model ids, extras, project bindings,
    effective agents, and per-agent validation for AuraCall UX and downstream
    app selection
  - `/agents` now includes a bounded agent configuration editor backed by the
    existing config entity APIs, with load/save/duplicate/archive flows and
    refreshed choices/diagnostics after mutations
  - downstream apps such as `transcribe-audio` should select `agentId` and use
    AuraCall readback for valid service/tenant/model/extras/project choices
- Product UX work must follow
  [docs/dev/aura-call-ux-specification-guide.md](docs/dev/aura-call-ux-specification-guide.md):
  - the product frontend should be task-oriented, modern, animated with
    restraint, and operator-readable by default
  - raw JSON, route templates, logs, browser processes, and provider ids belong
    behind inspectors or under Diagnostics
  - `/dashboard`, `/agents`, `/config`, and `/ops/browser` are legacy or
    diagnostic surfaces, not the design baseline for future configuration
    workflows
  - the next product frontend should start greenfield on a separate surface;
    existing frontend pages should remain frozen except for narrow operational
    bug fixes and explicit retirement/cutover notes
  - product UX development should advance through high-level milestones instead
    of extending whichever debug page is closest to the current backend
    endpoint:
    1. operator shell and navigation baseline: complete for the first
       greenfield `/console` surface. The console owns product navigation,
       selected-workflow routing, responsive layout, and the visible boundary
       to legacy diagnostics.
    2. Agents configuration workflow: complete for the first greenfield
       workflow. `/console?view=agents` provides list/detail agent setup using
       service, provider account, browser binding, model selector, extras,
       project binding, validation, duplicate/archive, and save flows.
    3. Providers and Projects workflows: complete for readback-first product
       UX. `/console?view=providers` and `/console?view=projects` expose
       provider-account readiness, browser-binding health, project/default
       binding inventory, linked-agent issues, and inspectors for raw ids.
    4. Overview and Health command center: complete for the first product
       command center. `/console` and `/console?view=overview` summarize
       service readiness, provider account health, active warnings, recent
       work, and next operator actions before exposing technical status detail.
    5. Runs workbench: complete for read-only inspection.
       `/console?view=runs` makes active work, response batches, team runs,
       runtime runs, live-follow operations, queue posture, recovery hints, and
       timelines inspectable from a dense table/detail surface. Launch, retry,
       cancel, resume, pause, drain, and other mutation controls remain
       deferred to a later safe-controls plan with state gates and tests.
    6. Search and archive workbench:
       finish the unified all-tenant search table with cursor loading,
       virtualized rows, normalized facets, saved views, asset previews,
       transcript inspection, run/evidence panels, and queue-backed
       materialization controls where the API contract is already explicit.
    7. API Access workflow:
       expose API keys, scopes, reachable agents/teams, secret rotation,
       audit/readback, and copy-on-create behavior as an operator workflow
       instead of burying key operations in Health diagnostics.
    8. Diagnostics boundary:
       consolidate logs, raw payloads, route templates, browser processes,
       low-level probes, and legacy inline dashboards under Diagnostics links
       or drawers, with product pages showing only selected technical detail.
    9. UX release-quality gate:
       every product page must satisfy the guide's accessibility,
       performance, responsive-layout, stable-table, reduced-motion,
       empty/error/loading-state, and raw-detail-disclosure checklist before it
       is treated as the durable UI for that workflow.
- Tenant-pool response batches are now scoped in
  [docs/dev/plans/0068-2026-05-18-tenant-pool-response-batches.md](docs/dev/plans/0068-2026-05-18-tenant-pool-response-batches.md):
  - `teams.<id>.type = "dispatch-pool"` defines batch dispatch teams whose
    members are separate account-bearing agents rather than sequential
    `/v1/team-runs` workflow steps
  - `/v1/response-batches` can route through `{ "dispatch": { "team": ... } }`
    and expands each child to the next available concrete member agent before
    authorization
  - `/v1/tenant-pool-teams/ensure` and MCP `tenant_pool_team_ensure` compose
    per-member project ensures and create the dispatch-pool team only when it
    is missing
  - dispatch selection uses active runtime evidence from leases/running steps
    plus current-batch assignments; projectSync is explicitly `none` until a
    later project-sync lane exists
- DB-backed agent registry migration is now scoped in
  [docs/dev/plans/0065-2026-05-10-db-backed-agent-registry.md](docs/dev/plans/0065-2026-05-10-db-backed-agent-registry.md):
  - `~/.auracall/config.json` remains bootstrap/source config for runtime
    profiles, browser bindings, API service settings, and optional pinned/core
    agents
  - a user-scoped registry under `~/.auracall` becomes the normal mutable store
    for large numbers of agents and teams
  - current `/v1/config/agents`, `/v1/config/teams`, and MCP config tools stay
    compatibility surfaces while their backing store migrates toward registry
    records with source, enabled state, revisions, and export/import support
- searchable run cache and artifact archive work is now scoped in
  [docs/dev/plans/0066-2026-05-16-searchable-run-cache-and-artifact-archive.md](docs/dev/plans/0066-2026-05-16-searchable-run-cache-and-artifact-archive.md):
  - this is the right lane for promoting AuraCall-created CLI/API/MCP work into
    a searchable cache/archive: response runs, response batches, team runs,
    media generations, uploaded files, provider conversation references,
    generated artifacts, and caller-supplied post-processing evidence
  - this lane is separate from account mirror live-follow, which mirrors
    provider-account history; the archive lane owns evidence created by
    AuraCall jobs and must be searchable/retrievable without provider browser
    work
  - this lane is also separate from domain validation; course grading
    arithmetic, transcript semantics, literature moderation, and similar
    workflow checks belong to caller agents/workflows that can attach their
    validation evidence to archived AuraCall outputs
- history-backed artifact materialization is closed in
  [docs/dev/plans/0069-2026-05-22-history-backed-artifact-materialization.md](docs/dev/plans/0069-2026-05-22-history-backed-artifact-materialization.md):
  - the lane now has explicit queued materialization jobs for provider
    conversations, account-mirror catalog items, archive items, and bounded
    reconciliation, with HTTP/CLI/MCP parity
  - account-mirror catalog reads remain cache-only; browser work happens only
    through explicit materialization or completion jobs routed through the
    dispatcher and provider politeness controls
  - ChatGPT historical artifacts were recovered live, Gemini media rows now
    record live duplicate-title/no-unique-evidence skips after a bounded mirror
    refresh, and Grok historical media recovery records an explicit unsupported
    skip before browser work
- conversation refresh and artifact reconciliation is closed in
  [docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md](docs/dev/plans/0070-2026-05-23-conversation-refresh-and-artifact-reconciliation.md):
  - the lane owns existing cached conversations becoming stale after operators
    add content through provider or AuraCall surfaces
  - full live-follow sweeps are the backfill path for partially hydrated
    histories, while steady follow walks recency-ordered project/left-rail
    indexes and uses changed detail/manifest freshness evidence when a provider
    does not move a modified conversation to rank 0
  - explicit operator reconciliation should refresh one cached conversation
    against the provider and then materialize missing artifacts through the
    existing history-materialization/cache/archive paths
  - freshness projection, the explicit `refreshSnapshot` history
    materialization job phase, and backend full-sweep completion
    policy/materialization cursor are implemented; Search and Account Mirror
    conversation rows now expose explicit reconciliation controls backed by the
    same durable job surface; steady-follow refreshes now restart detail
    inventory from the current rail/project top while full sweep resumes the
    deep cursor; full-sweep completion uses an extended collector timeout after
    the first Gemini proof hit the old cap; Gemini sweep discovery now includes
    bounded Gem/project conversation histories as well as the left rail, and
    fans project-history budget across Gems before deepening one; explicit
    reconciliation writes per-row detail/manifest/materialization evidence and
    can upsert a minimal direct-provider-id row when the mirror list did not
    already contain that conversation; provider hard stops now report explicit
    `provider_guard_required` materialization failures instead of generic
    internal errors; Gemini full-sweep dogfood materialized two cached
    conversation image artifacts with archive checksum evidence; the first live
    Gemini steady-follow dogfood exposed the generic collector timeout, so
    Gemini steady-follow completions now use a 300s envelope; refresh failures
    now persist target backoff state across API/proof-server restarts; Gemini
    explicit refresh and failure backoff defaults are shortened enough for
    practical bounded proof retries; a bounded Gemini steady-follow proof now
    completes and hands off materialization; the modified-conversation proof
    now relies on changed detail/manifest evidence rather than rank-only
    movement; a final same-profile selected-batch proof records Gemini bare
    `/app` terminal routeability evidence without consuming the bounded target
    budget, then still materializes the next routeable selected conversation
  - search and account-mirror catalog reads remain cache-only; browser work only
    starts from live-follow completion jobs or explicit reconciliation jobs
- full multi-tenant reconciliation is now scoped in
  [docs/dev/plans/0071-2026-05-24-full-multitenant-reconciliation.md](docs/dev/plans/0071-2026-05-24-full-multitenant-reconciliation.md):
  - the lane owns campaign-level orchestration across all configured
    account-bearing provider/runtime-profile targets after Plans 0069 and 0070
    closed the one-target materialization and reconciliation mechanics
  - a reconciliation campaign should discover configured live-follow targets
    from config/status/cache evidence without browser work, classify eligible,
    disabled, delayed, guarded, identity-mismatch, unsupported, and already
    active targets, and then start or attach target completions under
    provider/browser-profile concurrency budgets
  - the campaign surface should expose durable API/CLI/MCP create/list/status
    and control operations plus an operator UI detail view with aggregate
    counts, target rows, child completion/materialization links, terminal
    route-miss evidence, provider guards, and recommended operator actions
  - first implementation checkpoint: dry-run reconciliation campaigns now have
    a durable account-mirror cache store and API/CLI/MCP create/list/status/
    control readback; the planner classifies configured targets and applies
    selection budgets without launching provider browser work
  - second implementation checkpoint: non-dry-run campaigns start selected
    eligible targets as bounded full-sweep completion children, attach
    already-active target completions, hydrate child status on readback, and
    propagate pause/resume/cancel controls to child operations
  - third implementation checkpoint: provider/browser/active-target budget
    waits remain `deferred` campaign work, `run-next-pass` can advance the next
    target after capacity frees, active campaign startup/readback hydration can
    continue deferred targets, and the React Health dashboard exposes campaign
    launch/list/detail/control rows
  - installed-runtime checkpoint: dry-run enumeration proved 10 configured
    targets without browser work, and a bounded execution campaign attached
    five already-active child completions without duplicating target work
  - fourth implementation checkpoint: campaigns now claim non-matching active
    live-follow completions in place by upgrading them to bounded full-sweep
    materialization, and campaign readback hydrates materialization jobs into
    aggregate artifact/hash counts plus per-target asset and routeability
    evidence
  - installed-runtime checkpoint: campaign
    `acctmirror_reconciliation_87fbb97c-88ce-4294-92b2-a471df9c9279`
    closed the campaign-owned checksum proof with two terminal
    materialization jobs, two archive items, and two checksummed assets across
    distinct ChatGPT runtime-profile targets:
    `chatgpt:wsl-chrome-4` for `ecochran76@gmail.com` and
    `chatgpt:wsl-chrome-3` for `eric.cochran@soylei.com`
  - later Gemini/default campaign work proved terminal routeability and static
    route filtering but did not add a Gemini checksum; Gemini checksum recovery
    is now provider-specific follow-up, not a blocker for Plan 0071 closeout
  - cache-only reads remain cache-only; browser work starts only from explicit
    campaign execution, existing live-follow completions, or one-target
    reconciliation/materialization jobs
  - tenant/binding boundary tightening is implemented in
    [docs/dev/plans/0072-2026-05-25-tenant-binding-boundary-tightening.md](docs/dev/plans/0072-2026-05-25-tenant-binding-boundary-tightening.md):
    - tenant cache identity is provider plus bound identity
    - AuraCall runtime profile and browser profile are execution bindings and
      provenance, not cache owners
    - moving a tenant to another browser binding should be a user-scoped config
      edit plus identity smoke, not a DB migration
    - status, catalog, reconciliation, CLI, MCP, and dashboard readback expose
      distinct `tenantKey` and `bindingKey` fields
- live-follow artifact inventory and scoped proof controls are now closed in
  [docs/dev/plans/0073-2026-05-25-live-follow-artifact-inventory-proof-controls.md](docs/dev/plans/0073-2026-05-25-live-follow-artifact-inventory-proof-controls.md):
  - isolated proof servers can run one provider/runtime target without adopting
    unrelated persisted completions, resuming broad live-follow work, running
    the scheduler, or draining unrelated API work; `/status.accountMirrorProofScope`
    reports the provider/runtime, tenant key, binding key, browser operation
    key, and suppression state
  - metadata refresh now distinguishes live-observed counts from retained cache
    counts via `observedThisPass`, `retainedFromCache`, and `mergedTotal`
  - unscanned Gemini conversation detail surfaces now read as
    `assetInventory.state = deferred|unknown` instead of false
    `artifacts=0/files=0/media=0` tenant truth
  - completion status hydrates terminal materialization job evidence so
    recovered assets, checksums, routeability failures, manifests, and skipped
    candidates are visible from the live-follow operation itself
  - final installed Gemini proof
    `acctmirror_completion_17ccf29f-e4ee-479c-9d0c-3a71776126bc` completed
    with identity `ecochran76@gmail.com`; terminal materialization job
    `hmj_112116b41db94ec5b9c3bb7c867e35e9` is hydrated into completion
    readback as `materializationOutcome`
  - the proof materialized seven assets from ten conversations with zero
    failures and seven verified SHA-256 checksums, while metadata readback kept
    unscanned conversation detail as `assetInventory.state = deferred`
- Gemini no-renavigation and guard-first hardening is now closed in
  [docs/dev/plans/0074-2026-05-26-gemini-no-renavigation-guard.md](docs/dev/plans/0074-2026-05-26-gemini-no-renavigation-guard.md)
  as the protective sub-slice before resuming the Plan 0073 live proof:
  - existing Gemini targets attach through a no-navigation target-reuse path
  - ready read-only `/gems/view` and `/gems/edit/<projectId>` surfaces skip
    duplicate `Page.navigate` calls while post-write Gem verification keeps
    explicit fresh navigation/fresh-read behavior
  - Gemini provider guard pages stop refresh work before collector interaction,
    and the pre-pass guard census itself does not create, navigate, or focus
    browser targets
  - routine live follow remains rail-first; direct `/app/<conversationId>`
    navigation is labeled as direct fallback or explicit operator diagnostics
  - scoped proof completion
    `acctmirror_completion_17ccf29f-e4ee-479c-9d0c-3a71776126bc` completed one
    `gemini:auracall-gemini-pro` pass with provider guard clear, scheduler
    diagnostics `reload=0`, and `duplicateSameRouteAttempts.total=0`
  - Plan 0073 is closed with terminal materialization/checksum proof; the Plan
    0074 completion handed off materialization job
    `hmj_112116b41db94ec5b9c3bb7c867e35e9`, which succeeded at
    `2026-05-26T14:47:12.730Z` with seven materialized assets from ten
    conversations, zero failures, and seven checksums
- React operator UX redesign is now scoped in
  [docs/dev/plans/0067-2026-05-16-react-operator-ux-redesign.md](docs/dev/plans/0067-2026-05-16-react-operator-ux-redesign.md):
  - the current `/ops/browser` dashboard is a debug/proof-of-concept surface,
    not the durable product UX
  - the new operator console lives under `ux/operator` as a React/Vite app with
    top navigation, account/context menu, collapsible and resizable panes,
    central workspace, and right-side inspector
  - `/dashboard` now serves the packaged React app from the stable AuraCall API
    service port; `/ops/browser` remains the low-level Browser Ops debug
    surface
  - the Search page target is now a dense all-tenant workbench: a live-updating
    virtualized table of chats, artifacts, uploads, runs, and evidence sorted
    newest-first by default, with adjustable/sortable columns, facet-backed
    filters, URL-addressable selected rows, and right-pane inspection
  - first Search implementation slices are live: the React table has compact
    controls, known-value facets, persisted column widths/sort, and
    `?nav=search&row=...` selected row handoff URLs; `/v1/search` now merges
    account-mirror catalog rows with archive rows and returns normalized rows,
    cursor pages, facets, metrics, and source links; the UX now consumes those
    cursor pages incrementally as the operator scrolls; the table uses a
    fixed-height virtual row window so loaded result sets do not create one DOM
    node per row; Time, Provider, and Tenant are pinned during horizontal
    scroll; keyboard row navigation updates selected-row handoff URLs; each
    visible row has compact icon actions for inspect, copy handoff link, open
    provider URL when available, and download cached asset when available;
    operators can hide and reorder non-pinned columns from a compact Columns
    popover with preferences persisted locally; operators can save, apply, and
    delete local Search views that capture query, facets, sort, and column
    preferences; the right inspector now has a compact archive-aware summary
    card, reuses the asset preview path for Search-selected archive items, and
    adds run/evidence-specific panels for response id, batch id, agent/team,
    runtime, step/output counts, evidence schema, producer, and linked routes;
    missing generated artifacts now expose archive backfill, asset lookup,
    materialize, and provider/response handoff routes from the Asset panel;
    `POST /v1/archive/items/{archive_item_id}/materialize` can recover missing
    generated artifacts through the provider materializer and write local asset
    facts back to the archive index; `POST /v1/archive/materializations` and
    `GET /v1/archive/materializations[/{job_id}]` wrap the same recovery path
    in persisted, de-duplicated async jobs with status/archive-item filtered
    list polling, queued-job cancellation, CLI/MCP parity, and
    interrupted-job recovery on API/MCP startup
  - remaining Search work: semantic/vector ranking, shared/server-backed view
    presets, live evidence-row dogfooding when evidence rows exist in cache,
    and broader operator dashboard controls for non-archive async jobs
  - first slice is read-only shell work; API-backed health, run, archive,
    search, chat, config, agent, and team pages should land incrementally after
    the shell is stable
  - product pages should follow
    [docs/dev/aura-call-ux-specification-guide.md](docs/dev/aura-call-ux-specification-guide.md):
    task-oriented navigation, structured forms, list/detail work surfaces,
    inspectors for technical detail, clear validation, compact status, and
    diagnostics separated from normal workflows
  - greenfield config UX Plan 0077 is now closed in
    [docs/dev/plans/0077-2026-05-28-agents-configuration-ux.md](docs/dev/plans/0077-2026-05-28-agents-configuration-ux.md):
    - the existing frontend is frozen for product work and should be retired
      through explicit cutover slices instead of extended
    - the first replacement workflow is Agents configuration on the separate
      `/console` product surface, backed by the existing agent choices/config
      APIs and Plan 0076 tenant/binding/project readback
  - greenfield Providers/Projects UX Plan 0078 is closed in
    [docs/dev/plans/0078-2026-05-28-provider-project-console-ux.md](docs/dev/plans/0078-2026-05-28-provider-project-console-ux.md):
    - `/console?view=providers` and `/console?view=projects` now make
      provider-account readiness, browser binding health, project/default
      bindings, and linked agent setup issues visible in operator language
    - the legacy frontend pages remain frozen; provider/project UX work belongs
      in `ux/console` and should keep raw tenant, binding, runtime-profile,
      profile-path, and provider ids behind inspectors or Diagnostics links
  - greenfield Overview/Health UX Plan 0079 is closed in
    [docs/dev/plans/0079-2026-05-29-overview-health-console.md](docs/dev/plans/0079-2026-05-29-overview-health-console.md):
    - `/console` and `/console?view=overview` now default to an operator
      command center backed by `/status`, agent choices, and agent readback
    - the first viewport summarizes service reachability, agent readiness,
      provider readiness, live-follow posture, background drain, runner
      topology, and a prioritized attention queue while keeping raw status and
      route details behind disclosure or Diagnostics links
  - greenfield Runs workbench UX Plan 0080 is closed in
    [docs/dev/plans/0080-2026-05-29-runs-workbench-console.md](docs/dev/plans/0080-2026-05-29-runs-workbench-console.md):
    - `/console?view=runs` now makes response runs, team runs, runtime runs,
      live-follow operations, queue posture, recovery hints, and timelines
      inspectable from one dense table/detail workflow
    - the implemented workbench is read-only; launch, retry, cancel, resume,
      pause, and drain controls remain deferred until a later bounded plan
      proves state gates and safety contracts
- open provider-capability follow-through:
  - [docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md](docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md)
    is closed for the first-class media-generation resource across CLI, local
    API, MCP, and browser-backed Gemini/Grok provider paths
    - Grok Imagine browser-first image/video discovery, invocation, status,
      and materialization are closed in
      [docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md](docs/dev/plans/0054-2026-04-24-grok-imagine-research-checkpoint.md)
    - legacy Gemini `--generate-image` migration and Gemini API image support
      are closed in
      [docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md](docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md)
      - provider API media access is implemented only as an explicit path and
        parked for current dogfooding; browser-first media/workbench behavior
        remains the active priority
    - xAI API image/video execution and Grok edit/reference workflows remain
      deferred until selected by a separate bounded plan
  - [docs/dev/plans/0061-2026-04-25-grok-imagine-materialization-hardening.md](docs/dev/plans/0061-2026-04-25-grok-imagine-materialization-hardening.md)
    is closed for the browser-first Grok Imagine materialization hardening
    slice
    - closed proof: installed runtime can capture multiple visible generated
      tiles, resume full-quality discovery through Grok Files, expose
      checksum/preview/full-quality metadata through CLI/API/MCP status, and
      pass a low-churn Grok Imagine capability preflight without auth/account
      gating
    - non-goal remains deferred: xAI API media execution and Grok
      edit/reference workflows
  - [docs/dev/plans/0062-2026-04-27-chatgpt-image-generation.md](docs/dev/plans/0062-2026-04-27-chatgpt-image-generation.md)
    is closed for the ChatGPT image-generation follow-up
    - closed proof: installed runtime selected the ChatGPT Create image
      composer tool, preserved the submitted tab target, passively polled until
      one image was visible, and materialized the PNG artifact through the
      durable media-generation contract
    - capability reporting now includes `chatgpt.media.create_image` as a
      static workbench capability and can mark it available from live feature
      signatures
  - [docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md](docs/dev/plans/0050-2026-04-23-workbench-capability-surfaces.md)
    is closed for the more general discovery/reporting model for rapidly changing
    chat-workbench capabilities such as Deep Research, ChatGPT apps,
    ChatGPT business-plan skills, Gemini media tools, and provider add-ons
    - read-only ChatGPT feature-signature discovery now projects visible Web
      Search, Deep Research, Company Knowledge, apps/connectors, and skills
      into the same capability report without invoking or enabling tools
    - provider-backed invocation beyond the existing media-generation resource
      remains future work and should use a new bounded per-capability plan
- runtime browser diagnostics are closed in
  [docs/dev/plans/0051-2026-04-23-runtime-browser-diagnostics.md](docs/dev/plans/0051-2026-04-23-runtime-browser-diagnostics.md)
  - `GET /v1/runtime-runs/inspect?...&diagnostics=browser-state`, CLI
    `api inspect-run --diagnostics browser-state`, and MCP `runtime_inspect`
    expose the same bounded active-run browser snapshot
  - diagnostics complement `serviceState` with selected target, document,
    visible control counts, provider evidence, and a stored PNG screenshot
    path; they do not expose raw CDP or navigate provider pages
- status browser diagnostics parity is closed in
  [docs/dev/plans/0052-2026-04-23-status-browser-diagnostics-parity.md](docs/dev/plans/0052-2026-04-23-status-browser-diagnostics-parity.md)
  - `GET /v1/runs/{id}/status?diagnostics=browser-state`,
    `GET /v1/media-generations/{id}/status?diagnostics=browser-state`, MCP
    `run_status`, and MCP `media_generation_status` now expose the same
    bounded browser snapshot for active browser-backed media jobs
  - media diagnostics prefer the Gemini prompt-submission `tabTargetId` when
    present and return honest `unavailable` posture for terminal jobs
- browser control-plane completion is closed in
  [docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md](docs/dev/plans/0053-2026-04-23-browser-control-plane-completion.md)
  - product-code browser mutations are now limited by static regression tests
    to approved browser-service control points
  - raw mutating CDP scripts stay available only as explicit guarded
    development escape hatches
- browser operation queued dispatch is closed in
  [docs/dev/plans/0056-2026-04-25-browser-operation-queued-dispatch.md](docs/dev/plans/0056-2026-04-25-browser-operation-queued-dispatch.md)
  - `BrowserOperationDispatcher.acquireQueued(...)` gives future service/API/MCP
    callers an opt-in wait-for-turn primitive under the same browser-service
    dispatcher key
  - existing fail-fast `acquire(...)` semantics remain available for
    hard-stop human/login/operator flows
- browser-backed media queued dispatch is closed in
  [docs/dev/plans/0057-2026-04-25-browser-media-queued-dispatch.md](docs/dev/plans/0057-2026-04-25-browser-media-queued-dispatch.md)
  - Gemini/Grok browser media generation now opts into
    `acquireQueued(...)` before provider adapters touch CDP
  - media status timelines can show `browser_operation_queued` and
    `browser_operation_acquired`
  - explicit Grok video readback probes use a raw DevTools dispatcher key
- browser response queued dispatch is closed in
  [docs/dev/plans/0058-2026-04-25-browser-response-queued-dispatch.md](docs/dev/plans/0058-2026-04-25-browser-response-queued-dispatch.md)
  - normal managed browser response/chat execution now uses
    `acquireQueued(...)` at the shared browser execution boundary
  - login/setup/human-verification flows keep fail-fast busy behavior
- browser operation queue observability is closed in
  [docs/dev/plans/0059-2026-04-25-browser-operation-queue-observability.md](docs/dev/plans/0059-2026-04-25-browser-operation-queue-observability.md)
  - browser-state diagnostics can report recent browser-operation queue events
    such as `queued`, `acquired`, and `busy-timeout`
  - CLI runtime inspection renders the queue event count and latest queue event
    next to browser mutation diagnostics
- browser operation queue status proof is closed in
  [docs/dev/plans/0060-2026-04-25-browser-operation-queue-status-proof.md](docs/dev/plans/0060-2026-04-25-browser-operation-queue-status-proof.md)
  - generic local API response run status and MCP `run_status` now have
    controlled coverage proving `browserOperationQueue` survives the
    browser-state diagnostics boundary
- the bounded `0004` operator-facing claimant/readback hardening sub-lane is
  now maintenance-only unless a new concrete mismatch is demonstrated
- the narrower `api serve` server-local-runner ownership/readback checkpoint is
  also maintenance-only unless a fresh mismatch is reproduced
- service/runner topology reassessment is closed in
  [docs/dev/plans/0026-2026-04-21-service-runner-topology-reassessment.md](docs/dev/plans/0026-2026-04-21-service-runner-topology-reassessment.md)
- read-only runner topology/readiness is closed in
  [docs/dev/plans/0027-2026-04-21-runner-topology-readiness-status.md](docs/dev/plans/0027-2026-04-21-runner-topology-readiness-status.md)
  - `ExecutionServiceHost` owns `summarizeRunnerTopology()`
  - `/status.runnerTopology` exposes bounded local-server runner readiness
    without changing claim authority
  - multi-runner scheduling, background worker pools, reassignment loops, and
    parallel execution remain deferred
- scheduler-authority preflight is closed in
  [docs/dev/plans/0028-2026-04-21-scheduler-authority-preflight.md](docs/dev/plans/0028-2026-04-21-scheduler-authority-preflight.md)
  - topology visibility and candidate ordering are not assignment authority
  - `api serve` remains a local runner, not a fleet scheduler
- read-only scheduler-authority evaluator is closed in
  [docs/dev/plans/0029-2026-04-21-read-only-scheduler-authority-evaluator.md](docs/dev/plans/0029-2026-04-21-read-only-scheduler-authority-evaluator.md)
  - `evaluateStoredExecutionRunSchedulerAuthority(...)` returns deterministic
    authority decisions with `mutationAllowed: false`
  - no HTTP surface, scheduler mutation, worker loop, or automatic
    reassignment was added
- runtime inspection scheduler-authority readback is closed in
  [docs/dev/plans/0030-2026-04-21-runtime-inspection-scheduler-authority.md](docs/dev/plans/0030-2026-04-21-runtime-inspection-scheduler-authority.md)
  - `GET /v1/runtime-runs/inspect?...&authority=scheduler` exposes optional
    read-only `schedulerAuthority`
  - no scheduler mutation, worker loop, lease acquisition, or reassignment was
    added
- CLI runtime inspection scheduler-authority readback is closed in
  [docs/dev/plans/0031-2026-04-21-cli-runtime-inspection-scheduler-authority.md](docs/dev/plans/0031-2026-04-21-cli-runtime-inspection-scheduler-authority.md)
  - `auracall api inspect-run ... --authority scheduler` renders the same
    read-only evidence for operators
  - no scheduler mutation, worker loop, lease acquisition, or reassignment was
    added
- scheduler mutation design is closed in
  [docs/dev/plans/0032-2026-04-21-scheduler-mutation-design.md](docs/dev/plans/0032-2026-04-21-scheduler-mutation-design.md)
  - first mutation target is explicit single-run operator control:
    `schedulerControl.action = "claim-local-run"`
  - v1 is scoped to the server-local runner only
  - no fleet scheduler, worker loop, non-local assignment, parallel execution,
    new HTTP route, or browser dispatcher bypass is authorized
- scheduler local-claim control is closed in
  [docs/dev/plans/0033-2026-04-21-scheduler-local-claim-control.md](docs/dev/plans/0033-2026-04-21-scheduler-local-claim-control.md)
  - `ExecutionServiceHost` now owns `schedulerControl.action = "claim-local-run"`
  - existing `POST /status` maps the scheduler-control payload/result
  - local claims and expired stale/missing-owner reassignments are allowed only
    when read-only scheduler authority selects the server-local runner
  - no fleet scheduler, worker loop, non-local assignment, parallel execution,
    new HTTP route, or browser dispatcher bypass was added
- scheduler roadmap checkpoint is closed in
  [docs/dev/plans/0034-2026-04-21-scheduler-roadmap-checkpoint.md](docs/dev/plans/0034-2026-04-21-scheduler-roadmap-checkpoint.md)
  - do not widen into fleet scheduling or background worker loops yet
  - next bounded implementation target is local-owned active lease execution
    through targeted drain
  - `claim-local-run` remains explicit operator control; execution
    follow-through should preserve existing service-host, stored-step, and
    browser-dispatcher ownership boundaries
- local-owned active lease drain is closed in
  [docs/dev/plans/0035-2026-04-21-local-owned-active-lease-drain.md](docs/dev/plans/0035-2026-04-21-local-owned-active-lease-drain.md)
  - `runControl.action = "drain-run"` can now execute a runnable run whose
    active lease is already owned by the configured server-local runner
  - foreign active leases still skip
  - existing-lease execution heartbeats and releases the same lease through the
    stored-step executor path
  - no scheduler loop, non-local assignment, new HTTP route, or browser
    dispatcher bypass was added
- scheduler local-control phase closeout is closed in
  [docs/dev/plans/0036-2026-04-21-scheduler-phase-closeout.md](docs/dev/plans/0036-2026-04-21-scheduler-phase-closeout.md)
  - keep the explicit operator workflow:
    inspect scheduler authority, `claim-local-run`, then targeted `drain-run`
    when immediate execution is desired
  - do not add a `claim-and-drain-local-run` compound control now
  - scheduler mutation work is paused unless a concrete operator workflow
    shows that the two-step control is too noisy or error-prone
- team-run background-drain parity is closed in
  [docs/dev/plans/0037-2026-04-21-team-run-background-drain-parity.md](docs/dev/plans/0037-2026-04-21-team-run-background-drain-parity.md)
  - `TeamRuntimeBridge` can now create a team runtime without draining it
  - HTTP `POST /v1/team-runs` uses no-drain creation when `api serve`
    background drain is enabled, then schedules the existing server-owned
    drain loop
  - synchronous one-request behavior remains when background drain is disabled
  - no public input shape, scheduler mutation, multi-runner assignment, or
    parallel team execution was added
- service/runner roadmap checkpoint is closed in
  [docs/dev/plans/0038-2026-04-21-service-runner-roadmap-checkpoint.md](docs/dev/plans/0038-2026-04-21-service-runner-roadmap-checkpoint.md)
  - no fresh route-neutral runtime mutation was found still owned directly by
    HTTP after Plans 0033-0037
  - keep HTTP responsible for transport, listener lifecycle, timer state,
    pause/resume control mapping, and response projection
  - keep route-neutral runner lifecycle, queued drain, recovery, operator
    controls, scheduler-local claim, and targeted drain under
    `ExecutionServiceHost`
  - pause service/runner architecture expansion until a concrete mismatch is
    reproduced
  - integration hygiene passed on 2026-04-23 after the browser control-plane
    exception closed:
    - broad HTTP/MCP/runtime/CLI runner-control validation passed
    - the worktree was clean before the hygiene pass
  - keep service/runner implementation paused until a concrete product
    requirement or ownership/readback mismatch justifies the next bounded plan
- raw DevTools dispatcher fencing is closed in
  [docs/dev/plans/0039-2026-04-21-raw-devtools-dispatcher-fencing.md](docs/dev/plans/0039-2026-04-21-raw-devtools-dispatcher-fencing.md)
  - `browser-tools --port <port>` now acquires a port-scoped dispatcher lock
    instead of bypassing browser-service ownership
  - managed-profile browser-tools commands still prefer the managed browser
    profile dispatcher key when profile/target context is available
  - legacy direct-CDP verification scripts remained follow-up work after this
    slice
- direct CDP script guarding is closed in
  [docs/dev/plans/0040-2026-04-22-direct-cdp-script-guard.md](docs/dev/plans/0040-2026-04-22-direct-cdp-script-guard.md)
  - legacy direct-CDP scripts under `scripts/` now require
    `--allow-raw-cdp` or `AURACALL_ALLOW_RAW_CDP=1`
  - the guard keeps those scripts usable for development while making raw CDP
    an explicit escape hatch instead of an accidental browser-service bypass
- browser-service script-family grouping is closed in
  [docs/dev/plans/0041-2026-04-22-browser-service-script-family.md](docs/dev/plans/0041-2026-04-22-browser-service-script-family.md)
  - browser-service-related development scripts now have thin wrapper copies
    under `scripts/browser-service/`
  - root script paths remain compatible
  - provider-dependent Grok helpers were kept out of `packages/browser-service`
    to preserve package boundaries

Use [docs/dev/plans/0001-2026-04-14-execution.md](docs/dev/plans/0001-2026-04-14-execution.md) as the execution owner document for:

- the primary active service/runner orchestration lane
- bounded config/team-service follow-through required by that lane
- bounded browser/provider reliability maintenance only when a reproduced
  blocker exists

### Browser Profile Family Refactor
Status: maintenance

Aura-Call's browser/profile model still blends logical runtime profiles,
browser-family selection, service binding, and managed-profile path derivation
into one mutable config path. That has been a repeated source of target leakage,
operator confusion, and launch nondeterminism.

The next configuration/runtime refactor should separate:

- Aura-Call profile selection
- browser-family resolution
- service binding resolution
- immutable launch-plan resolution

Execution docs:
- Repo-wide plan: [docs/dev/plans/0008-2026-04-14-browser-profile-family-refactor.md](docs/dev/plans/0008-2026-04-14-browser-profile-family-refactor.md)

Current note:
- Phase 1 is complete enough through commit `196aad27`
- named secondary browser profiles, dual-profile live smokes, and reattach/doctor boundary fixes are now green enough that this track can remain in maintenance mode while the larger config-model refactor becomes the active architecture track

### Config Model Refactor
Status: maintenance

Aura-Call now has clearer semantics in docs, but the config shape is still
transitional. Browser concerns, AuraCall runtime concerns, and future higher
layers like agents and teams should not continue to share overloaded profile
concepts.

This refactor should establish the long-term layering:

- browser profiles
- AuraCall runtime profiles
- agents
- teams
- task / run spec

Current config-model checkpoint:
- target-shape is now the primary documented and default-written model:
  - `version: 3`
  - `browserProfiles`
  - `runtimeProfiles`
  - `defaultRuntimeProfile`
- dual-read loading is live for target and bridge shapes
- target-shape is now the default write mode for:
  - `config migrate`
  - `profile scaffold`
  - `wizard`
- inspection surfaces now expose:
  - target-vs-bridge precedence
  - selector-key presence
  - projected target model

Current note:
- the public config transition is now complete enough for a checkpoint
- the next architecture question is no longer config-shape mechanics
- the next active design/implementation track should be the agent/team-ready
  layering that composes on top of:
  - browser profiles
  - AuraCall runtime profiles
- current checkpoint:
  - reserved `agents` / `teams` are now:
    - parsed
    - projected
    - inspected
    - validated for missing references
  - one shared read-only resolver now exists for:
    - `agent -> runtimeProfile -> browserProfile`
  - current execution-adjacent checkpoint:
    - `--agent <name>` now resolves through the real config/runtime path
    - explicit `--profile` still wins over `--agent`
    - selected-agent resolution is visible in:
      - config inspection/doctor
      - session/status text
      - session/status JSON
    - stored session metadata now preserves:
      - `options.selectedAgentId`
  - current runtime/browser checkpoint:
    - one shared runtime selection helper now exists for:
      - `selected agent -> runtimeProfile -> browserProfile`
    - one browser-facing helper now exists for:
      - runtime selection + browser profile resolution
    - browser config, browser runtime metadata, and session/status postmortems
      now all preserve selected-agent provenance locally
  - current config-boundary checkpoint:
    - `config doctor` now warns when an AuraCall runtime profile still carries
      broad browser-owned override state such as:
      - broad launch/browser-family fields under
        `runtimeProfiles.<name>.browser`
      - top-level runtime-profile `keepBrowser`
    - this remains diagnostics only:
      - compatibility loading is unchanged
      - browser-owned state should still migrate downward toward browser
        profiles unless an advanced escape hatch is intentional
    - `config migrate` now performs one bounded cleanup for those obvious broad
      overrides when it is safe:
      - referenced browser-profile values win
      - conflicting runtime-profile values are left in place
      - service-scoped browser/account fields move only when one concrete
        `defaultService` makes the destination unambiguous
      - conflicting or still-ambiguous service-scoped fields remain in place
    - `config doctor` now distinguishes:
      - relocatable service fields:
        - `modelStrategy`
        - `thinkingTime`
        - `composerTool`
      - managed-profile escape hatches:
        - `manualLogin`
        - `manualLoginProfileDir`
    - current doctor policy:
      - prefer moving relocatable service fields into
        `runtimeProfiles.<name>.services.<service>`
      - keep the managed-profile escape hatches conservative until their
        ownership boundary is narrowed further
      - browser execution overrides still win over service fallback
      - browser mode still defaults to managed-profile interactive-login
        posture unless `manualLogin: false` is set explicitly
      - `manualLoginProfileDir` is only meaningful when `manualLogin` is true
      - resolved service-binding / launch-profile layers should suppress
        `manualLoginProfileDir` unless `manualLogin` is active for that same
        scope
      - default-equivalent derived managed-profile paths should be treated as
        redundant config noise
      - `config migrate` may now remove those default-equivalent explicit
        paths conservatively, while preserving real external overrides
      - when one concrete `defaultService` exists and no conflicting
        service-level value is already present, `config migrate` may now also
        move:
        - `manualLogin`
        - `manualLoginProfileDir`
        - `modelStrategy`
        - `thinkingTime`
        - `composerTool`
      - runtime-profile service overrides that exactly mirror inherited
        top-level `services.<service>` defaults should also be treated as
        redundant noise
      - empty service stubs left behind by that bounded cleanup should be
        pruned as residue, not preserved as meaningful config
      - browser-profile placement for `modelStrategy`, `thinkingTime`, and
        `composerTool` should be treated as misplaced service-scoped overrides,
        not as another redundancy-cleanup target
      - top-level `browser.modelStrategy`, `browser.thinkingTime`, and
        `browser.composerTool` should also be treated as misplaced
        service-scoped defaults
      - top-level `browser.projectName` and `browser.projectId` should also be
        treated as misplaced service/project-scoped defaults, while
        `llmDefaults` remains the compatibility bridge seam for model/project
        defaults
      - top-level `browser.conversationName` and
        `browser.conversationId` should also be treated as misplaced
        service/conversation-scoped defaults on the root browser block
      - `llmDefaults.model`, `llmDefaults.modelStrategy`,
        `llmDefaults.defaultProjectName`, and
        `llmDefaults.defaultProjectId` should be treated as compatibility-only
        bridge state, not as the preferred active model/service/project-default
        layer
      - compatibility bridge output may still backfill those `llmDefaults`
        keys from root `model` / `browser` defaults when no explicit
        `llmDefaults` block exists
      - compatibility bridge writes should now mirror the same target-first
        authority as read-time dual-read:
        - target `browserProfiles` overwrite stale `browserFamilies`
        - target `runtimeProfiles` overwrite stale `profiles`
        - bridge output should emit bridge-only keys instead of preserving
          mixed target + bridge residue
      - legacy `auracallProfiles` should remain inspectable compatibility
        residue only and should no longer outrank current `profiles` /
        `runtimeProfiles` for active fallback selection
      - current active root-browser service-default inventory is now explicit:
        `modelStrategy`, `thinkingTime`, `composerTool`, `projectName`,
        `projectId`, `conversationName`, and `conversationId`, with
        `manualLogin` / `manualLoginProfileDir` kept separate as managed-profile
        escape hatches
      - `manualLoginProfileDir` should also be treated as inert unless
        `manualLogin` is explicitly true for the same runtime/service scope
      - policy decision: that root-browser inventory remains supported
        transitional behavior for now, but it is no longer the preferred
        authoring surface for new config
      - current usage audit result:
        - root-browser service-default authoring is still exposed by real
          operator-facing paths:
          - CLI flag mapping for project/conversation ids and browser service
            knobs
          - browser-mode docs that still document legacy root-browser keys
        - current CLI classification keeps these flags as supported
          transitional root-browser inputs for now:
          - `--project-id`
          - `--project-name`
          - `--conversation-id`
          - `--conversation-name`
          - `--browser-model-strategy`
          - `--browser-thinking-time`
          - `--browser-composer-tool`
        - current narrowing checkpoint:
          - `--project-id` and `--project-name` now also populate the selected
            runtime-profile service block when one concrete default service
            exists
          - `--conversation-id` and `--conversation-name` now also populate
            the selected runtime-profile service block when one concrete
            default service exists
          - `--browser-model-strategy`, `--browser-thinking-time`, and
            `--browser-composer-tool` now also populate the selected
            runtime-profile service block when one concrete default service
            exists
          - their root-browser mapping still remains only as transitional
            compatibility-alias input
        - active service binding should now prefer the service-scoped values
          over legacy root-browser copies when both exist
        - keep `manualLogin` / `manualLoginProfileDir` outside that rewrite;
          they remain browser-execution escape hatches
        - browser-owned `keepBrowser` should now follow the referenced browser
          profile first:
          - `browserProfiles.<name>.keepBrowser` wins over legacy
            `runtimeProfiles.<name>.keepBrowser`
          - runtime-profile `keepBrowser` remains fallback residue only when
            no browser-profile-level value exists
        - the broader browser-owned runtime override block still remains
          partially transitional:
          - active resolution now prefers the referenced browser profile for:
            - `blockingProfileAction`
            - `chromePath`
            - `display`
            - debug-port controls
            - `headless`
            - `hideWindow`
            - `remoteChrome`
            - tab/window cleanup controls
            - `managedProfileRoot`
            - source-profile and cookie-source wiring
            - `wslChromePreference`
          - no browser-owned launch/browser-family field in that block now
            outranks the referenced browser profile during active resolution
          - next contract-tightening checkpoint:
            - doctor should now distinguish shadowed compatibility residue
              from still-active runtime ownership when a runtime profile lacks
              any browser profile reference
        - reassessment decision:
          - the first bounded root-browser compatibility-alias pass is now
          complete enough
          - keep further alias work in maintenance mode unless a later slice
            explicitly chooses deprecation/reporting scope
  - current team-ready checkpoint:
    - one shared read-only resolver now exists for:
      - `team -> agent -> runtimeProfile -> browserProfile`
    - one shared read-only helper now exists for:
      - team member runtime/browser activation contexts
    - resolved team inspection is now visible in:
      - `config show`
      - `profile list`
  - current semantic checkpoint:
    - the next design question is still broader execution/orchestration
      boundary, not more selection plumbing
    - current reassessment decision:
      - the config-boundary hardening sub-lane is now maintenance-mode unless
        a new concrete resolver or migrate mismatch is found
      - most remaining work at this layer is now contract locking rather than
        fresh behavior correction
    - the current bounded doctor seams above runtime profiles are now:
      - agent-default ownership integrity:
        - non-empty `agents.<name>.defaults` should surface as a placeholder
          seam so operators do not infer live execution meaning from it
        - `agents.<name>.defaults` should not silently bypass runtime/browser
          selection
        - `agents.<name>.defaults` should not silently carry
          browser/account-bearing override state
        - `agents.<name>.defaults` should not silently rewire service identity
        - current posture stays diagnostics-only:
          - agent workflow defaults remain allowed when they do not mutate
            browser/account ownership
          - `agents.<name>.runtimeProfile` remains the only live
            agent-owned execution selector today
          - `agents.<name>.description`, `instructions`, and `metadata`
            remain organizational / future-workflow fields for now
          - do not introduce typed live agent-owned defaults in this
            config-model phase; defer that to a later execution-facing design
            slice
          - the generic agent defaults bag is still execution-inert for
            runtime selection, browser profile resolution, and default service
            resolution
      - team-role integrity:
      - `teams.<name>.roles.<role>.agent` should not silently reference a
        missing agent or an agent outside team membership
      - `teams.<name>.roles.<role>.handoffToRole` should not silently point at
        a missing role
      - explicit duplicate role ordering and self-handoff should not remain
        silent planning drift either
      - current planner semantics remain intentionally narrow:
        - explicit role `order` still drives sequencing
        - `handoffToRole` remains advisory metadata, not dependency rewrite
          policy
    - future service-mode runners and parallelism should remain a higher layer,
      not be implied by current team config alone
    - future teams are expected to become the orchestration layer for:
      - divide-and-conquer task decomposition
      - multi-turn automation across agents
      - explicit inter-agent data handoff
      while runners/parallelism remain a separate execution layer
    - teams should be treated as reusable orchestration templates, not as
      complete one-off assignments
    - a separate task / run-spec layer should carry:
      - the concrete bundle
      - the requested outcome
      - run-specific constraints
      - temporary overrides

Sequencing rule:
- do the config-model refactor before implementing agents
- do not burn time on broad code symbol renames before that refactor
- keep browser reliability in maintenance mode while this refactor becomes the
  main planning/implementation track

Execution docs:
- Repo-wide plan: [docs/dev/plans/0007-2026-04-14-config-model-refactor.md](docs/dev/plans/0007-2026-04-14-config-model-refactor.md)
- Target public shape: [docs/dev/config-model-target-shape.md](docs/dev/config-model-target-shape.md)
- Input alias policy: [docs/dev/plans/legacy-archive/0031-2026-04-08-config-model-input-alias-plan.md](docs/dev/plans/legacy-archive/0031-2026-04-08-config-model-input-alias-plan.md)
- Troubleshooting: [docs/dev/config-shape-troubleshooting.md](docs/dev/config-shape-troubleshooting.md)
- Agent boundary: [docs/dev/plans/0009-2026-04-14-agent-config-boundary.md](docs/dev/plans/0009-2026-04-14-agent-config-boundary.md)
- Team boundary: [docs/dev/plans/0006-2026-04-14-team-config-boundary.md](docs/dev/plans/0006-2026-04-14-team-config-boundary.md)
- Team service execution: [docs/dev/plans/0004-2026-04-14-team-service-execution.md](docs/dev/plans/0004-2026-04-14-team-service-execution.md)
- Task / run spec: [docs/dev/plans/0002-2026-04-14-task-run-spec.md](docs/dev/plans/0002-2026-04-14-task-run-spec.md)
- Team run data model: [docs/dev/plans/0003-2026-04-14-team-run-data-model.md](docs/dev/plans/0003-2026-04-14-team-run-data-model.md)
- Team run review ledger: [docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md](docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md)

Next recommendation:
- keep broader public team execution writes paused on HTTP/MCP surfaces
- the first concrete task / run-spec shape is now defined in the canonical plan
- the concrete `teamRun` execution contract is now defined in the canonical team-run plan
- the first internal implementation slice is now live for durable `taskRunSpec` persistence plus `taskRunSpec -> teamRun -> runtime` projection
- the bounded CLI write surface is now live as `auracall teams run` on top of
  that same sequential bounded single-host local-runner bridge
- the bounded internal inspection/readback seam for that persisted linkage is now live on existing response/recovery surfaces
- the narrow internal debug/inspection command is now live as `auracall teams inspect`
- the first bounded public read-only team inspection surface is now live as `GET /v1/team-runs/inspect`
  - current lookup keys:
    - `taskRunSpecId`
    - `teamRunId`
    - `runtimeRunId`
- the first bounded public read-only runtime queue surface is now live as `GET /v1/runtime-runs/inspect`
  - current lookup keys:
    - `runId`
    - `runtimeRunId`
    - `teamRunId`
    - `taskRunSpecId`
  - optional runner evaluation:
    - `runnerId`
- next, keep broader public team execution writes paused on HTTP/MCP surfaces
  while tightening runner/service-mode ownership and preserving the current
  bounded CLI local-runner bridge

Browser reliability maintenance note:
- default-tenant account-health validation reproduced a generic browser-service
  substrate issue that is now closed in Plan 0021:
  - simultaneous or overlapping managed-profile operations can share the same
    fixed DevTools port and contaminate tab/identity evidence
  - read-only probes still need ownership because tab selection and live DOM
    inspection depend on shared CDP state
  - human-verification/manual-login flows need an exclusive operation boundary
- active bounded follow-up:
  - none; Plan 0022 closed the Grok/ChatGPT home/new-chat selector-diagnosis
    drift without changing dispatcher behavior or prompt execution
- current ChatGPT hardening/proof checkpoint is substantially better than it
  was:
  - mutation-side persistence/verification is hardened across root/project
    CRUD surfaces
  - read-side conversation recovery has one shared surface-readiness seam plus
    bounded retry for transient read misses
  - artifact-local consistency has been tightened for:
    - image matching
    - download/spreadsheet button matching
    - canvas content resolution
  - live artifact proof on `wsl-chrome-2` now includes:
    - DOCX/download
    - spreadsheet (`.xlsx`)
    - generated image
- treat remaining ChatGPT work as maintenance/proof-planning by default
- record side findings in durable docs and only reopen coding when a concrete
  blocker is demonstrated

### Service Mode And Runner Orchestration
Status: in progress

Aura-Call now has enough team planning structure that the next major
architecture question is not config shape. It is the service/runtime layer
underneath future team execution.

Primary goals:
- run Aura-Call as a service
- add durable runners/workers
- add heartbeats and runner liveness
- define queue/lease ownership cleanly
- keep runner/service execution separate from team orchestration intent

Execution checkpoints:
- Team semantics checkpoint
  - `team` is a reusable orchestration template
  - it owns reusable collaboration policy, not one concrete assignment
- Task / run-spec checkpoint
  - define the concrete assignment layer that binds work to a team
  - keep bundle/goal/constraints/overrides out of the long-lived team
    template
- Team-run execution checkpoint
  - bind one task / run spec to one team template
  - keep the first public execution contract conservative:
    - sequential first
    - fail-fast by default
    - no implicit parallelism from membership alone
- Handoff / host-action checkpoint
  - explicit structured handoffs
  - deterministic status fields for unattended loops
  - machine-readable local host-action requests when supported

Current checkpoint:
- read-only team execution planning is in place:
  - `teamRun`
  - `step`
  - `handoff`
  - `sharedState`
- one bounded host-backed service-ready seam now exists for:
  - step indexing
  - runnable/waiting/blocked classification
  - direct-run execution through one bounded local pass
  - request-scoped recovery/reclamation
  - team-runtime bridge dispatch through the same host
- an internal team-runtime bridge now projects team plans to persisted runtime
  records and executes local runnable steps through one bounded host pass
- `auracall api serve` now recovers stale runs at startup and reports bounded
  recovery counts

Current checkpoint:
- the first bounded public HTTP team execution write is now live under
  [docs/dev/plans/0019-2026-04-20-public-team-execution-write-surface.md](docs/dev/plans/0019-2026-04-20-public-team-execution-write-surface.md)
- `POST /v1/team-runs` constructs one bounded `TaskRunSpec` from request
  fields and executes through the existing
  `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> runtimeRun` chain
- the response returns deterministic `taskRunSpecId`, `teamRunId`,
  `runtimeRunId`, status, and links for team inspection, runtime inspection,
  and response readback
- MCP write parity is now live under
  [docs/dev/plans/0023-2026-04-21-mcp-team-run-write-parity.md](docs/dev/plans/0023-2026-04-21-mcp-team-run-write-parity.md)
- `auracall-mcp` exposes `team_run`, which uses the same bounded input shape
  and task/team/runtime execution path with explicit MCP provenance
- the completed contract checkpoint is
  [docs/dev/plans/0024-2026-04-21-taskrunspec-public-contract-reconciliation.md](docs/dev/plans/0024-2026-04-21-taskrunspec-public-contract-reconciliation.md)
  which selected the live flattened `TaskRunSpec` schema as the first public
  full-spec compatibility target
- prebuilt flattened `taskRunSpec` input is now live under
  [docs/dev/plans/0025-2026-04-21-prebuilt-taskrunspec-acceptance.md](docs/dev/plans/0025-2026-04-21-prebuilt-taskrunspec-acceptance.md)
  for both HTTP `POST /v1/team-runs` and MCP `team_run`

Current sequencing gate:
- keep broader team execution writes paused beyond the bounded HTTP and MCP
  surfaces:
  - sectioned public task-run-spec envelopes remain deferred
  - multi-runner/background-worker expansion remains out of scope

Sequencing rule:
- do not expand this layer into multi-runner/background worker service mode until the
  durable state and account model are explicit enough to support replay,
  postmortem, and multi-process coordination

### Team Run Review And Observability
Status: maintenance

The next higher-level capability is whole-sequence review for team tasks.
Aura-Call should not rely on individual provider chat caches as the only way to
understand a serial or future parallel team run after the fact.

Primary goals:
- reconstruct a complete team-run sequence from Aura-Call-owned durable state
- preserve per-step provider/cache references when available
- preserve prompt/input snapshots, normalized outputs, artifacts, failures, and
  handoffs
- leave an explicit observation slot for future passive provider-state
  monitoring

Current checkpoint:
- Review-ledger checkpoint is complete under:
  - [docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md](docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md)
  - completed scope:
    - read-only ledger projection
    - `auracall teams review`
    - stored provider reference enrichment
    - durable failure-derived hard-stop observations
- Completed checkpoint:
  - [docs/dev/plans/0016-2026-04-15-passive-provider-observations.md](docs/dev/plans/0016-2026-04-15-passive-provider-observations.md)
  - completed scope:
    - stored passive observation seam on the execution path
    - ChatGPT, Gemini, and Grok provider-parity persistence
    - review-ledger projection of stored passive observations
    - live persisted validation of the bounded provider-parity seam
- Completed checkpoint:
  - [docs/dev/plans/0017-2026-04-16-runtime-inspection-service-state-probe.md](docs/dev/plans/0017-2026-04-16-runtime-inspection-service-state-probe.md)
  - completed scope:
    - opt-in read-only runtime-inspection `serviceState` contract
    - default ChatGPT-backed live probe on the managed browser path
    - default Gemini-backed live probe on browser-backed runtime profiles
    - default Grok-backed live probe on browser-backed runtime profiles
    - executor-owned transient Gemini `thinking` state for active
      browser-backed runs when DOM/page evidence is absent
    - executor-owned transient Grok `thinking` state for active
      browser-backed runs when DOM/page evidence is absent
  - [docs/dev/plans/0018-2026-04-17-service-state-quality-follow-up.md](docs/dev/plans/0018-2026-04-17-service-state-quality-follow-up.md)
  - completed scope:
    - bounded Gemini quality probing recorded as negative evidence on this
      machine/profile
    - bounded Grok quality probing recorded as negative evidence on this
      machine/profile
    - keep executor-owned `thinking` as the honest active fallback for Gemini
      and Grok unless future provider-owned evidence proves a richer live state
    - retain the existing run-scoped `serviceState` seam without widening
      `/status` or adding generic runtime-owned DOM polling
- Active next checkpoint is:
  - roadmap reassessment is complete for the current live-state lane
  - current state:
    - the run-scoped `serviceState` seam is live-validated across ChatGPT,
      Gemini, and Grok
    - ChatGPT has the strongest richer active progression
    - Gemini and Grok quality follow-ups are now recorded as bounded negative
      evidence on this machine/profile
    - no new bounded `serviceState` follow-up plan is justified right now
  - next checkpoint:
    - keep the current seam in maintenance mode
    - only resume service-state expansion if a new provider-owned evidence seam
      is identified

Sequencing rule:
- build the durable review ledger before broad passive chat-state monitoring
- passive states should be provider-adapter observations attached to the
  ledger later instead of defining the core orchestration model
- do not resume durable-state/account-mirroring work or cache-path-resolution
  work ahead of the first stored passive-observation seam unless a new blocker
  appears

Execution docs:
- Team run review ledger: [docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md](docs/dev/plans/0015-2026-04-15-team-run-review-ledger.md)
- Passive provider observations: [docs/dev/plans/0016-2026-04-15-passive-provider-observations.md](docs/dev/plans/0016-2026-04-15-passive-provider-observations.md)
- Runtime inspection service-state probe: [docs/dev/plans/0017-2026-04-16-runtime-inspection-service-state-probe.md](docs/dev/plans/0017-2026-04-16-runtime-inspection-service-state-probe.md)
- Service-state quality follow-up: [docs/dev/plans/0018-2026-04-17-service-state-quality-follow-up.md](docs/dev/plans/0018-2026-04-17-service-state-quality-follow-up.md)

### Durable State And Account Mirroring
Status: maintenance

The future runner/service layer will need storage beyond the current
single-process/session model. That includes both orchestration state and a
better mirrored view of provider/browser account identity.

Primary goals:
- Redis/Postgres upgrade path for workers/runners
- durable queue/run/step/handoff persistence
- better DB mirroring of LLM service accounts
- preserve browser/account affinity constraints explicitly
- support replay/debug without depending only on live browser/session state

Important note:
- this is not just a database upgrade
- it is the ownership model for:
  - runs
  - steps
  - handoffs
  - service accounts
  - browser-bearing execution affinity

Current checkpoint:
- the first single-runner durable ownership substrate is live:
  - persisted runtime bundles for runs, steps, events, leases, and shared state
  - persisted local runner records with heartbeat/liveness state
  - read-only runtime queue projection and runner affinity inspection
  - configured service-account affinity using
    `service-account:<service>:<identity-key>`
  - local-claim and targeted-drain gating that preserves actionable affinity
    mismatch reasons
- this remains a single-runner/local-service checkpoint:
  - configured service identity is declarative config evidence, not live
    browser-account proof
  - no multi-runner scheduler, reassignment loop, or public team execution
    writes are authorized by this checkpoint

Next checkpoint:
- completed on 2026-04-15:
  - one bounded isolated `api serve` operator smoke proved the documented
    read-only account-affinity posture end to end
  - `/status` exposed the live runner and local-claim summary
  - `GET /v1/runtime-runs/inspect` exposed configured
    `requiredServiceAccountId`
  - a mismatched runner/account path remained `blocked-affinity` with the
    stable missing service-account reason

Next recommendation:
- roadmap reassessment for this checkpoint is complete
- keep this durable-state/account-affinity checkpoint closed and in
  maintenance mode
- only reopen this lane when a broader durable-ownership seam is selected
  explicitly before implementing more service behavior

Execution docs:
- Durable ownership checkpoint: [docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md](docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md)

### External Control Surfaces
Status: planned

Aura-Call should eventually expose the same orchestration/runtime core through
multiple control surfaces instead of teaching each interface a different
execution model.

Primary goals:
- API surface
- MCP surface
- shared execution semantics under both
- shared auth/audit/replay model under both

Sequencing rule:
- do not let API or MCP invent a different team/run model from the service
  layer

### Retrieval And Search
Status: planned

Aura-Call will need both provider-side and local retrieval capabilities as the
agent/team layer grows more capable.

Primary goals:
- add LLM-side/provider-side search support
- add local lexical search over the cache/database
- add local semantic search over the cache/database
- later support routing/fusion between remote and local retrieval

Important split:
- provider-side search belongs to service/provider capabilities
- local lexical/semantic search belongs to Aura-Call's own state layer

### Provider Expansion
Status: planned

Provider coverage should continue to expand, but it should not drive the
service/runtime architecture by itself.

Primary goals:
- full Gemini implementation
- Claude implementation
- Grok image support

Current note:
- Gemini is the first recommended provider-expansion side track because it
  already has inherited Oracle support across both API and web/browser paths
- the next Gemini move should be a bounded audit/alignment plan, not a broad
  rewrite:
  - [docs/dev/plans/0013-2026-04-14-gemini-completion.md](docs/dev/plans/0013-2026-04-14-gemini-completion.md)

Sequencing rule:
- prefer building shared runtime/orchestration layers first, then expanding
  providers onto those layers

### Agent Orchestration And Local Actions
Status: planned

Teams are expected to become the orchestration layer for multi-agent work, but
that later track must also cover explicit handoffs, local execution, and
cross-agent coordination semantics.

Primary goals:
- agent-to-agent communication
- explicit handoff/state passing
- local actions
  - remote LLM composes local instructions
  - local machine executes them
  - Aura-Call packages results back into the run

Safety note:
- local actions need an explicit later policy for:
  - allowed execution scope
  - approval/consent
  - result packaging
  - audit trail
  - environment isolation

## P02 | Priority Buckets

### Now

- Primary active lane checkpoint: Plan 0083 is closed for state-gated safe Runs
  controls in the greenfield `/console?view=runs` workbench.
- Immediate next action: execute Plan 0084 for API memory/readback and
  stale-runner compaction before adding Search/archive, API Access, launch,
  broad retry, materialization recovery, or more control families.
- Candidate next plan families, still to be split into detailed plans:
  - API memory/readback and stale-runner compaction for the installed service:
    open as Plan 0084
  - live-follow health semantics that expose retry churn, failure history, and
    replacement-loop state without regressing current target rollups
  - explicit artifact recovery for known remote assets missing local
    materialization evidence
  - Gemini conversation-detail and asset-inventory confidence
  - materialization/reconciliation readback parity across API, CLI, MCP, and
    console operator surfaces
- Launch and broad retry remain deferred until a future plan explicitly chooses
  that control family.
- Service mode and runner orchestration remains paused after the current
  single-host bounded local-runner bridge reached a coherent ownership
  checkpoint.
- Supporting UX action: Plan 0078 is closed for Providers and Projects in the
  greenfield `/console` surface
  [docs/dev/plans/0078-2026-05-28-provider-project-console-ux.md](docs/dev/plans/0078-2026-05-28-provider-project-console-ux.md);
  Plan 0079 is closed for the Overview/Health command center in the same
  surface
  [docs/dev/plans/0079-2026-05-29-overview-health-console.md](docs/dev/plans/0079-2026-05-29-overview-health-console.md);
  Plan 0080 is closed for the read-only Runs workbench in the same
  greenfield console
  [docs/dev/plans/0080-2026-05-29-runs-workbench-console.md](docs/dev/plans/0080-2026-05-29-runs-workbench-console.md);
  Plan 0083 is closed for the first state-gated Runs control family in the
  same workbench
  [docs/dev/plans/0083-2026-05-29-runs-safe-controls.md](docs/dev/plans/0083-2026-05-29-runs-safe-controls.md);
  continue leaving `/dashboard`, `/agents`, `/config`, and `/ops/browser`
  frozen as legacy/diagnostic pages.
- Supporting maintenance: bounded config/team-service corrections only when
  they are required to preserve the primary lane's existing semantics
- Supporting maintenance: roadmap, runbook, and validation hygiene that keeps
  the execution board deterministic
- Current transition: user-scoped installed-runtime dogfood is no longer
  considered broadly green; `/status` is usable, but API OOM restarts,
  stale-runner accumulation, live-follow retry churn, and missing local
  materialization evidence need bounded reliability work before release or
  additional product-control expansion
- Current lazy-live-follow checkpoint: installed API service on port `18095`
  still reports aligned active counts across metrics, active list, and
  live-follow target rollup, but current target health is insufficient by
  itself; future health readback must also surface failure-history severity,
  replacement-loop state, and materialization backlog
- Current provider-drift checkpoint:
  - plain `grok` now resolves to current `grok-4.20` text support
  - first-class media generation across CLI, local API, and MCP is closed in
    [docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md](docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md)
  - ChatGPT model-selector drift has been repaired for the prompt workbench:
    `wsl-chrome-3` live smoke found `Extended Pro` at
    `button.__composer-pill` and distinguished `Pro - Extended` from
    `Thinking - Extended` without prompt submission
  - installed `auracall --profile wsl-chrome-3 capabilities --target chatgpt`
    now reports `chatgpt.model.selector` with label `Extended Pro`, location
    `prompt_workbench`, and selector `button.__composer-pill`; concurrent
    feature probes are correctly fenced by the dispatcher
  - ChatGPT capability discovery now synthesizes `Thinking Standard`,
    `Thinking Extended`, `Pro Standard`, and `Pro Extended` from separate
    model/depth controls, so callers can discover Standard Pro/Thinking even
    when the top-level picker only shows the active depth
  - Plan 0270 separates ChatGPT composer modes: ordinary browser runs enforce
    `Chat` by default, `Work` requires an explicit request, and Work model
    selection cannot fall through to Chat's picker or thinking-time controls
  - ChatGPT image generation is closed under Plan 0062, and lazy-live-follow
    service-mode dogfood is closed under Plan 0063

### Soon

- Search/archive and API Access workflows: keep scoped as product-console
  follow-ups after the current reliability/materialization concerns have an
  explicit bounded plan path, unless the user intentionally prioritizes one of
  those workflows over service health.

### Later

- Retrieval and search:
  - provider-side search
  - local lexical/semantic search
- Provider expansion:
  - full Gemini
  - Claude
  - xAI API and Grok Imagine edit/reference workflows after browser-first
    media parity is stable
- Multi-runner expansion and broader external control only after a concrete
  product requirement or reproduced ownership gap justifies reopening the
  service/runner lane

### Service Volatility Externalization
Status: parked

Aura-Call currently keeps too much volatile service knowledge in TypeScript: model aliases, picker labels, route patterns, selector families, feature/app fingerprints, artifact classification hints, and rate-limit knobs. That makes normal upstream service churn look like product code churn.

The next major refactor is to externalize service-specific volatility into typed, checked-in service manifests while keeping workflow logic, recovery strategy, and verification in code.

Primary goals:
- reduce hard-coded service drift in adapters and resolvers
- make model/feature/selector updates more data-driven
- keep refactors incremental, service-by-service, with regression gates
- avoid a big-bang rewrite of ChatGPT, Grok, and Gemini at the same time

Execution docs:
- Repo-wide plan: [docs/dev/plans/0012-2026-04-14-service-volatility-refactor.md](docs/dev/plans/0012-2026-04-14-service-volatility-refactor.md)
- Inventory: [docs/dev/service-volatility-inventory.md](docs/dev/service-volatility-inventory.md)
- Per-service plan template: [docs/dev/service-volatility-service-plan-template.md](docs/dev/service-volatility-service-plan-template.md)
- First pilot plan: [docs/dev/plans/0010-2026-04-14-service-volatility-chatgpt.md](docs/dev/plans/0010-2026-04-14-service-volatility-chatgpt.md)

Release discipline:
- no service migration starts without a service-specific plan
- no service migration lands without targeted regression coverage and the relevant acceptance bar

## P03 | Existing Long-Running Tracks

### Browser Service Hardening
See [docs/dev/plans/0011-2026-04-14-browser-service-refactor-roadmap.md](docs/dev/plans/0011-2026-04-14-browser-service-refactor-roadmap.md).

- P79 / [Plan 0379](docs/dev/plans/0379-2026-09-29-owned-browser-exit-retirement.md)
  is integrated under issue 135; owned Chrome exit now retires only its exact
  browser-registry generation.
- P80 / [Plan 0380](docs/dev/plans/0380-2026-09-29-provider-traffic-governor.md)
  is integrated under issue 138 and supplies the authoritative provider-action
  admission, receipt, and warning-persistence seam.
- P81 / [Plan 0381](docs/dev/plans/0381-2026-09-29-account-mirror-change-frontier.md)
  is open under issue 139. It will make account-mirror work proportional to one
  shared provider-index epoch plus the changed/incomplete conversation and
  missing-local-asset frontier. Provider-free implementation comes next;
  scheduler resume, installation, and live acceptance remain separate gates.

Historical focused reliability slices:
- [docs/dev/plans/0141-2026-06-12-agent-browser-migration.md](docs/dev/plans/0141-2026-06-12-agent-browser-migration.md) (closed as pilot deferred; no-launch BYOP mapping accepted, live mutation held for agent-browser external-BYOP adopt/reuse support)
- [docs/dev/plans/0014-2026-04-14-browser-service-reattach-reliability.md](docs/dev/plans/0014-2026-04-14-browser-service-reattach-reliability.md) (closed)
- [docs/dev/plans/0021-2026-04-21-browser-operation-dispatcher.md](docs/dev/plans/0021-2026-04-21-browser-operation-dispatcher.md) (closed)
- [docs/dev/plans/0022-2026-04-21-provider-selector-diagnosis-hardening.md](docs/dev/plans/0022-2026-04-21-provider-selector-diagnosis-hardening.md) (closed)
- [docs/dev/plans/0023-2026-04-21-mcp-team-run-write-parity.md](docs/dev/plans/0023-2026-04-21-mcp-team-run-write-parity.md) (closed)
- [docs/dev/plans/0024-2026-04-21-taskrunspec-public-contract-reconciliation.md](docs/dev/plans/0024-2026-04-21-taskrunspec-public-contract-reconciliation.md) (closed)
- [docs/dev/plans/0025-2026-04-21-prebuilt-taskrunspec-acceptance.md](docs/dev/plans/0025-2026-04-21-prebuilt-taskrunspec-acceptance.md) (closed)
- [docs/dev/plans/0039-2026-04-21-raw-devtools-dispatcher-fencing.md](docs/dev/plans/0039-2026-04-21-raw-devtools-dispatcher-fencing.md) (closed)
- [docs/dev/plans/0040-2026-04-22-direct-cdp-script-guard.md](docs/dev/plans/0040-2026-04-22-direct-cdp-script-guard.md) (closed)
- [docs/dev/plans/0041-2026-04-22-browser-service-script-family.md](docs/dev/plans/0041-2026-04-22-browser-service-script-family.md) (closed)
- [docs/dev/plans/0042-2026-04-22-open-execution-plan-reconciliation.md](docs/dev/plans/0042-2026-04-22-open-execution-plan-reconciliation.md) (closed)
- [docs/dev/plans/0043-2026-04-22-browser-service-wrapper-build-compatibility.md](docs/dev/plans/0043-2026-04-22-browser-service-wrapper-build-compatibility.md) (closed)
- [docs/dev/plans/0044-2026-04-22-team-run-cli-resolver-shadow-fix.md](docs/dev/plans/0044-2026-04-22-team-run-cli-resolver-shadow-fix.md) (closed)
- [docs/dev/plans/0045-2026-04-22-repo-dogfood-user-runtime-install.md](docs/dev/plans/0045-2026-04-22-repo-dogfood-user-runtime-install.md) (closed)
- [docs/dev/plans/0046-2026-04-22-installed-runtime-dogfood.md](docs/dev/plans/0046-2026-04-22-installed-runtime-dogfood.md) (closed)
- [docs/dev/plans/0047-2026-04-22-status-runner-topology-compaction.md](docs/dev/plans/0047-2026-04-22-status-runner-topology-compaction.md) (closed)
- [docs/dev/plans/0048-2026-04-22-grok-model-drift-checkpoint.md](docs/dev/plans/0048-2026-04-22-grok-model-drift-checkpoint.md) (closed)
- [docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md](docs/dev/plans/0049-2026-04-22-media-generation-surfaces.md) (closed)
- [docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md](docs/dev/plans/0055-2026-04-25-media-generation-compatibility-follow-up.md) (closed)
- [docs/dev/plans/0061-2026-04-25-grok-imagine-materialization-hardening.md](docs/dev/plans/0061-2026-04-25-grok-imagine-materialization-hardening.md) (closed)
- [docs/dev/plans/0062-2026-04-27-chatgpt-image-generation.md](docs/dev/plans/0062-2026-04-27-chatgpt-image-generation.md) (closed)

### Browser Automation Drift Repairs
See [docs/dev/browser-service-upgrade-backlog.md](docs/dev/browser-service-upgrade-backlog.md).

- [docs/dev/plans/0171-2026-07-25-chatgpt-developer-app-trusted-refresh.md](docs/dev/plans/0171-2026-07-25-chatgpt-developer-app-trusted-refresh.md)
  is closed. It added a
  browser-trusted, scroll-and-hit-test activation seam and retains the existing
  explicit account/confirmation gates; duplicate creation, uninstall, OAuth
  automation, and refresh-owned prompt submission remain out of scope. The
  exact refresh passed, prompt-preservation fails closed, and LitScout's
  separately authorized H4/R1 receipt later proved a real app-selected
  literature prompt with seven reported LitScout actions and zero retries.
  Owning-workflow cleanup disconnected the app, and no further connector turn
  is authorized.
- 2026-07-23 Plan 0164 provider-free repair: one operator-overridden SIP-1133
  diagnostic pass proved that 12 files used one physical page but still created
  three client attachments and prematurely accepted a 403 JSON response. The
  installed repair now retains one client across files-only snapshot, listing,
  and batch transfer and waits for a successful signed download capture.
  `215/215` adjacent tests pass; the final exact live batch remains a separately
  authorized acceptance gate.
- 2026-07-23 Plan 0164 live receipt: the separately authorized exact batch
  proved one page and one CDP attachment with no rate-limit warning, closing the
  tab/client-churn question. All 12 transfers still failed because the viewer
  path produced no successful signed capture and the direct fallback remained
  403. The operator reproduced `Forbidden` in ChatGPT's native web UX, so the
  remaining blocker is provider-side file access, not AuraCall.
- 2026-07-23 installed operations: `chatgpt/wsl-chrome-3` live follow resumed
  successfully. The first pass advanced four detail conversations with no
  provider guard and handed off to one `idle_waiting` completion under normal
  cadence.

- P18 remains paused: [Plan 0325](docs/dev/plans/0325-2026-09-01-installed-history-materialization-fairness-canary.md), now held on a stable published operational branch; no live allowance was used by maintenance.

Plan0391 inactivity handoff revision: operator chose 120 seconds. The source
packet depends on Remote View PR346's gateway input tracking and conditional
revocation. Source checks are green; installed wall-clock handoff and independent
root viewing remain acceptance gates. This revision does not close P86.

## Plan0402 | Stored browser launch precedence

[Characterization](docs/dev/plans/0402-2026-10-10-stored-launch-plan-characterization.md)
completed provider-free. Convergence is parked: every proposed field has a known
precedence/normalization difference, and managed directory already consumes the
plan. A future migration needs an explicit precedence contract; no runtime change.

## Plan0403 | Agreed browser launch precedence

[Plan0403](docs/dev/plans/0403-2026-10-10-runtime-launch-precedence.md) implements the
operator's runtime > browser profile > global decision following Plan0402. The
launch plan owns resolution and stored execution consumes it. Provider-free source
acceptance is separate from source integration and installed/live adoption.
