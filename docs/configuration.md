# Local configuration (JSON5)

Aura-Call reads layered config files (system → user → project tree). Files use JSON5 parsing, so trailing commas and comments are allowed.

If no config file exists, Aura-Call scaffolds a default config using your
detected browser profile.

The primary documented shape is now:
- `browserProfiles`
- `runtimeProfiles`
- `runtimeProfiles.<name>.browserProfile`
- `api`
- `version: 3`

The compatibility bridge shape still exists and still loads:
- `browserFamilies`
- `profiles`
- `profiles.<name>.browserFamily`
- typically `version: 2`

You can regenerate a file with `auracall profile scaffold`, use
`auracall wizard` for guided setup, or rewrite an existing file with
`auracall config migrate`.
Use `auracall config migrate` to write a v2-style layout from an existing config file:

```sh
auracall config migrate --dry-run
auracall config migrate --in-place --strip-legacy
auracall config migrate --output ~/.auracall/config.v3.json --strip-legacy
auracall profile scaffold --force
auracall wizard
auracall config migrate --bridge-shape --output ~/.auracall/config.bridge.json --strip-legacy
```

When invoking via `tsx` in dev, prefer Node’s `--import` to avoid `pnpm` swallowing `--dry-run`:

```sh
node --import tsx bin/auracall.ts config migrate --dry-run
```

`auracall config migrate`, `auracall profile scaffold`, and `auracall wizard`
now also print a
short bridge summary in the target-model terms so operators can immediately see
which AuraCall runtime profile and browser profile the written config points at.

Use `auracall config show` to inspect the active resolved model in the new
terminology without changing the stored bridge-key layout:

```sh
auracall config show
auracall config show --json
auracall config doctor
auracall config doctor --json
auracall config doctor --strict
auracall config agent-diagnostics
auracall config agent-diagnostics --json
auracall config agent-export --agent researcher --team ops --output agents.snapshot.json
auracall config agent-import agents.snapshot.json --dry-run
auracall profile list
auracall profile list --json
```

The command reports the active AuraCall runtime profile, its referenced browser
profile, the resolved browser target, whether `defaultRuntimeProfile` or the
compatibility selector `auracallProfile` is present, and whether the current
bridge keys are present in the loaded config.

`config show` now also includes a read-only resolved-agent view so future
agent-aware tooling can inspect `agent -> runtimeProfile -> browserProfile`
resolution without rebuilding that chain from raw arrays.

`config show` now also includes a read-only resolved-team view so future
team-aware tooling can inspect `team -> agent -> runtimeProfile -> browserProfile`
resolution without rebuilding that chain from projected arrays.

When `--agent <name>` is passed, `config show` and `config doctor` also surface
the selected-agent resolution chain directly, including the selected agent,
resolved AuraCall runtime profile, and resolved browser profile.

When `--team <name>` is passed, `config show` and `config doctor` surface a
read-only team planning view directly:
- selected team resolution
- member agents
- each member's resolved AuraCall runtime profile
- each member's resolved browser profile

This does not enable team execution or parallelism. It is an inspection and
runtime-planning surface only.

`config agent-diagnostics` reads the effective config plus user-scoped agent
registry and `~/.auracall/api.env` without returning secrets. Use it to check
disabled registry records, config-vs-registry conflicts, missing API-key scope
targets, and which scoped key ids can reach which effective agents.

`config agent-export` writes selected effective agents/teams to a versioned
`auracall_agent_registry_snapshot` JSON file for review, backup, or promotion.
`config agent-import` imports that file into the user-scoped registry and still
blocks config-defined overlay ids rather than writing hidden registry records
behind pinned config entries.

Operators can use the same snapshot contract over HTTP with
`POST /v1/config/snapshots/export` and `POST /v1/config/snapshots/import`.
The Agents / Teams dashboard exposes the same flow as download, dry-run import,
and apply import controls. When API auth is enabled, these routes require an
unscoped operator key.

The dashboard also exposes an API-key issue control for selected agent/team
scopes. It calls `POST /v1/config/api-keys/issue`, writes the selected
user-scoped env file, and returns the new secret once for the operator to store.

## Browser launch field precedence

For user-config browser launch plans, executable, source browser profile root/name,
source cookie path, bootstrap cookie path, display and managed browser profile root
use this order:

1. The selected AuraCall runtime profile's `browser` override.
2. The explicitly selected browser profile's settings.
3. The configured root `browser` defaults.

Blank strings are absent; canonical source fields (`sourceProfileName`,
`sourceCookiePath`, `sourceProfilePath`) precede compatibility aliases within each
layer. `cookieSync` uses the same order, including an explicit `false` override.
A source cookie path alone does not authorize copying: derived bootstrap cookies
require `cookieSync: true`. A separately configured `bootstrapCookiePath` is an
explicit bootstrap request. Source root can derive a cookie path when none is
configured; it remains separate from the managed browser directory.

Stored execution uses the same immutable plan for emitted launch options, affinity
configuration, managed directory and source authorization identity. Runtime
`chromeProfile` aliases now supply authorization's source name too. An explicit
runtime/service managed directory is honored, while a stale directory belonging to
another runtime/browser selection or provider is discarded. With no explicit
directory, the managed directory derives from the winning managed root plus the
selected browser profile and provider. Model/tool/workflow preferences remain
separate. Already explicit session-config launch options retain their precedence.

## Local API and dashboard

Use the top-level `api` block to pin the local API binding and operator-facing
dashboard URLs:

```json5
{
  api: {
    host: "127.0.0.1",
    port: 18095,
    dashboardUrl: "http://auracall.localhost/ops/browser",
    publicDashboardUrl: "https://auracall.ecochran.dyndns.org/ops/browser",
    accountMirrorScheduler: {
      intervalMs: 600000,
      execute: true,
    },
    routing: {
      localHostname: "auracall.localhost",
      externalHostname: "auracall.ecochran.dyndns.org",
      localBaseUrl: "http://auracall.localhost",
      externalBaseUrl: "https://auracall.ecochran.dyndns.org",
      dashboardPath: "/ops/browser",
      accountMirrorPath: "/account-mirror",
      proxyTarget: "http://127.0.0.1:18095",
      auth: "authelia",
      ingress: "traefik",
    },
  },
}
```

`auracall api serve` defaults to `api.host`, `api.port`, and
`api.accountMirrorScheduler` when CLI flags are omitted. CLI scheduler flags
still win for one-off runs. `/status.routes.operatorBrowserDashboardUrl`, CLI
`api ops-browser-status`, and MCP `api_ops_browser_status` report the canonical
dashboard URL when configured. `/status.serviceDiscovery` reports the
configured bind URL, local hostname/base URL, external hostname/base URL,
dashboard/account-mirror paths, proxy target, ingress, and auth guard so
operators can find the same service after restart.

