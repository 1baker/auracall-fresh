# Browser Mode

ChatGPT file uploads require a verified local-file action or one unambiguous
visible composer with a visible editor and attachment trigger. When menu labels
change, inactive or ambiguous composers are rejected; a hidden native file input
is still valid. If the trigger declares which popover it controls, that popover
must match.

ChatGPT handoffs without a model selector keep the current model. An explicit
semantic selector selects the requested model and thinking effort.

Aura-Call’s `--engine browser` supports three different execution paths:

- **ChatGPT automation** (GPT-* models): drives the ChatGPT web UI with Chrome automation.
- **Gemini web mode** (Gemini models): talks directly to `gemini.google.com` using your signed-in Chrome cookies (no ChatGPT automation).
- **Grok automation** (Grok models): drives the Grok web UI with Chrome automation.

If you’re running Gemini, also see `docs/gemini.md`.
If you’re running ChatGPT browser automation from WSL, see `docs/wsl-chatgpt-runbook.md` for the WSL Chrome setup and DevTools host override.

`auracall --engine browser` routes the assembled prompt bundle through the provider web UI instead of the Responses/API path. (Legacy `--browser` still maps to `--engine browser`, but it will be removed.) If you omit `--engine`, Aura-Call first honors the active `auracallProfile` defaults in `~/.auracall/config.json`, then auto-picks API when `OPENAI_API_KEY` is available and falls back to browser otherwise. The CLI writes the same session metadata/logs as API runs, and local browser automation now runs against persistent Aura-Call-managed Chrome profiles under `~/.auracall/browser-profiles/<auracallProfile>/<service>`.

`--preview` now works with `--engine browser`: it renders the composed prompt, lists which files would be uploaded vs inlined, and shows the bundle location when bundling is enabled, without launching Chrome.

## Quick example: browser mode with custom cookies

```bash
# Minimal inline-cookies flow: keep ChatGPT logged in without Keychain
jq '.' ~/.auracall/cookies.json  # file must contain CookieParam[]
auracall --engine browser \
  --browser-inline-cookies-file ~/.auracall/cookies.json \
  --model "GPT-5.2 Pro" \
  -p "Run the UI smoke" \
  --file "src/**/*.ts" --file "!src/**/*.test.ts"
```

`~/.auracall/cookies.json` should be a JSON array shaped like:

```json
[
  { "name": "__Secure-next-auth.session-token", "value": "<token>", "domain": "chatgpt.com", "path": "/", "secure": true, "httpOnly": true },
  { "name": "_account", "value": "personal", "domain": "chatgpt.com", "path": "/", "secure": true }
]
```

You can pass the same payload inline (`--browser-inline-cookies '<json or base64>'`) or via env (`AURACALL_BROWSER_COOKIES_JSON`, `AURACALL_BROWSER_COOKIES_FILE`). Cloudflare cookies (`cf_clearance`, `__cf_bm`, etc.) are only needed when you hit a challenge.

## Current Pipeline

1. **Prompt assembly** – we reuse the normal prompt builder (`buildPrompt`) and the markdown renderer. Browser mode pastes the system + user text (no special markers) into the ChatGPT composer and, by default, pastes resolved file contents inline until the total pasted content reaches ~60k characters (then switches to uploads).
2. **Automation stack** – code lives in `src/browserMode.ts` and is a lightly refactored version of the `oraclecheap` utility:
   - Launches Chrome via `chrome-launcher` and connects with `chrome-remote-interface`.
   - (Optional) copies cookies from the requested browser profile via Aura-Call’s built-in cookie reader (Keychain/DPAPI aware) so you stay signed in.
   - Navigates to `chatgpt.com`, selects the exact `Chat`/`Work` composer radio, applies the mode-specific model contract, pastes the prompt, waits for completion, and copies the markdown via the built-in “copy turn” button. `Chat` is the default; `Work` is never inherited accidentally from browser state.
   - Immediately probes `/backend-api/me` in the ChatGPT tab to verify the session is authenticated; if the endpoint returns 401/403 we abort early with a login-specific error instead of timing out waiting for the composer.
   - When `--file` inputs would push the pasted composer content over ~60k characters, we switch to uploading attachments (optionally bundled) and wait for ChatGPT to re-enable the send button before submitting the combined system+user prompt.
   - Reuses Aura-Call’s managed browser profile for the active profile/service instead of launching a throwaway Chrome profile.
   - For stored/API ChatGPT browser runs, each dispatched prompt opens one
     dedicated Chrome target. Multiple runs may share the same AuraCall runtime
     profile, but each running prompt remains bound to its own tab while passive
     DOM probes report thinking/streaming/completion evidence. The profile-wide
     mutation lock is held through launch, navigation, prompt insertion, and
     send only; after the prompt is dispatched, response-batch drains may start
     another browser-backed run on the same runtime profile, which gets its own
     target. Passive DOM lease evidence is accepted only from the current
     submitted conversation target; if that target navigates to Library, root,
     project, or another conversation, the run fails with a target-mismatch
     diagnostic instead of renewing indefinitely. API run summaries include the
     `chromeTargetId` so operators can confirm the one-running-prompt-per-tab
     boundary after completion.
