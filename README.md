# Aura-Call 🧿 — Whispering your tokens to the silicon sage

<p align="center">
  <img src="./README-header.png" alt="Aura-Call CLI header banner" width="1100">
</p>

<p align="center">
  <a href="https://github.com/ecochran76/auracall/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ecochran76/auracall/ci.yml?branch=main&style=for-the-badge&label=tests" alt="CI Status"></a>
  <a href="https://github.com/ecochran76/auracall"><img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=for-the-badge" alt="Platforms"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License"></a>
</p>

Aura-Call bundles your prompt and files so another AI can answer with real context. Its default API model is the durable `openai:frontier` alias, currently backed by GPT-6 Astra; exact provider model IDs remain available as explicit pins. Browser automation uses capability-oriented selectors such as `chatgpt:fast`, `chatgpt:reasoning-high`, and `chatgpt:premium`, or `--browser-model-strategy current` to preserve the active ChatGPT model. GPT-5.2 and Sol/Terra/Luna spellings remain compatibility inputs but are no longer advertised as durable configuration. API remains the most reliable path, and `--copy` is an easy manual fallback.

Configured [automatic desktop pools or named AuraCall desktops](docs/configuration.md#named-auracall-desktops)
use Remote View's native viewer in the dedicated `/desktops` client. Viewing is
passive by default; explicit takeover coordinates human input with AuraCall
browser automation. After two minutes without external keyboard/pointer input,
control returns to view-only after verified revocation, allowing automation to
resume. A compact, collapsible rail groups real runtime profiles by account or
profile; **Wake** opens dormant local browser profiles on the selected desktop.
Connected embedded viewers stay mounted during routine refreshes and when returning to the tab. Switching interaction capability replaces the viewer. Root desktop access remains independently available.

API model IDs containing `/` (for example, `vendor/claude-sonnet-custom-v1`)
are exact pins: AuraCall trims surrounding whitespace and preserves their spelling
and case rather than interpreting provider words as shorthand aliases.

On the current GPT-6 Chat picker, `chatgpt:premium` selects GPT-6 and verifies
its **Pro** Power setting. Existing standalone **6 Pro** pickers remain supported.
The verified premium choice takes precedence over ordinary thinking-time settings;
`--browser-model-strategy current` continues to preserve the current model.
If Pro cannot be verified, AuraCall fails before prompt submission.

## Quick start

Primary local install: `pnpm run install:user-runtime` builds the current
checkout into `~/.auracall/user-runtime` and writes user-owned wrappers under
`~/.local/bin`; see `docs/user-scoped-runtime.md`.
Public npm distribution is intentionally deferred; `auracall` is not currently
offered through npm or Homebrew.
The installer checks the compiled `/desktops` application before replacing the
install prefix. Reconcile active PRs, worktrees and already deployed capabilities
before installation; a successful build alone does not authorize dropping them.


Requires Node 22+.

```bash
# Copy the bundle and paste into ChatGPT
auracall --render --copy -p "Review the TS data layer for schema drift" --file "src/**/*.ts,*/*.test.ts"

# Minimal API run (expects OPENAI_API_KEY in your env)
auracall -p "Write a concise architecture note for the storage adapters" --file src/storage/README.md

# Multi-model API run
auracall -p "Cross-check the data layer assumptions" --models gpt-5.1-pro,gemini-3-pro --file "src/**/*.ts"

# Preview without spending tokens
auracall --dry-run summary -p "Check release notes" --file docs/release-notes.md

# Browser run (no API key, opens ChatGPT in the default Chat mode)
auracall --engine browser -p "Walk through the UI smoke test" --file "src/**/*.ts"
# Explicit Chat model selection accepts the current composer-scoped animated
# model trigger. Provider-equivalent compact spelling such as `6Pro` is matched
# as `6 Pro`, while the exact observed provider label remains in run metadata.
# After AuraCall clicks the requested row, it may verify the switch from the
# matching trigger once the menu closes; it does not fall back to preserving
# the current model.

# Work is opt-in and uses its own model selector
auracall --profile wsl-chrome-3 --engine browser \
  --browser-chatgpt-mode work \
  --browser-work-model "GPT-5.6 Terra" \
  -p "Reply exactly with: AURACALL_WORK_MODE_OK"
# Established Chat may show a High thinking control. AuraCall does not use the
# shared model/thinking slider as a mode marker; established Work requires the
# active same-Project/same-conversation route's exact Work badge and otherwise
# fails closed. ChatGPT may omit the human-readable Project slug from that
# active-link route while retaining the same exact Project ID and conversation ID.

# Preferred first-time browser onboarding (guided config + managed profile + live verification)
auracall wizard

# Scriptable browser onboarding (managed Aura-Call profile + live verification + account check)
auracall setup --target grok

# Seed the managed Aura-Call profile from a different browser/source profile
auracall setup --target grok \
  --browser-bootstrap-cookie-path "/mnt/c/Users/<you>/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies"

# Machine-readable browser doctor output
auracall doctor --target grok --json

# No-prompt account binding smoke for the selected AuraCall runtime profile
auracall profile identity-smoke --target chatgpt --include-negative --json
auracall profile identity-smoke --all-bound --include-negative --json
# Identity smoke is a one-shot probe: after printing the complete report it
# exits the CLI process while leaving the managed browser profile running.
# ChatGPT identity smoke also reports accountLevel/accountPlanType when the
# signed-in session exposes them, so Business-vs-Pro profile bindings can fail
# fast before automation uses the wrong model/tool quota lane.
# If the auth-session endpoint omits those fields, AuraCall may fill only
# missing identity fields from ChatGPT's exact logged-in client-bootstrap JSON;
# token-bearing bootstrap fields are never returned.
# Qualified ChatGPT plan/structure bindings remain strict when provider-app
# evidence exposes those values. If the provider app proves the same primary
# email but omits a qualifier, AuraCall treats that qualifier as unknown rather
# than inventing account-session drift; an explicit conflicting value still
# fails closed.

# Machine-readable live browser feature discovery
auracall features --target gemini --json

# Workbench capability discovery before invoking volatile provider tools
auracall capabilities --target gemini --json
auracall capabilities --target gemini --static --json
auracall capabilities --target chatgpt --json
auracall capabilities --target chatgpt --category app --json
auracall capabilities --target grok --static --json
auracall capabilities --target grok --diagnostics browser-state --json
auracall capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json
auracall capabilities --target grok --entrypoint grok-imagine --discovery-action grok-imagine-video-mode --json
# ChatGPT discovery accepts current drawer rows without requiring tabindex and
# reports selected inline tools only from the active composer form. Connected
# app results expose metadata.selection.stableId and exactLabel for use as the
# durable composerTool request value. Connected apps are selected by typing the
# exact label while the drawer is open and activating the filtered row. The
# resulting inline object must expose an app://connector_... identity;
# arbitrary label-only rows remain untrusted.

# Guarded ChatGPT Skill lifecycle on the selected AuraCall runtime profile
auracall --profile wsl-chrome-3 skills list \
  --expected-account <chatgpt-email> --json
auracall --profile wsl-chrome-3 skills show <32-hex-skill-id> \
  --expected-account <chatgpt-email> --json
# Select the exact Skill only from a pill-free empty composer, verify it, and
# restore that empty composer. ChatGPT may seed its own example prompt after
# Try in chat; AuraCall accepts that text only when it exactly matches the
# provider's decoded prompt parameter. Root qualification accepts ChatGPT's
# current named textarea as well as its legacy editor ID, ignoring hidden
# fallback editors and rejecting multiple visible composers. This does not submit
# a prompt or prove Skill invocation.
auracall --profile wsl-chrome-3 skills select <32-hex-skill-id> \
  --expected-account <chatgpt-email> --yes --json
# User-added Skills are not available for execution in Chat mode. `skills run`
# fails before inventory reads, browser launch, or Send. Work-mode execution is
# intentionally deferred and is not implied by Skill inventory or selection.
auracall --profile wsl-chrome-3 skills run <32-hex-skill-id> \
  --expected-account <chatgpt-email> --yes --prompt "Use this Skill to analyze..." \
  --response-timeout 300 --json
# Mutations additionally require --yes. Create returns the exact stable ID;
# update requires that ID plus the exact prior SKILL.md SHA-256 from show.
auracall --profile wsl-chrome-3 skills create \
  --source ./my-skill --name "My skill" \
  --expected-account <chatgpt-email> --yes --json
auracall --profile wsl-chrome-3 skills update <32-hex-skill-id> \
  --source ./my-skill-v2 --name "My skill" \
  --expected-hash <64-hex-sha256> --expected-account <chatgpt-email> --yes --json
auracall --profile wsl-chrome-3 skills delete <32-hex-skill-id> \
  --expected-account <chatgpt-email> --yes --json
# Sources must be a regular SKILL.md file or a directory containing one.
# Incomplete inventory, identity drift, stale hashes, CAPTCHA/MFA, and uncertain
# provider outcomes stop the operation. Never retry an outcome-unknown mutation.

# Guarded ChatGPT developer-app lifecycle on the selected AuraCall runtime profile
auracall --profile wsl-chrome-3 apps --target chatgpt list --json
# The read-only list operation has a 45-second outer deadline. DevTools target
# resolution, CDP attachment, Runtime enablement, and Page enablement each have
# a 10-second stage deadline and emit their exact stage in debug output. Browser
# client cleanup is separately bounded, so a stalled stage cannot retain its lease.
# Inventory auth status requires one exact app-id/connector-id match; a
# same-name older connector never supplies auth state to a replacement app.
auracall --profile wsl-chrome-3 apps --target chatgpt test Corel33t \
  --expected-account eric.cochran@soylei.com --json
# Private developer apps are selected in Chat through the composer @mention
# ecosystem picker, not the generic top-level tools menu. Source
# `apps test --submit` uses that path and verifies the exact composer-local
# plugin identity before Send, then remains in the shared response lifecycle so
# tool and app-security approvals are detected. Manual approval returns a
# terminal failed/nonzero result (not a guaranteed preserved browser handoff);
# allow-once may select a one-time `Allow`, while
# always-allow refuses to downgrade persistent consent. Installed acceptance
# requires a user runtime containing that repair.
# Developer-app tests preserve the active Chat model (`modelStrategy=current`);
# a separately resolved `--model` value is not proof that the UI switched.
# The per-run request uses fresh-root Chat and removes inherited composer-tool,
# Work/project/conversation targeting. JSON and text return answerText,
# conversationId, terminal/current URL, effectState and retrySafe. Unknown or
# observed Send effects are never retry-safe; there is no automatic resubmit.
# Response collection uses the selected browser.timeoutMs (canonical browser
# default: 2 hours); apps test has no separate fixed two-minute deadline.
# Issue 6 provider-free fixtures prove this source seam, not installed/live use.
# Create, refresh, submitted tests, and uninstall require --expected-account
# plus --yes. OAuth, MFA, consent, CAPTCHA, and verification remain human gates.
# `awaiting-human` is emitted only after AuraCall observes a fresh OAuth or
# human-action navigation. If no fresh handoff appears, create must be proved
# by one exact fresh installed-app inventory entry or the command fails closed.
# The post-submit observer begins immediately, accumulates every target URL it
# sees, and preserves a bounded visible alert/Create-dialog explanation before
# navigating away for inventory proof.
auracall --profile wsl-chrome-3 apps --target chatgpt refresh Corel33t \
  --server-url https://litscout.example.test/mcp \
  --expected-account eric.cochran@soylei.com --yes
# Refresh is replacement semantics: validate the full recreation input, delete
# the exact private development app, prove its old identity/name absent, then
# recreate it once. ChatGPT Delete may execute without a second confirmation.
# Stop at OAuth, MFA, CAPTCHA, verification, or other human gates.
# If deletion completed but recreation failed, do not rerun refresh: use the
# guarded `apps create` command with the same frozen inputs after confirming
# the old app remains absent.
# Current ChatGPT connection radios are keyboard-semantic Radix controls;
# AuraCall focuses the exact requested radio and sends trusted CDP Space input
# before filling the mounted server URL field.
# Machine-readable `recreate-pending` output includes that validated create
# input. An incomplete installed-app inventory always stops mutation.

# Shared durable media-generation contract from the CLI
auracall media generate --provider chatgpt --type image -p "Generate an image of an asphalt secret agent" --json
auracall media generate --provider gemini --type image -p "Generate an image of an asphalt secret agent" --json
auracall media generate --provider grok --type image -p "Generate an image of an asphalt secret agent" --count 1 --no-wait
auracall run status <media_generation_id> --json
auracall media materialize <media_generation_id> --count 1 --json
auracall media inspect <media_generation_id> --json

# Save and diff live feature snapshots
auracall features snapshot --target gemini --json
auracall features diff --target gemini --json

# List usable ChatGPT provider Library files. These stable provider IDs are
# separate from local paths passed through --file and from composer tools.
# The complete read-only operation is bounded to 54 seconds, then AuraCall
# allows up to 5 seconds for abort-driven browser cleanup before returning;
# a later 60-second watchdog cannot replace the operation's named result.
# This command requests exactly one provider Library read; it does not retry a
# connection-shaped failure after adopting the existing exact Library target.
# Provider-side interaction, connection, identity, dialog, route-readiness,
# and DOM-inventory stages are named and bounded inside a 30-second operation
# ceiling, so a stalled CDP command fails with its stage before either CLI limit.
# Abort cleanup also bounds provider-session close to the existing 3-second CDP
# close window, so a session that will not close cannot hide that named stage.
# Once the provider returns, this one-shot command returns those files without
# resolving or writing the account-file cache. Account Mirror and general
# account-file listing retain their existing cache persistence behavior.
# Provider results are fixed before independently bounded client cleanup. The
# utility governor and lease settlement then have a five-second ceiling; if
# settlement stalls, the original provider error is retained and the unresolved
# lease remains fenced rather than becoming available to another process.
# It adopts an existing exact ChatGPT Library page in the selected managed
# browser profile; it does not create, refresh, or navigate a replacement page.
# A dead or expired prior command lease is reconciled only after AuraCall
# verifies that its retained target is this same exact Library route.
# If no exact Library page is available, the command fails closed. After its
# terminal report, the one-shot CLI exits while leaving the managed browser alive.
# In --json mode, timeout/provider/cancellation failures are structured JSON
# with a nonzero exit status. Their diagnostics include only the last closed-
# vocabulary Library stage, bounded cleanup phases, and timestamps (at most 32
# events); they exclude URLs, target IDs, account data, and provider content.
# SIGINT/SIGTERM/SIGQUIT cancellation exits 130.
auracall --profile wsl-chrome-3 library-files --json

# Local dev-only OpenAI-compatible responses server
auracall api serve

# Optional local API key gate from ~/.auracall/config.json
# api.auth.required=true protects /v1/* routes; /status remains observable.
curl -H "Authorization: Bearer <key>" http://auracall.localhost/v1/models

# Serve against a non-default AuraCall runtime profile
auracall --profile auracall-gemini-pro api serve

# Probe the local dev server posture
curl http://auracall.localhost/status

# Discover configured AuraCall agents as OpenAI-compatible model ids
curl -H "Authorization: Bearer <key>" http://auracall.localhost/v1/models

# Submit a single prompt to a configured agent
curl -s http://auracall.localhost/v1/responses \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"agent:instant-chatgpt-ecochran76","input":"Summarize the attached runbook."}'

# Enqueue many independent jobs as a nonblocking response batch
curl -s http://auracall.localhost/v1/response-batches \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"limits":{"maxConcurrentRuns":1,"maxBrowserInteractionsPerMinute":8},"requests":[{"model":"agent:instant-chatgpt-ecochran76","input":"Job 1"},{"model":"agent:instant-chatgpt-ecochran76","input":"Job 2"}]}'

# Privileged setup for a project-bound tenant-pool team. AuraCall ensures each
# member project/agent and creates the dispatch-pool team only when missing.
curl -s http://auracall.localhost/v1/tenant-pool-teams/ensure \
  -H "Authorization: Bearer <operator-key>" \
  -H "Content-Type: application/json" \
  -d '{"teamId":"chatgpt-reasoning-pool","service":"chatgpt","projectName":"Shared Project","agentModelSelector":"chatgpt:reasoning-high","members":[{"agentId":"chatgpt-reasoning-a","runtimeProfile":"wsl-chrome-1"},{"agentId":"chatgpt-reasoning-b","runtimeProfile":"wsl-chrome-2"}]}'

# Dispatch a batch through the tenant-pool team. AuraCall expands each child to
# the next available member agent and records the selected tenant in batch status.
curl -s http://auracall.localhost/v1/response-batches \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"dispatch":{"team":"chatgpt-pro-pool"},"requests":[{"model":"gpt-5.1","input":"Job 1"},{"model":"gpt-5.1","input":"Job 2"}]}'

# ChatGPT tenant-wide defaults apply across batches and one-shot responses:
# at most 4 concurrent chats, 120 chat starts per hour, and 240 chat starts per day.
# Read configured limits from /status.tenantExecutionLimits.
# Add ?tenantExecutionLimits=usage for lease/event-derived usage counters.
# Override with services.chatgpt.tenantLimits or
# profiles.<name>.services.chatgpt.tenantLimits when a tenant needs a narrower budget.

# Open the local read-only browser operator dashboard
xdg-open http://auracall.localhost/ops/browser

# Explicitly allow a non-loopback bind only when you mean it
auracall api serve --host 0.0.0.0 --listen-public --port 8080

# Machine-readable browser setup output
auracall setup --target grok --skip-login --skip-verify --json

# If you re-log your source Chrome profile later, rerun setup/login to refresh Aura-Call's managed profile
auracall setup --target grok --force-reseed-managed-profile

# Legacy Gemini browser image shortcut (compatibility-only direct file save)
auracall --engine browser --model gemini-3-pro --prompt "a cute robot holding a banana" --generate-image out.jpg --aspect 1:1

# Sessions (list and replay)
auracall status --hours 72
auracall session <id> --render

# Generic persisted run status for response/team/media runs
auracall run status <id> --json

# Prepare a provider-neutral cross-service handoff packet without target mutation
auracall handoff prepare \
  --source-provider chatgpt --source-profile default --source-ref "https://chatgpt.com/c/..." \
  --target-provider chatgpt --target-profile auracall-chatgpt-pro \
  --target-ref "https://chatgpt.com/g/g-p-...-project-slug" \
  --target-project-ref "g-p-..." \
  --target-model-selector chatgpt:reasoning-high \
  --source-context-json /path/to/context.json \
  --source-manifest-json /path/to/manifest.json \
  --source-materialization-job-json /path/to/history-materialization-job.json \
  --source-materialization-job-id hmj_existing \
  --dry-run --json
auracall handoff status <handoff_id> --json
auracall handoff approve-upload <handoff_id> --actor ecochran76 --package-digest <digest>
# Deterministic packet-adapter execution:
auracall handoff upload <handoff_id> --json
auracall handoff approve-submit <handoff_id> --actor ecochran76 --package-digest <digest>
auracall handoff submit <handoff_id> --json
# Provider-native ChatGPT execution uses a fresh packet and recover-live for
# each approved stage; a packet-adapter completion cannot later be promoted live.
auracall handoff approve-upload <fresh_handoff_id> --actor ecochran76 --package-digest <digest>
auracall handoff recover-live <fresh_handoff_id> --target-adapter chatgpt-browser --json
auracall handoff approve-submit <fresh_handoff_id> --actor ecochran76 --package-digest <digest>
auracall handoff recover-live <fresh_handoff_id> --target-adapter chatgpt-browser --json
auracall handoff resume <handoff_id> --json
auracall handoff repair <handoff_id> --json
auracall handoff export <handoff_id> --json
auracall handoff recover-live <handoff_id> --json
# The console Handoffs view can run the same status/resume/repair/export/recover actions
open http://127.0.0.1:<api_port>/console?view=handoffs&handoff=<handoff_id>

# TUI (interactive, only for humans)
auracall tui
```

Engine auto-picks API when `OPENAI_API_KEY` is set, otherwise browser; browser is stable on macOS and works on Linux and Windows. On Linux pass `--browser-chrome-path/--browser-cookie-path` if detection fails; on Windows prefer `--browser-manual-login` or inline cookies if decryption is blocked. From WSL, integrated Windows Chrome runs now use an auto-assigned DevTools port plus Aura-Call’s built-in `windows-loopback` relay by default, so firewall rules and `portproxy` are only for manual direct-CDP debugging.

Current browser-mode default posture:
- browser runs still default to Aura-Call-managed profile launch
- a browser profile can opt into an agent-browser-owned hidden RDP/Guacamole
  process with `agentBrowserRdp.enabled: true`; AuraCall still owns and passes
  the exact managed browser profile directory under `~/.auracall`, then
  attaches only after agent-browser proves an operator-visible route, the
  requested browser build, and a responsive CDP endpoint
- routed Chrome profiles must declare `browserFamily: "chrome"` with
  `browserBuild: "stock_chrome"`; routed chromium-stealthcdp profiles must
  declare `browserFamily: "chromium"` with
  `browserBuild: "stealthcdp_chromium"`. Missing or mixed declarations fail
  before agent-browser is invoked
- if you do not set `manualLogin` explicitly, browser config resolution still
  treats interactive login as on and derives
  `manualLoginProfileDir = managedProfileRoot + auracallProfile + service`
- set `manualLogin: false` explicitly when you need to suppress that managed
  profile path
- non-Windows managed Chrome launches include `--password-store=basic` and
  `--use-mock-keychain` so Linux/WSL automation profiles do not block behind
  desktop keyring prompts, including visible auth-mode launches
- browser prompt execution uses one provider-adapter lifecycle. ChatGPT browser
  prompts support file attachments; Gemini and Grok browser prompt adapters do
  not currently support prompt attachments and fail before connection instead
  of silently dropping them
- provider-native ChatGPT handoff submission shares the exclusive managed
  browser profile operation queue with ordinary browser execution. A handoff
  without an existing target conversation opens one fresh retained tab instead
  of borrowing another job's generic ChatGPT tab; this is isolation within a
  serialized profile lane, not concurrent per-tab mutation support
- stored team/API browser runs are non-interactive: if ChatGPT shows a logged
  out surface, Aura-Call fails fast and prints an auth-mode command such as
  `auracall --profile <name> login --target chatgpt` instead of waiting in the
  hidden/minimized automation window; API readback also includes those
  recovery fields in `metadata.executionSummary.failureSummary.details`
- failed browser runs can still expose deliberate recovery artifacts in
  `output[]`; ChatGPT JSON-object runs that time out with a large unparseable
  best snapshot now persist that snapshot as an artifact for caller-side
  quarantine/retry workflows
- managed browser response/chat runs now wait through the browser-service
  operation dispatcher when another operation owns the same managed browser
  profile; login/setup/human-verification flows still surface busy state
  immediately
- steps can opt into the deterministic `auracall.step-output.v1` model-output
  envelope for routing, local actions, artifacts, handoffs, and structured
  failures; `/v1/team-runs` accepts top-level `outputContract` and
  `/v1/responses` accepts `auracall.outputContract`; see
  `docs/response-shape-contract.md`
- configured agents are the preferred integration unit for external apps and
  local agents. Use `agent:<agent_id>` model ids, scoped API keys, durable run
  polling, and response batches instead of hard-coded provider model labels;
  see `docs/agent-workflows.md`.
- tenant-pool teams use `teams.<id>.type = "dispatch-pool"` to spread
  independent response-batch children across configured member agents. They do
  not run `/v1/team-runs` workflow steps and they do not synchronize provider
  projects between tenants; project divergence is reported as operator risk,
  not an execution error. Use `POST /v1/tenant-pool-teams/ensure` or MCP
  `tenant_pool_team_ensure` as the privileged setup path when the pool should
  ensure per-tenant projects and create the team only if missing.
- cross-service context handoff starts with `auracall handoff prepare
  --dry-run`: AuraCall writes a provider-neutral packet under
  `~/.auracall/handoffs/<handoff_id>/` with source context, manifest,
  omissions, source materialization evidence, schema-validated analysis input
  and decision artifacts, target package preview files, upload manifest,
  package digest, target submission plan, and explicit zero-target-mutation
  evidence. Repeatable `--source-materialization-job-json` inputs import
  existing account-history materialization readbacks into the source manifest
  and omissions. Repeatable `--source-materialization-job-id` inputs read
  existing source jobs through the local API; explicit
  `--source-materialization-create` can create one bounded source job when no
  prior source job evidence was supplied. When a selected manifest item has no
  usable local file path, packet preparation asks the local `fsr`/file-searcher
  index for a bounded fallback match before recording a retryable omission; any
  recovered file is copied into the packet and marked in
  `target/upload-manifest.json`. Handoff target attachment packaging is enabled
  for all target services by default: ten or fewer selected files remain
  individual upload manifest entries, while eleven or more selected files are
  packaged into one deterministic `target/selected-files/handoff-attachments.zip`
  upload item. The upload manifest and target package retain the original
  selected-file metadata, and ZIP-mode primer text instructs the target chat to
  inspect or extract the ZIP before analysis. Override the default with
  `handoff.attachmentPackaging.enabled` and
  `handoff.attachmentPackaging.zipWhenFileCountExceeds` in config. For ChatGPT
  targets, pass
  `--target-model-selector chatgpt:reasoning-high` or another semantic selector
  when the live submit path must select a specific model mode instead of
  inheriting the browser's current model. `auracall handoff status
  <handoff_id>` reads the packet ledger back by id, including event count,
  packet digest, source completeness, source materialization job evidence,
  analysis schema validity, package digest, package file metrics, and target
  preview attempts. `auracall handoff approve-upload <handoff_id>` records an
  explicit upload approval for the current package digest, and
  `auracall handoff upload <handoff_id>` writes deterministic target upload
  result rows for staged files. `auracall handoff approve-submit
  <handoff_id>` records a separate submit approval bound to the package,
  primer, compact context, and uploaded-file-set digests, and
  `auracall handoff submit <handoff_id>` writes deterministic
  `target/submission-result.json` and `target/readback.json` artifacts. Live
  target provider mutation remains outside the default deterministic handoff
  workflow. `auracall handoff resume <handoff_id>` writes the next safe
  operator action to `target/resume-plan.json`, `auracall handoff repair
  <handoff_id>` restores missing derived result/readback state where possible,
  and `auracall handoff export <handoff_id>` writes
  `target/manual-handoff-export.json` for manual target completion. The local
  API exposes matching `/v1/handoffs/<handoff_id>/...` operator endpoints, and
  `/console?view=handoffs&handoff=<handoff_id>` provides a browser console
  surface for status, resume, repair, export, and live recovery actions.
  `auracall handoff recover-live <handoff_id>` and
  `POST /v1/handoffs/<handoff_id>/recover-live` execute only the current
  approved resume-plan target action and write `target/live-recovery.json`;
  missing or stale approvals leave a blocked recovery artifact instead of
  bypassing the gate. The live recovery path is adapter-backed: the default
  operator executor remains the packet-owned target adapter, and provider-native
  upload/submit/readback adapters attach behind the same approval-validated
  contract. `--target-adapter chatgpt-browser` and API/console
  `targetAdapter=chatgpt-browser` explicitly select the ChatGPT browser prompt
  attachment adapter; invalid browser-adapter requests fail closed instead of
  falling back to packet recovery. The first provider-native adapter seam
  submits the approved primer and compact context through a prompt runner and
  writes provider-native conversation/message readback evidence. The
  provider-native file seam can now
  pass selected packet files to an upload runner, persist native provider file
  ids, record retryable failed-upload rows, and block submit approval after a
  failed upload. The first provider-specific adapter is ChatGPT browser prompt
  attachment: selected files are staged by the upload recovery step, then the
  submit recovery step sends the approved primer, compact context JSON, and
  selected attachments through the existing ChatGPT browser prompt path. A
  target-profile live smoke remains the follow-on proof.

WSL quick start: run `./scripts/bootstrap-wsl.sh` to install Node 22 + WSL Chrome + deps, then follow `docs/wsl-chatgpt-runbook.md` for the ChatGPT browser setup. If you are choosing between WSL Chrome and Windows Chrome from WSL, prefer WSL Chrome first and keep it as the primary browser profile; the Windows relay path is still more brittle and is better kept in a separate named browser profile.

Terminology note:
- browser profile = browser/account family config such as `default` or `wsl-chrome-2`
- source browser profile = Chromium profile used for cookie/bootstrap sourcing, such as `Default`
- managed browser profile = Aura-Call-owned automation profile directory
- AuraCall runtime profile = top-level `runtimeProfiles.<name>` config entry selected by `defaultRuntimeProfile` / `--profile`
- configured provider account = expected logical account read only from the selected provider service configuration
- observed provider account session = account evidence read only from the provider application or auth session
- provider-session proof = the sole provider-login authorization result; it compares configured and observed provider-account dimensions and binds that verdict to one concrete browser process and target
- Chrome/browser sign-in is bootstrap and browser provenance only. A Chrome Google account, browser profile name, source browser profile, managed-profile directory, DevTools port, or process never proves which ChatGPT, Gemini, or Grok account is signed in.
- account-mirror tenant key = `service-account:<provider>:<boundIdentityKey>`; this owns cached provider projects, conversations, artifacts, files, media, search rows, archive rows, and checksums. ChatGPT Business/workspace bindings add configured account qualifiers (for example `|plan=team|structure=workspace`) so a Business workspace never shares the Personal cache merely because both sessions expose the same email. When only a Business account-level label is configured, Account Mirror adds the stable fallback `|structure=business`; display-only account-level labels do not otherwise change shared execution affinity.
- account-mirror binding key = `binding:<provider>:<runtimeProfileId>:<browserProfileId>`; this identifies the current execution binding and status/backoff provenance
- moving a tenant to another browser is a user-scoped binding edit plus managed-browser login/cookie seeding and `auracall profile identity-smoke --target <provider> --include-negative --json`; no account-mirror DB/cache migration is required when the provider plus bound identity stays the same

## Integration

**CLI**
- API mode expects API keys in your environment: `OPENAI_API_KEY` (GPT-5.x), `GEMINI_API_KEY` (Gemini 3 Pro), `ANTHROPIC_API_KEY` (Claude Sonnet 4.5 / Opus 4.1), `XAI_API_KEY` (Grok 4.20).
- Gemini browser mode uses Chrome cookies instead of an API key—just be logged into `gemini.google.com` in Chrome (no Python/venv required).
- Operators can poll any persisted response/team/media run from the CLI with
  `auracall run status <id>` or `auracall run status <id> --json`; this uses
  the same `auracall_run_status` envelope as API `GET /v1/runs/{run_id}/status`
  and MCP `run_status`, including timing and recommended polling details for
  long-running browser-backed Extended/Pro/Deep Research jobs.
- CLI media creation uses the same durable media-generation contract as local
  API and MCP through `auracall media generate --provider
  chatgpt|gemini|grok --type image|music|video -p <prompt>`. Use `--no-wait` to return a running media id
  immediately, then poll it with `auracall run status <id> --json`.
- Prefer `auracall media generate` for new image/music/video automation because
  it persists the media-generation id, timeline, status, and artifact cache.
  Use `auracall media inspect <id> --json` to read the durable record and
  current local cache availability for each artifact without reopening the
  provider browser or retrying materialization.
  ChatGPT image runs use the browser Create image composer tool and keep
  readback/materialization scoped to the submitted tab target. For Grok image
  runs, `auracall media materialize <id> --count 1 --json`
  explicitly retries saved-gallery/files full-quality discovery without
  submitting another prompt, including after the operator has navigated away
  from the original `/imagine` generation page.
  Gemini image requests can use explicit `--transport api` with
  `GEMINI_API_KEY`, but provider API media access is not the current primary
  dogfood lane; browser media paths remain the normal operator focus.
  The older Gemini-only `--generate-image <file>` flag remains a
  compatibility shortcut for direct one-file browser image saves and does not
  create a durable media-generation record.
- A bounded local OpenAI-compatible responses adapter is available for
  development through `auracall api serve`. Start it with
  `auracall --profile <name> api serve` to bind response, runtime, workbench,
  and media behavior to a non-default AuraCall runtime profile. The local
  operator dashboard should use the configured stable URL
  `http://auracall.localhost/ops/browser`; `/status.routes` advertises both the
  relative dashboard path and any configured canonical dashboard URLs. Current
  endpoints are:
  - `GET /console` (greenfield product console; Agents, Providers, and
    Projects workflows start here)
  - `GET /ops/browser`
  - `GET /account-mirror`
  - `GET /account-mirror/preview-session`
  - `GET /dashboard` (alias)
  - `GET /status`
  - `GET /status/recovery/{run_id}`
  - `POST /v1/team-runs`
  - `GET /v1/team-runs/inspect`
  - `GET /v1/runtime-runs/inspect`
  - `GET /v1/models`
  - `GET /v1/workbench-capabilities`
  - `POST /v1/chat/completions`
  - `POST /v1/responses`
  - `GET /v1/responses/{response_id}`
  - `POST /v1/media-generations`
  - `GET /v1/media-generations/{media_generation_id}`
  - `POST /v1/media-generations/{media_generation_id}/materialize`
  - `GET /v1/media-generations/{media_generation_id}/status`
  - `GET /v1/runs/{run_id}/status`
  - `GET /v1/account-mirrors/status`
  - `GET /v1/account-mirrors/catalog`
  - `GET /v1/account-mirrors/catalog/items/{item_id}`
  - `GET /v1/account-mirrors/recovery-candidates`
  - `POST /v1/account-mirrors/materializations`
  - `GET /v1/account-mirrors/materializations`
  - `GET /v1/account-mirrors/materializations/{job_id}`
    - both default to bounded job metrics; append `?detail=full` only for a
      one-off manifest/archive-entry diagnostic
  - `POST /v1/account-mirrors/materializations/{job_id}`
  - `POST /v1/account-mirrors/preview-sessions`
  - `GET /v1/account-mirrors/preview-sessions`
  - `GET /v1/account-mirrors/preview-sessions/{preview_session_id}`
  - `PATCH /v1/account-mirrors/preview-sessions/{preview_session_id}`
  - `DELETE /v1/account-mirrors/preview-sessions/{preview_session_id}`
  - `POST /v1/account-mirrors/refresh`
  - `POST /v1/account-mirrors/reconciliations`
  - `GET /v1/account-mirrors/reconciliations`
  - `GET /v1/account-mirrors/reconciliations/{campaign_id}`
  - `POST /v1/account-mirrors/reconciliations/{campaign_id}`
  - `POST /v1/account-mirrors/completions`
  - `GET /v1/account-mirrors/completions`
  - `GET /v1/account-mirrors/completions/{completion_id}`
    - both default to a bounded, side-effect-free monitoring projection;
      append `?detail=full` only for one-off diagnostics that require the full
      refresh receipt or lifecycle history
- `POST /v1/chat/completions` accepts non-streaming OpenAI-style chat requests,
  maps `system` messages to instructions, joins the remaining chat messages
  into the existing `/v1/responses` runtime path, drains one host-owned run
  before returning, and returns a standard `chat.completion` object. If a
  browser-backed run cannot finish inside the bounded synchronous wait window,
  the endpoint returns `503` with `Retry-After`, `error.type =
  "auracall_execution_pending"`, `response_id`, and `response_poll_path` for
  `GET /v1/responses/{response_id}` polling instead of holding the client
  request indefinitely. The default wait is 30 seconds; set
  `auracall.chatCompletionSyncTimeoutMs` on a request to tune it. `stream:
  true` is rejected explicitly until the
  streaming adapter is implemented.
- Once AuraCall has issued a `response_id`, clients should keep polling that
  same id. `GET /v1/responses/{response_id}` returns structured JSON for
  pending, recovering, finalizing, completed, failed, and cancelled run states;
  true readback faults return structured JSON with the `response_id` rather
  than an empty response.
- `GET /v1/models` returns the static provider model catalog plus AuraCall
  discovery entries. Effective config-defined and registry-backed agents appear
  as `agent:<agent_id>` model ids usable with `/v1/responses` and non-streaming
  `/v1/chat/completions`; agent metadata includes source/revision fields when
  available so clients can distinguish config and registry records.
  semantic provider selectors such as `chatgpt:reasoning-high` and
  `chatgpt:premium` include
  `metadata.kind="semantic_model_selector"` and `metadata.executionReady` so
  clients can distinguish execution-ready selectors from planned Gemini/Grok
  selectors.
- Optional local API-key authorization can be enabled in config or through the
  user-scoped service dotenv file:
  ```json
  {
    "api": {
      "auth": {
        "required": true,
        "keys": [
          {
            "id": "local-app",
            "secret": "replace-with-a-random-token",
            "agents": ["researcher"],
            "teams": ["ops"],
            "services": ["chatgpt"],
            "runtimeProfiles": ["default"]
          }
        ]
      }
    }
  }
  ```
  The installed user service also reads `~/.auracall/api.env` through systemd
  `EnvironmentFile`. `pnpm run install:user-api-service` creates that file with
  `AURACALL_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and
  `AURACALL_MODEL` when it does not already exist, so OpenAI-compatible clients
  can point at the same file without copying secrets into the repo. The service
  accepts `AURACALL_API_KEY` plus optional `AURACALL_API_KEY_AGENTS`,
  `AURACALL_API_KEY_TEAMS`, `AURACALL_API_KEY_SERVICES`, and
  `AURACALL_API_KEY_RUNTIME_PROFILES` comma/space-delimited scopes; additional
  keys can be declared with `AURACALL_API_KEY_IDS` and matching
  `AURACALL_API_KEY_<ID>` variables. Local privileged MCP operators can use
  `api_key_issue`, and unscoped operator API clients can use
  `POST /v1/config/api-keys/issue`, to append an agent/team-scoped key to
  `~/.auracall/api.env`; the Agents / Teams dashboard exposes the same issue
  control. Restart the user API service afterward so systemd reloads the file.
  Use `pnpm run smoke:api-key-issue` for a temp-env HTTP smoke that does not
  touch the real user-scoped `api.env`; use
  `pnpm run smoke:api-key-openai-client` to verify the issued temp key through
  the standard OpenAI client interface.
  When enabled, `/v1/*` routes require `Authorization: Bearer <secret>` or
  `X-AuraCall-API-Key: <secret>`. `/status` remains unauthenticated so local
  operators can discover the service posture. Scoped keys are enforced on
  `/v1/responses` and `/v1/team-runs` against the effective config plus
  registry catalog for agent, team, service, and runtime-profile selectors.
  Operators can inspect non-secret scope health with
  `GET /v1/config/agent-diagnostics`; the report includes effective
  agent/team counts, config-vs-registry conflicts, disabled registry records,
  and which loaded API-key ids can reach which effective agents. With auth
  enabled, this route requires an unscoped operator key until role-based API
  keys exist. Local MCP operators can run `api_key_diagnostics` against
  `~/.auracall/api.env` before or after restart to catch missing agents, teams,
  runtime profiles, or listed key ids without exposing secret values. The same
  local, secret-free report is available with
  `auracall config agent-diagnostics`.
- Registry-backed agents and teams can be exported to reviewable JSON snapshots
  with `auracall config agent-export --agent <id> --team <id> --output <file>`
  and imported with `auracall config agent-import <file> --dry-run`. The same
  contract is available to operators through `POST /v1/config/snapshots/export`
  and `POST /v1/config/snapshots/import`, and the Agents / Teams dashboard can
  download snapshots or dry-run/apply a snapshot file. Imports write the
  user-scoped registry and keep config-defined overlay ids pinned.
- ChatGPT account mirror refreshes in tab-affinity mode use a governed crawler
  tab for both standalone refreshes and live-follow passes. Standalone requests
  use their refresh request ID for custody and traffic attribution; the same
  pacing and warning stops apply. A cold standalone request gets a TTL lease;
  borrowing a retained live-follow tab preserves its existing lifetime. Project discovery reads
  sidebar project IDs and links without visiting each project; account mirroring
  keeps project click fallback disabled.
- Account mirror refreshes are metadata-first and identity-gated. Successful
  refreshes persist the mirror snapshot in the existing provider cache under
  `provider + boundIdentity`; runtime/browser profile ids are retained as
  binding and refresh provenance, not as duplicate mirror cache owners. The
  same refresh stores bounded project/conversation manifests and lightweight
  artifact/file/media indexes without fetching full content. Operators and agents
  can inspect those cached indexes with
  `GET /v1/account-mirrors/catalog?provider=chatgpt&runtimeProfile=default&kind=all&limit=50`;
  catalog reads are cache-only and do not enqueue browser work. Individual
  cached rows can be read with
  `GET /v1/account-mirrors/catalog/items/{item_id}?provider=chatgpt&runtimeProfile=default&kind=conversations`;
  item reads use the same cache catalog and do not enqueue browser work.
  Cached conversation rows include `conversationFreshness`, a cache-derived
  projection with `fresh`, `stale`, `partial`, `missing_assets`,
  `terminal_unavailable`, `guarded`, or `unknown` state plus index/detail,
  manifest, routeability, fingerprint, and local-asset evidence. Snapshot writes
  persist index observation metadata on each cached conversation row: observed
  time, source surface, recency rank, and index-row fingerprint. The same object
  is copied into `/v1/search` row metadata for account-mirror conversations; it
  is diagnostic only and never turns cache reads into live provider validation.
  ChatGPT metadata-only refreshes preserve a human-readable conversation title
  from the visible index row or ChatGPT's local conversation-history metadata;
  a virtualized or textless sidebar row does not by itself reduce the cached
  title to the provider conversation UUID.
  Each snapshot also records a versioned `providerIndexEpoch`, and each cached
  conversation carries versioned `changeFrontierState`. These records use
  hashed identity/conversation scope keys, preserve explicit asset availability
  (`available`, `unavailable`, or `unknown`), and distinguish current-epoch
  physical browser activity from lifetime totals. Rewriting the same epoch
  preserves its checkpoint and counters; the next epoch rolls those counters
  into lifetime totals and returns the row to pending planning. Existing or
  malformed cache rows migrate conservatively to pending work with unknown
  availability and zero physical counters.
  Provider-account admission counts concurrent callers in the shared durable
  ledger across AuraCall runtime profiles. Each recent admitted interaction's
  configured minute ceiling constrains later callers; a higher caller ceiling
  does not override a stricter recent contribution. Shared provider warnings
  interrupt pending admission pacing within a one-second polling interval plus
  store-read latency. This budget counts admitted operations, not every request
  generated internally by a provider page.
  On an attached owned ChatGPT connection, native backend429responses are
  propagated to the shared account warning guard before waiting for a visible
  dialog or the next DOM warning probe. Foreign-origin and static-resource
  responses do not establish that provider warning. This warning delivery does
  not supply a separate backend-request admission budget.
  Project conversation reads retain an already-ready same-origin project route
  whose URL carries a display-name suffix after the stable project ID, avoiding
  an extra navigation solely to canonicalize its URL. A different project still
  requires navigation, and route/document readiness checks remain in force.
  Changed-frontier planning is deterministic and provider-free: each row
  becomes exactly one of `skip`, `visit_once`, `materialize_retained`, or
  `defer`. Active guards, identity mismatches, and future retry horizons defer;
  terminal provider/volatile absence skips; changed index evidence visits once;
  and only current retained detail plus manifest evidence can materialize
  missing assets without a route visit. Resume checkpoints use the hashed
  conversation key; an absent checkpoint safely restarts the bounded plan.
  For steady live follow, this plan is authoritative once a cached row has
  migrated work state. Changed rows alone enter the detail reader; retained-
  asset rows proceed directly to materialization; complete, terminal, guarded,
  and retry-delayed rows do not enter route work. Legacy rows use the prior
  freshness selector for one migration pass, while explicit full sweeps retain
  their existing all-row semantics. Non-visit decisions are checkpointed with
  the epoch so interruption does not reset completed work.
  A selected ChatGPT detail row produces one `ConversationVisitBundle` that
  carries detail completeness, a sanitized detail fingerprint, artifact/file
  references, route evidence, and its own physical target/navigation/reload
  receipt. Account-mirror reads prohibit the forced payload-route fallback,
  transient-surface reload, and conversation reopen after that route visit.
  More than one recorded navigation for a row fails closed. Matching-epoch
  bundles checkpoint their action, outcome, fingerprint, and physical counters
  into durable work state; stale-epoch bundles are ignored.
  A durable detail fingerprint also marks that conversation as eligible for
  retained-snapshot materialization. Completion combines those retained rows
  with rows visited in the current pass. ChatGPT steady-follow children are
  restricted to that supplied conversation set; a qualified empty frontier
  queues no child even when the account-wide backlog contains older work.
  Browser startup or missing-endpoint admission denials fail materialization
  with retryable diagnostics; they do not count as empty inventories or
  establish a refreshed, routeable conversation snapshot.
  Within a nonempty frontier, zero-asset skipped retries rotate behind
  unattempted conversations on later jobs, preventing one metadata-only row
  from repeatedly consuming the target budget. Force mode keeps supplied order.
  Explicit conversation scope takes precedence, and explicit full sweeps keep
  account-wide selection. Asset work consumes cached detail
  and manifest evidence without reopening or refreshing the conversation.
  Materialization checkpoints the aggregate row outcome and physical artifact
  resolution/download counters. Per-entry availability remains authoritative:
  confirmed missing volatile uploads are `unavailable`, while an unresolved
  persistent Library row remains `unknown`; a mixed result therefore stays
  deferred rather than falsely making the whole conversation terminal.
  Deferred materialization records the provider-specific failure cooldown as
  its retry-not-before boundary and cannot immediately re-enter the frontier.
  When an explicitly bounded pass shuts down its exact managed browser,
  AuraCall also retires settled idle ChatGPT tab leases in that same AuraCall
  runtime profile, managed browser profile, service, and tenant scope as
  `already-missing`. Active, in-flight, outcome-unknown, or unrelated leases
  remain fenced for operator reconciliation rather than being force-released.
  Cache reconciliation also preserves an existing readable title when a later
  weak observation contains only that conversation UUID. Operators can use an
  explicit read-only `conversations --include-history --history-limit <n>
  --refresh` pass to hydrate older placeholder titles without fetching message
  bodies or artifacts.
  Refresh merges preserve the provider-observed conversation order for newly
  seen rows and append older unobserved cached rows, so a conversation that
  moves to the top of a provider rail/project index stays top-ranked in cache.
  Catalog/search conversation rows also count artifacts/files/media from
  account-mirror manifests when those assets are bound to the provider
  conversation id, so refreshed manifest evidence can drive reconciliation even
  when an older cached transcript row has stale local count fields.
  Metadata-only live follow is not artifact catch-up. Use
  `GET /v1/account-mirrors/recovery-candidates`,
  `auracall api mirror-recovery-candidates`, or MCP
  `account_mirror_recovery_candidates` to read bounded, browser-free recovery
  candidates before queuing provider work. Candidate rows classify
  remote-known missing local assets, unknown/deferred inventory, blocked
  targets, evidence confidence, and the explicit recovery action to take.
  `retrievalFailed` means AuraCall did not obtain verified bytes and does not
  prove the provider asset is unavailable; only provider-confirmed 404/410 or
  explicit deleted/expired/not-found evidence is terminal unavailability.
  Transient detail-read timeout streaks checkpoint and yield the current
  live-follow pass; a later pass resumes from the next conversation. Because
  live follow is read-only, such failures do not create an
  `outcome-unknown` provider-effect fence.
  Project discovery yields when its existing physical navigation budget is
  exhausted, retaining collected rows and the next-project cursor for a later
  cycle. A yielded inventory remains partial rather than complete.
  For ChatGPT conversation payload reads, an in-page 404 remains recoverable
  because the governed reload may still receive the exact payload with 200.
  Only an exact fallback conversation response with 404/410 is classified as
  `not_found_or_unavailable`. Persisting that online state does not delete
  cached artifact/file history; ordinary reconciliation excludes the terminal
  conversation before provider work or `maxItems` budget is spent.
  In tab-affinity mode, a standalone context read acquires the requested
  conversation route directly and reuses its owned process tab for later reads.
  Explicit navigation restrictions and caller-owned exact targets remain
  authoritative.
  When an initial ChatGPT payload fallback leaves readable conversation DOM,
  the settled payload retry uses direct fetch only and cannot revisit the route.
  This preserves message extraction without waiting for another navigation.
  Governed context reads also check the owned page for native conversation
  HTTP429 and visible request-limit warnings before identity work and during
  message waits. Such a signal stops the read through the existing provider
  guard rather than reporting an empty or missing-message result.
  Direct `conversations context get` reads have a shared finite 120-second
  command-lifecycle deadline, overridable with `--timeout-ms`. For an exact
  conversation ID without project resolution, the deadline starts before
  browser target/session resolution and cache identity/feature preflight, then
  continues through provider work. The deadline composes caller cancellation
  into each preflight/provider signal; timeout and caller abort are terminal,
  non-retryable outcomes.
  Completed context commands flush their full result and diagnostics before
  exiting; retained browser connections do not keep the CLI alive afterward.
  Each live attempt writes a
  metadata-only terminal receipt under the provider cache with outcome,
  elapsed time, attempt count, and last bounded preflight/scrape stage. If
  target or identity preflight times out before detected identity is available,
  AuraCall uses only configured local cache identity to place that receipt.
  When target resolution supplies a provider-session authorization, cache
  scoping reuses that configured identity and skips a second live identity or
  feature probe; the provider adapter still observes and asserts the bound
  account before reading conversation content. This keeps cache placement
  provider-free without weakening live account authorization.
  Use `--retry-attempts 0` for a one-attempt canary. The option controls the
  number of provider retries after the first context attempt; omitted commands
  retain the normal retry policy.
  `cache context get` returns the receipt as `terminalReceipt` without
  contacting a browser.
  An explicit `--refresh` never substitutes stale cached context for a timeout.
  Programmatic context reads with owned backend request admission allow up to five
  additional seconds after abort/deadline for adapter cleanup. They retain the
  original abort/timeout code; failed or unconfirmed cleanup fences custody and
  prevents cached fallback. Reads without request admission keep their existing
  deadline behavior. Request-aware utilities close sessions retained during their
  operation before settling the lease; later calls connect with fresh authority.
  They reject inherited provider sessions rather than borrow a prior authority.
  Confirmed pre-send budget denial retains its typed, resumable outcome.
  Account Mirror detail collection propagates owned retained-session cleanup
  failures before accepting completion or starting the next detail row; combined
  read/cleanup failures retain both causes.
  Each top-level collection pass closes its retained detail client, including
  partial chunks. Completed evidence and the continuation cursor cross passes;
  the next explicit pass reconnects. Per-surface attribution shares that lifetime.
  With request admission active, detail timeout or cancellation drains provider
  completion for at most five seconds and stops the pass. Confirmed cleanup does
  not turn a cancelled read into success; unconfirmed cleanup retains custody.
  History-backed materialization is an explicit separate job surface:
  `POST /v1/account-mirrors/materializations` queues a durable
  `history_materialization_job` by provider conversation id, account-mirror
  catalog item id, archive item id, a selected `conversationIds` batch, or
  bounded reconciliation request. `refreshSnapshot: true` turns the job into an
  explicit conversation reconciliation: the service first refreshes the current
  online conversation context through the provider adapter, records a
  `snapshotRefresh` phase on the durable job result, then runs the existing
  artifact/file/media materialization phase. Reconciliation also writes
  per-row account-mirror evidence for the cached conversation: refreshed
  detail/manifest timestamps, routeability state, observed counts, and
  materialized-asset timestamps when downloads succeed. If an operator
  reconciles a direct provider conversation id that is not yet in the mirror
  list, AuraCall can upsert a minimal conversation row under the bound identity
  once routeability/detail evidence exists. Snapshot failures such as Gemini
  bare `/app` route fallbacks are recorded as terminal per-conversation
  evidence and skip artifact materialization for that target. Provider hard
  stops such as `google.com/sorry`, account chooser/sign-in, CAPTCHA,
  reCAPTCHA, or visible human-verification pages surface as
  `provider_guard_required` job failures with HTTP 409 semantics; operators
  must clear the managed browser profile before retrying.
  Aggregate job status is derived from the manifest entries: any real selected
  asset transfer failure makes both the result and durable job `failed`, even
  when another selected asset materializes. Synthetic terminal routeability
  placeholders and provider-guard evidence retain their dedicated semantics;
  they are not reclassified as ordinary transfer failures.
  Detailed materialization results also expose per-entry `assetAvailability`:
  `available` for materialized or duplicate local assets, `unavailable` for a
  confirmed missing volatile provider asset, and `unknown` when failure does
  not prove terminal absence. Confirmed volatile misses default to
  `failureKind: "provider_unavailable"` and `retryable: false`. A persistent
  ChatGPT Library `library_row_not_found` lookup remains `unknown`; a missing
  rendered Library row is not evidence that the provider file ceased to exist.
  Legacy jobs without this field retain their original reason-based terminal
  compatibility.
  New results also expose `recoverabilityState` so operator action is not
  inferred from an empty download result: `downloadable_now` identifies a
  concrete retrievable control, `repair_prompt_candidate` preserves a payload
  asset whose live control is missing, `metadata_only` records inventory that
  has no current retrieval path, `terminally_unavailable` requires explicit
  provider-unavailable evidence, and `materialized` identifies verified local
  output. A repair-prompt candidate is diagnostic only; AuraCall does not send
  a repair prompt automatically.
  While a ChatGPT tab-affinity prompt is in flight, AuraCall renews its active
  lease at intervals of at most 30 seconds. Renewal stops when the request
  completes, fails, is cancelled, loses ownership, or reaches its absolute
  deadline. A result arriving at or after that hard deadline is rejected even
  when a delayed timer callback has not run. The separate provider-activity check still prevents cleanup from
  closing a tab with an active or uncertain response.

  A completion-owned failed job with zero verified materializations blocks its live-follow
  operation before another provider pass; inspect and correct the
  materialization or account/browser condition, then start a fresh bounded
  operation rather than relying on automatic retry. When the same failed job
  contains one or more verified materializations, live follow preserves the
  partial-success receipt, observes its normal quiet window, and continues so
  remaining retryable transfers can be revisited without discarding progress.
  Gemini reconciliation uses the loaded app/rail surface as its first
  conversation-opening path: direct `/app/<conversationId>` navigation is only a
  fallback when the conversation cannot be found/opened from the rail, or when
  the operator explicitly requests route validation.
  Bulk `reconcile: true` jobs use cache freshness evidence before spending the
  bounded target budget: fresh/complete conversation rows are skipped unless
  forced, while stale, partial, or missing-assets rows can still be refreshed
  even when stale cached asset counts are zero.
  The asset-transfer budget counts only entries bound to a concrete provider or
  local asset; synthetic `no-materializable-*` and `known-files-excluded`
  evidence does not spend it. Retryable zero-asset conversations remain
  eligible, but later jobs order them by least-recent attempt so the same stable
  front rows cannot monopolize every bounded pass.
  Selected `conversationIds` batches honor the operator-provided order before
  catalog order; terminal Gemini bare-`/app` misses do not consume `maxItems`,
  so the same bounded request can continue to the next routeable selected id.
  The job uses
  mirrored history as the discovery index, reopens provider conversations through
  the managed browser/provider path, materializes fetchable artifacts/files into
  the existing conversation attachment cache, and upserts successful files as
  `account_mirror` archive rows so `/v1/search`, `/v1/archive`, and asset routes
  agree. Reconciliation with `assetKinds: ["media"]` also scans unavailable
  media-bearing cached conversation rows and unavailable media-generation
  archive artifacts; Gemini route misses that land on bare `/app` are recorded
  as terminal per-conversation evidence without spending the next reconciliation
  target. It can resume Gemini media materialization when cached account history
  has a matching provider conversation by id,
  unambiguous exact prompt/title, cached-media evidence, or nearest
  timestamp-backed exact prompt/title. Direct provider conversation evidence on
  a media-generation archive row is enough to resume the materializer even when
  the account-mirror catalog has not cached that conversation row; legacy rows
  with null runtime/identity evidence inherit the explicit request selectors
  unless the row carries conflicting concrete evidence. An explicit
  `archiveItemId` for a media-generation generated artifact uses that same
  media-history matching path before falling back to ordinary conversation
  materialization. Duplicate
  title-only Gemini matches are
  skipped with explicit media-recovery evidence counts for cached media,
  timestamps, and cached artifacts/files. Grok media reconciliation is
  skipped with an explicit unsupported reason because Grok's resumed image
  materializer can only inspect the active Imagine/files surface, not a matched
  historical conversation. Poll with `GET /v1/account-mirrors/materializations/{job_id}`, list with
  `GET /v1/account-mirrors/materializations`, and cancel queued jobs with
  `POST /v1/account-mirrors/materializations/{job_id}` plus
  `{"action":"cancel"}`. CLI parity is
  `auracall api history-materialization-create`,
  `history-materialization-status`, `history-materialization-jobs`, and
  `history-materialization-cancel`. Use
  `--provider-work-timeout-ms` (or HTTP `providerWorkTimeoutMs`) to bound
  browser-backed provider work for explicit proofs; MCP parity is
  `history_materialization_create`, `history_materialization_job`,
  `history_materialization_jobs`, and `history_materialization_cancel`.
  Before an exact non-forced catalog-item request enters provider work, AuraCall
  compares that selected asset family with readable archive rows and terminal
  history-materialization entries. A match settles as skipped; `--force`
  remains the explicit override.
  Reconciliation job-result metrics expose `eligibleCandidates` separately
  from `selectedCandidates`: eligible candidates passed cached routeability,
  selected-kind, freshness, and persisted terminal-family gates before the
  job ceiling, while selected candidates were actually admitted after
  within-job family deduplication and budgets. A selected candidate may still
  settle as a terminal skip, and neither count is the global missing-local
  asset inventory. Broad reconciliation results also expose a conversation-unit
  `candidateFunnel`. Its exclusive pre-eligibility reasons account for every
  discovered catalog conversation row, and its exclusive post-eligibility
  reasons account for every eligible row before selection. In particular,
  `identityMismatch` means the request and catalog entry did not identify the
  same provider account under Aura-Call's canonical tenant-binding rules. Plain
  and composite `service-account:<provider>:` forms can match; conflicting,
  missing, malformed, or incomparable identity evidence remains excluded. The
  reason does not mean the underlying assets are absent or unavailable.
  Conversation-backed results also expose optional `attempts` receipts and
  `materializedCandidates`. Each receipt binds one selected target to its
  before-budget, snapshot/materialization phases, awaited Account Mirror
  evidence writes, budget consumption, provider-guard observation, and
  terminal status. A receipt is published only after provider output passes
  target/metric verification and its required evidence writes complete;
  failed verification or persistence fails the job without accepting that
  attempt.
  Direct single-conversation materialization readback includes
  `scrapeTelemetry` on successful results, and stale timeout recovery attaches
  the last progress snapshot to the failed job. Use it to verify that direct
  ChatGPT ids stay scoped to `getConversationContext`,
  `listConversationFiles`, `materializeConversationArtifacts`, and
  `materializeConversationFiles`, with zero account-library/project inventory
  counters. A healthy direct file proof should show bounded CDP traffic such as
  one `Target.attachToTarget`, one `Page.enable`, one `Runtime.enable`, a small
  `Runtime.evaluate` count, and `downloads.attempted/succeeded` matching the
  actual provider/browser transfer count. ChatGPT files-only requests with
  snapshot refresh reuse that same retained materialization session for file
  inventory evidence; they do not open a separate snapshot-refresh client.
  Completion-owned materialization also treats the successfully refreshed
  cached inventory as authoritative, so it does not repeat scoped file listing
  and lose known candidates to a second listing timeout. It first reads the
  dedicated conversation-file cache and then falls back to `files[]` in the
  refreshed conversation-context cache, which is the dataset written by
  snapshot refresh. Scrape telemetry records these boundaries as
  `llmService.materializeConversationFiles.reuseRefreshedCache` and
  `llmService.materializeConversationFiles.reuseRefreshedContext`.
  Current ChatGPT conversation assets are discovered from semantic
  `Open preview of <filename>` controls as well as legacy behavior-button and
  upload-tile markup. The preview control supplies asset identity; an adjacent
  `Download file` button is an action, not a filename. Discovery and
  materialization preserve the same turn/message/index identity so an
  unrelated download control cannot satisfy the request.
  The bounded late-control wait is scoped to the relevant assistant or user
  turn. A preview/download control elsewhere on the page cannot end readiness
  for the selected asset surface. Current search-unit markup may carry the
  assistant/user role on the selected root itself; AuraCall reads role evidence
  from both that root and its nested role node.
  ChatGPT `files-download` JSON may supply a signed URL as the JSON string
  itself, a recognized shallow URL field, or one `data`/`result` wrapper.
  Parsing a URL is not materialization proof: AuraCall still requires the
  requested provider file id or exact response filename before writing bytes.
  Malformed or unrecognized error-only JSON remains `retrieval_failed` with
  unknown availability. Recognized provider envelopes, including ChatGPT's live
  snake-case `error_code` / `error_type` form, become non-retryable
  `provider_unavailable` only when they explicitly prove unavailable, deleted,
  expired, or not-found state. Failed JSON responses retain bounded key/type
  shape evidence without persisting response values. Structured provider evidence determines
  availability directly, and later generic fallbacks cannot overwrite a
  stronger earlier failure. Intercept polling preserves its deadline even when
  a response hangs; direct, anchor, signed-follow, and body-read stages each
  have a local aborting timeout.
  When activating an exact ChatGPT conversation-file tile opens a preview,
  AuraCall snapshots visible `Download` buttons before activation and clicks
  only the sole newly visible exact `button[aria-label="Download"]`. This
  supports current source-file previewers that do not expose a dialog role;
  multiple newly visible controls fail closed, while zero new exact controls
  may use the existing single-dialog-scoped fallback for older layouts. The
  source-file path also configures an isolated browser download directory and
  accepts a native browser download only when exactly one stable, nonempty file
  appears there after that exact preview click. Its filename must match the
  requested asset, allowing only Chrome's numeric collision suffix such as
  `name(1).txt`; ambiguous or mismatched downloads fail closed.
  A files-catalog materialization request is exact-asset authority, not merely a
  conversation hint: AuraCall carries the selected catalog ID, filename, and
  provider file ID into transfer selection and excludes every nonmatching file
  before applying `maxItems`. It must never silently download or classify a
  different file from the same conversation.
  If every known cached file is already terminal-local or outside the bounded
  selection, the history receipt reports `known-files-excluded`; it reserves
  `no-materializable-file` for a genuinely empty refreshed file inventory.
  Example:
  `auracall api history-materialization-create --provider chatgpt --runtime-profile wsl-chrome-3 --bound-identity-key <email> --conversation-id <id> --asset-kind files --max-items 1 --provider-work-timeout-ms 300000 --force --json`.
  React Search conversation rows and the cache-only Account Mirror catalog page
  expose the same reconciliation request as explicit row actions; opening rows
  still reads only cached catalog/search data. Lazy mirror
  scheduling is disabled unless `api.accountMirrorScheduler.intervalMs` is set
  in config or `api serve` starts with
  `--account-mirror-scheduler-interval-ms <ms>`. That records eligibility
  passes in `/status.accountMirrorScheduler`; set
  `api.accountMirrorScheduler.execute: true` or pass
  `--account-mirror-scheduler-execute` only when the service should request
  eligible metadata refreshes. CLI flags win over config for one-off runs.
  Operator controls share
  `POST /status`: `{"accountMirrorScheduler":{"action":"pause"}}`,
  `{"accountMirrorScheduler":{"action":"resume"}}`, or
  `{"accountMirrorScheduler":{"action":"run-once"}}`. The diagnostic
  `{"accountMirrorScheduler":{"action":"run-once-with-foreground-pressure"}}`
  control proves foreground-yield behavior by holding AuraCall foreground
  pressure while one scheduler pass selects a target and should not start
  provider refresh. Manual `run-once` remains dry-run unless the server was
  started with `--account-mirror-scheduler-execute` and the request sets
  `"dryRun":false`.
  Scheduler selection excludes targets whose active completion is
  operator-paused. Dry-run, skipped, and targetless passes never reconcile
  configured live follow; only a completed execute refresh may reconcile the
  provider/runtime-profile lane it selected.
  Recent scheduler passes are persisted in the AuraCall cache and exposed at
  `/status.accountMirrorScheduler.history` so cadence and failure evidence
  survives a service restart. `/status.accountMirrorScheduler.lastWakeReason`
  and `lastWakeAt` distinguish routine cadence, manual operator wakes, and
  live-follow nudges after real work settles.
  `/status.accountMirrorScheduler.operatorStatus.posture` gives the compact
  operator read: `disabled`, `paused`, `running`, `scheduled`, `waiting`,
  `ready`, `healthy`, or `backpressured`. `waiting` with
  `backpressureReason=foreground-work` means live follow is intentionally
  yielding to API/service work, not unhealthy. The detailed
  `/status.accountMirrorScheduler.foregroundWork` object reports active request
  count, pending drain reservations, scheduled drain state, and background drain
  state. MCP `api_status` reads the same local
  `/status` posture and supports expectation fields so agents can assert
  scheduler readiness without shelling out to the CLI. For live execute
  dogfood, prefer a long interval plus one manual `run-once` request so the
  scheduler proves the refresh path without repeatedly touching bot-sensitive
  provider pages. Gemini uses the most conservative default mirror pacing:
  routine refreshes wait 18 hours plus deterministic jitter, explicit refreshes
  wait 2 minutes plus at most 1 minute jitter, each cycle reads at most four page batches and
  80 conversation rows, and live browser reads are paced to six interactions
  per minute. Per-service `liveFollow` config may override those pacing fields
  when a provider/account needs a stricter local policy.
  Use `auracall api mirror-complete` to start live follow for a mirror target
  on the configured local API. The command returns an id immediately; the
  service backfills history until no more history is detected, then stays in
  steady follow and periodically crawls for new content. `--max-passes` is a
  debug cap, not the default; it does not disable the selected runtime's tab
  affinity, traffic governor, lease accounting, or warning hard stops.
  `auracall api mirror-completion-status <id>`
  polls a bounded mode, phase, next-attempt, count, materialization-outcome,
  and latest-lifecycle projection without refreshing materialization state.
  Use the authenticated HTTP route with `?detail=full` for a one-off full
  refresh receipt; do not use full detail as a polling surface. Completion operation
  records are persisted under the account-mirror cache and hydrated on API/MCP
  startup, so operators can keep polling the same id after service restarts.
  Full-sweep backfill is explicit: start with
  `--sweep-mode full_sweep --materialization-policy full_missing_assets` and
  optional `--materialization-asset-kind`, `--materialization-max-items`,
  `--materialization-refresh-snapshot`, and `--materialization-force`. A
  successful refresh pass queues a history-materialization job through the
  same provider/politeness path only when the recovery planner reports
  retrievable missing assets or unknown/deferred detail work. Raw missing-local
  rows classified as duplicate, unsupported metadata-only, static false
  positives, retrieval failures, or terminal failures do not keep reopening
  materialization. A queued handoff is recorded in the completion
  `materializationCursor`. Per-service `liveFollow` config can set the same
  sweep/materialization fields for startup reconciliation; ordinary
  `liveFollow.enabled: true` remains metadata-only steady follow by default.
  Startup reconciliation upgrades an existing active live-follow operation in
  place when the configured `liveFollow` policy becomes full retrieval; it does
  not start a duplicate loop for the same provider/runtime target.
  Pausing a completion aborts its active collector before returning control, so
  that collector cannot later advance the pass or queue materialization. A
  subsequent resume starts a fresh run.
  History-materialization jobs stay `running` until provider work actually
  settles or the API service restarts, so readback does not mark a job failed
  while browser retrieval continues in the background. A bounded completion
  also remains nonterminal until its owned materialization settles; a failed
  owned job blocks the completion with
  `account_mirror_materialization_failed` instead of reporting `completed`.
  After a completion-owned materialization job reaches terminal state, the
  next live-follow collector waits a full configured minimum interval from
  that provider-work settlement timestamp. A long materialization therefore
  cannot consume the collector quiet window.
  Routine scheduler passes and independent account-mirror completions also
  share one FIFO provider-work lease per provider. Different ChatGPT browser
  profiles cannot collect or materialize concurrently: the current owner
  retains the lease from collector entry through terminal completion-owned
  materialization, then releases it before its own cadence wait so the next
  ChatGPT tenant can rotate in. Unrelated providers remain independently
  runnable.
  If ChatGPT persists a rate-limit guard during a collector or materialization
  read, the current detail loop stops before another provider interaction and
  the matching account-mirror target immediately projects the same cooldown;
  completion and scheduler work remain ineligible until that boundary.
  Leased ChatGPT prompt, utility, live-follow, and materialization navigation
  now share one provider-traffic lifecycle: exact lease ownership, persisted
  admission/start, physical mutation settlement, and a visible warning probe.
  A detected `Too many requests` surface writes both provider-interaction
  warning evidence and the managed browser profile cooldown before later work
  can proceed. The warning evidence includes a versioned classifier, sanitized
  visible summary, source target class, first observation time, open-page count,
  and a capped preceding interaction timeline with timing deltas and cumulative
  navigation/reload/read counts. It excludes URLs, provider identifiers,
  operation IDs, lease IDs, account data, headers, cookies, and content.
  Account-mirror refresh evidence also publishes current-epoch changed-frontier
  action counts, physical visits/navigation/reloads, snapshot refreshes,
  artifact resolutions, downloads, duplicates, deferred rows, and a bounded
  amplification ratio.
  Real ChatGPT rate-limit detections retain a bounded 24-hour history per
  browser profile and escalate from 5 to 15 and 45 minutes, capped at six
  hours, so repeated provider limits cannot settle into a fixed short retry
  loop. Successful reads preserve that history until it ages out.
  If the same visible ChatGPT rate-limit warning remains after a target-census
  cooldown expires, Account Mirror closes that warning tab and records one new
  bounded cooldown instead of creating a manual-clear guard. It never clicks or
  dismisses the provider warning.
  Browser prompt runs also perform a bounded terminal census after a possible
  provider effect. A delayed `Too many requests` surface on the leased or a
  sibling ChatGPT tab on the same browser endpoint records the shared browser
  profile cooldown before the lease is released. Post-effect detections remain
  non-retryable and never resubmit the prompt; the census does not navigate,
  click, dismiss, or close provider tabs.
  Full-sweep completion refreshes use a longer collector timeout than ordinary
  refreshes so conservative provider pacing has room to finish a bounded pass;
  ChatGPT identity discovery uses the same 240-second browser-work allowance as
  ChatGPT detail reads, plus the configured governor wait, and aborts its
  disposable CDP connection when that effective deadline is reached;
  Gemini steady-follow completions also use a wider provider-specific envelope,
  and Gemini full sweeps use the widest default envelope because project/Gem
  history hydration and detail reads are intentionally slow.
  For bounded root-cause work, the local API exposes
  `GET/POST /v1/account-mirrors/development-policy` and asynchronous
  `POST /v1/account-mirrors/development-runs` plus
  `GET/POST /v1/account-mirrors/development-runs/{id}` for status and cancel.
  These surfaces are disabled unless the installed service explicitly sets
  `AURACALL_ACCOUNT_MIRROR_DEVELOPMENT_CONTROLS=1`; every run must also name one
  provider/runtime target and bounded wall time, conversations, materialization
  candidates, and passes. The policy preview starts no provider work. Remove the
  service opt-in after diagnosis; production provider guards, CAPTCHA/sign-in
  stops, identity validation, foreground yielding, and browser ownership remain
  non-overridable. For phase-isolated detail diagnosis, use
  `requestedPhase: "detail-inventory"` with `sweepMode: "steady_follow"` so the
  collector resumes cached detail candidates without replaying the project and
  root rails. Steady-follow detail recovery also applies changed/unchanged
  planning to the retained index rows: only changed or incomplete detail is
  read, while retained assets use materialization and complete rows skip.
  `full_sweep` intentionally refreshes those discovery surfaces.
  Use `auracall api mirror-reconcile-all --dry-run` to create a durable
  multi-tenant reconciliation campaign plan without touching provider
  browsers. The dry-run planner reads config/status/cache evidence, classifies
  configured targets as eligible, guarded, delayed, disabled, missing identity,
  identity mismatch, unsupported, or already active, and records selected
  target budgets plus full-sweep materialization policy. Use
  `auracall api mirror-reconcile-all --no-dry-run` to start selected eligible
  targets as bounded full-sweep child completions; already-active completions
  are attached to the campaign instead of duplicated. Targets deferred by the
  current provider, browser-profile, or active-target budget remain in the
  campaign and can advance on startup/status readback or explicitly with
  `auracall api mirror-reconciliation-control <campaign_id> run-next-pass`.
  If an attached active completion does not satisfy the campaign's requested
  full-sweep/materialization policy, the campaign claims that child in place
  and upgrades it to bounded full-sweep materialization rather than starting a
  duplicate target completion. Campaign readback hydrates child
  materialization jobs into aggregate materialized/checksum counts plus
  per-target asset and terminal-routeability evidence. Bounded operator
  reconciliation bypasses the routine minimum-interval wait, but it still
  respects identity mismatches, provider guards, hard stops, failure backoff,
  and browser-operation locks. Materialized asset evidence is reported with
  the archive item provider conversation id and bound identity when available,
  so artifact hashes remain attributable to the source conversation.
  Read a campaign back with
  `auracall api mirror-reconciliation-status <campaign_id>`, list recent
  campaigns with `auracall api mirror-reconciliations`, or use the Health
  dashboard reconciliation section for launcher/status/control rows. MCP
  exposes the same object through `account_mirror_reconciliation_create`,
  `account_mirror_reconciliation_status`, and
  `account_mirror_reconciliation_control`.
  Steady-follow refreshes recheck the current top of the provider
  rail/project conversation list instead of resuming the previous deep
  attachment cursor, so provider-modified conversations that move back to the
  top can be refreshed on routine cadence; Gemini root rail reads reuse the
  current `/app` or `/app/<id>` tab, normalize configured direct conversation
  URLs to the `/app` rail surface, and scroll/open the rail in place instead of
  forcing a browser refresh. Gemini context, file-download, and materialization
  reads click rail-discovered conversations in-page before any direct route
  fallback.
  During steady-follow, ChatGPT, Gemini, and Grok conversation rows are also
  evaluated in provider-observed reverse modified-time order before expensive
  detail reads. Cached-fresh rows with current detail, manifest, assets, and no
  incomplete chunk cursor count toward a fresh frontier; after
  `liveFollow.freshFrontierThreshold` contiguous fresh rows, older cached-fresh
  conversation detail is skipped. `full_sweep` keeps its full verification
  behavior, and missing-asset or chunk-incomplete rows remain selectable even
  when old.
  Full-sweep refreshes are the mode
  that resume the persisted deep cursor for backfill. Gemini mirror collection
  reads both the left rail and Gem/project conversation histories; project
  history reads are limited to rows with a concrete `/gems/edit/<id>` link.
  ChatGPT detail inventory also persists an outer
  `metadataEvidence.attachmentInventory` cursor for bounded conversation
  batches. When one large conversation itself needs multiple chunks,
  `attachmentInventory.conversationDetail` records the current conversation id
  and next message index, and the outer conversation cursor stays pinned until
  that inner cursor completes. Cache/index writes use temp-file replacement and
  malformed appended `cache-index.json` files are salvaged on the next index
  upsert, so a partial cache-index write should not strand live-follow status.
  Google-made or third-party Gems shown elsewhere in Gemini's catalog are not
  editable and are not treated as AuraCall project targets, even when Gemini
  renders buttons around them. A successful non-truncated project scan replaces
  the cached project manifest instead of retaining stale Gem rows; conversation
  and asset manifests still retain cached rows when detail inventory is partial.
  Project history reads reserve a bounded slice of the row budget, fan it across
  editable Gems/projects before deepening one history, hydrate bounded history
  when requested, cap the number of project histories read in one refresh with a
  full-sweep continuation cursor, and tolerate an individual Gem route failure
  with diagnostic evidence rather than aborting the whole sweep.
  For isolated materialization or one-provider proof runs, start the API with
  scoped proof mode, for example
  `auracall --profile auracall-gemini-pro api serve --port 18173 --account-mirror-proof-provider gemini --account-mirror-proof-runtime-profile auracall-gemini-pro`.
  Proof scope suppresses startup completion resume, configured live-follow
  reconciliation, scheduler execution, and background drain until an operator
  explicitly starts the bounded proof completion; the proof server does not
  adopt unrelated persisted active completions from the shared store.
  `/status.accountMirrorProofScope` reports the provider, runtime profile,
  tenant key, binding key, and suppression state, and `/status.liveFollow` is
  scoped to the proof target.
  The manual fallback remains
  `--background-drain-interval-ms 0 --account-mirror-scheduler-interval-ms 0 --no-account-mirror-completions-on-start`.
  Shutdown only parks completion loops owned by the current server process, so
  an isolated readback server does not rewrite unrelated persisted completion
  records when it exits.
  `auracall api mirror-completions --status active` lists recent and active
  persisted completion summaries without touching provider pages or hydrating
  full refresh receipts.
  `auracall api mirror-completion-control <id> pause|resume|cancel` controls a
  live-follow operation without killing the API service or touching provider
  browser state.
  `auracall api scheduler-diagnostics --provider chatgpt --runtime-profile default`
  reads the same scheduler diagnostics bundle exposed by the dashboard and MCP,
  including the recent in-process browser mutation audit for the selected
  provider/runtime profile when available. The mutation readback includes raw
  items plus `byKind`, `bySource`, and duplicate same-route physical mutation
  attempt counts. Repeated same-source `navigate` or `reload` starts are visible
  while the second attempt is still in flight, so scoped proof runs can
  distinguish rail clicks, direct conversation fallback, Gem navigation, target
  attach/select, and reload evidence without relying on browser clipboard access
  or attaching to CDP.
  `/status.accountMirrorCompletions` reports completion metrics plus active and
  recent records. Completion readback hydrates terminal materialization job
  status into `materializationOutcome`, including attempted conversations,
  eligible/selected candidate counts, materialized/skipped/failed counts,
  checksum counts, manifest paths, and routeability counts when the handoff job
  is terminal. Older persisted outcomes default both candidate counts to zero,
  and selected is clamped not to exceed eligible. Account-mirror status
  separates `metadataEvidence.countEvidence.observedThisPass`,
  `retainedFromCache`, and `mergedTotal`; unscanned Gemini conversation asset
  detail is reported through `assetInventory.state = deferred|unknown` instead
  of treating `artifacts=0` as proof that no assets exist.
  `metadataEvidence.conversationFreshnessFrontier` reports the provider, sweep
  mode, rows examined, rows selected for detail, first stopped row, selected
  conversation ids, and fallback reason when the frontier cannot be trusted.
  `/ops/browser`
  renders the same live-follow posture plus
  service controls for the background drain, mirror scheduler run-once,
  scheduler pause/resume, and live-follow start/pause/resume/cancel in the
  local operator dashboard. Scheduler pause/resume is persisted under the
  AuraCall home cache, so an API service restart preserves the operator's
  selected posture before startup cadence is considered. A persisted pause
  also suppresses startup completion hydration and live-follow reconciliation;
  restart never creates or resumes provider work behind the paused scheduler.
  Row controls show a compact action-result card with
  the completion id, target, status, and next attempt while keeping raw JSON
  available for debugging. Destructive live-follow cancel actions require a
  confirmation prompt; start, pause, and resume remain one-click controls. The
  target table can filter by mirror completeness or attention state so operators
  can focus on incomplete account mirrors without opening raw status JSON; each
  target row also explains the current attention reason from existing status,
  failure-backoff, recent completion error fields, and additive
  `resumePolicy` classification. `resumePolicy` separates safe steady-follow
  or bounded-resume targets from operator-paused, provider-blocked,
  identity-blocked, disabled, and already-active targets so broad live-follow
  resume does not blindly unpause or restart expensive scrape work. Metadata collector
  timeouts abort the collector signal and persist target failure-backoff state
  across API/proof-server restarts. Operator-directed recovery can preview and
  run through failure backoff with `ignoreFailureBackoff=true` (or
  `ignore_failure_backoff=true`) on `/v1/account-mirrors/status` and
  `/v1/account-mirrors/refresh`; this is separate from
  `ignoreMinimumInterval` and does not bypass provider guard/manual-clear,
  provider hard-stop, active queued/running work, or current authoritative
  provider-app identity mismatch. Gemini explicit refreshes use a practical
  proof retry window by default: 2 minutes plus at most 1 minute jitter, with
  refresh failures escalating from 2 minutes to a 10 minute cap; provider guard
  hard stops remain separate manual-clear blockers. Grok account-file listing
  closes its CDP client on abort so stale file-page work does not outlive the
  browser-operation lock. Foreground ChatGPT runs retain that same profile-wide
  operation through response wait, tool approvals, and terminal answer
  extraction; account-mirror refresh and other same-profile work must wait for
  terminal cleanup rather than taking the profile immediately after Send.
  `/account-mirror` is the dedicated read-only account
  mirror page; it includes the same cache-only catalog browser with
  provider/profile/kind/search/limit controls backed by
  `GET /v1/account-mirrors/catalog`, persists filters in the page URL, and
  opens stable item-detail URLs without starting provider browser work.
  `/status.serviceDiscovery` reports the configured bind URL, local
  `auracall.localhost` route, external route, dashboard/account-mirror paths,
  proxy target, ingress, and auth guard so operators can rediscover the service
  after restart. `/ops/browser` renders the same service discovery block as a
  first-class dashboard panel, and the configured dashboard/account-mirror
  paths are served as operator route aliases instead of being display-only.
  `/config` is the read-only effective config page for the same service
  discovery/operator route data, bound identity/account-level projections, and
  live-follow desired/actual eligibility view. `/agents` is the read-only
  Agents / Teams page for existing team-run and runtime-run inspection
  endpoints, with a local-state recent runtime-run browser backed by
  `GET /v1/runtime-runs/recent` source/status/limit filters and row actions
  that fill, inspect, or jump directly to linked account-mirror detail for
  existing run ids without touching provider browsers. Recent-run rows include
  a `Mirror` availability summary before the jump action so operators can see
  whether cached provider detail is available, a single cached conversation
  opens directly from that summary, and the summary hydrates the same
  cache-only transcript/materialization badge as detailed runtime views. Those
  badges are direct links to their exact cached provider conversation, including
  rows with multiple provider conversations; rows with more than four cached
  conversations keep the overflow in an inline `Mirror` refs expansion. After
  badge hydration, recent-run rows and runtime detail provider-conversation
  blocks also show compact cache scan summaries for transcript, asset,
  metadata-only, unavailable, and pending refs. The recent-runs table can filter
  and sort by those hydrated cache states without refetching runtime data; the
  table also reports the visible count after filters apply and can copy the
  currently visible account-mirror links for handoff.
  Runtime inspection also projects compact conversation turns from stored step
  input/output so `/agents` can render a chat-style run view beside raw JSON.
  When stored browser-run metadata includes provider conversation ids, that
  chat view also links directly to the matching cache-only `/account-mirror`
  detail and `GET /v1/account-mirrors/catalog/items/{item_id}` route, then
  hydrates a local badge showing whether the cached item has transcript turns,
  related assets, or metadata only.
  The catalog page now renders a compact cached-item browser with kind-count
  quick filters, selected-row highlighting, and a first cached conversation
  drill-in by default on `/account-mirror`. Selecting a cached row also writes
  `item`, `itemKind`, `itemProvider`, and `itemRuntimeProfile` into the page
  URL so the same detail view can be reopened after refresh or shared without
  relying on transient table state. The detail pane includes a compact result
  navigator for the current filtered rows, allowing operators to move between
  cached conversations, files, artifacts, and media without returning to the
  table. The same filtered result set can copy stable account-mirror detail
  links for handoff. Keyboard navigation supports `/` to focus catalog search and
  ArrowUp/ArrowDown to move through the result navigator.
  Conversation catalog rows show cached transcript availability and message
  count before opening the row, with a `withTranscript=1` filter for rows that
  will open as chat dialogs.
  Conversation detail reads hydrate any existing cached conversation context
  into the item detail and render cached turns as a chat dialog, while keeping
  the raw cached item JSON available for debugging. Cached chat-dialog details
  can be searched in place, downloaded locally as Markdown, and used to
  navigate cached related files/artifacts/sources without starting provider
  browser work. File, artifact, and media item detail includes a compact cached
  metadata inspector, cached URL links, and a browser-safe cached preview for
  inline text, remote image/video/audio/PDF URLs, or cache-owned materialized
  local files served through the local API before the raw JSON block. Catalog
  rows also show a `Preview` badge so operators can spot `local`, `remote`,
  `inline`, and `metadata` assets before opening detail, then filter or sort
  cached rows by previewability without triggering browser work. Previewable
  asset rows also expose `Open Preview` and `Copy URL` actions directly from
  the catalog table. Conversation rows expose `Reconcile`, which queues
  `POST /v1/account-mirrors/materializations` with `refreshSnapshot: true`
  rather than making the detail read launch browser work. The table also has
  batch actions to inspect, review in one cache-only
  preview session with provider/kind/title/item metadata, select reviewed
  items, open, copy, download selected visible preview URLs, or export a
  selected JSON manifest for operator handoff. Exported manifests can be loaded
  back into the preview-session page for cache-only review, and selected
  sessions can be saved as named records under the account-mirror cache for
  later dashboard/API readback. In `sqlite`/`dual` cache mode these named
  sessions live in `account-mirror/cache.sqlite`; legacy JSON records under
  `account-mirror/preview-sessions/` remain readable for compatibility. The
  Preview Session page includes a searchable saved-session table with
  created/updated timestamps, item counts, content badges, and one-click
  load/open actions.
- Current API boundary for that local server:
  - loopback by default; non-loopback requires `--listen-public`
  - runtime-backed create/read with one bounded local execution pass for direct runs
    - `POST /v1/responses` may now initially return `in_progress` while the
      server-owned local background drain advances work
    - poll `GET /v1/responses/{response_id}` for terminal readback
    - direct browser-backed runs now use the same configured stored-step
      executor path as normal Aura-Call runtime execution
    - direct browser-backed ChatGPT runs can request volatile workbench tools
      per call with `auracall.composerTool` and
      `auracall.deepResearchPlanAction`, for example Deep Research `edit`
      review-state runs that can then be polled through generic run status.
      `auracall.composerTool` accepts an existing composer-tool ID/alias or a
      discovered connected app's stable ID (for example
      `chatgpt.apps.litscout`) or exact unique label (`LitScout`). Connected
      app selection never installs, reconnects, or approves access: missing,
      ambiguous, disconnected/approval-required, and unverified rows stop
      before Send. Completed browser-run metadata includes a bounded
      `composerCapability` receipt with the requested value and verified
      observed ID, label, kind, availability, and connection state.
    - existing ChatGPT Library documents use the distinct
      `auracall.libraryFiles` array. Each entry contains exactly one stable
      provider `id` or exact unique `name`; duplicate, missing, stale,
      ambiguous, incomplete, or unverified selections fail before Send.
      Readback exposes only the bounded requested and attached identities under
      `metadata.executionSummary.browserRunSummary.libraryFiles`.
  - `POST /v1/media-generations` accepts the shared media-generation contract
    for `provider = chatgpt|gemini|grok`, `mediaType = image|music|video`, prompt,
    optional `model`, `transport`, `count`, `size`, `aspectRatio`, and
    metadata. Gemini API image generation is supported with
    `transport = api`, `GEMINI_API_KEY`, and the Imagen
    `models.generateImages` path; the default model is
    `imagen-4.0-generate-001`, and generated inline image bytes are cached as
    durable media artifacts. By default the route waits for terminal completion; add
    `?wait=false` or JSON `"wait": false` to return a running media id
    immediately for polling. The route persists request/readback records with a
    `timeline[]` showing processing milestones such as capability discovery,
    capability-gate stops, prompt submission, submit-path observation,
    artifact polling, `image_visible`/`video_visible` terminal media
    observation, materialization, and terminal completion. Grok browser video
    requests preflight the explicit Imagine Video mode, submit through the
    active `/imagine` tab, poll the submitted tab for terminal video evidence,
    and cache the generated MP4 through the provider download control when
    available. A diagnostic-only Grok video readback probe exists for
    already-submitted tabs when metadata explicitly provides
    `grokVideoReadbackProbe = true`, `grokVideoReadbackTabTargetId`, and
    `grokVideoReadbackDevtoolsPort`; it bypasses capability preflight and
    direct-connects to that tab without submitting, navigating, reloading, or
    opening/reusing the Imagine entrypoint. Use
    `docs/grok-imagine-video-readback-runbook.md` for the bounded manual live
    probe. Browser-backed ChatGPT/Gemini/Grok media jobs wait through the
    browser-service operation dispatcher before provider adapters touch CDP;
    timelines can include `browser_operation_queued` and
    `browser_operation_acquired` when another operation already owns the same
    managed browser profile or raw DevTools endpoint. Operators can poll the
    generic `GET /v1/runs/{run_id}/status`
    surface for response/team chats and media jobs. Media jobs also retain the
    narrower
    `GET /v1/media-generations/{media_generation_id}/status` for a compact
    status summary with the latest timeline event, artifact cache path, and
    materialization method. Existing media generations can be explicitly
    resumed with `POST /v1/media-generations/{media_generation_id}/materialize`
    or `auracall media materialize <media_generation_id>` when an operator
    wants the configured provider materializer to fetch/refresh artifacts
    without creating a second media-generation job. When provider readback
    exposes named download variants, status artifacts include compact
    `downloadLabel`,
    `downloadVariant`, and `downloadOptions` fields so callers can distinguish
    outputs such as Gemini music MP4-with-art versus MP3 without fetching the
    full generation record. Media status also includes a derived
    `diagnostics` block from persisted timeline evidence so operators can see
    capability preflight, selected workbench mode/tool state, submitted tab,
    provider route progression, artifact polling/progress counts, terminal
    run-state counts, and materialization source without a separate browser
    probe. Grok browser image jobs require
    generated account media for terminal success; public gallery/template
    media remains diagnostic evidence and is not cached as generated output.
    Repeated stable
    public/template terminal media with no generated account image fails as
    `media_generation_no_generated_output`; inspect `diagnostics` or
    `submit_path_observed` to see whether Grok reported pending generation,
    generated media, blocked state, or public-template reuse after the send
    click. Grok browser image jobs default to scraping up to eight currently
    visible generated tiles from the submitted Imagine page; pass `count` to
    request fewer visible tiles. The default capture path does not scroll the
    wall to trigger additional provider generation.
    Add `diagnostics=browser-state` to either status route during a running
    browser-backed media job to capture the selected provider target,
    document readiness, visible control counts, provider evidence, and a stored
    PNG screenshot path without re-invoking the provider.
    Browser readback/materialization on a submitted tab now treats that tab as
    the authority when `preserveActiveTab` is set: provider adapters reuse the
    existing tab target and refuse post-submit navigation/reload/reopen
    recovery on that tab.
    Gemini browser image runs now emit pre-submission milestones such as
    `browser_target_attached`, `gemini_surface_ready`, `capability_selected`,
    `composer_ready`, `prompt_inserted`, and `send_attempted` before the
    terminal `prompt_submitted`/artifact-polling sequence, so operators can
    distinguish a healthy managed browser from a stuck provider interaction.
    Gemini image/music/video requests with `transport = browser` now check the
    matching workbench capability, select the matching `Images`/`Music`/`Videos`
    workbench tool, and materialize generated artifacts through the managed
    browser path. Gemini music can cache both provider download variants when
    readback exposes them: video with album art and MP3 audio. If Gemini
    exposes one music artifact plus visible option labels, Aura-Call expands
    those labels into separate provider-menu materialization requests. Read-only
    artifact discovery also preserves already-visible provider download option
    labels without opening the menu. Gemini music/video
    live smokes are quota-sensitive and should stay opt-in/manual; fixture
    coverage is the routine validation path. Grok image requests with
    `transport = browser` now check `grok.media.imagine_image` through the
    explicit `/imagine` entrypoint first; account-gated or unavailable accounts
    fail before prompt submission, while available accounts use the pinned
    `/imagine` tab, provider run-state polling, visible tile capture, and a
    provider download-button comparison before falling back to remote media
    fetch. Grok video remains explicitly gated.
  - `GET /v1/workbench-capabilities` reports currently known or discovered
    provider workbench capabilities for regular service discovery. Filter with
    `provider=chatgpt|gemini|grok`, `category=research|media|canvas|connector|skill|app|search|file|other`,
    and `runtimeProfile=<name>`. Static entries report conservative
    `unknown` or `account_gated` availability. When served with the configured
    runtime, `provider=gemini`, `provider=chatgpt`, and `provider=grok` can
    merge live browser feature-signature evidence from the matching managed
    browser profile.
    ChatGPT discovery reports visible Web Search, Deep Research, Company
    Knowledge, apps/connectors, and skill labels without invoking or enabling
    them. A skill label remains `availability = unknown` and
    `invocationMode = unknown`; it does not prove stable identity,
    installation, activation, version, or use in a submitted turn.
    App reporting keeps three independent signals separate: installed plugin
    inventory, linked/authentication state, and current composer visibility.
    An installed app is not reported as currently invocable unless it is
    selectable in the active Chat/Work menu or has an active link. Selectable
    apps use `invocationMode = composer_mention`; AuraCall opens the composer
    tool drawer, types the exact connector name to filter it, activates the
    matching row, and verifies the resulting inline object by its
    `app://connector_...` path before prompt text is added. Each observed app includes a
    `metadata.selection` contract with its stable ID, exact label, connection
    state, and provider-identity verification. This inventory is derived from
    exact visible provider rows, so newly visible apps do not require an
    AuraCall source-code update.
    Grok discovery reports visible Imagine image/video capability evidence
    without submitting a generation request. The matching CLI surface is
    `auracall capabilities --target gemini --json`,
    `auracall capabilities --target chatgpt --json`, or
    `auracall capabilities --target grok --json`; add `--static` to skip
    browser attachment during debugging. Add `--diagnostics browser-state` or
    `diagnostics=browser-state` to include bounded target/document/provider
    evidence and a stored screenshot path for the selected provider. For Grok
    Imagine, add `--entrypoint grok-imagine` or `entrypoint=grok-imagine` to
    inspect the `/imagine` workbench route without submitting a prompt. Grok
    Imagine provider evidence includes conservative read-only run-state,
    pending, terminal image/video, media URL, and materialization-control
    signals when those are visible in the workbench. Bounded visible masonry
    and filmstrip tiles are preserved separately from terminal media evidence.
    Passive upsell affordances such as `Upgrade to SuperGrok` are not treated
    as account gates unless the page also lacks ready generation controls or
    generated media.
  - `POST /v1/team-runs` creates one bounded task-backed team execution:
    - request fields are either:
      - compact fields: `teamId`, `objective`, and optional `title`,
        `promptAppend`, `structuredContext`, `responseFormat`, `maxTurns`, and
        bounded `localActionPolicy`
      - a prebuilt flattened `taskRunSpec` validated with Aura-Call's live
        `TaskRunSpec` schema
    - the server constructs or accepts exactly one `TaskRunSpec`, one
      `TeamRun`, and one `sourceKind = team-run` runtime run through
      `TeamRuntimeBridge`
    - the response envelope is `object = "team_run"` with `taskRunSpec`,
      deterministic `execution` ids/status, and links for team inspection,
      runtime inspection, and `/v1/responses/{runtimeRunId}` readback
    - when server background drain is enabled, creation returns after
      persistence and the existing server-owned background drain advances the
      team runtime; when background drain is disabled, the route keeps the
      synchronous one-request behavior
    - sectioned public task-run-spec envelopes, background worker pools, and
      parallel team execution remain out of scope
  - startup recovery default source can be tuned with
    `--recover-runs-on-start-source <direct|team-run|all>`
    (`direct` by default)
  - `GET /status?recovery=true` (or `1`) returns optional recovery state:
    - defaults to `sourceKind=direct`
    - optionally filters with `sourceKind=direct|team-run|all`
    - includes `totalRuns`, plus `reclaimableRunIds`,
      `recoverableStrandedRunIds`, `activeLeaseRunIds`, `strandedRunIds`, and
      `idleRunIds`
    - also includes bounded local-claim summary under `localClaim` when a local runner is configured:
      - `runnerId`
      - `selectedRunIds`
      - `blockedRunIds`
      - `notReadyRunIds`
      - `unavailableRunIds`
      - `statusByRunId`
      - `reasonsByRunId`
    - also includes bounded active-lease health under `activeLeaseHealth`:
      - `freshRunIds`
      - `staleHeartbeatRunIds`
      - `suspiciousIdleRunIds`
      - `reasonsByRunId`
    - also includes bounded lease-repair posture under `leaseRepair`:
      - `locallyReclaimableRunIds`
      - `inspectOnlyRunIds`
      - `notReclaimableRunIds`
      - `repairedRunIds`
      - `reasonsByRunId`
  - `GET /status/recovery/{run_id}` returns one bounded per-run recovery
    detail view with:
    - `taskRunSpecId`
    - bounded persisted `taskRunSpecSummary`:
      - `id`
      - `teamId`
      - `title`
      - `objective`
      - `createdAt`
      - `persistedAt`
  - `GET /v1/runtime-runs/inspect` returns one bounded read-only runtime
    queue/runner view:
    - required query:
      - `runId`
      - `runtimeRunId`
      - `teamRunId`
      - `taskRunSpecId`
      - optional query:
        - `runnerId`
        - `probe=service-state`
        - `diagnostics=browser-state`
        - `authority=scheduler`
    - returns:
      - `resolvedBy`
      - `queryId`
      - `queryRunId`
      - bounded alias match summary:
        - `matchingRuntimeRunCount`
        - `matchingRuntimeRunIds`
      - bounded `taskRunSpecSummary` when the runtime run is task-backed
      - optional `serviceState` when explicitly requested with
        `probe=service-state`
        - this is a live run-scoped provider-state probe, not durable replay
        - current posture is explicit:
          - `probeStatus = observed`
          - `probeStatus = unavailable`
        - current default live probes are:
          - ChatGPT on the managed browser path
          - Gemini on browser-backed runtime profiles only
            - active browser-backed Gemini runs prefer provider-owned
              lottie/avatar spinner evidence when visible, then fall back to
              executor-owned transient `thinking`
          - Grok on browser-backed runtime profiles only
            - active browser-backed Grok runs prefer executor-owned transient
              `thinking` state before DOM/page fallback
        - Gemini API-backed runtime profiles still return honest
          `unavailable` posture on this seam
        - Grok API-backed runtime profiles still return honest `unavailable`
          posture on this seam
        - keep `serviceState` separate from:
          - runtime queue/lease state
          - `/status` server/runner health
      - optional `browserDiagnostics` when explicitly requested with
        `diagnostics=browser-state`
        - this is a bounded live browser snapshot for the active running step,
          not raw CDP access
        - includes selected target URL/title/id, document readiness, visible
          control counts, provider evidence such as Gemini activity state, and
          a PNG screenshot path under AuraCall diagnostics storage
        - when a browser run queued behind another same-profile operation,
          diagnostics can also include recent browser-operation queue events
          such as `queued`, `acquired`, or `busy-timeout`
        - generic run/media status also supports this switch for active
          browser-backed media jobs and prefers the provider `tabTargetId`
        - workbench capability reports support the same switch for selected
          providers, so Grok Imagine account-gating evidence can be inspected
          without submitting a prompt
        - media status can also surface provider browser diagnostics recorded at
          prompt submission
        - the local read-only `/ops/browser` dashboard links these seams and
          only runs browser-state probes when an operator explicitly clicks a
          probe
      - optional `schedulerAuthority` when explicitly requested with
        `authority=scheduler`
        - this is read-only scheduler evidence, not assignment authority
        - returns the deterministic decision, reason, active lease posture,
          candidates, selected runner evidence, future mutation label, and
          `mutationAllowed = false`
      - `runtime.queueProjection` with:
        - `queueState`
        - `claimState`
        - `nextRunnableStepId`
        - `activeLeaseId`
        - `activeLeaseOwnerId`
        - active/waiting/running/deferred/terminal step ids
        - bounded affinity evaluation
          - `requiredService`
          - `requiredRuntimeProfileId`
          - `requiredBrowserProfileId`
          - `requiredHostId`
          - `hostRequirement`
          - `requiredServiceAccountId`
          - `browserRequired`
          - `eligibilityNote`
        - when configured service identity exists for the active step service,
          `requiredServiceAccountId` uses the same
          `service-account:<service>:<identity-key>` shape as runner
          `serviceAccountIds`
        - this is declarative config-derived affinity only:
          - identity key preference is `email`, then `handle`, then `name`
          - `api serve` does not live-probe the browser account during runner
            registration
          - a matching id means the runner is configured for that account, not
            that the currently logged-in browser tab has been independently
            verified
      - bounded `runner` summary when:
        - `runnerId` is supplied, or
        - the active lease owner resolves to a persisted runner record
        - `api serve` derives runner `serviceAccountIds` from configured
          service identities when present, using
          `service-account:<service>:<identity-key>`
        - when configured identities are absent or incomplete for a
          browser-capable runner, `eligibilityNote` preserves that caveat
          instead of implying full browser-account affinity
    - this is still inspection-only; it does not create, claim, cancel, or run
      work
      - `requestedOutputCount`
      - `inputArtifactCount`
    - bounded `orchestrationTimelineSummary` from relevant durable
      `sharedState.history` entries:
      - `total`
      - bounded `items`
        - `type`
        - `createdAt`
        - `stepId`
        - `note`
        - `handoffId`
    - bounded `handoffTransferSummary` when incoming planned handoffs for the
      current dependent step carry task-aware transfer context:
      - `total`
      - bounded `items`
        - `handoffId`
        - `fromStepId`
        - `fromAgentId`
        - `title`
        - `objective`
        - `requestedOutputCount`
        - `inputArtifactCount`
    - current host classification
    - active lease snapshot
    - dispatch posture
    - reconciliation / repair posture and reasons
    - active-lease health under `leaseHealth`, including whether the lease looks fresh, stale-heartbeat, or suspiciously idle
    - bounded host drain now also treats `stale-heartbeat` as its own skip posture; `suspiciously-idle` remains diagnostic only
    - `POST /status` now also accepts one bounded stale-heartbeat operator action:
      - `{"leaseRepair":{"action":"repair-stale-heartbeat","runId":"..."}}`
      - it only repairs runs currently classified as `stale-heartbeat` when the existing durable repair posture is already `locally-reclaimable`
      - successful action results also preserve bounded reconciliation detail under `reconciliationReason`
      - `suspiciously-idle` remains read-only and is rejected by that action
    - `POST /status` now also accepts one bounded local run-cancel operator action:
      - `{"runControl":{"action":"cancel-run","runId":"..."}}`
      - it only cancels runs that currently hold an active lease owned by the local configured runner/host
      - it releases that active lease with release reason `cancelled`
      - inactive or not-owned runs are rejected cleanly instead of being force-cancelled
    - `POST /status` now also accepts one bounded human-escalation resume action:
      - `{"runControl":{"action":"resume-human-escalation","runId":"...","note":"...","guidance":{...},"override":{"promptAppend":"...","structuredContext":{...}}}}`
      - it applies to direct or team runs currently paused for human escalation
      - it resumes the cancelled human-escalation step back to `runnable`
      - runs without a paused human-escalation step are rejected cleanly
    - `POST /status` now also accepts one bounded targeted drain action:
      - `{"runControl":{"action":"drain-run","runId":"..."}}`
      - it applies to direct or team runs
      - it triggers one targeted host drain pass for that run
      - it is the intended post-resume follow-through path when operators want immediate execution instead of waiting for the ordinary background drain
      - it can also execute a runnable run already leased by the configured
        server-local runner, including after a successful scheduler local claim
    - `POST /status` now also accepts one bounded local-action request resolution action:
      - `{"localActionControl":{"action":"resolve-request","runId":"...","requestId":"...","resolution":"approved|rejected|cancelled"}}`
      - it only applies to currently `requested` local action records on direct or team runs
      - it updates the persisted local-action outcome summary used by `GET /v1/responses/{response_id}`
      - already-resolved requests are rejected cleanly instead of being overwritten
    - `POST /status` now also accepts one bounded scheduler-control claim action:
      - `{"schedulerControl":{"action":"claim-local-run","runId":"...","schedulerId":"operator:local-status"}}`
      - it is gated by read-only scheduler authority and only claims or reassigns to the server-local runner
      - it does not execute by itself; follow with targeted `drain-run` for
        immediate execution through the existing local-owned lease
      - fresh active leases, still-active lease owners, non-local selected runners, and affinity/capability blocks are rejected without mutation
    - recovery summary/detail now also surface bounded operator attention for
      stale-heartbeat and suspiciously-idle active-lease cases:
      - `recoverySummary.attention.staleHeartbeatInspectOnlyRunIds`
      - per-run `attention.kind = stale-heartbeat-inspect-only|suspiciously-idle`
    - recovery summary/detail now also surface bounded cancellation readback:
      - `recoverySummary.cancelledRunIds`
      - `recoverySummary.cancellation.reasonsByRunId`
      - per-run `cancellation.cancelledAt`
      - per-run `cancellation.source`
      - per-run `cancellation.reason`
    - startup recovery logs now also emit:
      - `attention=stale-heartbeat-inspect-only:<count>`
      - `attention=suspiciously-idle:<count>` when active leases look
        idle-but-not-stale
    - configured local runner claim posture under `localClaim`, including whether the current local runner is actually selected
  - `GET /v1/team-runs/inspect` returns one bounded read-only team linkage view:
    - query by `taskRunSpecId=<task_run_spec_id>`, `teamRunId=<team_run_id>`, or `runtimeRunId=<runtime_run_id>`
    - returns:
      - `resolvedBy`
      - `queryId`
      - bounded `taskRunSpecSummary`
      - `matchingRuntimeRunCount`
      - bounded `matchingRuntimeRunIds`
      - bounded `runtime` summary:
        - `runtimeRunId`
        - `teamRunId`
        - `taskRunSpecId`
        - `runtimeSourceKind`
        - `runtimeRunStatus`
        - `runtimeUpdatedAt`
        - `sharedStateStatus`
        - `stepCount`
        - `handoffCount`
        - `localActionRequestCount`
        - `nextRunnableStepId`
        - bounded runnable/deferred/waiting/running/blocked/terminal step ids
        - `activeLeaseOwnerId`
    - this is inspection-only and does not create or mutate team execution
  - `/status` also reports bounded background-drain state:
    - `enabled`
    - `intervalMs`
    - `state = disabled|idle|scheduled|running|paused`
    - `paused`
    - `lastTrigger`
    - `lastStartedAt`
    - `lastCompletedAt`
    - `api serve` defaults timer-driven drain to a 60-second cadence; use
      `--background-drain-interval-ms <ms>` to tune it, or `0` to disable the
      timer
  - `/status` also reports ChatGPT tenant execution budgets under
    `tenantExecutionLimits`:
    - `providers.chatgpt.defaultLimits`
    - `providers.chatgpt.entries[].tenantKey`
    - `providers.chatgpt.entries[].runtimeProfileIds`
    - `providers.chatgpt.entries[].browserProfileIds`
    - `providers.chatgpt.entries[].limits`
    - default `/status` keeps usage counters unscanned with
      `usage.basis = not-requested`
    - `GET /status?tenantExecutionLimits=usage` adds read-only evidence from
      persisted active leases and `step-started` events:
      - `providers.chatgpt.entries[].usage.activeChats`
      - `providers.chatgpt.entries[].usage.chatsLastHour`
      - `providers.chatgpt.entries[].usage.chatsLastDay`
    - this readback does not acquire leases or execute work
  - `/status` now also reports the live persisted local runner identity for
    `api serve` under `runner`:
    - `id`
    - `hostId`
    - `status`
    - `lastHeartbeatAt`
    - `expiresAt`
    - `lastActivityAt`
    - `lastClaimedRunId`
  - `/status` also reports read-only runner topology/readiness under
    `runnerTopology`:
    - `localExecutionOwnerRunnerId`
    - `generatedAt`
    - aggregate active/stale/fresh/expired/browser-capable runner counts
    - bounded runner capability summaries for service ids, runtime profiles,
      browser profiles, service-account ids, and browser capability
    - `selectedAsLocalExecutionOwner` marks the runner this server may execute
      through
    - this is read-only capacity evidence; it does not grant scheduler,
      reassignment, lease, or parallel execution authority
  - plain `/status` now also reports a compact direct-run local claim snapshot
    under `localClaimSummary` when a local runner is configured:
    - `sourceKind`
    - `runnerId`
    - `selectedRunIds`
    - `blockedRunIds`
    - `notReadyRunIds`
    - `unavailableRunIds`
    - `statusByRunId`
    - `reasonsByRunId`
  - bounded local claims now use that live runner id as the lease owner
    instead of a generic host-only owner string
  - successful bounded direct-run execution now also updates that persisted
    runner record with:
    - `lastActivityAt`
    - `lastClaimedRunId`
  - if a run is cancelled while a delayed local step is still finishing, the
    final persisted state now stays `cancelled` instead of being overwritten by
    the later step completion
  - bounded local execution now refreshes the active lease heartbeat while a
    step is still running so live runner-owned claims do not start stale and do
    not rely on one-shot lease freshness
  - `POST /status` provides one bounded operator control seam for the same
    background drain loop:
    - `{"backgroundDrain":{"action":"pause"}}`
    - `{"backgroundDrain":{"action":"resume"}}`
    - and one bounded stale-heartbeat lease repair action:
      - `{"leaseRepair":{"action":"repair-stale-heartbeat","runId":"..."}}`
    - and one bounded local run-cancel action:
      - `{"runControl":{"action":"cancel-run","runId":"..."}}`
      - cancellation is single-runner scoped and only applies to active locally
        owned runs
    - and one bounded human-escalation resume action:
      - `{"runControl":{"action":"resume-human-escalation","runId":"...","note":"...","guidance":{...},"override":{"promptAppend":"...","structuredContext":{...}}}}`
      - resume is limited to direct or team runs currently paused for human escalation
    - and one bounded targeted drain action:
      - `{"runControl":{"action":"drain-run","runId":"..."}}`
      - targeted drain is limited to direct or team runs and performs one host-owned pass for that run
    - and one bounded local-action request resolution action:
      - `{"localActionControl":{"action":"resolve-request","runId":"...","requestId":"...","resolution":"approved|rejected|cancelled"}}`
      - resolution is limited to currently `requested` direct-run or team-run local action records
    - and one bounded scheduler-control claim action:
      - `{"schedulerControl":{"action":"claim-local-run","runId":"...","schedulerId":"operator:local-status"}}`
      - claims local-eligible runs or reassigns expired stale/missing-owner leases only to the server-local runner
  - `/status` now reports explicit development posture, route surface, and
    unauthenticated/local-only state, including the current AuraCall version
  - optional `X-AuraCall-*` execution headers for:
    - `X-AuraCall-Runtime-Profile`
    - `X-AuraCall-Agent`
    - `X-AuraCall-Team`
    - `X-AuraCall-Service`
  - optional local API-key auth for `/v1/*`; no auth unless configured
  - no streaming
  - bounded non-streaming `/v1/chat/completions` compatibility routes through
    the existing `/v1/responses` runtime path and drains synchronously before
    returning
  - runner self-registration + heartbeat now exist for the local `api serve`
    host, but there is still no broader multi-runner claim/reassignment mode
  - direct-run responses now include bounded execution readback under
    `metadata.executionSummary`
  - if runtime shared state exposes `structuredOutputs[key="response.output"]`,
    preserve that structured mixed payload on top-level `response.output`
    instead of flattening it into metadata
  - runtime-backed response readback now also includes bounded assignment
    identity under top-level response metadata:
    - `metadata.taskRunSpecId`
  - task-backed runtime execution now also injects bounded assignment context
    directly into step execution:
    - `taskContext`
    - `taskStructuredContext`
    - `taskInputArtifacts`
    - dependency-scoped `taskTransfer` from incoming planned handoffs
  - task-backed team planning now also shapes bounded inter-step handoffs with
    compact transfer context under handoff `structuredData.taskTransfer`:
    - `title`
    - `objective`
    - `successCriteria`
    - bounded `requestedOutputs`
    - bounded `inputArtifacts`
  - runtime-backed detailed response readback now also includes bounded task
    assignment artifact refs under:
    - `metadata.executionSummary.inputArtifactSummary`
    - `total`
    - bounded `items`
      - `id`
      - `kind`
      - `title`
      - `path`
      - `uri`
    - runtime-backed detailed response readback now also includes bounded
      consumed handoff transfer context under:
      - `metadata.executionSummary.handoffTransferSummary`
      - `total`
      - bounded `items`
        - `handoffId`
        - `fromStepId`
        - `fromAgentId`
        - `title`
        - `objective`
        - `requestedOutputCount`
        - `inputArtifactCount`
  - runtime-backed detailed response readback now also includes bounded
      orchestration timeline summary derived from durable shared-state history
      under:
      - `metadata.executionSummary.orchestrationTimelineSummary`
      - `total`
      - bounded `items`
        - `type`
        - `createdAt`
        - `stepId`
        - `note`
        - `handoffId`
    - mixed-provider response readback now also includes bounded per-step
      routing projection under:
      - `metadata.executionSummary.stepSummaries`
      - use this field when you need routing proof from response readback
        itself
      - contract split:
        - top-level `metadata.service` / `metadata.runtimeProfile` remain the
          compact response summary
        - top-level `response.output` remains the transport payload
        - `metadata.executionSummary.stepSummaries` is the per-step routing
          projection
        - execution-summary fields should not leak into individual `output`
          items
        - `GET /status/recovery/{run_id}` remains the orchestration timeline
          surface and should not grow routing fields like:
          - `runtimeProfile`
          - `service`
          - `stepSummaries`
    - requested-output fulfillment reads now also include
      `metadata.executionSummary.requestedOutputSummary` with:
        - `total`
      - `fulfilledCount`
      - `missingRequiredCount`
      - bounded per-item `label`
      - bounded per-item `kind`
      - bounded per-item `format`
      - bounded per-item `destination`
      - bounded per-item `required`
      - bounded per-item `fulfilled`
      - bounded per-item `evidence`
    - required requested-output policy reads now also include
      `metadata.executionSummary.requestedOutputPolicy` with:
      - `status = satisfied|missing-required`
      - `message`
      - `missingRequiredLabels`
      - when required outputs are still missing, response readback now returns
        `status = failed` with bounded failure code
        `requested_output_required_missing`
      - stored runtime/service terminal state now also converges to `failed`
        for those same clearly missing-required cases
      - task-run-spec provider request budget now also has one bounded runtime
        enforcement seam:
        - when the next runnable step order would exceed
          `constraints.providerBudget.maxRequests`, runtime/service state fails
          before execution with bounded failure code
          `task_provider_request_limit_exceeded`
      - task-run-spec provider token budget now also has one bounded runtime
        enforcement seam:
        - when cumulative stored provider usage already exceeds
          `constraints.providerBudget.maxTokens`, runtime/service state fails
          before the next step executes with bounded failure code
          `task_provider_token_limit_exceeded`
    - runtime-backed response readback now also includes bounded provider
      usage when the stored execution path reports real usage:
      - `metadata.executionSummary.providerUsageSummary`
      - `ownerStepId`
      - `generatedAt`
      - `inputTokens`
      - `outputTokens`
      - `reasoningTokens`
      - `totalTokens`
    - resumed/drained operator lifecycle reads now also include
      `metadata.executionSummary.operatorControlSummary` with:
      - `humanEscalationResume.resumedAt`
      - `humanEscalationResume.note`
      - `targetedDrain.requestedAt`
      - `targetedDrain.status`
      - `targetedDrain.reason`
        - preserves the specific local-claim explanation when targeted drain
          cannot safely claim a run
      - `targetedDrain.skipReason`
        - keeps the bounded coarse skip enum such as
          `claim-owner-unavailable`
    - cancelled terminal reads now also include
      `metadata.executionSummary.cancellationSummary` with:
      - `cancelledAt`
      - `source`
      - `reason`
    - local-action terminal reads now also include
      `metadata.executionSummary.localActionSummary` with:
      - `ownerStepId`
      - `generatedAt`
      - `counts`
      - bounded `items`
      - operator resolution of pending local-action requests now updates this same summary
    - immediate `/status` operator action results now also preserve bounded
      identity/timestamp detail:
      - `resolve-request`
        - `resolvedAt`
        - `ownerStepId`
      - `resume-human-escalation`
        - `resumedAt`
        - `resumedStepId`
  - non-loopback `--host` bindings are allowed but still warned as unsafe for
    anything beyond local development
- If your Gemini account can’t access “Pro”, Aura-Call auto-falls back to a supported model for web runs (and logs the fallback in verbose mode).
- Gemini feature discovery/snapshot/diff is now first-class through
  `auracall features ...`.
- Blocking pages such as `google.com/sorry`, CAPTCHA / reCAPTCHA, or similar
  human-verification surfaces now stop `doctor`, `features`, `setup`, `login`,
  and shared browser runs early with manual-clear guidance instead of being
  treated as ordinary pages.
- Prefer API mode or `--copy` + manual paste; browser automation is experimental.
- Browser support: stable on macOS; works on Linux (add `--browser-chrome-path/--browser-cookie-path` when needed) and Windows (manual-login or inline cookies recommended when app-bound cookies block decryption).
- Remote browser service: `auracall serve` on a signed-in host; clients use `--remote-host/--remote-token`.
- AGENTS.md/CLAUDE.md:
  ```
  - Aura-Call bundles a prompt plus the right files so another AI (GPT 5 Pro + more) can answer. Use when stuck/bugs/reviewing.
  - Run `npx -y auracall --help` once per session before first use.
  ```
- Tip: set `browser.chatgptUrl` in config (or `--chatgpt-url`) to a dedicated ChatGPT project folder so browser runs don’t clutter your main history.

**Codex skill**
- Copy the bundled skill from this repo to your Codex skills folder:
  - `mkdir -p ~/.codex/skills`
  - `cp -R skills/oracle ~/.codex/skills/oracle`
- Then reference it in your `AGENTS.md`/`CLAUDE.md` so Codex loads it.

**MCP**
- Run the stdio server via `auracall-mcp`.
- Configure clients via [steipete/mcporter](https://github.com/steipete/mcporter) or `.mcp.json`; see [docs/mcp.md](docs/mcp.md) for connection examples.
- MCP tools include `consult`, `sessions`, bounded team execution through
  `team_run`, direct response creation through `response_create`, generic run
  status through `run_status`, the shared media contract through
  `media_generation`, media run status readback through
  `media_generation_status`, explicit media artifact recovery through
  `media_generation_materialize`, recent local runtime-run browsing through
  `runtime_runs_recent`, and routine provider workbench discovery through
  `workbench_capabilities`. When launched from a resolved AuraCall runtime
  profile, the MCP response, media, and workbench tools use the same configured
  browser-backed service bundle as the local API server.
- Persistence-safe MCP polling pattern: create once, keep the returned
  `response.id` or `media_generation.id`, then poll with `run_status` or
  `media_generation_status`. Status tools read durable local records and should
  not be replaced with a second create call just to check progress.
```bash
npx -y auracall auracall-mcp
```
- Cursor setup (MCP): drop a `.cursor/mcp.json` like below, then pick “oracle” in Cursor’s MCP sources. See https://cursor.com/docs/context/mcp for UI steps.
[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en-US/install-mcp?name=oracle&config=eyJjb21tYW5kIjoibnB4IC15IEBzdGVpcGV0ZS9vcmFjbGUgb3JhY2xlLW1jcCJ9)

```json
{
  "auracall": {
    "command": "auracall-mcp",
    "args": []
  }
}
```

## Highlights

- Bundle once, reuse anywhere (API or experimental browser).
- Multi-model API runs with aggregated cost/usage, including OpenRouter IDs alongside first-party models.
- Render/copy bundles for manual paste into ChatGPT when automation is blocked.
- GPT‑5 Pro API runs detach by default; reattach via `auracall session <id>` / `auracall status` or block with `--wait`.
- Azure endpoints supported via `--azure-endpoint/--azure-deployment/--azure-api-version` or `AZURE_OPENAI_*` envs.
- File safety: globs/excludes, size guards, `--files-report`.
- Sessions you can replay (`auracall status`, `auracall session <id> --render`).
- Session logs and bundles live in `~/.auracall/sessions` (override with `AURACALL_HOME_DIR`). On POSIX systems AuraCall creates and repairs this sensitive session tree as owner-only (`0700` directories and `0600` files) without traversing symlinks.

## Flags you’ll actually use

| Flag | Purpose |
| --- | --- |
| `-p, --prompt <text>` | Required prompt. |
| `-f, --file <paths...>` | Attach local files/dirs (globs + `!` excludes). On ChatGPT's current workbench, AuraCall prefers the exact `Add photos & files` row and also accepts the unrestricted `#upload-files` input only when it is bound to the active composer and its `Add files and more` trigger; `Add from library` is a separate provider-library drawer. |
| `-e, --engine <api\|browser>` | Choose API or browser (browser is experimental). |
| `-m, --model <name>` | Built-ins (`openai:frontier` default, currently `gpt-6-astra`; exact GPT-5.x, Gemini, Claude, and Grok IDs remain available) plus any OpenRouter id. Browser ChatGPT publishes `chatgpt:fast`, `chatgpt:reasoning`, `chatgpt:reasoning-high`, `chatgpt:reasoning-max`, `chatgpt:premium`, and `chatgpt:legacy`. Older GPT-5.2 and Sol/Terra/Luna selectors remain accepted aliases or explicit provider-family pins. |
| `--models <list>` | Comma-separated API models (mix built-ins and OpenRouter ids) for multi-model runs. |
| `--base-url <url>` | Point API runs at LiteLLM/Azure/OpenRouter/etc. |
| `--chatgpt-url <url>` | Target a ChatGPT workspace/folder (browser). |
| `--browser-chatgpt-mode <chat\|work>` | Select the ChatGPT composer mode. AuraCall defaults every ChatGPT browser run to `chat`; `work` must be requested explicitly. |
| `--browser-chatgpt-tool-approval <manual\|allow-once\|always-allow>` | Handle a post-submit ChatGPT third-party tool approval pause. `manual` is the fail-closed default; the opt-in modes click only the exact corresponding action and verify that the approval surface disappears. |
| `--browser-work-model <label>` | Select a model through Work's dedicated slider menu (advanced options -> Model). This is used only with `--browser-chatgpt-mode work` and never falls back to the Chat picker. This is a raw provider-label escape hatch; prefer semantic selectors for ordinary Chat runs. |
| `--browser-model-strategy <select\|current\|ignore>` | Control ChatGPT model selection in browser mode (`current` keeps the active model and records its observed picker label; `ignore` skips the picker). |
| `--browser-manual-login` | Skip cookie copy; reuse a persistent automation profile and wait for manual ChatGPT login. |
| `--browser-thinking-time <light\|standard\|extended\|heavy>` | Set ChatGPT effort intensity in browser mode. In the current horizontal Power slider, the four AuraCall levels map to Instant, Medium, High, and Extra High. `light`/Instant is default-effort intent: when the selected model exposes no separate effort control, AuraCall continues with the provider default and does not report a selected thinking time. Medium, High, and Extra High remain explicit higher-effort requests and fail before Send when their control is missing or ambiguous. Prefer `--model chatgpt:reasoning-high` or `--model chatgpt:reasoning-max`; provider-version spellings remain compatibility aliases. |
| `--browser-no-thinking-time` | Omit an inherited semantic-selector thinking depth for this browser run. This leaves the current provider depth untouched and conflicts with `--browser-thinking-time`. |
| `--browser-composer-tool <tool>` | Select a ChatGPT composer tool/add-on by durable ID, such as `chatgpt.commerce.shopping`, `chatgpt.search.web_search`, or `chatgpt.research.deep_research`; legacy labels remain aliases. File-source rows (`Add photos & files`, `Add from library`) are attachments and are rejected as tools. Deep Research is staged: AuraCall verifies the account tier, submits the prompt, waits for the provider plan, clicks only the Start CTA when available, records timed auto-starts, preserves review evidence in run metadata, and reads completed reports from the Deep Research iframe as Markdown, Word, and PDF conversation artifacts. Export-menu opening and exact Word/PDF selection run in separate short-lived iframe execution contexts so provider navigation cannot collect an awaited page-side Promise. A Word/PDF export counts as materialized only when a fresh file has the requested extension and matching DOCX/PDF binary signature; retained or wrong-variant files are preserved but reported as errors. |
| `--browser-deep-research-plan-action <start\|edit>` | Control ChatGPT Deep Research after the provider plan appears. `start` accepts the plan; `edit` opens the plan editor before the timed auto-start window, keeps the managed browser open, and stores review evidence including the iframe/DOM edit target and passive screenshot path. |
| `--browser-port <port>` | Force a fixed Chrome DevTools port (advanced/debugging). Normal WSL -> Windows launches default to auto-discovery instead. |
| `--browser-inline-cookies[(-file)] <payload|path>` | Supply cookies without Chrome/Keychain (browser). |
| `--browser-timeout`, `--browser-input-timeout` | Control overall/browser input timeouts (supports h/m/s/ms). |
| `--render`, `--copy` | Print and/or copy the assembled markdown bundle. |
| `--wait` | Block for background API runs (e.g., GPT‑5.1 Pro) instead of detaching. |
| `--write-output <path>` | Save only the final answer (multi-model adds `.<model>`). |
| `--files-report` | Print per-file token usage. |
| `--dry-run [summary\|json\|full]` | Preview without sending. |
| `--remote-host`, `--remote-token` | Use a remote `auracall serve` host (browser). |
| `--remote-chrome <host:port>` | Attach to an existing remote Chrome session (browser). From WSL, `windows-loopback:<port>` now relays to a Windows Chrome listening on Windows `127.0.0.1:<port>` without raw WSL->Windows CDP TCP. |
| `--youtube <url>` | YouTube video URL to analyze (Gemini browser mode). |
| `--generate-image <file>` | Legacy Gemini browser image shortcut that saves one file directly; prefer `auracall media generate` for durable media runs. |
| `--edit-image <file>` | Edit existing image with `--output` (Gemini browser mode). |
| `--azure-endpoint`, `--azure-deployment`, `--azure-api-version` | Target Azure OpenAI endpoints (picks Azure client automatically). |

For a long ChatGPT browser run, expiration of AuraCall's observation window is
not treated as model failure when the exact submitted generation has a visible
Stop control, including the brief interval before ChatGPT mounts the assistant
turn. Once mounted, non-empty assistant text remains positive progress evidence.
AuraCall retains the managed browser identity,
keeps the Session running with
`observation_expired_generation_active`, and allows `auracall session <id>` to
reattach read-only without resending the prompt. A physical refresh is reserved
for positively stale or interrupted observation and is limited to the same
conversation at most once per 15 minutes. Before reattachment or fallback
navigation, a validated final progress `/c/<id>` URL supersedes a stale
synthetic runtime route while the exact DevTools target and port stay fixed.

## Configuration

ChatGPT tool approval is always an operator preference. Use `allow-once` when
each detected tool call should receive only the current approval, or
`always-allow` when ChatGPT should persist approval for that third-party tool.
This consent is separate from connector OAuth authentication; seeing a tool
approval card does not mean the connector login expired. AuraCall assigns a
page-lifetime identity to the exact mounted approval card, so a clicked card
may be acknowledged when ChatGPT replaces it with an identical-looking next
card while one unchanged card remains protected from a second click.
AuraCall never upgrades `allow-once` to `always-allow`, never clicks `Answer
now`, and fails closed on incomplete or ambiguous approval surfaces. Before
the one allowed activation, AuraCall briefly settles and re-probes the same
exact surface, then focuses and invokes that exact verified DOM control under
a CDP user gesture. A changed or ambiguous surface receives no activation; one
that independently disappears needs no action.
The same preference can be stored as `browser.chatgptToolApproval` or on the
selected `services.chatgpt` entry.

Put defaults in `~/.auracall/config.json` (JSON5). Example:
```json5
{
  model: "gpt-5.1-pro",
  engine: "api",
  filesReport: true,
  handoff: {
    attachmentPackaging: {
      enabled: true,
      zipWhenFileCountExceeds: 10,
    },
  },
  browser: {
    chatgptUrl: "https://chatgpt.com/g/g-p-691edc9fec088191b553a35093da1ea8-oracle/project",
    chatgptToolApproval: "manual",
    // Opt-in guarded ChatGPT rollout; use "serialized" for immediate rollback.
    tabConcurrencyMode: "tab-affinity"
  }
}
```

Terminal-session receipts are disabled by default. Enable the provider-neutral
producer only with an explicit private allowed root:

```json5
{
  terminalSessionReceipts: {
    enabled: true,
    schemaVersion: 1,
    root: "auracall-home",
  },
}
```

`auracall-home` resolves to the owner-only
`~/.auracall/terminal-session-events` directory (or the matching
`AURACALL_HOME_DIR` location). An absolute custom root is also accepted when it
is normalized, owned by the current user, has no symlink in its path, and is
not accessible to group or other users. AuraCall persists an immutable result
file first, then terminal session metadata, then atomically publishes one
immutable `auracall.session.terminal` version-1 receipt. Receipts contain a
hashed session reference, relative result locator, digest, size, bounded
execution class, and bounded error code; they never contain prompts, response
bodies, credentials, or absolute result paths.

Inspect the sanitized root identity and delivery ledger with
`auracall terminal-receipts status`. Add `--session <id>` to verify the exact
session-to-receipt-to-result digest chain, or `--reconcile` to idempotently
publish receipts missing after a process crash. Publication failure is reported
separately and never changes the model outcome or retries provider work.

For event-driven agent continuation, the local API exposes the privacy-bounded
`GET /v1/terminal-receipts/{session_id}` observation. It remains `pending`
until the exact immutable receipt verifies, then reports `succeeded`, `error`,
or `cancelled`; receipt-integrity failures report `integrity_error`. Point a
`codex-wake http-json` source at this route, not the broader run-status route.
The complete one-request, one-wake, no-resubmit workflow—including exact
`wsl-chrome-3` provenance checks, hard stops, cancellation, connected-app, and
Library guidance—is in
[docs/codex-wake-chatgpt.md](docs/codex-wake-chatgpt.md).

Use `browser.chatgptUrl` (or the legacy alias `browser.url`) to target a specific ChatGPT workspace/folder for browser automation.
`tabConcurrencyMode` still defaults to `serialized`. When explicitly set to
`tab-affinity`, ChatGPT conversations, the live-follow crawler, and utility
work receive exact tabs while sharing aggregate interaction and provider-warning
guards. Inspect the sanitized posture in Browser Ops or with
`auracall api ops-browser-status --port <port>`. Roll back by restoring
`serialized` and restarting AuraCall; Gemini and Grok remain serialized.
The sanitized status separates target-action counts by workload so operators
can distinguish expected live-follow route traversal from conversation or
utility tab churn without exposing target or conversation identifiers.
Tab leases are heartbeat- and TTL-governed: maintenance reclaims expired active
ownership, retires expired idle tabs, and revisits lost leases until target
absence or an exact post-close census releases them. An uncertain provider
outcome remains durable no-retry evidence even after its tab lease retires.
The API enables this maintenance owner when affinity is selected either at the
root or by any resolved AuraCall runtime profile. Its aggregate
`/status.tabConcurrency` projection uses the same effective-mode rule, so a
serialized root does not hide shared affinity coordination selected by a
nested AuraCall runtime profile.
Serialized mode now also retains the same durable tab-lease and provider-
interaction safety stores used for traffic admission. It remains
concurrency-disabled (`enabled=false`); the stores exist so configured ChatGPT,
Gemini, and Grok browser actions cannot fall back to un-attributed provider
traffic. If AuraCall cannot establish the exact managed browser profile and tab
lease, it stops before the physical action.
See [docs/configuration.md](docs/configuration.md) for precedence and full schema.

For multiple ChatGPT workspaces, keep profile entries in `~/.auracall/config.json` and select one at runtime:

```json5
{
  defaultRuntimeProfile: "default",
  runtimeProfiles: {
    default: {
      services: {
        chatgpt: { url: "https://chatgpt.com/" },
      },
    },
    work: {
      services: {
        chatgpt: { url: "https://chatgpt.com/g/p-691edc9fec088191b553a35093da1ea8-oracle/project" },
      },
    },
    review: {
      services: {
        chatgpt: {
          projectId: "g-p-abcdef123456789", // no hardcoded URL needed
        },
      },
    },
  },
}
```

```bash
auracall --profile work --engine browser -p "Draft to share" --file notes.md
auracall --profile review --engine browser --project-name "Sprint Review Notes" -p "Clean this draft"
auracall --profile review --engine browser --project-id g-p-abcdef123456789 -p "Review this branch"
```

Project-name rule

- `--project-name` resolves and reuses an existing exact-name project when one
  is already visible from the provider list.
- `auracall projects create '<name>' --target <provider>` now refuses
  exact-name duplicates instead of creating a second project with the same
  display name.
- If you mean "create if missing", list or resolve first, then create only when
  no exact-name match exists.

Advanced flags

| Area | Flags |
| --- | --- |
| Browser | `--browser-manual-login`, `--browser-chatgpt-mode`, `--browser-work-model`, `--browser-thinking-time`, `--browser-composer-tool`, `--browser-deep-research-plan-action`, `--browser-timeout`, `--browser-input-timeout`, `--browser-cookie-wait`, `--browser-cookie-sync`, `--browser-inline-cookies[(-file)]`, `--browser-attachments`, `--browser-inline-files`, `--browser-bundle-files`, `--browser-keep-browser`, `--browser-headless`, `--browser-hide-window`, `--browser-no-cookie-sync`, `--browser-allow-cookie-errors`, `--browser-chrome-path`, `--browser-cookie-path`, `--browser-bootstrap-cookie-path`, `--chatgpt-url` |
| Azure/OpenAI | `--azure-endpoint`, `--azure-deployment`, `--azure-api-version`, `--base-url` |

Remote browser example
```bash
# Host (signed-in Chrome): launch serve
auracall serve --host 0.0.0.0:9473 --token secret123

# Client: target that host
auracall --engine browser --remote-host 192.168.1.10:9473 --remote-token secret123 -p "Run the UI smoke" --file "src/**/*.ts"

# If cookies can’t sync, pass them inline (JSON/base64)
auracall --engine browser --browser-inline-cookies-file ~/.auracall/cookies.json -p "Run the UI smoke" --file "src/**/*.ts"
```

Session management
```bash
# Prune stored sessions (default path ~/.auracall/sessions; override AURACALL_HOME_DIR)
auracall status --clear --hours 168
```

Team execution (bounded internal bridge)
```bash
# Execute one configured team through the internal runtime bridge
auracall teams run auracall-solo "Draft a concise runtime note"

# Machine-readable payload for inspection
auracall teams run auracall-solo "Reply exactly with: OK" --max-turns 1 --json

# Bounded two-step workflow on the same Grok project/runtime profile
auracall teams run auracall-two-step "Reply exactly with: OK" --max-turns 2 --json

# Bounded multi-agent planner-to-finisher workflow on the same Grok project/runtime profile
auracall teams run auracall-multi-agent "Reply exactly with: OK" --max-turns 2 --json

# Bounded tooling workflow with one allowed local shell action
auracall teams run auracall-tooling "Run one bounded node local shell action, then reply exactly with: OK" \
  --max-turns 2 \
  --allow-local-shell-command node \
  --allow-local-cwd-root /home/ecochran76/workspace.local/auracall \
  --json

# Require operator approval/cancellation before the bounded local action can proceed
auracall teams run auracall-tooling "Request one bounded node local shell action, then wait for operator approval/cancellation" \
  --max-turns 2 \
  --allow-local-shell-command node \
  --allow-local-cwd-root /home/ecochran76/workspace.local/auracall \
  --require-local-action-approval \
  --json

# Bounded ChatGPT team baseline on the managed wsl-chrome-2 browser profile
auracall teams run auracall-chatgpt-solo "Reply exactly with: OK" --max-turns 1 --json

# Bounded cross-service workflow: ChatGPT planner -> Grok finisher
auracall teams run auracall-cross-service "Reply exactly with: OK" --max-turns 2 --json

# Bounded cross-service workflow: ChatGPT planner -> Gemini finisher
auracall teams run auracall-cross-service-gemini "Reply exactly with: OK" --max-turns 2 --json

# Inspect persisted task assignment and linked runtime state
auracall teams inspect --task-run-spec-id taskrun_auracall-solo_abc123 --json
auracall teams inspect --team-run-id teamrun_auracall-solo_abc123 --json
auracall teams inspect --runtime-run-id teamrun_auracall-solo_abc123

# Review the whole persisted team-run sequence as a read-only ledger
auracall teams review --task-run-spec-id taskrun_auracall-solo_abc123 --json
auracall teams review --team-run-id teamrun_auracall-solo_abc123 --json
auracall teams review --runtime-run-id teamrun_auracall-solo_abc123
```

Current boundary:
- `auracall teams run` is a real CLI execution entrypoint and returns
  `taskRunSpecId`, `teamRunId`, `runtimeRunId`, step summaries, and shared
  state.
- `auracall teams inspect` is a bounded internal debug surface for persisted
  `taskRunSpec -> teamRun -> runtime` linkage. It reads one persisted task
  assignment plus the latest linked runtime dispatch state without widening
  public team execution semantics.
- `auracall teams review` is a bounded read-only review surface for the
  persisted team-run sequence. It projects steps, handoffs, artifacts,
  prompt/input snapshots, output snapshots, failures, and provider
  conversation refs when existing runtime metadata carries them. Provider refs
  include stored conversation id, tab URL, configured URL, project id, runtime
  profile id, browser profile id, agent id, and selected model when available.
  Missing provider refs are reported as `null`; provider cache paths are only
  reported when stored metadata already carries a concrete path.
- Review observations now include:
  - durable failure-derived hard stops for provider error, login required,
    captcha/human-verification, and awaiting human action
  - stored ChatGPT passive observations for `thinking`,
    `response-incoming`, and `response-complete` when the browser execution
    path emits them
  - stored Gemini passive observations for `thinking`,
    `response-incoming`, and `response-complete` when the Gemini executor path
    or browser-native attachment path emits them
  - stored Grok passive observations for `thinking`,
    `response-incoming`, and `response-complete` when the Grok browser
    execution path emits them
  - on the current managed WSL Chrome path, ChatGPT `thinking` is most
    reliably evidenced by the placeholder assistant turn
    `ChatGPT said:Thinking`; generic status-node scans remain supplemental
- Gemini observations currently derive from Gemini-owned executor evidence, not
  ChatGPT-style DOM heuristics:
  - web executor: returned thoughts/text/images plus successful completion
  - browser-native attachment path: prompt committed, answer first visible,
    answer stabilized
- Grok observations currently derive from Grok’s own assistant-result
  lifecycle:
  - prompt submitted
  - first new assistant content visible
  - stabilized result returned
- Rich passive monitoring is still provider-path scoped. The provider-parity
  slice is implemented; broader monitoring remains a later checkpoint.
- Browser-backed team execution is now provider-backed on the stored-step seam.
- The current live smoke target is:
  - `auracall teams run auracall-solo "Reply exactly with: AURACALL_TEAM_SMOKE_OK" --title "AuraCall team smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_TEAM_SMOKE_OK and nothing else." --max-turns 1 --json`
- The current ChatGPT team baseline target is:
  - `auracall teams run auracall-chatgpt-solo "Reply exactly with: AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK" --title "AuraCall ChatGPT team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK and nothing else." --max-turns 1 --json`
- The current cross-service live target is:
  - `auracall teams run auracall-cross-service "Reply exactly with: AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK" --title "AuraCall cross-service team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
- The current cross-service Gemini live target is:
  - `auracall teams run auracall-cross-service-gemini "Reply exactly with: AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK" --title "AuraCall cross-service Gemini team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
- The current broader-workflow live target is:
  - `auracall teams run auracall-two-step "Reply exactly with: AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK" --title "AuraCall two-step team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
- The current multi-agent live target is:
  - `auracall teams run auracall-multi-agent "Reply exactly with: AURACALL_MULTI_AGENT_LIVE_SMOKE_OK" --title "AuraCall multi-agent team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_MULTI_AGENT_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
- The current bounded tooling live target is:
  - `auracall teams run auracall-tooling "Run one bounded node local shell action that emits AURACALL_TOOL_ACTION_OK, then reply exactly with: AURACALL_TOOL_TEAM_LIVE_SMOKE_OK" --title "AuraCall tooling team live smoke" --prompt-append "For the tool envelope, use a top-level localActionRequests array with exactly one shell action. Preserve the provided toolEnvelope unchanged. Use kind \"shell\" and command \"node\". Use args [\"-e\",\"process.stdout.write('AURACALL_TOOL_ACTION_OK')\"]. Use structuredPayload {\"cwd\":\"/home/ecochran76/workspace.local/auracall\"}. After the local action succeeds, the final answer must be exactly AURACALL_TOOL_TEAM_LIVE_SMOKE_OK." --max-turns 2 --allow-local-shell-command node --allow-local-cwd-root /home/ecochran76/workspace.local/auracall --json`
- Gemini-bound team experimentation is now also live on the same stored-step seam:
  - `auracall teams run auracall-gemini-tooling "Use the provided toolEnvelope structured context to request one bounded shell action, then use the resulting tool outcome to return the provided finalToken exactly." --title "AuraCall Gemini tooling team live smoke" --prompt-append "Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must output only the final token after a successful executed tool outcome." --structured-context-json '{"toolEnvelope":{"kind":"shell","summary":"Run one bounded deterministic node command","command":"node","args":["-e","process.stdout.write('\''AURACALL_TOOL_ACTION_OK'\'')"],"structuredPayload":{"cwd":"/home/ecochran76/workspace.local/auracall"}},"finalToken":"AURACALL_GEMINI_TOOL_TEAM_SMOKE_OK"}' --max-turns 2 --allow-local-shell-command node --allow-local-cwd-root /home/ecochran76/workspace.local/auracall --json`
  - on this WSL Chrome pairing, stored Gemini team execution may need exported cookies first:
    - `pnpm tsx bin/auracall.ts login --target gemini --profile auracall-gemini-pro --export-cookies`
  - stored Gemini team execution now reuses the same scoped/home exported-cookie fallback as direct Gemini browser mode when Linux keyring cookie reads return no Google auth cookies