Selector precedence is now explicit in those reports:
- runtime selection uses `--profile` first
- then `--agent`
- then the config default selector
- `--team` remains planning-only and never changes the active runtime selection

Stored session metadata now also preserves that selected-agent provenance as
`options.selectedAgentId`, so detached runs and postmortems can distinguish an
agent-selected run from one started directly with `--profile`.

`auracall status`, `auracall session <id>`, and the corresponding `--json`
surfaces now expose that stored selected-agent provenance directly, so you do
not need to open raw session metadata just to confirm how a run was selected.

The JSON forms now also include a `projectedModel` block that exposes
the target conceptual shape directly:
- `browserProfiles[]`
- `runtimeProfiles[]`
- `agents[]`
- `teams[]`
- `activeRuntimeProfileId`
- `activeBrowserProfileId`

Aura-Call now also accepts the target-shape keys on reads; this projection is
there so operators can inspect the normalized model directly.

Use `auracall profile list` when you want the inventory view instead:
- all AuraCall runtime profiles
- their browser-profile bridges
- their default services
- projected agents and their inherited runtime/browser context
- projected teams and their current agent membership, including unresolved
  members
- the available browser profiles in the current config

Use `auracall config doctor` when you want bridge-health checks instead:
- AuraCall runtime profiles with no explicit browser-profile reference
- runtime profiles that reference missing browser profiles
- agents that reference missing AuraCall runtime profiles
- teams that reference missing agents
- unused browser profiles
- legacy `auracallProfiles` still present
- pass `--strict` when warnings should return a nonzero exit code for scripts/CI
- `auracallProfiles` is now legacy inspection/fallback only:
  - Aura-Call still reports it when present
  - but current `profiles` / `runtimeProfiles` now stay ahead of it for
    active fallback selection

For future troubleshooting of bridge-shape vs target-shape vs mixed-shape
configs, see:

- [config-shape-troubleshooting.md](/home/ecochran76/workspace.local/auracall/docs/dev/config-shape-troubleshooting.md)

## Terminology

Use these terms consistently:

- `browser profile`
  - a browser-service level runtime/account family config such as `default` or
    `wsl-chrome-2`
  - this owns browser execution concerns like executable path, source cookie
    path, managed profile root, WSL-vs-Windows behavior, and debug-port policy
- `source browser profile`
  - the native Chromium profile used for bootstrap/cookie sourcing
  - examples: `Default`, `Profile 1`, `Profile 2`
- `managed browser profile`
  - the Aura-Call-owned automation profile directory derived from the browser
    profile plus service
- `AuraCall runtime profile`
  - the top-level Aura-Call config entry selected by
    `defaultRuntimeProfile` / `--profile`
  - compatibility key:
    - `auracallProfile`
  - this chooses a browser profile and adds service/model/project/cache defaults

In short:
- browser profile = browser/account family
- AuraCall runtime profile = workflow defaults layered on top of a browser profile

Agent and team layers:
- `agents`
  - reference AuraCall runtime profiles and add instructions/persona/task
    defaults
  - live execution selection currently uses only
    `agents.<name>.runtimeProfile`
  - `description`, `instructions`, and `metadata` are valid places to describe
    agent purpose and future workflow policy
- `teams`
  - group agents without redefining browser or runtime-profile state

## ChatGPT developer apps

The `apps` CLI namespace uses the managed ChatGPT browser selected by the
current AuraCall runtime profile. It does not add a second browser credential
or app registry to configuration.

- `auracall --profile <runtime> apps --target chatgpt list --json` is
  read-only. It reports the live account, Developer mode, installed app IDs,
  development scope, enablement, and linked authentication state.
- `create`, `refresh`, submitted `test`, and `uninstall` require both
  `--expected-account <email>` and `--yes`. Exact app IDs are preferred;
  duplicate exact names fail closed.
- `test <app>` without `--submit` selects the app in a blank composer, verifies
  the resulting ecosystem-mention app ID, sends nothing, and clears the
  composer.
- OAuth sign-in, MFA, consent, CAPTCHA, and other human-verification surfaces
  are returned as operator gates. Aura-Call does not enter credentials or
  override those surfaces.
- The commands share the browser-operation dispatcher and current ChatGPT
  blocking-surface guards. They do not relax live-follow rate limits.

Use the account-bound runtime profile deliberately. For example:

```bash
auracall --profile wsl-chrome-3 apps --target chatgpt create \
  --name "LitScout Dev" \
  --server-url "https://example.test/mcp" \
  --auth oauth \
  --connection server-url \
  --expected-account eric.cochran@soylei.com \
  --yes --json
```

Target-model note:
- the preferred public shape is documented in
  [config-model-target-shape.md](/home/ecochran76/workspace.local/auracall/docs/dev/config-model-target-shape.md)
  and uses:
  - `version: 3`
  - `defaultRuntimeProfile`
  - `browserProfiles`
  - `runtimeProfiles`
- Aura-Call now accepts the target-shape aliases for config loading:
  - `browserProfiles`
  - `runtimeProfiles`
  - `runtimeProfiles.<name>.browserProfile`
- precedence for dual-read is:
  - target keys win over bridge keys
  - mixed/conflicting configs are surfaced by `auracall config doctor`
- target-shape is now the default write mode for:
  - `config migrate`
  - `profile scaffold`
  - `wizard`
- `--target-shape` is still accepted explicitly, but is now mostly useful for
  scripts that want to state the intended write mode directly
- bridge keys remain the compatibility form:
  - usually `version: 2`
  - `auracallProfile` as the compatibility runtime-profile selector
  - `browserFamilies` as the browser-profile bridge
- `profiles` as the AuraCall runtime-profile bridge
- use `--bridge-shape` when you intentionally want compatibility bridge output
- when compatibility bridge output is requested from mixed-shape input:
  - target keys still supply the authoritative values
  - bridge output rewrites back to bridge-only keys instead of preserving a
    mixed-shape file

Transitional authoring note:
- new or cleaned-up service defaults should prefer:
  - `services.<service>`
  - `runtimeProfiles.<name>.services.<service>`
- some current CLI/browser entrypoints still resolve through the root
  `browser` block for transitional compatibility, especially:
  - `--project-id`
  - `--project-name`
  - `--conversation-id`
  - `--conversation-name`
  - `--browser-model-strategy`
  - `--browser-chatgpt-mode`
  - `--browser-work-model`
  - `--browser-thinking-time`
  - `--browser-no-thinking-time` (one-run omission only; it is not persisted)
  - `--browser-composer-tool`
  - `--browser-deep-research-plan-action`