3. **Session integration** – browser sessions use the normal log writer, add `mode: "browser"` plus `browser.config/runtime/context` metadata, and log the Chrome PID/port so `auracall session <id>` (or `auracall status <id>`) shows a marker for the background Chrome process. The context records provider/project/conversation IDs plus any resolved names and cache profile key.
4. **Usage accounting** – we estimate input tokens with the same tokenizer used for API runs and estimate output tokens via `estimateTokenCount`. `auracall status` therefore shows comparable cost/timing info even though the call ran through the browser.

### CLI Options

- `--engine browser`: enables browser mode (legacy `--browser` remains as an alias for now). Without `--engine`, Aura-Call chooses API when `OPENAI_API_KEY` exists, otherwise browser.
- `--chatgpt`: shorthand for `--engine browser --model chatgpt:fast` (ChatGPT automation).
- `--gemini`: shorthand for `--engine browser --model gemini-3-pro` (Gemini web mode).
- `--gemini-url`: override the Gemini web URL (e.g., a specific Gem).
- `--grok-url`: override the Grok web URL (e.g., a project link like `https://grok.com/project/<id>`).
- `--browser-target`: explicitly select the browser automation target
  (`chatgpt`, `gemini`, or `grok`). When the chosen model identifies a provider,
  it must agree with this target; AuraCall fails before browser work on a
  mismatch. Pair bounded commands with an explicit compatible `--model`.
- `--project-id` / `--conversation-id`: override the browser run scope without changing the configured default URL. Conversation takes precedence over project; both are optional.
- `auracall login --target gemini`: opens the configured browser profile for Gemini sign-in (useful when cookies are missing).
  - if the managed Gemini page lands on `google.com/sorry`, CAPTCHA,
    reCAPTCHA, Cloudflare, or another human-verification surface, the command
    now exits nonzero with manual-clear guidance instead of treating that as a
    successful ordinary login result
- Stored/API ChatGPT browser runs do not wait for interactive login. If the
  managed ChatGPT page shows `Log in` or otherwise probes as signed out, the
  run fails fast with auth recovery guidance and an auth-mode command such as
  `auracall --profile <name> login --target chatgpt`. API readback exposes the
  same machine-readable recovery fields under
  `metadata.executionSummary.failureSummary.details`.
- Root, detached, and setup-verification ChatGPT browser runs derive canonical
  provider-session authorization from the selected AuraCall runtime profile,
  browser profile, and configured ChatGPT account identity. Authorization is
  attached only at the browser execution boundary: it is not persisted in
  session metadata, and the browser-config diagnostic exposes only presence/
  source fields rather than serializing the authority's configured identity.
  Existing account-preflight diagnostics may separately report observed login
  identity. Missing or conflicting configured identity still fails before
  attachment upload or prompt submission.
- `auracall login --target grok`: opens the configured browser profile for Grok sign-in.
- `auracall wizard`: guided first-run onboarding. It detects candidate local/WSL/Windows Chromium profiles, writes a profile-scoped Aura-Call config entry, then runs the same managed-profile setup flow described below. On WSL, prefer the WSL Chrome path first unless you are intentionally testing the Windows relay path; for the primary WSL setup, keep that profile on Aura-Call `default`.
- `auracall setup --target <chatgpt|gemini|grok>`: inspect the managed Aura-Call profile, open the managed login browser when needed, then send a real verification prompt through that same profile. Use `--skip-login` when the managed profile is already signed in and `--skip-verify` when you only want inspection/bootstrap.
  - setup now also stops early if the selected managed page is already on a
    blocking surface that requires human clearance
- `auracall profile identity-smoke --target <chatgpt|gemini|grok> [--include-negative] [--json]`: inspect the selected AuraCall runtime profile's bound service identity against the live managed browser account without submitting a prompt. Use `--all-bound` as the normal dogfood gate for every service that has an expected identity configured on the selected profile; use `--all` only when intentionally checking unbound services too. By default it launches the managed browser only when no live DevTools session is registered; add `--no-launch-if-needed` for a passive check. Gemini identity checks wait briefly for the hydrated Google Account label before failing as unknown.
- `--browser-bootstrap-cookie-path`: use a different Chrome/Chromium cookie DB as the managed-profile bootstrap source without changing the runtime browser selection. This is the right flag for “run WSL Chrome, but seed Aura-Call from Windows Brave/Chrome/Edge.”
- `--force-reseed-managed-profile`: rebuild the managed Aura-Call profile from the configured source Chrome profile before opening login/setup. Without this flag, `auracall login` and `auracall setup` are non-destructive: they can bootstrap an empty managed profile but will not delete/reseed an existing one.
- `--browser-chrome-profile`, `--browser-chrome-path`: cookie source + binary override (defaults to the standard `"Default"` Chrome profile so existing ChatGPT logins carry over).
  - `--browser-cookie-path`: explicit path to the Chrome/Chromium/Edge `Cookies` SQLite DB. Handy when you launch a fork via `--browser-chrome-path` and want to copy its session cookies; see [docs/chromium-forks.md](chromium-forks.md) for examples.