- Current expected live result:
  - `runtimeSourceKind = "team-run"`
  - `runtimeRunStatus = "succeeded"`
  - `runtimeProfileId = "auracall-grok-auto"`
  - `browserProfileId = "default"`
  - `service = "grok"`
  - `finalOutputSummary = "AURACALL_TEAM_SMOKE_OK"`
- Current expected broader-workflow result:
  - two ordered steps succeed on the same Grok runtime profile
  - durable shared state records consumed-transfer evidence for step 2
  - `finalOutputSummary = "AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK"`
- Current expected ChatGPT team baseline result:
  - `runtimeSourceKind = "team-run"`
  - `runtimeRunStatus = "succeeded"`
  - `runtimeProfileId = "wsl-chrome-2"`
  - `browserProfileId = "wsl-chrome-2"`
  - `service = "chatgpt"`
  - `finalOutputSummary = "AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK"`
- Current expected cross-service result:
  - two ordered steps succeed across different providers
  - step 1 resolves to:
    - `runtimeProfileId = "wsl-chrome-2"`
    - `browserProfileId = "wsl-chrome-2"`
    - `service = "chatgpt"`
  - step 2 resolves to:
    - `runtimeProfileId = "auracall-grok-auto"`
    - `browserProfileId = "default"`
    - `service = "grok"`
  - durable recovery/response readback both show:
    - non-empty orchestration timeline
    - at least one `handoff-consumed` item
  - `finalOutputSummary = "AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK"`