- those CLI flags are still intentionally classified as supported transitional
  root-browser inputs under the current resolver contract
- narrowing checkpoint:
  - `--project-id` and `--project-name` now also mirror into the selected
    `runtimeProfiles.<name>.services.<defaultService>` slot when one concrete
    default service exists
  - `--conversation-id` and `--conversation-name` now also mirror into the
    selected `runtimeProfiles.<name>.services.<defaultService>` slot when one
    concrete default service exists
  - `--browser-model-strategy`, `--browser-chatgpt-mode`,
    `--browser-work-model`, `--browser-thinking-time`,
    `--browser-composer-tool`, and
    `--browser-deep-research-plan-action` now also mirror into the selected
    `runtimeProfiles.<name>.services.<defaultService>` slot when one concrete
    default service exists
  - when no concrete default service exists, they remain root-browser-only
    inputs
  - `--browser-no-thinking-time` remains deliberately CLI-only because it
    suppresses inherited depth for one execution rather than authoring config
- active service binding now prefers the service-scoped values when both the
  service-scoped and root-browser copies exist
- keep `manualLogin` / `manualLoginProfileDir` separate from that precedence:
  they remain browser-execution escape hatches
- treat that root-browser surface as a supported compatibility-alias input, not
  as the preferred long-term authoring layer
- current reassessment:
  - the first bounded compatibility-alias reconciliation pass is complete
  - keep this root-browser alias surface stable unless a later slice
    explicitly chooses deprecation or stronger reporting

Runtime host policy note:
- `runtime.localActions.shell` defines the host/runtime execution ceiling for
  built-in shell local actions
- task/team policy may narrow that ceiling, but should not widen it
- current staged values are:
  - `bounded-command`
  - `repo-automation`
  - `extended`
- this currently affects internal local-action execution paths rather than
  adding a new public CLI surface

Version policy:
- `version: 3` means the file is written in the primary target shape
- `version: 2` means the file is written in the compatibility bridge shape
- Aura-Call still loads either version permissively during the transition

Handoff packaging policy:
- `handoff.attachmentPackaging.enabled` defaults to `true`
- `handoff.attachmentPackaging.zipWhenFileCountExceeds` defaults to `10`
- with the default policy, ten or fewer selected target files remain individual
  upload manifest entries
- eleven or more selected target files are packaged into one deterministic
  `target/selected-files/handoff-attachments.zip` upload item
- ZIP-mode target primer text instructs the receiving chat to inspect or
  extract the ZIP before analysis
- the target package and upload manifest retain original selected-file metadata
  for audit, approval, export, and repair

## Primary Example (`~/.auracall/config.json`)

```json5
{
  version: 3,

  // Select which AuraCall runtime profile to use by default
  defaultRuntimeProfile: "default",

  globals: {},

  llmDefaults: {
    model: "chatgpt:premium",
  },

  // Optional global service URL defaults (override per runtime profile)
  services: {
    chatgpt: { url: "https://chatgpt.com/" },
    gemini: { url: "https://gemini.google.com/app" },
    grok: { url: "https://grok.com/" },
  },

  // Optional handoff packaging policy. These are the defaults: all target
  // services upload ten or fewer selected files individually and package
  // eleven or more selected files into one deterministic ZIP attachment.
  handoff: {
    attachmentPackaging: {
      enabled: true,
      zipWhenFileCountExceeds: 10,
    },
  },

  // Optional host-owned runtime execution policy defaults
  runtime: {
    localActions: {
      shell: {
        complexityStage: "bounded-command",
        allowedCommands: ["node", "npm", "pnpm", "git"],
        allowedCwdRoots: ["/home/you/workspace.local/auracall"],
        defaultShellActionTimeoutMs: "15s",
        maxShellActionTimeoutMs: "120s",
        maxCaptureChars: 8000,
      },
    },
  },

  // Optional named browser profiles
  browserProfiles: {
    default: {
      chromePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      sourceProfileName: "Default",
      sourceCookiePath: "/Users/me/Library/Application Support/Google/Chrome/Default/Network/Cookies",
      bootstrapCookiePath: "/Users/me/Library/Application Support/Google/Chrome/Default/Network/Cookies",
      managedProfileRoot: "/Users/me/.auracall/browser-profiles",
      serviceTabLimit: 3,
      blankTabLimit: 1,
      collapseDisposableWindows: true
    },
    "wsl-chrome-2": {
      // This is the executable family, not the browser-profile id selected by
      // runtimeProfiles.<name>.browserProfile.
      browserFamily: "chrome",
      browserBuild: "stock_chrome",
      chromePath: "/usr/bin/google-chrome",
      sourceProfileName: "Profile 1",
      sourceCookiePath: "/home/me/.config/google-chrome/Profile 1/Network/Cookies",
      bootstrapCookiePath: "/home/me/.config/google-chrome/Profile 1/Network/Cookies",
      display: ":0.0",
      managedProfileRoot: "/home/me/.auracall/browser-profiles",
      wslChromePreference: "wsl",
      // Optional: agent-browser owns the process and hidden RDP/Guacamole
      // route; AuraCall keeps ownership of the exact managed profile bytes.
      agentBrowserRdp: {
        enabled: true,
        runtimeProfile: "auracall-wsl-chrome-2",
        // command: "/absolute/path/to/agent-browser",
        // jobTimeoutMs: 120000,
      },
    },
    "gemini-stealthcdp": {
      browserFamily: "chromium",
      browserBuild: "stealthcdp_chromium",
      chromePath: "/opt/chromium-stealthcdp/current/chrome",
      managedProfileRoot: "/home/me/.auracall/browser-profiles",
      agentBrowserRdp: {
        enabled: true,
        runtimeProfile: "auracall-gemini-stealthcdp",
      },
    }
  },

  // Optional dev-only port range for new Chrome spawns
  dev: {
    browserPortRange: [45000, 45100],
  },

  runtimeProfiles: {
    default: {
      browserProfile: "default",
      engine: "browser",
      search: "on",
      defaultService: "chatgpt",
      keepBrowser: false,
      browser: {
        headless: false,
        hideWindow: false,
      },
      services: {
        chatgpt: {
          identity: { email: "me@example.com" },
          projectName: "Aura-Call",
          chatgptMode: "chat",
          workModel: "Research",
          model: "chatgpt:premium",
          thinkingTime: "extended",
          interactiveLogin: false,
          features: {
            web_search: true,
            deep_research: false,
            company_knowledge: false,
            apps: ["projects", "gpts"]
          }
        },
        grok: {
          identity: { email: "me@example.com" }
        }
      },
      cache: {
        store: "dual",
        refresh: false,
        includeHistory: true,
        includeProjectOnlyConversations: true,
        historyLimit: 2000,
        historySince: null,
        cleanupDays: 365,
        rootDir: null,
        refreshHours: 6,
        useDetectedIdentity: false
      }
    },
    work: {
      browserProfile: "default",
      engine: "browser",
      defaultService: "chatgpt",
      keepBrowser: false,
      services: {
        chatgpt: {
          identity: {
            email: "me@example.com",
            accountPlanType: "team",
            accountStructure: "workspace"
          },
          projectId: "g-p-123456789"
        }
      }
    },
    "wsl-chrome-2": {
      browserProfile: "wsl-chrome-2",
      engine: "browser",
      defaultService: "chatgpt",
      keepBrowser: false,
      services: {
        chatgpt: {
          identity: {
            email: "consult@polymerconsultingroup.com",
            accountPlanType: "pro",
            accountStructure: "personal"
          },
          // Optional advanced override. By default Aura-Call derives:
          // ~/.auracall/browser-profiles/wsl-chrome-2/chatgpt
          manualLoginProfileDir: "/Users/me/.auracall/browser-profiles/wsl-chrome-2/chatgpt"
        }
      }
    }
  },

  // Agent/team layers. Agent runtimeProfile selection is live; purpose fields
  // are descriptive until a later workflow-defaults slice promotes them.
  agents: {
    "default-chatgpt-memory-steward": {
      runtimeProfile: "default",
      description: "Low-churn mirror steward for the default ChatGPT tenant",
      instructions: "Maintain account mirror freshness without submitting prompts or navigating away from active provider work.",
      metadata: {
        service: "chatgpt",
        purpose: "account-mirror",
        mirrorPolicy: {
          mode: "lazy",
          priority: "background",
          contentPolicy: "metadata-first"
        }
      }
    },
    "default-chatgpt-primary": {
      runtimeProfile: "default",
      description: "Primary default ChatGPT account for planning, drafting, synthesis, and historical recall"
    },
    "consult-chatgpt-pro": {
      runtimeProfile: "wsl-chrome-2",
      description: "Consulting ChatGPT Pro account for Pro and Deep Research work"
    }
  },
  teams: {
    "chatgpt-memory-ops": {
      agents: ["default-chatgpt-memory-steward", "default-chatgpt-primary"],
      description: "Default ChatGPT mirror plus primary workbench routing"
    },
    "chatgpt-pro-pool": {
      type: "dispatch-pool",
      agents: ["default-chatgpt-primary", "consult-chatgpt-pro"],
      dispatch: {
        mode: "next_available",
        projectSync: "none"
      },
      project: {
        name: "Shared Project",
        createIfMissing: true,
        sync: "none"
      },
      description: "Response-batch dispatch pool across separate ChatGPT tenants"
    }
  },

  remote: {
    host: "192.168.64.2:9473",
    token: "c4e5f9..."
  },

  azure: {
    endpoint: "https://your-resource-name.openai.azure.com/",
    deployment: "gpt-5-1-pro",
    apiVersion: "2024-02-15-preview"
  },

  heartbeatSeconds: 30,
  filesReport: false,
  background: true,
  sessionRetentionHours: 72,
  promptSuffix: "// signed-off by me",
  apiBaseUrl: "https://api.openai.com/v1"
}
```

