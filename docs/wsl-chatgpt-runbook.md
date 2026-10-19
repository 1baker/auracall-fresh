# WSL Runbook: Oracle ChatGPT Browser (WSL Chrome)

Goal: Run ChatGPT browser automation from WSL using a Linux Chrome install, avoiding Windows/WSL interop issues.

Terminology for this runbook:
- browser profile: a browser/account family such as `default` or `wsl-chrome-2`
- source browser profile: the native Chromium profile used for bootstrap/cookie sourcing, usually `Default`
- managed browser profile: Aura-Call's persistent automation profile under `~/.auracall/browser-profiles/<auracallProfile>/<service>`
- AuraCall runtime profile: the top-level `profiles.<name>` entry selected by `--profile`

## Key behavior
- WSL Chrome is the most reliable path; Windows Chrome/Brave from WSL often fails due to DevTools binding and profile locks.
- AuraCall uses the resolver-derived Windows host for WSL-to-Windows DevTools
  routing, but normalizes any resolver-derived `127.x` nameserver to
  `127.0.0.1` because it is local to the WSL network namespace. An explicit
  `AURACALL_BROWSER_REMOTE_DEBUG_HOST` remains authoritative and is not
  rewritten.
- AuraCall now defaults browser `DISPLAY` to `:0.0` on WSL unless you set `browser.display`, `AURACALL_BROWSER_DISPLAY`, or explicitly target Windows-hosted Chrome.
- Aura-Call uses a managed persistent profile under
  `~/.auracall/browser-profiles/<auracallProfile>/<service>`. Sign in once in
  that managed browser profile. Copying a source browser profile is opt-in via
  setup/bootstrap controls or `--browser-cookie-sync`, because provider token
  rotation in the managed profile can invalidate the source browser session.
- Aura-Call uses `--password-store=basic` and `--use-mock-keychain` for WSL
  Chrome managed-browser launches, including visible auth-mode launches, so
  managed browser profiles do not block behind a Linux desktop keyring prompt.
- Chrome-launcher bookkeeping uses Linux temporary directories named
  `/tmp/auracall-chrome-launcher-*` (or the active `os.tmpdir()` equivalent).
  It must never create `undefined:/.../lighthouse.*` inside the directory where
  AuraCall was invoked.

## Recommended setup
0) Quick bootstrap (installs Node 22 + Chrome + repo deps):

```bash
./scripts/bootstrap-wsl.sh
```

1) Install Chrome in WSL (one-time):

```bash
sudo apt-get install -y google-chrome-stable
```

2) Configure Oracle defaults (`~/.auracall/config.json`):

```json5
{
  browser: {
    chromePath: "/usr/bin/google-chrome",
    chromeCookiePath: "/home/you/.config/google-chrome/Default/Cookies",
    chromeProfile: "Default",
    interactiveLogin: true,
    managedProfileRoot: "/home/you/.auracall/browser-profiles"
  },

  // Optional named secondary WSL browser profile
  browserFamilies: {
    "wsl-chrome-2": {
      chromePath: "/usr/bin/google-chrome",
      chromeProfile: "Default",
      chromeCookiePath: "/home/you/.config/google-chrome/Default/Cookies",
      bootstrapCookiePath: "/home/you/.config/google-chrome/Default/Cookies",
      display: ":0.0",
      managedProfileRoot: "/home/you/.auracall/browser-profiles",
      wslChromePreference: "wsl"
    }
  }
}
```

3) First-time login for primary WSL account (keep the window open so you can sign in):

```bash
AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 \
oracle --profile default --target chatgpt login --browser-keep-browser
```

4) Optional: configure a second WSL browser profile for another account (for example, Pro testing):

```json5
{
  auracallProfile: "default",
  browserFamilies: {
    "wsl-chrome-2": {
      chromePath: "/usr/bin/google-chrome",
      chromeProfile: "Default",
      chromeCookiePath: "/home/you/.config/google-chrome/Default/Cookies",
      bootstrapCookiePath: "/home/you/.config/google-chrome/Default/Cookies",
      display: ":0.0",
      managedProfileRoot: "/home/you/.auracall/browser-profiles",
      wslChromePreference: "wsl"
    }
  },
  profiles: {
    default: {
      services: {
        chatgpt: {
          identity: { email: "ecochran76@gmail.com" }
        }
      }
    },
    "wsl-chrome-2": {
      engine: "browser",
      browserFamily: "wsl-chrome-2",
      defaultService: "chatgpt",
      services: {
        chatgpt: {
          identity: { email: "consult@polymerconsultingroup.com" }
        }
      }
    }
  }
}
```

Aura-Call derives the managed browser profile directory automatically as
`~/.auracall/browser-profiles/<auracallProfile>/<service>` unless you set
`manualLoginProfileDir` explicitly.