- `--project-name` / `--conversation-name`: resolve browser project/conversation by cached name before starting a run. `--conversation-name` also accepts selectors like `latest` or `latest-1`.
- `--chatgpt-url`: override the ChatGPT base URL. Works with the root homepage (`https://chatgpt.com/`) **or** a specific workspace/folder link such as `https://chatgpt.com/g/.../project`. `--browser-url` stays as a hidden alias.
- `--browser-timeout`, `--browser-input-timeout`: `7200s (2h)`/`30s` defaults. Durations accept `ms`, `s`, `m`, or `h` and can be chained (`1h2m10s`). The long browser timeout is intentional for Extended/Pro/Deep Research materialization; callers should submit asynchronously and poll `GET /v1/runs/{run_id}/status` or MCP `run_status`.
- `--browser-chatgpt-mode <chat|work>`: select the ChatGPT composer mode. Omitted values resolve to `chat`. AuraCall prefers an exact visible radio or compact menu control; an established conversation may instead prove Chat through its visible, enabled ChatGPT prompt editor only when no mode control or Work marker is present. Work always requires explicit UI proof and fails closed when unavailable.
- `--browser-work-model <label>`: request a model through Work's dedicated model-selection surface. AuraCall never sends this value to Chat's picker. Without this flag, Work preserves its current model; if a named Work selector cannot be found, the run fails closed.
- `--browser-model-strategy <select|current|ignore>`: control ChatGPT model selection. `select` (default) switches to the requested model; `current` keeps the active model and logs its label; `ignore` skips the picker entirely. (Ignored for Gemini web runs.)
- `--browser-thinking-time <light|standard|extended|heavy>`: set Chat mode's thinking-time intensity. It is not applied in Work mode because Work has a separate model system. You can also set a default in `~/.auracall/config.json` via `profiles.<name>.browser.thinkingTime` (legacy `browser.thinkingTime` still works).
- `--browser-no-thinking-time`: omit any inherited semantic-selector thinking depth for one run, leaving the current provider depth untouched. It cannot be combined with `--browser-thinking-time`.
  - preferred long-term config surface:
    - `runtimeProfiles.<name>.services.<service>.thinkingTime`
  - legacy root `browser.thinkingTime` remains supported as transitional input
    because current CLI/browser authoring still exposes that layer
- `--browser-port <port>` (alias: `--browser-debug-port`; env: `AURACALL_BROWSER_PORT`/`AURACALL_BROWSER_DEBUG_PORT`): force a fixed DevTools port. This is now an advanced/debugging override. When Aura-Call launches a local browser normally, it still honors `browser.debugPort`/`browser.debugPortRange`; but for integrated WSL -> Windows Chrome launches the default strategy is now `auto`, which means Chrome is launched with `--remote-debugging-port=0`, Aura-Call reads `DevToolsActivePort`, and then adopts the real live endpoint. Use `browser.debugPortStrategy: "fixed"` (or `AURACALL_BROWSER_PORT_STRATEGY=fixed`) only when you intentionally need a pinned port.
- If you want Aura-Call to share an already-running Chrome profile, that Chrome must have been launched with `--remote-debugging-port`. Otherwise Aura-Call cannot attach to it. This is less safe than a dedicated Aura-Call profile because any local user/process can control the browser via that port.
  - Linux/macOS: `ps -ax | rg \"chrome.*remote-debugging-port\"` or `tr \"\\0\" \" \" < /proc/<pid>/cmdline | rg remote-debugging-port` to discover the active port.
  - Windows: `wmic process where \"name='chrome.exe'\" get ProcessId,CommandLine` or `Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe'\" | Select-Object ProcessId,CommandLine` to find the port flag.