When `agentBrowserRdp.enabled` is true, AuraCall forces a persistent headed
posture (`headless: false`, `hideWindow: false`, `keepBrowser: true`) inside the
remote display. It passes the existing
`<managedProfileRoot>/<browser-profile-id>/<service>` directory directly to
agent-browser; it does not copy or convert that directory. Activation requires
the named agent-browser runtime profile and RDP route pool to be healthy.
AuraCall rejects a family/build mismatch both before launch and after
agent-browser reports the actual selected executable.

## Named AuraCall desktops

Native `remoteView` uses Remote View's application consumer API. AuraCall owns
its Chromium processes, managed browser profiles and CDP; Remote View supplies
desktops and the native viewer. Configure an enabled external-mode `auracall`
consumer with a bounded pool and AuraCall's exact HTTPS embedding origin in the
Remote View installation before selecting it here. No provider installation,
network provisioning or borrowed Agent Browser desktop adoption is automatic.

```json5
remoteView: {
  application: {
    name: "auracall",
    origin: "http://127.0.0.1:19096", // private native control endpoint
    publicOrigin: "https://desktops.example.com",
    appOrigin: "https://auracall.example.com"
  },
  defaultDesktop: "research",
  desktops: {
    research: { poolName: "main", label: "Research" },
    writing: { poolName: "main", label: "Writing" }
  },
  rootDesktopUrl: "https://desktops.example.com/root"
},
browserProfiles: {
  "work-chrome": { desktop: "writing" },
  "root-chrome": { desktop: "root" }
}
```

The private origin must use loopback HTTP; presentation origins use HTTPS.
The root URL is operator-supplied and independent of AuraCall's assignments.
A browser-profile assignment overrides the global default. `root` selects
ordinary desktop launching explicitly. Unknown names, unavailable configuration,
stale assignments and unverified browser ownership fail clearly without root
fallback. Selecting a native desktop forces a persistent headed browser and
keeps the existing managed browser directory and authentication.

Each named desktop retains one exact native assignment. Multiple browser
profiles can share it; different names acquire distinct assignments within the
configured pool's capacity. Configuration changes apply to subsequent launches;
an existing browser on a different desktop is refused rather than moved.
Native browser receipts bind the PID, boot/start identity, selected executable,
managed directory, display, CDP endpoint and assignment generation. Configure the
Remote View application with `inventory`, `acquire`, `release`, `observe`,
`control` and `windows` capabilities. Chromium may flatten its process title and
scrub its environment; AuraCall then requires a fresh native window/PID join on
the exact desktop and both generations instead of guessing ownership from a
missing `DISPLAY`. Native launch resolves the configured local executable directly; it does not
require Agent Browser RDP family/build declarations. Minimal manual-login launches skip Chrome's first-run shell
so that CDP can become ready; provider sign-in remains interactive.