- Current expected cross-service Gemini result:
  - two ordered steps succeed across different providers
  - step 1 resolves to:
    - `runtimeProfileId = "wsl-chrome-2"`
    - `browserProfileId = "wsl-chrome-2"`
    - `service = "chatgpt"`
  - step 2 resolves to:
    - `runtimeProfileId = "auracall-gemini-pro"`
    - `browserProfileId = "default"`
    - `service = "gemini"`
  - durable recovery/response readback both show:
    - non-empty orchestration timeline
    - at least one `handoff-consumed` item
  - `finalOutputSummary = "AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK"`
- Current expected multi-agent result:
  - two ordered steps succeed on the same Grok runtime profile
  - the planner step hands off to the finisher step
  - durable shared state records consumed-transfer evidence for step 2
  - `finalOutputSummary = "AURACALL_MULTI_AGENT_LIVE_SMOKE_OK"`
- Current expected tooling result:
  - two ordered steps succeed on the same Grok runtime profile
  - the first step emits only a bounded `localActionRequests` JSON envelope
  - the allowed `node` local shell action executes under the declared cwd root
  - shared state records:
    - `local shell action executed: node`
    - local action outcome summary for the tool step
  - `finalOutputSummary = "AURACALL_TOOL_TEAM_LIVE_SMOKE_OK"`