- `--browser-blocking-profile <fail|restart|restart-managed>`: choose what happens if Chrome is already running with the target profile but DevTools is not enabled. `restart-managed` (default) only restarts Aura-Call-managed profiles. (`restart-auracall` remains a supported alias.)
- `--browser-cookie-sync` explicitly copies cookies from a source browser profile into the managed browser profile. Copying is off by default because provider token rotation in the managed browser can invalidate the source browser session. Prefer signing in once in the managed browser profile or supply `--browser-bootstrap-cookie-path` when that one-time copy is intentional. `--browser-no-cookie-sync` remains a compatibility override for stored configurations that enable copying.
- `--browser-manual-login` (persistent automation profile + user-driven login), `--browser-headless`, `--browser-hide-window`, `--browser-keep-browser`, and the global `-v/--verbose` flag provide launch controls and diagnostics. An explicit `--browser-headless` is honored for a locally launched browser; visible/headful remains the safer default when human verification may be required. For `--remote-chrome`, AuraCall does not launch the browser, so local launch flags remain ignored as documented below.
- `--browser-url`: override ChatGPT base URL if needed.
- `--browser-attachments <auto|never|always>`: control how `--file` inputs are delivered in browser mode. Default `auto` pastes file contents inline up to ~60k characters and switches to uploads above that.
- `--browser-inline-files`: alias for `--browser-attachments never` (forces inline paste; never uploads attachments).
- `--browser-bundle-files`: bundle all resolved attachments into a single temp file before uploading (only used when uploads are enabled/selected).
- `--force`: bypass the duplicate prompt guard if an identical prompt is already running. This does not control conversation reuse (a separate policy will handle reuse vs new conversation).
- sqlite bindings: automatic rebuilds now require `AURACALL_ALLOW_SQLITE_REBUILD=1`. Without it, the CLI logs instructions instead of running `pnpm rebuild` on your behalf.
- `--model`: the same flag used for API runs is accepted. For ChatGPT browser automation, prefer `chatgpt:fast`, `chatgpt:reasoning`, `chatgpt:reasoning-high`, `chatgpt:reasoning-max`, `chatgpt:premium`, or `chatgpt:legacy`. `chatgpt:premium` targets the current `6 Pro` UI label while retaining `gpt-6-astra` as its API identity; browser run metadata records the observed picker label separately. GPT-5.2 and Sol/Terra/Luna spellings remain compatibility inputs. Grok automation defaults to `grok-4.20` / `grok` and still accepts explicit legacy `grok-4.1` values through the Grok model picker.
- Source browser profile cookie copying is opt-in. When enabled with
  `--browser-cookie-sync`, failure to copy still fails closed unless the hidden
  `--browser-allow-cookie-errors` escape hatch is intentionally supplied.
  Existing cookies in the managed browser profile are reused without reading
  or modifying the source browser profile.
- Experimental cookie controls (hidden flags/env):
  - `--browser-cookie-names <comma-list>` or `AURACALL_BROWSER_COOKIE_NAMES`: allowlist which cookies to sync. Useful for “only NextAuth/Cloudflare, drop the rest.”
  - `--browser-cookie-wait <ms|s|m>`: if cookie sync fails or returns no cookies, wait once and retry (helps when macOS Keychain prompts are slow).
  - `--browser-inline-cookies <jsonOrBase64>` or `AURACALL_BROWSER_COOKIES_JSON`: skip Chrome/keychain and set cookies directly. Payload is a JSON array of DevTools `CookieParam` objects (or the same, base64-encoded). At minimum you need `name`, `value`, and either `url` or `domain`; we infer `path=/`, `secure=true`, `httpOnly=false`.
  - `--browser-inline-cookies-file <path>` or `AURACALL_BROWSER_COOKIES_FILE`: load the same payload from disk (JSON or base64 JSON). If no args/env are provided, Aura-Call also auto-loads `~/.auracall/cookies.json` or `~/.auracall/cookies.base64` when present.
  - Practical minimal set that keeps ChatGPT logged in and avoids the workspace picker: `__Secure-next-auth.session-token` (include `.0`/`.1` variants) and `_account` (active workspace/account). Cloudflare proofs (`cf_clearance`, `__cf_bm`/`_cfuvid`/`CF_Authorization`/`__cflb`) are only needed when a challenge is active. In practice our allowlist pulls just two cookies (session token + `_account`) and works; add the Cloudflare names if you hit a challenge.
  - Inline payload shape example (we ignore extra fields like `expirationDate`, `sameSite`, `hostOnly`):  
    ```json
    [
      { "name": "__Secure-next-auth.session-token", "value": "<token>", "domain": "chatgpt.com", "path": "/", "secure": true, "httpOnly": true, "expires": 1771295753 },
      { "name": "_account", "value": "personal", "domain": "chatgpt.com", "path": "/", "secure": true, "httpOnly": false, "expires": 1770702447 }
    ]
    ```

All options are persisted with the session so reruns (`auracall exec <id>`) reuse the same automation settings.

### Provider discovery (experimental)

- `auracall projects`: list available projects/workspaces (provider must implement it; currently scaffolding only).
- `auracall projects [--refresh]`: list browser projects/workspaces (use `--refresh` to force a cache update).
- `auracall projects files list <id>`: list files for a project/workspace.
- `auracall projects files add <id> -f <paths...>`: upload files to a project/workspace.
- `auracall projects files remove <id> <file...>`: remove files from a project/workspace.
- `auracall cache [--provider <chatgpt|gemini|grok>] [--refresh] [--include-history] [--include-project-only-conversations] [--history-limit <count>] [--history-since <date>]`: show cached project/conversation lists with timestamps and stale status; `--refresh` updates the cache for the active provider.
  - conversation cache rows now also expose `inventorySummary` with aggregated `conversationCount`, `messageCount`, `sourceCount`, `fileCount`, and `artifactCount`
- `auracall cache export --scope <projects|conversations|conversation|contexts> --format <json|md|html|csv|zip> [--project-id <id>] [--conversation-id <id>] [--output <path>]`: export cached data to a directory or zip file.
  - conversation/context markdown and HTML exports now distinguish:
    - `Files`: user/provider-supplied files referenced in the conversation context
    - `Artifacts`: provider/model output artifacts discovered from the conversation
  - conversation/context CSV exports now include `sourceCount`, `fileCount`, and `artifactCount`
  - conversation-list CSV exports now also include `messageCount`, `sourceCount`, `fileCount`, and `artifactCount` via the shared cache inventory seam