Open `/desktops` on the AuraCall HTTP service. The compact left rail lists configured AuraCall runtime profiles, grouped by
**Account** or **Profile**, alongside positively owned running AuraCall browsers.
The SVG header control hides or restores the rail with a short slide; grouping
and collapse preferences survive reload. Reduced-motion preferences are honored.
The selected browser mounts Remote View's native observe-only embed.

**Wake** opens a dormant local browser runtime profile on its configured native
desktop, or the selected existing desktop when no placement is configured. It
uses the same managed browser directory, browser family, provider and configured
account identity as ordinary AuraCall commands. Remembered placement lives in
`~/.auracall/desktop-profile-assignments.json`; runtime profiles sharing the same
browser family and provider share placement. Explicit operator configuration
wins. Existing running browsers are preserved; profiles running outside the
native desktops show an actionable unavailable state. Windows and remote browser
profiles cannot be awakened here. Wake opens the provider page for interactive
sign-in; it does not send a prompt or start background jobs. Takeover remains an
explicit action in the single header. Selecting another desktop disposes the old viewer, and
reload preserves the selected desktop/browser through AuraCall's own URL.
Fresh presentation routes are issued after exact assignment/generation readback;
opaque provider routes are temporary and never become durable browser identity.
Existing ingress authentication remains in force. Scoped execution API keys do
not authorize desktop operator access.

Viewing sends no input and closing the client keeps browsers and assignments
running. **Take control** first excludes AuraCall direct CDP and Puppeteer commands, plus browser launches
on that desktop, then issues a native input-capable grant. A second human claim
or an active automation command prevents takeover. **Release control** disposes
the local viewer and revokes the exact provider grant before automation resumes.
`remoteView.controlInactivitySeconds` defaults to **120 seconds** (two minutes).
Remote View's gateway tracks actual keyboard/pointer input across every viewer
transport for the exact control grant. When that input stops for the configured
period, AuraCall requests conditional revocation, returns the client to view-only,
and resumes automation only after exact terminal proof. New clicks or keystrokes
cannot regain control; use **Take control** again. Display updates, stream
acknowledgements, resize and connection polling do not reset the input timer.
**Release control** remains available for immediate handoff.

This requires Remote View's `revoke_inactive_view` consumer operation (Plan0071).
If the provider response is uncertain or that operation is unavailable, automation
stays paused. Closing a tab is not release evidence. Authorization expiry remains
independent; exact revocation or terminal issuance replay must qualify resumption. Reload retains
the claim in this browser tab; **Reconnect control** reuses that claim. Durable
private receipts contain claim and generation identities, never viewer URLs.
A definitively refused takeover with no caller-owned claim returns to passive
viewing; uncertain issuance retains the recovery claim. Selecting root for a
still-running native-bound browser is refused: close that browser explicitly
before changing its desktop placement.

Coordination covers AuraCall's managed CDP and launch paths. External OS tools and
root desktop access remain independently available. Native installed acceptance
and whole-feature integration remain open under Plan 0391.

Existing explicit `agentBrowserRdp` configuration remains independent. A legacy
named desktop may still specify `runtimeProfile` plus `routePoolEntryId` instead
of `poolName`; its compatibility presentation uses passive captures. Legacy RDP
route state does not establish native Remote View availability.

## Compatibility Bridge Example

If you are still troubleshooting or maintaining the compatibility bridge shape,
the equivalent browser/runtime keys are:

- `browserFamilies` instead of `browserProfiles`
- `profiles` instead of `runtimeProfiles`
- `profiles.<name>.browserFamily` instead of
  `runtimeProfiles.<name>.browserProfile`

## Layered config + precedence

Config layers are merged in this order (later wins):

1. System config (`/etc/auracall/config.json` on Linux/macOS, `%ProgramData%\\auracall\\config.json` on Windows, or `AURACALL_SYSTEM_CONFIG_PATH`)
2. User config (`~/.auracall/config.json` or `AURACALL_CONFIG_PATH`)
3. Project configs found while walking up from the working directory:
   - `./.auracall/config.json`
   - `./auracall.config.json`

Within each file, later CLI flags still override config, and environment variables continue to override defaults where documented.

- `engine`/`search` can be set globally or inside a runtime profile; runtime-profile values apply when that profile is selected and no CLI flag overrides them.
- Use `--profile <name>` to switch AuraCall runtime profiles for a single run (overrides config).
- Use `--agent <name>` to resolve a run through a reserved agent reference.
  - Today this only selects the referenced AuraCall runtime profile and its browser-profile inheritance.
  - It does not enable autonomous background agent behavior by itself.
  - `agents.<name>.description`, `instructions`, and `metadata` are accepted
    config fields for purpose, selection, and future workflow policy, but they
    still do not affect runtime selection, browser profile resolution, or
    default service resolution.
  - `agents.<name>.defaults` also remains execution-inert for now; treat it as
    a placeholder seam, not a live override surface.
  - Account identity stays on
    `runtimeProfiles.<name>.services.<service>.identity`, not agent metadata.
    ChatGPT Business/workspace identities should include `accountLevel`,
    `accountPlanType`, and `accountStructure`; Account Mirror uses those
    qualifiers to keep a same-email Business cache distinct from Personal.
  - If both `--profile` and `--agent` are passed, `--profile` wins.
- Use `--team <name>` only for planning and inspection surfaces today.
  - It does not change the active runtime selection.
  - It does not outrank `--profile` or `--agent` because it does not participate in runtime selection yet.
- Profile onboarding and login with managed profiles:
  - `auracall --profile <name> setup --chatgpt` runs the managed-profile setup for that profile and opens a login flow if needed.
  - `auracall --profile <name> login --chatgpt` opens only the managed-profile login flow so you can manually authenticate a second account.
  - `auracall --profile <name> setup --chatgpt --skip-login` verifies an existing session without reopening login.
  - Use `--chatgpt-url` or `profiles.<name>.services.chatgpt.projectId` once signed in to pin to a workspace.
- On WSL, keep the primary WSL Chrome setup on `runtimeProfiles.default` if you want to reuse the long-lived managed browser profile at `~/.auracall/browser-profiles/default/<service>`.
- Use family names like `wsl-chrome-2` for secondary WSL account profiles (for example, `consult@polymerconsultingroup.com`) while keeping `default` as primary.
- Prefer a named `browserProfiles.<name>` block plus `runtimeProfiles.<name>.browserProfile` for runtime/browser-profile wiring instead of teaching raw path wiring as the main pattern.
- `browserProfiles.<name>.keepBrowser` is now the preferred browser-owned home for keep-open behavior.
  - when both are present, `browserProfiles.<name>.keepBrowser` wins over legacy `runtimeProfiles.<name>.keepBrowser`
  - `runtimeProfiles.<name>.keepBrowser` remains fallback-compatible only when no browser-profile value exists
  - compatibility bridge output keeps browser-owned `keepBrowser` on `browserFamilies.<name>`, not on `profiles.<name>`