For passive CDP observation, resolve the live endpoint from that exact managed
browser profile or from AuraCall's launch/session receipt. Do not assume an old
fixed port such as `45015`: WSL Chrome may use a new auto-assigned DevTools port
on every launch. A watcher attached to a remembered port is not evidence for
the active browser and must fail closed before a live acceptance run.

To run that same AuraCall-owned directory inside an agent-browser hidden
RDP/Guacamole route, configure its named browser profile with
`browserFamily: "chrome"`, `browserBuild: "stock_chrome"`, and
`agentBrowserRdp: { enabled: true, runtimeProfile: "<matching-agent-browser-runtime>" }`.
Do not move or copy the managed browser profile. AuraCall passes the exact path
to agent-browser and attaches through the returned CDP endpoint only after the
remote view and executable-build proofs pass. Keep this option disabled until
`agent-browser install doctor --json`, remote-view readiness, the named runtime
profile, and the route pool are healthy.

Seed the second account once:

```bash
AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 \
oracle --profile wsl-chrome-2 --target chatgpt login --browser-keep-browser
```

5) Run ChatGPT automation:

Primary account:

```bash
AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 \
oracle --engine browser -p "Say hello from WSL primary"
```

Secondary account:

```bash
AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 \
oracle --profile wsl-chrome-2 --engine browser -p "Say hello from second profile"
```

Chat is the default composer mode for every AuraCall ChatGPT browser run. Work
must be explicit, and its model is selected through a separate nested slider
menu rather than the Chat model picker:

```bash
oracle --profile wsl-chrome-3 --engine browser \
  --browser-chatgpt-mode work \
  --browser-work-model "GPT-5.6 Terra" \
  -p "Reply exactly: AURACALL_WORK_MODE_OK"
```

If the mode menu or the Work slider's `advanced options -> Model` submenu is
not present, AuraCall fails closed. It does not reuse Chat picker selectors.

The current Chat composer combines model and effort selection in one
intelligence picker. AuraCall scopes the trigger to the active composer; an
older assistant turn's `Switch model` action is a retry menu and is never used
for composer model selection. The horizontal Power positions are Instant,
Medium, High, Extra High, and Pro. Existing AuraCall effort levels map to the
first four positions respectively and verify the selected slider value.

On the current Chat workbench, `Add files and more` opens one searchable
popover containing both file sources and tools. Use `--browser-composer-tool`
only for tool/app rows through durable IDs such as
`chatgpt.commerce.shopping`, `chatgpt.search.web_search`, or
`chatgpt.research.deep_research`; legacy labels remain aliases. Use
`--file` for local paths. AuraCall prefers `Add photos & files / Upload from
computer`; if that text drifts, it accepts the unrestricted `#upload-files`
input only when the same active composer contains the prompt and the exact
`Add files and more` trigger. It never substitutes `Add from library / Browse
and search your files`, which is ChatGPT's provider-library drawer. Missing or
ambiguous binding still fails closed.

Third-party tools can pause after prompt submission and ask for `Allow once`
or `Always allow`. AuraCall defaults to `manual`, which detects the pause and
returns an actionable error without clicking. For unattended runs, select the
operator preference explicitly:

```bash
# Approve only the current tool call.
oracle --profile wsl-chrome-3 --engine browser \
  --browser-chatgpt-tool-approval allow-once \
  -p "Use the selected tool, then summarize the result"

# Persist ChatGPT approval for that third-party tool.
oracle --profile wsl-chrome-3 --engine browser \
  --browser-chatgpt-tool-approval always-allow \
  -p "Use the selected tool, then summarize the result"
```

The detector requires one visible surface containing exactly one of each
approval action. Before its one trusted pointer sequence, it briefly settles,
re-probes the same exact surface/action, and uses the fresh button center. A
changed or ambiguous surface receives no click; one that independently
disappears needs no action. AuraCall verifies a clicked surface disappears and
will not click the same surface twice. It never clicks `Answer now`.

Current live proof: the 2026-08-15 `wsl-chrome-3` LitScout canary selected
`allow-once`, logged exact `Allow once`, verified disappearance, and completed
with the expected token. A deliberately nonexistent cancellation target kept
LitScout project, job, cancellation, operator-action, and canonical-write
effects at zero. The durable receipt is
`docs/dev/notes/2026-08-15-plan0288-litscout-allow-once-live-proof.json`.

## Troubleshooting
- **Chrome opens but the URL never changes**: Oracle is connecting to the wrong DevTools host.
  - Fix: set `AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1` for the run.
- **WSL Chrome fails with `Missing X server` / blank `DISPLAY`**:
  - AuraCall now defaults to `:0.0` on WSL.
  - Override only if your X server uses another display or you intentionally want Windows-hosted Chrome.