- `auracall cache context list [--provider <chatgpt|gemini|grok>]`: list cached context IDs for agent/tooling use.
- `auracall cache context get <id> [--provider <chatgpt|gemini|grok>] [--output <path>]`: read one cached context (by ID or cached title) without browser scraping.
- `auracall cache context search <query> [--provider <chatgpt|gemini|grok>] [--conversation-id <id>] [--role <user|assistant|system|source>] [--limit <count>]`: keyword-search cached context chunks (messages + sources).
- `auracall cache context semantic-search <query> [--provider <chatgpt|gemini|grok>] [--model <embedding-model>] [--max-chunks <count>] [--min-score <value>] [--openai-api-key <key>] [--openai-base-url <url>]`: semantic search over cached contexts using OpenAI embeddings.
- `auracall cache sources list [--provider <chatgpt|gemini|grok>] [--conversation-id <id>] [--domain <domain>] [--source-group <group>] [--query <text>] [--limit <count>]`: list normalized source links from the cache catalog (SQL-first, JSON fallback).
- `auracall cache artifacts list [--provider <chatgpt|gemini|grok>] [--conversation-id <id>] [--kind <download|canvas|generated|image|spreadsheet>] [--query <text>] [--limit <count>]`: list normalized artifact rows from the cache catalog (SQL-first, JSON fallback).
- `auracall cache files list [--provider <chatgpt|gemini|grok>] [--conversation-id <id>] [--project-id <id>] [--dataset <...>] [--query <text>] [--resolve-paths] [--limit <count>]`: list normalized file bindings from the cache catalog (SQL-first, JSON fallback).
- `auracall cache files resolve [--provider <chatgpt|gemini|grok>] [--conversation-id <id>] [--project-id <id>] [--dataset <...>] [--query <text>] [--missing-only] [--limit <count>]`: resolve cached file pointers and classify each binding as `local_exists`, `missing_local`, `external_path`, `remote_only`, or `unknown`.
- `auracall features --target <chatgpt|gemini|grok> [--json]`: discover the
  live provider tool/mode/toggle surface from the managed browser session.
- `auracall features snapshot --target <chatgpt|gemini|grok> [--json]`: save a
  live feature snapshot under `~/.auracall/feature-snapshots/<auracallProfile>/<provider>/`.
- `auracall features diff --target <chatgpt|gemini|grok> [--json]`: compare
  the current live provider feature surface against the latest saved snapshot.
- `auracall cache doctor [--provider <chatgpt|gemini|grok>] [--identity-key <key>] [--strict] [--json]`: run cache integrity checks (SQLite `quick_check`, expected table presence, missing local file pointers, and aggregated conversation inventory summary).
- `auracall cache clear [--provider <chatgpt|gemini|grok>] [--identity-key <key>] [--dataset <name>] [--older-than <date>] [--include-blobs] [--yes] [--json]`: clear cached datasets; entries now include `inventoryBefore` and `inventoryAfter` so operator reports show the conversation/message/source/file/artifact effect of the mutation.
- `auracall cache cleanup [--provider <chatgpt|gemini|grok>] [--identity-key <key>] [--older-than <date> | --days <n>] [--include-blobs] [--yes] [--json]`: cleanup stale cache entries/files; entries now also include `inventoryBefore` and `inventoryAfter`.
- `auracall cache repair [--provider <chatgpt|gemini|grok>] [--identity-key <key>] [--actions <list>] [--apply --yes] [--json]`: run cache repair actions (default dry-run). Supported actions include `sync-sql`, `rebuild-index`, `prune-orphan-assets`, `prune-orphan-source-links`, `prune-orphan-file-bindings`, `prune-orphan-artifact-bindings`, and `mark-missing-local`.
- `auracall cache clear [--provider <chatgpt|gemini|grok>] [--identity-key <key>] [--dataset <...>] [--older-than <date>] [--include-blobs] [--yes] [--json]`: clear selected cache datasets (dry-run by default).
- `auracall cache compact [--provider <chatgpt|gemini|grok>] [--identity-key <key>] [--json]`: run SQLite `VACUUM + ANALYZE + optimize` on cache DBs.
- `auracall cache cleanup [--provider <chatgpt|gemini|grok>] [--identity-key <key>] [--older-than <date>|--days <n>] [--include-blobs] [--yes] [--json]`: clean stale cache files/rows, prune stale cache-index entries, and prune old backups (dry-run by default; `--days` defaults to `365` unless profile cache `cleanupDays` overrides it).
- `auracall session <id> --open-conversation [--print-url] [--browser-path <path>] [--browser-profile <name>]`: open the provider conversation linked to a stored session (uses the saved context, not the cache). Use `--print-url` to emit the URL only, `--browser-path` to override the browser binary, and `--browser-profile` to override the profile directory.
- `auracall conversations [--project-id <id>] [--project-name <name>] [--conversation-name <name>] [--include-history] [--history-limit <count>] [--history-since <date>] [--filter <text>] [--refresh]`: list conversations for a provider (uses the registry or `AURACALL_BROWSER_PORT`, and spawns a manual-login Chrome session when no DevTools target is available). Use `--include-history` if you want the History dialog opened to pull older conversations; use `--history-limit` (default `2000`) and/or `--history-since` to scroll deeper; use `--filter` to match title/id text; use `--refresh` to force cache updates.
- Browser project/conversation lists are cached under `~/.auracall/cache/providers/<provider>/<username-or-email>/` (identity-scoped, stale after ~6h or when the configured URL changes). Cache identity comes from `profiles.<name>.services.<service>.identity` unless `profiles.<name>.cache.useDetectedIdentity` is enabled. Browser profiles, managed browser profiles, Chrome executables, and display/debug-port settings are login-cookie and launch bindings, not tenant cache owners. Browser runs that can detect provider identity should also have a configured expected identity on the selected AuraCall runtime profile; missing identity is treated as unsafe because it can mix cache/account state. To move a tenant to another browser binding, edit the user-scoped runtime/browser binding, seed or log into the managed browser profile if needed, run `auracall profile identity-smoke --target <provider> --include-negative --json`, and then refresh/reconcile; no account-mirror DB migration is required when provider plus bound identity is unchanged. Raw adapter/debug calls that omit identity expectation fields remain development escape hatches.
- Doctor/features/setup/browser runs now stop early on blocking pages such as
  `google.com/sorry`, CAPTCHA / reCAPTCHA, Cloudflare, or similar
  human-verification surfaces when those require manual clearance.