- Other broad browser-owned overrides under `runtimeProfiles.<name>.browser` are still treated more conservatively for now.
  - active resolution now prefers the referenced browser profile for:
    - `chromePath`
    - `display`
    - `managedProfileRoot`
    - `wslChromePreference`
  - conflicting runtime-profile values for source-profile/cookie-source wiring and debug/tab cleanup controls still win in active resolution today
  - keep using that path only as an intentional advanced escape hatch, not as the preferred public authoring surface
- Compatibility bridge equivalents are:
  - `browserFamilies.<name>`
  - `profiles.<name>.browserFamily`
- `auracall wizard` now emits the primary target shape by default for new profile setup.
- use `--bridge-shape` on `wizard`, `profile scaffold`, or `config migrate` only when you intentionally need compatibility bridge output.
- Use separate named profiles for Windows Chrome or other experimental runtimes.
- `model`, `filesReport`, `heartbeatSeconds`, and `apiBaseUrl` in config override the auto-detected values unless explicitly set on the CLI.
- `llmDefaults.model`, `llmDefaults.modelStrategy`,
  `llmDefaults.defaultProjectName`, and `llmDefaults.defaultProjectId` remain
  compatibility-bridge fields.
  - prefer root `model` plus `services.<service>` or
    `runtimeProfiles.<name>.services.<service>` for active
    model/service/project behavior.
- If `azure.endpoint` (or `--azure-endpoint`) is set, Aura-Call reads `AZURE_OPENAI_API_KEY` first and falls back to `OPENAI_API_KEY` for GPT models.
- Remote browser defaults follow the same order: `--remote-host/--remote-token` win, then `remote.host` / `remote.token` (or `remoteHost` / `remoteToken`) in the config, then `AURACALL_REMOTE_HOST` / `AURACALL_REMOTE_TOKEN` if still unset.
- `OPENAI_API_KEY` only influences engine selection when neither the CLI nor `config.json` specify an engine (API when present, otherwise browser).
- `AURACALL_NOTIFY*` env vars still layer on top of the config’s `notify` block.
- `sessionRetentionHours` controls the default value for `--retain-hours`. When unset, `AURACALL_RETAIN_HOURS` (if present) becomes the fallback, and the CLI flag still wins over both.
- `services.<service>.url` defines global service URL defaults; `runtimeProfiles.<name>.services.<service>.url` can override them per runtime profile.
- `runtimeProfiles.<name>.services.chatgpt.url` (or compatibility `profiles.<name>.services.chatgpt.url`) is the right way to pin a runtime profile to a second ChatGPT workspace/project.
  - Example: `auracall --profile work "..."` uses `https://chatgpt.com/g/p-123456789` from `runtimeProfiles.work`.
- If your preference is not a hard URL, use `runtimeProfiles.<name>.services.<service>.projectId` or `.projectName`:
  - `projectId` is the most explicit; Aura-Call builds the scoped project route from it.
  - `projectName` is resolved via cache/name lookup at runtime and can be ambiguous if duplicate titles exist.
- Migration note:
  - If you already use `projectId`/`projectName` in profile service blocks, you can keep that path and avoid URL pinning entirely.
  - URL pinning is most useful when you want a literal target route (for example, a specific non-project chat folder URL) instead of config-driven project resolution.
- `services.<service>.interactiveLogin` can set a global login mode default; `runtimeProfiles.<name>.services.<service>.interactiveLogin` overrides it per runtime profile (legacy `manualLogin` still works).
- Current browser-mode default posture is still managed-profile interactive
  login:
  - if you do not set `manualLogin` explicitly, `resolveBrowserConfig(...)`
    still defaults browser runs to `manualLogin: true`
  - Aura-Call then derives a managed browser profile dir from
    `browser.managedProfileRoot + auracallProfile + service`
  - set `manualLogin: false` explicitly when you need a non-managed path
- `services.<service>.manualLoginProfileDir` (and its per-runtime-profile override) controls the persistent managed browser profile dir used for interactive login.
  - Treat this as an advanced override. The default path is derived from `browser.managedProfileRoot + auracallProfile + service`.
  - It is only meaningful when `manualLogin` / `interactiveLogin` is enabled
    for that same scope.
  - Resolved service-binding and launch-profile layers should only surface it
    when interactive login is actually enabled; do not treat it as general
    always-live service config.
- Migration note for runtime-profile browser escape hatches:
  - when a runtime profile declares one concrete `defaultService` and there is
    no conflicting service-level value already present, `auracall config
    migrate` may now move:
    - `browser.manualLogin`
    - `browser.manualLoginProfileDir`
    - `browser.modelStrategy`
    - `browser.chatgptMode`
    - `browser.workModel`
    - `browser.thinkingTime`
    - `browser.composerTool`
    - `browser.deepResearchPlanAction`
    into `runtimeProfiles.<name>.services.<defaultService>`
- `interactiveLogin` is the preferred name; legacy `manualLogin` keys keep working with deprecation warnings.
- `services.<service>.features` holds provider-specific feature flags. Typical keys:
  - `chatgpt`: `web_search`, `deep_research`, `company_knowledge`, `apps`
  - `grok`: `search`, `sources`, `apps`
  - `gemini`: `search`, `grounding`, `apps`
- Headless/headful settings belong to the browser layer; keep using `browser.headless` and `browser.hideWindow` until the rename lands.
- `browser.hideWindow: true` is now the recommended default for headful browser automation. Aura-Call launches Chrome with `--start-minimized`, suppresses `Page.bringToFront()` on reuse paths, and only auto-hides windows it just launched itself. On WSL/X11, treat this as a no-focus-steal guarantee first and a literal minimized-state guarantee second, because Chrome's DevTools window-bounds API can still report `windowState: normal` while `_NET_ACTIVE_WINDOW` stays unchanged.
- `services.<service>.thinkingTime` can set a per-service ChatGPT effort default (overrides `profiles.<name>.browser.thinkingTime` when set). Prefer durable selectors: `chatgpt:fast`, `chatgpt:reasoning`, `chatgpt:reasoning-high`, `chatgpt:reasoning-max`, `chatgpt:premium`, or `chatgpt:legacy`. GPT-5.2 and Sol/Terra/Luna spellings remain compatibility inputs and explicit provider-family pins.
- `services.chatgpt.chatgptMode` selects the composer contract and defaults to `chat`. Set it to `work` only when Work is intentional. `services.chatgpt.workModel` is interpreted only by the dedicated Work selector; ordinary `model` and `thinkingTime` remain Chat-mode controls. Runtime-profile service values override global service and transitional root-browser values.
- `runtimeProfiles.<name>.services.<service>.identity` sets the username/email used for cache identity; auto-scraping is disabled unless `runtimeProfiles.<name>.cache.useDetectedIdentity` is set.
- `runtimeProfiles.<name>.browser.profilePath` + `profileName` define the source browser profile; `cookiePath` overrides the derived Cookies DB location. `profileName` accepts either the on-disk Chromium directory (for example `Profile 1`) or the friendly UI label.
- when both exist, active resolution now prefers the referenced browser profile
  over conflicting runtime-profile browser aliases for:
  - `blockingProfileAction`
  - `chromePath`
  - `display`
  - debug-port controls
  - `headless`
  - `hideWindow`
  - `remoteChrome`
  - tab/window cleanup controls
  - `managedProfileRoot`
  - source browser profile / cookie-source wiring
  - `wslChromePreference`