- **Chrome stalls behind a keyring prompt**:
  - Current Aura-Call WSL Chrome managed-browser launches include
    `--password-store=basic` and `--use-mock-keychain`.
  - If an older Chrome process is already running without those flags, close
    that managed browser profile's Chrome process and rerun so Aura-Call can
    relaunch it with the keyring bypass flags.
  - For visible auth recovery, use `auracall --profile <name> login --target chatgpt`;
    auth-mode opens on `DISPLAY=:0.0` by default.
- **A managed browser profile already has a Chrome owner**:
  - AuraCall reattaches when that exact managed browser profile's responsive
    DevTools endpoint is attributable.
  - If Chrome owns the directory but no responsive endpoint can be attributed,
    AuraCall fails closed instead of launching a second Chrome on a dynamic
    port. Inspect or close only the exact owned process before retrying.
- **A long response reports `observation_expired_generation_active`**:
  - The model run is still active; the observer lease expired. Do not resend
    the prompt or click `Answer now`.
  - A visible Stop control is sufficient positive generation evidence even
    before ChatGPT mounts the assistant turn; approval cards, dialogs, and
    completion surfaces do not qualify.
  - Run `auracall session <id>` to reattach read-only to the persisted exact
    browser target and conversation. AuraCall keeps healthy growing output in
    place and permits a same-conversation refresh only for stale/interrupted
    observation, at most once per 15 minutes.
  - Reattachment reconciles a validated final progress `/c/<id>` URL ahead of
    any stale synthetic runtime route while retaining the exact target and
    DevTools port.
- **Using Windows Chrome from WSL**:
  - Keep `manualLoginProfileDir` as a WSL path if you override it; Aura-Call converts it to the `\\wsl.localhost\...` path for Windows Chrome.
  - If DevTools can’t be reached, open the Windows firewall for the chosen port or pin a port with `AURACALL_BROWSER_PORT`.
- **Wrong profile opens / not logged in**:
  - Keep the login window open, sign in, then rerun. The profile is reused on subsequent runs.
- **Need a clean profile**:
  - Remove the relevant managed profile under `~/.auracall/browser-profiles/<auracallProfile>/<service>` and repeat the login step.

## Optional helper aliases
Add to `~/.zshrc`:

```bash
alias oracle-wsl='AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 oracle'
alias oracle-login='AURACALL_BROWSER_REMOTE_DEBUG_HOST=127.0.0.1 oracle --target chatgpt login --browser-keep-browser'
```

## Chat mode preflight

On the exact new-chat root, AuraCall first waits boundedly for explicit
Chat/Work controls. If none appear, one exact visible enabled prompt editor and
no active current-route `Work` badge may establish Chat; it can never establish
Work. Project landing pages still require explicit controls, while established
conversation routes retain their mode-marker compatibility checks.

When a selected artifact's interpreter download returns HTTP404or410, AuraCall
records `failureKind: provider_unavailable` and `retryable: false` in its artifact
manifest and history result. The corresponding history asset is unavailable;
other artifacts continue independently. A visible download control does not
prove that its remote bytes still exist.

ChatGPT completion-to-materialization handoff preserves an observed provider
cooldown deadline, while action-specific pacing remains active in the child.
It adds no blanket quiet period merely because metadata collection finished.
Historical generic failed/skipped results remain in history and do not prove
terminal unavailability or suppress newly discovered retrievable inventory.

## Stale native desktop receipt after browser replacement

CLI login now retains the selected native desktop launch policy. Ordinary inventory
continues to refuse a running browser whose native receipt names an exited process.
Inspect `auracall --profile <runtime> doctor --target chatgpt --local-only --json`
and the current process first. Do not infer a composer selector failure from this
ownership refusal or repeat an unknown submission.

For an independently identified replacement PID, explicitly reconcile with:

```sh
auracall --profile <runtime> login --target chatgpt --reconcile-native-browser <pid>
```

This Linux-only operation opens no page and sends no prompt. It requires exactly
one retained receipt, actual absence of its old PID, unchanged configured desktop
placement, current assignment and viewing generation, exact managed directory,
selected executable and process birth, a current window on the retained desktop,
and a responsive loopback DevTools socket owned by the selected PID. It rechecks
process/socket/window proof before publishing a new browser identity. The old and
proposed receipts remain in a private `~/.auracall/native-desktops/reconciliation-*`
record; such a record is intent evidence if receipt publication fails. Managed
browser data and input-control claims are preserved. Cookie export and reseeding
cannot be combined with reconciliation.

If proof is missing or conflicting, reconciliation refuses without changing the
browser receipt or signalling a process. Resolve the exact ownership/placement
problem with the operator; do not hand-edit receipts, reuse stale CDP endpoints,
clear control claims or kill a browser to make the command succeed. After successful
reconciliation, run one supported read-only inventory command. Provider warnings
and human-verification pages retain their existing hard stops.