Latest selectors
- `--conversation-name latest` selects the most recent conversation (scoped to `--project-id`/`--project-name` when provided).
- `--conversation-name latest-1` selects the second-most recent conversation.
- `--no-project` forces global scope; for ChatGPT this means the most recent conversation outside a project.
- Grok conversation listing reads the `/c/<id>` links in the project Conversations panel. If the History dialog opens during scraping, Aura-Call auto-closes it; if the UI still looks blocked, click the backdrop once to dismiss.
- When listing conversations with `--project-id`, Aura-Call prefers an already-open Grok project tab (to avoid History bleed-through) and verifies the URL matches the requested project before scraping.

### Manual login mode (persistent profile, no cookie copy)

Use `--browser-manual-login` when cookie decrypt is blocked (e.g., Windows app-bound cookies) or you prefer to sign in explicitly. You can also make it the default via `profiles.<name>.services.<service>.interactiveLogin` in `~/.auracall/config.json` (legacy `manualLogin` still works).

For first-time setup, prefer `auracall wizard`. It creates or updates a dedicated Aura-Call profile for the browser/runtime you pick and then calls `auracall setup --target <service>` for the actual managed-profile bootstrap, login, and verification. If you are on WSL and just need the most reliable path, use WSL Chrome first, keep that primary setup on the Aura-Call `default` profile, log in once in that managed profile, and treat Windows Chrome as an advanced/experimental path with its own named profile. If you already know the exact profile and want something scriptable/non-interactive, use `auracall setup --target <service>` directly instead of running `auracall login` and a separate smoke manually.

```bash
auracall --engine browser \
  --browser-manual-login \
  --browser-keep-browser \
  --model "GPT-5.2 Pro" \
  -p "Say hi"
```

- Aura-Call launches Chrome headful with a persistent managed profile at `~/.auracall/browser-profiles/<auracallProfile>/<service>` by default (override with `AURACALL_BROWSER_PROFILE_DIR` or `profiles.<name>.services.<service>.manualLoginProfileDir` in `~/.auracall/config.json`; legacy `browser.manualLoginProfileDir` still works).
  - preferred long-term config surface:
    - `runtimeProfiles.<name>.services.<service>.manualLoginProfileDir`
  - legacy root `browser.manualLoginProfileDir` remains supported as a
    transitional escape hatch