- Current tooling-test boundary:
  - manual provider-backed CLI proof is green
  - the automated tooling live case remains separately gated behind
    `AURACALL_TOOLING_LIVE_TEST=1`
  - keep the stable Grok baseline on `AURACALL_LIVE_TEST=1` only until the
    Grok tool-envelope path is deterministic enough to stop flaking
- Important browser-profile rule:
  - when a runtime profile points at an existing managed browser profile via
    `manualLoginProfileDir`, Aura-Call now follows the owning browser family
    for managed-profile resolution instead of minting a fresh runtime-profile-
    namespaced browser directory.
- Important Grok testing guard:
  - Grok browser-backed runs now persist one bounded per-managed-browser-profile
    cooldown/spacing record under `~/.auracall/cache/providers/grok/__runtime__`
  - repeated Grok test runs may now:
    - auto-wait briefly
    - or fail fast with a visible `Grok rate limit cooldown active until ...`
      / `Grok write spacing active until ...` message
  - visible provider toasts such as:
    - `Query limit reached for Auto`
    - `Try again in 4 minutes`
    are now treated as real Grok cooldown signals instead of timing out as
    generic browser failures
  - this is intentional and is meant to reduce self-inflicted live-test churn
    during repeated browser/team runs

## More docs
- Browser mode & forks: [docs/browser-mode.md](docs/browser-mode.md) (includes `auracall serve` remote service), [docs/chromium-forks.md](docs/chromium-forks.md), [docs/linux.md](docs/linux.md)
- MCP: [docs/mcp.md](docs/mcp.md)
- OpenAI/Azure/OpenRouter endpoints: [docs/openai-endpoints.md](docs/openai-endpoints.md), [docs/openrouter.md](docs/openrouter.md)
- Manual smokes: [docs/manual-tests.md](docs/manual-tests.md)
- Testing: [docs/testing.md](docs/testing.md)
  - the live suite is intentionally tiered into:
    - stable baseline
    - extended matrix
    - flaky-but-informative probes
  - use the stable baseline for routine confidence and keep the broader
    provider/operator matrix opt-in
  - current routine baseline command:
    - `pnpm run test:live:team:baseline`