- the remaining live runtime-profile `browser` advanced override surface is now
  empty for the browser-owned launch/browser-family field class in this lane.
- if a runtime profile still carries browser-owned fields after that rewrite:
  - with a referenced browser profile, those runtime values are compatibility
    residue and should be removed or migrated
  - without a referenced browser profile, those values are still live only
    because the runtime profile has not been moved onto an explicit browser
    profile yet
- `runtimeProfiles.<name>.defaultService` chooses the default browser target when no explicit model or `--target` is set.
- `agents` and `teams` are reserved top-level config blocks for the future config-model refactor.
  - Aura-Call now lets `--agent <name>` resolve through `agents.<name>.runtimeProfile` for selection semantics only.
  - `agents.<name>.description`, `instructions`, and `metadata` remain
    organizational/future-workflow fields today.
  - `agents.<name>.defaults` remains a placeholder seam and does not currently
    change runtime selection, browser profile resolution, or default service
    resolution.
  - this phase does not define any typed live agent-owned defaults yet; if
    you need different live behavior, model it as a different AuraCall runtime
    profile instead of assuming the agent layer already owns execution
    defaults.
  - They still do not introduce separate agent or team execution behavior yet.
- `runtimeProfiles.<name>.cache.*` sets defaults for cache behavior (including `store`, `refreshHours`, and `rootDir`).
- `runtimeProfiles.<name>.cache.includeProjectOnlyConversations` controls whether refresh also inserts project-only conversation IDs that were not present in the global history snapshot.
- `runtimeProfiles.<name>.cache.cleanupDays` sets the default retention window for `auracall cache cleanup --days`.
- Mirror-oriented cache defaults are usually `includeHistory: true`, `includeProjectOnlyConversations: true`, `historyLimit: 2000`, and `cleanupDays: 365`.
- Lazy account mirroring must remain polite by default:
  - routine mirror scans use provider-specific minimum intervals with
    deterministic jitter
  - explicit refreshes are still rate-limited and jittered
  - provider hard stops such as CAPTCHA, `sorry`, account challenge, rate
    limit, or sign-in required states impose long cooldowns instead of retry
    storms
  - ChatGPT rate-limit detections retain a bounded per-browser-profile history
    and escalate cooldowns up to six hours; successful reads do not erase the
    recent detection streak
  - account-mirror scheduler pause/resume is durable across API service
    restarts and is hydrated before startup cadence is scheduled
  - terminal completion-owned materialization starts a fresh collector minimum
    interval from its provider-work settlement; elapsed time while
    materialization was still active does not satisfy that quiet window
  - each mirror pass has page/read budgets and should prefer metadata before
    full content or binary artifact retrieval
  - `liveFollow.freshFrontierThreshold` optionally controls how many contiguous
    cached-fresh reverse-mtime conversation rows stop steady-follow detail
    scanning; the default is `3`
  - account-mirror development controls require the installed service capability
    `AURACALL_ACCOUNT_MIRROR_DEVELOPMENT_CONTROLS=1` and an explicit,
    target-bound `development` request with wall-time, conversation,
    materialization-candidate, and pass limits; ordinary requests cannot infer
    development mode from `NODE_ENV` or a runtime-profile name
  - development overrides may relax deadlines, interaction rates, and cooldowns,
    but never bypass provider guards, CAPTCHA/sign-in stops, identity checks,
    foreground preemption, or browser-operation ownership
  - a phase-isolated `detail-inventory` development run uses `steady_follow`;
    `full_sweep` intentionally refreshes project/root discovery before detail
    work even when `requestedPhase` is supplied
- `runtimeProfiles.<name>.cache.store` controls cache backend: `json` keeps legacy JSON files only, `sqlite` uses SQLite only (`cache.sqlite` per provider+identity), and `dual` reads/writes SQLite plus the JSON mirror (recommended migration mode).
- `dev.browserPortRange` sets the fallback DevTools port range used when spawning new Chrome instances (profile/browser overrides still win).
- `browser.*` legacy keys are still accepted and override profile defaults when present (CLI flags still win).
- `browser.debugPortStrategy` controls how Aura-Call chooses a DevTools port when it launches Chrome. `fixed` honors `browser.debugPort` / `AURACALL_BROWSER_PORT`; `auto` lets Chrome choose and then adopts the real endpoint from `DevToolsActivePort`. `AURACALL_BROWSER_PORT_STRATEGY` can override it at runtime. On WSL when `browser.chromePath` points at a Windows Chrome executable, Aura-Call now defaults to `auto`.
- `browser.debugPort` and `--browser-port` are best treated as fixed-port escape hatches for local debugging or special manual workflows. They are no longer the recommended primary configuration for integrated WSL -> Windows Chrome runs.
- `browser.blockingProfileAction` controls how Aura-Call handles a running Chrome profile without DevTools (`fail`, `restart`, `restart-managed`). Default is `restart-managed` (only restarts Aura-Call-managed profiles). (`restart-auracall` is still accepted as an alias.)
- `browser.managedProfileRoot` sets the profile root considered Aura-Call-managed when `blockingProfileAction=restart-managed`.
- `browser.serviceTabLimit`, `browser.blankTabLimit`, and `browser.collapseDisposableWindows` control Aura-Call’s tab/window cleanup policy per profile. Defaults are `3`, `1`, and `true`: reuse exact/blank/same-origin/compatible-host tabs first, then keep at most 3 matching-service tabs, at most 1 spare blank tab, and collapse extra windows only when every tab in that window is disposable for the same profile/service action.