- Log into chatgpt.com in that window the first time; Aura-Call polls until the session is active, then proceeds.
- Reuse the same profile on subsequent runs (no re-login unless the session expires).
- Add `--browser-keep-browser` (or config `profiles.<name>.keepBrowser=true`) when doing the initial login/setup or debugging so the Chrome window stays open after the run. When omitted, Aura-Call closes Chrome but preserves the profile on disk.
- On first run, Aura-Call bootstraps that managed profile from your configured Chrome profile when possible. Later `auracall login` / `auracall setup` runs preserve existing managed profile state by default. Add `--force-reseed-managed-profile` when you explicitly want a destructive rebuild from the source profile. Cookie copy is still available as a fallback (`browser.manualLoginCookieSync=true`) when a managed profile needs seeding.
- If your runtime browser and your source profile differ, keep the runtime browser settings (`browser.chromePath`, `browser.chromeCookiePath`, `browser.wslChromePreference`) pointed at the browser you want Aura-Call to launch, and use `browser.bootstrapCookiePath` or `--browser-bootstrap-cookie-path` for the source profile you want to clone from. This prevents WSL runtime selection from silently overriding an explicit Windows/Brave bootstrap source.
- Managed-profile bootstrap now copies a selective Chromium auth-state subset (preferences, network state, local storage, IndexedDB, and related account DBs) instead of cloning the entire browser profile. That keeps first-run onboarding practical while still carrying the state most chat sites use.
- On WSL, some Windows Chromium cookie DBs are still unreadable from `/mnt/c` even when the rest of the profile is copyable. In that case Aura-Call can seed non-cookie browser state from `--browser-bootstrap-cookie-path`, but the run may still come up guest-only until you sign in once in the managed Aura-Call profile.
- On WSL when the runtime browser is Windows Chrome, Aura-Call now defaults to auto DevTools-port discovery for managed launches. The primary path is: managed Windows profile -> `--remote-debugging-port=0` -> `DevToolsActivePort` discovery -> built-in `windows-loopback` relay. You usually do not need firewall rules, `portproxy`, or a pinned `--browser-port` for this path.
- If Chrome is already running with that profile and DevTools remote debugging enabled (see `DevToolsActivePort` in the profile dir), you can reuse it instead of relaunching by pointing Aura-Call at it with `--remote-chrome <host:port>`.
- To inspect the managed profile and clean dead browser-state entries without launching Chrome, run `auracall doctor --target grok --local-only --prune-browser-state` (swap `grok` for `chatgpt` as needed). Add `--json` if you want a machine-readable `auracall.browser-doctor` report instead of the human summary.
- To bootstrap/login/verify in one command, run `auracall setup --target grok` (swap `grok` for `chatgpt` or `gemini` as needed). The command prints the managed profile path before and after verification so you can confirm exactly which Aura-Call profile was used. Add `--json` for a machine-readable `auracall.browser-setup` report with explicit login/verification step status and embedded before/after doctor reports.

## Remote Chrome Sessions (headless/server workflows)

Aura-Call can reuse an already-running Chrome/Edge instance on another machine by tunneling over the Chrome DevTools Protocol. This is handy when:

- Your CLI runs on a headless server (Linux/macOS CI, remote mac minis, etc.) but you want the browser UI to live on a desktop where you can see uploads or respond to Captcha challenges.
- You want to keep a single signed-in profile open (e.g., Windows VM with company SSO) while sending prompts from other hosts.

### 1. Start Chrome with remote debugging enabled

On the machine that should host the browser window:

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --user-data-dir=/path/to/profile \
  --profile-directory='Default'
```

Notes:

- Any Chromium flavor works (Chrome, Edge, Vivaldi, etc.)—just ensure CDP is exposed on a reachable host:port. Linux distributions often call the binary `google-chrome-stable`. On macOS you can run `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- `--remote-debugging-address=0.0.0.0` is required if the CLI connects from another machine. Lock it down behind a VPN or SSH tunnel if the network is untrusted.
- Keep this browser window open and signed into ChatGPT; Aura-Call will reuse that session and **will not** copy cookies over the wire.

### 2. Point Aura-Call at the remote browser

From the machine running `oracle`:

```bash
auracall --engine browser \
  --remote-chrome 192.168.1.10:9222 \
  --prompt "Summarize the latest incident doc" \
  --file docs/incidents/latest.md
```

WSL + Windows Chrome shortcut:

```bash
auracall --engine browser \
  --browser-target grok \
  --remote-chrome windows-loopback:45871 \
  --prompt "ping"
```

This `windows-loopback:<port>` host alias is WSL-only. Aura-Call starts a local WSL relay and forwards CDP traffic over stdio to a Windows helper that talks to Windows Chrome on Windows `127.0.0.1:<port>`. Use it when Windows Chrome is reachable on Windows loopback but raw WSL->Windows TCP is not.

Key behavior:

- Use IPv6 by wrapping the host in brackets, e.g. `--remote-chrome "[2001:db8::1]:9222"`.
- From WSL, `--remote-chrome windows-loopback:<port>` is the preferred way to reuse a Windows Chrome that already exposes `--remote-debugging-port=<port>` on Windows loopback.
- Local-only flags like `--browser-headless`, `--browser-hide-window`, `--browser-keep-browser`, and `--browser-chrome-path` are ignored because Aura-Call no longer launches Chrome. You still get verbose logging, model switching, attachment uploads, and markdown capture.
- Cookie sync is skipped automatically (the remote browser already has cookies). If you need inline cookies, use them on the machine that’s actually running Chrome.
- Aura-Call opens a dedicated CDP target (new tab) for each run and closes it afterward so your existing tabs stay untouched.
- Attachments are transferred via CDP: Aura-Call reads each file locally, base64-encodes it, and uses `DataTransfer` inside the remote browser to populate the upload field. Files larger than 20 MB are rejected to keep CDP messages reasonable.
- When the remote WebSocket disconnects, Aura-Call errors with “Remote Chrome connection lost…” so you can re-run after restarting the browser.

### 3. Troubleshooting