If you’re looking for an even more powerful context-management tool, check out https://repoprompt.com  
Name inspired by: https://ampcode.com/news/oracle

## More free stuff from steipete
- ✂️ [Trimmy](https://trimmy.app) — “Paste once, run once.” Flatten multi-line shell snippets so they paste and run.
- 🟦🟩 [CodexBar](https://codexbar.app) — Keep Codex token windows visible in your macOS menu bar.
- 🧳 [MCPorter](https://mcporter.dev) — TypeScript toolkit + CLI for Model Context Protocol servers.

The dedicated desktop client uses Remote View’s native toolbar. Its view-only/interactive switch pauses AuraCall before enabling input and confirms release before resuming automation. Two minutes without actual input returns to view only. Wake opens the provider page only when the owned browser has no nonblank pages.

The desktop client uses the left rail for navigation, grouping and browser actions. Close ends the selected AuraCall-owned browser while retaining its desktop and managed browser data; its runtime profiles become dormant and can be woken again. API service restarts preserve managed browsers.

The desktop mode switch retains the native viewer page and its settings while
changing between observation and control. Only the authorized desktop transport
reconnects. Input remains blocked during the change, and AuraCall resumes
automation only after control-grant revocation is confirmed.

Open the AuraCall root URL to reach the console, then select **Desktops** to open the browser client. Console, operator dashboard and desktop client share AuraCall's glowing halo favicon.