If the config is missing or invalid, Aura-Call falls back to defaults and prints a warning for parse errors.

Chromium-based browsers usually need both `chromePath` (binary) and `chromeCookiePath` (cookie DB) set so automation can launch the right executable and reuse your login. See [docs/chromium-forks.md](chromium-forks.md) for detailed paths per browser/OS.

## Terminal-session receipts

The provider-neutral terminal-session receipt producer is opt-in and disabled
when `terminalSessionReceipts` is absent. Enable schema version 1 with one
explicit allowed root:

```json5
{
  terminalSessionReceipts: {
    enabled: true,
    schemaVersion: 1,
    root: "auracall-home", // managed owner-only terminal-session-events child
  },
}
```

`root` may be `auracall-home` or a normalized absolute path. Relative paths,
path traversal, filesystem roots, symlinks, non-owner paths, and roots or
managed subdirectories with group/other permission bits fail closed. Newly
created directories use mode `0700`; immutable result and receipt files use
mode `0400` on POSIX systems.

For successful terminal sessions, AuraCall writes and syncs the canonical
result inside the allowed root, persists terminal session metadata containing
only the relative result locator/digest/size and immutable event identity, and
then atomically publishes the receipt. Error and cancelled receipts contain no
raw diagnostic message. A publication failure is retained as delivery status;
it does not rewrite the session outcome or retry model/provider work.

Use these readback and recovery surfaces:

```sh
auracall terminal-receipts status
auracall terminal-receipts status --json
auracall terminal-receipts status --session <session-id>
auracall terminal-receipts status --reconcile
```

Status shows a sanitized root label and fingerprint, schema version, last
successful emission, last bounded failure, and last reconciliation counters.
`--session` verifies the receipt identity plus result digest without printing
the result. `--reconcile` is idempotent: an existing immutable event is
deduplicated, a terminal error/cancellation can be reconstructed from bounded
metadata, and a successful session without a durably persisted result intent is
left without a receipt rather than inferred as successful.

## Session retention

Each invocation can optionally prune cached sessions before starting new work:

- `--retain-hours <n>` deletes sessions older than `<n>` hours right before the run begins. Use `0` (or omit the flag) to skip pruning.
- In `config.json`, set `sessionRetentionHours` to apply pruning automatically for every CLI/TUI/MCP invocation.
- Set `AURACALL_RETAIN_HOURS` in the environment to override the config on shared machines without editing the JSON file.

Under the hood, pruning removes entire session directories (metadata + logs). The command-line cleanup command (`auracall session --clear`) still exists when you need to wipe everything manually.

## API timeouts

- `--timeout <seconds|duration|auto>` controls the overall run deadline. Bare
  numbers are seconds; human-readable units and compounds such as `90s`, `60m`,
  and `1h30m` are accepted.
- Defaults: `auto` = 60 m for `gpt-5.1-pro`; non-pro API models use `120s` if you don’t set a value.
- Heartbeat messages print the live remaining time so you can see when the client-side deadline will fire.

### Native viewer observation renewal

The desktop client renews passive observation grants every four minutes through
the existing native viewer. Its iframe and native settings remain mounted.
Control claims retain their existing verified release and inactivity rules.


### Automatic AuraCall desktop pool

To place unpinned browser profiles automatically, configure `remoteView.pool.name`
with the existing native application origins. Example:

```json5
remoteView: {
  application: {
    name: 'auracall',
    origin: 'http://127.0.0.1:19096',
    publicOrigin: 'https://remote-view.example.test',
    appOrigin: 'https://auracall.example.test'
  },
  pool: { name: 'main' },
  desktops: {}
}
```

The desktop rail keeps sleeping runtime profiles visible. Wake reuses a healthy
empty desktop or grows the pool. At the configured capacity it wraps around to
the least crowded healthy desktop. The maximum comes from Remote View's consumer
pool policy (`maximum_reserved`); it is not hard-coded in AuraCall. Set that
policy to the desired limit, such as ten, and enable `allow_scale_in` for shrinking.

Automatic mode ignores old remembered Wake placement as a permanent pin. Explicit
browser/runtime desktop selections still take precedence, including `root`.
Existing running browsers retain their exact placement until deliberately closed
and awakened; enabling the pool does not move a process between displays.

While the API service runs, maintenance retains one ready spare where capacity
permits and returns excess verified-empty desktops. Remote View owns physical
cooldown and retirement. Open browsers, human viewers/control, unresolved recovery,
unknown observations and ambiguous operations prevent unsafe cleanup. Inventory
exposes the latest maintenance state. No chat is submitted by Wake or maintenance.


## Browser opening and desktop input control

Browser and new-target opening are independent of desktop input ownership. Automatic placement uses the native pool’s configured maximum, grows with demand and wraps when full; shrink remains guarded by empty-capacity custody. Desktop human-control ownership continues to protect interaction with existing pages. A retained input claim must not be used to prevent browser opening. Issue253/Plan0405 record the source and acceptance boundaries.

Desktop input-control ownership records are validated before automation. An invalid or incomplete record blocks interaction with an explicit recovery error and is preserved for diagnosis. Ownership is published by atomic rename so readers cannot observe a partially written owner.json. Browser opening remains independent of input ownership. Recovery of existing unknown ownership requires qualifying the retained control state; no automatic deletion is performed.

Developer-mode visibility is an independent, optional observation during installed-app inventory reads. If that bounded predicate evaluation expires, the inventory retains Developer mode as unknown. Existing-app tests still require exact account/app identity and complete inventory; creating or replacing an app requires confirmed enabled Developer mode. Transport, navigation and cancellation failures remain errors.

A retained native browser can open a replacement tab/window when its existing window has closed. Opening verifies exact retained process identity and current desktop assignment/display. Existing-page interactions still require current desktop window proof and input ownership. A live retained process cannot be silently moved to root by changing configuration.

Cold startup opens and records custody of a required replacement page before retiring its selected incompatible startup page. Closing the sole page first can terminate Chromium. If replacement creation fails, startup is preserved; if retirement fails, replacement custody is retained and the command reports the incomplete handoff.

ChatGPT app tests qualify one visible enabled composer outside dialogs, supporting both legacy editor ID and the current rich Ask ChatGPT editor. Missing or ambiguous editors stop before input; a missing clear readback is not success. Exact app identity and account checks still apply.

Current app-picker rows require the installed app description as well as name; a same-name custom GPT is insufficient. Missing description or duplicate matching rows stops selection. Legacy picker rows retain exact-name qualification. The selected pill must still carry the exact app identity before Send.
