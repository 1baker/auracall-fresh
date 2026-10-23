# Use the Chrome conversation already open on your computer

This DEV source candidate connects AuraCall directly to stock Chrome. Agent Browser
is optional future integration for this route. No browser is launched, restarted,
copied, navigated or closed. Chrome retains your existing website sign-ins.

**Current verification:** Linux offline source/process fixtures only. Actual
Windows setup, Chrome permission prompts, document/keyboard behavior, website model
entitlement and real replies remain unverified. Do not treat this document as an
installation or LIVE approval. Existing native-effect holds remain in force.

## What using it will look like

After the separately reviewed setup, open an existing ChatGPT or Grok conversation
(`/c/...`) and click the AuraCall extension. Chrome asks for its normal debugging
permission; the extension badge says **ON** only after the local bridge accepts
that tab. The debugging permission can inspect/control pages; this candidate's
code restricts it to explicitly shared ChatGPT/Grok conversations. It has no
cookie, history, download, tab-creation or navigation operations. No remote
debugging toggle, headless browser, provider API key or new website login is part
of this design. A normal browser permission/automation banner is expected.

AuraCall's existing `frontend_inspect`, `frontend_configure`, `frontend_send` and
`frontend_status` tools then operate that conversation. ChatGPT intelligence uses
visible controls and arrow keys; Grok Heavy uses its visible model menu. Full
replies and linked request IDs use the existing durable frontend request store.
Neither a model label nor a tool receipt proves provider entitlement or actual
generation. Those need the real-browser acceptance run.

Click the extension again to revoke the share. Navigation, reload, human
verification, debugger detachment or native disconnect invalidate it. Chrome tabs
stay open. V1 requires an existing conversation; it does not navigate from a root
page or automatically recover a different conversation/document. Tab handles are
session-bound. Re-sharing needs a freshly prepared configuration; completed records
remain bound to their old route and can be read with that original configuration.

## Source/build and proposed setup

`pnpm run build:stock-chrome` prepares `dist/stock-chrome/` containing:

- `extension/manifest.json` and `worker.js` for the unpacked extension;
- standalone Node22+ `native-host.mjs` and `frontend-mcp.mjs` entry points;
- `prepare-host.mjs` and `configure.mjs` setup helpers.

The checked-in public extension key pins the expected unpacked extension ID to
`iikcjmnbnpamgdjedcgcghoaimaegaho`. It is a public ID/key, not a credential. Verify
the actual ID in Chrome during setup. No extension private signing key is stored.

`prepare-host.mjs` takes an output directory, the intended Windows bundle directory,
the explicit Windows Node executable and that extension ID. It writes a native
manifest, host config, quoted batch launcher and setup note. It refuses shell
expansion characters in Windows paths and does not overwrite existing files.
It performs no Windows command or registry change.

The proposed setup is deliberately separate from running this helper:

1. Verify the current Windows user, available Node22+, actual stock Chrome and
   intended directory. Copy the pinned bundle to that directory.
2. Review the extension permissions and load its `extension/` directory into the
   existing Chrome. Verify the pinned ID; preserve current tabs/sign-ins.
3. Inspect and preserve any existing current-user registration for
   `HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.auracall.stock_chrome`.
   Only after approval, bind its default value to the prepared native manifest.
   No machine-wide registry key, service or debugging toggle is required.
4. Prepare the bundle's `private/` directory with the current user's private ACL.
   The host and client check owner and ACL on Windows with a bounded, read-only
   PowerShell check of those exact paths. Other users' data-read/write/delete/ACL
   grants or a reparse point refuse startup/use. SYSTEM/Administrators retain their
   normal administrative rights. No automatic ACL repair is performed. This
   Windows check is implemented but has **not** run in the source-only test lane.
5. Explicitly share the existing provider conversation. The native host starts
   only when Chrome connects it, binds Windows loopback and exclusively creates a
   private `connection.json`. A stale file refuses startup; it is not overwritten.
6. Run `configure.mjs` with the explicit connection file, new output config file,
   `chatgpt` or `grok`, exact shared conversation URL and expected visible model.
   It requires exactly one matching shared tab and writes a private config without
   exposing the local capability. Use a separate route config per chosen tab.
7. Run `frontend-mcp.mjs` with `AURACALL_FRONTEND_CONFIG` naming that file and an
   explicit private `AURACALL_HOME_DIR`. Run the host and MCP with the same Windows
   user/runtime. From WSL, a reviewed Windows Node stdio launch avoids assuming
   WSL can connect to Windows loopback or reading Windows credentials into WSL.

No step above has been performed against the human's Chrome by this source slice.
Windows launcher, registration, ACL behavior and WSL stdio interoperability all
require the bounded native setup/acceptance phase. Rollback must restore any prior
registration and remove only this candidate after its shares are revoked. It must
not close Chrome or delete browser profiles.

## Request and failure behavior

The native messaging host accepts only its configured extension origin. Local HTTP
requires its random private capability and exact loopback Host, and rejects web
Origin requests. Only live shared handles from that native session are accepted.
The default Agent Browser transport rejects stock-Chrome handles; the explicit
`transport: "stock_chrome"` configuration selects this adapter. Legacy routes stay
available without changing their semantics.

The public broker supports the frontend's existing synchronous service-request v1
shape. It translates only four compiled, read-only ChatGPT/Grok DOM recipes,
single click/focus/fill steps and slider arrow keys. It never executes caller-
supplied probe JavaScript, arbitrary CDP methods, provider network requests, or
ChatGPT's `Answer now`. Real mouse/key/text input uses Chrome's Input interface;
DOM reads and focus/locator preparation use the same attached tab.

Every operation checks the shared URL/document, with per-target serialization.
Existing drafts, ambiguous/hidden/obscured controls and challenges stop input.
An unconfirmed/timed-out input fences further writes on that share; read-only
status recovery is allowed. There is no automatic replay. Human reconciliation
and an explicit fresh share/configuration are required before more writes after
that fence. This conservative v1 behavior is separate from the existing MCP
request store's recovery of already-completed replies.

The HTTP listener and discovery file end with the native connection. Only its
own unchanged discovery file is removed. Completed frontend records remain
readable after both the native host and connection file disappear, without a
browser call, using the original configuration and private AuraCall home.

Protocol references: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging),
[Chrome debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger),
and [Google's native messaging sample](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/api-samples/nativeMessaging).