- Run `scripts/test-remote-chrome.ts <host> [port]` to sanity-check connectivity (`npx tsx scripts/test-remote-chrome.ts my-host 9222`).
- For the WSL Windows-relay path, first confirm Windows Chrome answers locally on Windows (`http://127.0.0.1:<port>/json/version`), then run Aura-Call with `--remote-chrome windows-loopback:<port>`. The relay path is inside Aura-Call; `scripts/test-remote-chrome.ts` does not yet know about the alias.
- If you target IPv6 without brackets (e.g., `2001:db8::1:9222`), the CLI rejects it—wrap the address like `[2001:db8::1]:9222`.
- For direct cross-machine `--remote-chrome <host:port>` targets, ensure firewalls allow inbound TCP to the debugging port and that you’re not behind a captive proxy stripping WebSocket upgrades. This does not apply to the WSL-only `windows-loopback:<port>` relay path.
- Because we do not control the remote lifecycle, Chrome stays running after the session. Shut it down manually when you’re done or remove `--remote-debugging-port` to stop exposing CDP.

### Remote Service Mode (`auracall serve`)

Prefer to keep Chrome entirely on the remote Mac (no DevTools tunneling, no manual cookie shuffling)? Use the built-in service:

1. **Start the host**
   ```bash
   auracall serve
   ```
   Aura-Call picks a free port, launches Chrome, starts an HTTP/SSE API, and prints:
   ```
   Listening at 0.0.0.0:9473
   Access token: c4e5f9...
   ```
   Use `--host`, `--port`, or `--token` to override the defaults if needed.
   If the host Chrome profile is not signed into ChatGPT, the service opens chatgpt.com for login and exits—sign in, then restart `auracall serve`.

2. **Run from your laptop**
   ```bash
   auracall --engine browser \
     --remote-host 192.168.64.2:9473 \
     --remote-token c4e5f9... \
   --prompt "Summarize the incident doc" \
    --file docs/incidents/latest.md
   ```

   - `--remote-host` points the CLI at the VM.
   - `--remote-token` matches the token printed by `auracall serve` (set `AURACALL_REMOTE_TOKEN` to avoid repeating it).
   - You can also set defaults in `~/.auracall/config.json` (`remote.host`, `remote.token`) so you don’t need the flags; env vars still override those when present.
   - Cookies are **not** transferred from your laptop. The service requires the host Chrome profile to be signed in; if not, it opens chatgpt.com and exits so you can log in, then restart `auracall serve`.

3. **What happens**
   - The CLI assembles the composed prompt + file bundle locally, sends them to the VM, and streams log lines/answer text back through the same HTTP connection.
   - The remote host runs Chrome locally, pulls ChatGPT cookies from its own Chrome profile, and reuses them across runs while the service is up. If cookies are missing, the service exits after opening chatgpt.com so you can sign in before restarting.
   - Background/detached sessions (`--no-wait`) are disabled in remote mode so the CLI can keep streaming output.
   - `auracall serve` logs the DevTools port of the manual-login Chrome (e.g., `Manual-login Chrome DevTools port: 54371`). Runs automatically attach to that logged-in Chrome; you can use the printed port/JSON URL for debugging if needed.

4. **Stop the host**
   - `Ctrl+C` on the VM shuts down the HTTP server and Chrome. Restart `auracall serve` whenever you need a new session; omit `--token` to let it rotate automatically.

This mode is ideal when you have a macOS VM (or spare Mac mini) logged into ChatGPT and you just want to run the CLI from another machine without ever copying profiles or keeping Chrome visible locally.

## Limitations / Follow-Up Plan

- **Attachment lifecycle** – in `auto` mode we prefer inlining files into the composer (fewer moving parts). When we do upload, each `--file` path is uploaded separately (or bundled) so ChatGPT can ingest filenames/content. The automation waits for uploads to finish (send button enabled, upload chips visible) before submitting. When inline paste is rejected by ChatGPT (too large), Aura-Call retries automatically with uploads.
- **Model picker drift** – we rely on heuristics to pick GPT-5.2 variants. If OpenAI changes the DOM we need to refresh the selectors quickly. Consider snapshot tests or a small “self check” command.
- **Non-mac platforms** – window hiding uses AppleScript today; Linux/Windows just ignore the flag. We should detect platforms explicitly and document the behavior.
- **Streaming UX** – browser runs cannot stream tokens, so we log a warning before launching Chrome. Investigate whether we can stream clipboard deltas via mutation observers for a closer UX.

## Testing Notes

- ChatGPT automation smoke: `pnpm test:browser`
- Gemini web (cookie) smoke: `AURACALL_LIVE_TEST=1 pnpm vitest run tests/live/gemini-web-live.test.ts` (requires a signed-in Chrome profile at `gemini.google.com`)
- `pnpm test --filter browser` does not exist yet; manual runs with `--engine browser -v` are the current validation path.
- Most of the heavy lifting lives in `src/browserMode.ts`. If you change selectors or the mutation observer logic, run a local `auracall --engine browser --browser-keep-browser` session so you can inspect DevTools before cleanup.

### Developer-app inventory and current settings

`auracall --profile <runtime-profile> apps list --json` reports installed apps independently of the Developer-mode settings control. When that control is unavailable, JSON reports `developerMode: null` and text reports `Developer mode: unknown`. This does not mean disabled or enabled. Existing-app operations retain exact account/inventory guards; creating or replacing an app still requires an affirmative enabled observation. Real navigation, attachment and incomplete inventory failures remain visible.
