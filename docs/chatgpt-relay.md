# ChatGPT OAuth MCP relay

AuraCall can offer a request panel inside ChatGPT using its existing OAuth HTTP
MCP server. A local Codex/operator process stages an explicit approved request.
ChatGPT reads it through authenticated tools, then returns the entire final
answer through `relay_reply`. Codex reads the exact saved answer with `status`.
This is a ChatGPT/plugin exchange, not a provider API call or a browser launcher.

## Current verification boundary

The source provides the private store, CLI, OAuth resource server and static
panel. Synthetic signed-token loopback MCP and real local-process fixtures prove
delivery/persistence behavior. Actual OAuth consent, endpoint publication,
ChatGPT account/plugin installation, selected Pro intelligence, complete live
provider answer and native browser continuity require separate real acceptance.
No ready public URL, browser capability or model entitlement is implied.

The panel feature-detects the documented ChatGPT compatibility methods
`callTool` and `sendFollowUpMessage`. It only posts to the current conversation;
it assumes no new-conversation, sidebar, Work-only or desktop-only Extension.
Unavailable methods leave dispatch disabled. Verify the actual client and model
combination; do not substitute an API or another account when it is unavailable.

## Prepare the existing identity/endpoint binding

Use the existing approved authorization provider, registered owner and DEV
HTTPS ingress. `configs/relay-oauth.example.json` contains placeholders, not a
deployment. Make a private owner-only copy and replace every placeholder with
the approved values. `resource` is the exact canonical HTTPS MCP URL and token
audience. `issuer`, `jwksUri` and `subject` must match the real authorization
server and registered owner. Access tokens require `at+jwt`, RS256/ES256, expiry
and the exact resource audience. The authorization server owns consent, PKCE,
client registration, token issuance and refresh; AuraCall does not create these.

Permissions may use a space-separated `scope` string or an `scp` string list,
as used by Authelia JWT access tokens. When both claims are present they must
grant the same set. Malformed, oversized or conflicting claims refuse before
MCP tools are constructed. Signature, issuer, exact audience and owner checks
apply before either claim is read.

Grant only the needed `relay:read`, `relay:dispatch` and `relay:reply` scopes.
The server binds loopback; approved HTTPS ingress must preserve the canonical
Host. It rejects foreign Host/Origin, URL/body tokens, wrong audience/subject,
expired tokens and insufficient tool scope. The relay mode exposes no frontend
or browser-control tools. The UI has no external scripts/network endpoints and
receives no OAuth bearer credentials.

The relay store is an explicit private POSIX directory (Linux/WSL). Config and
request files must be regular owner-private files; store files/directories must
also belong to the executing user. Do not place live private state in a shared
checkout or modify another owner's configuration, service or registration.

### Verify the public OAuth route

Qualify the real issuer discovery and JWKS before preparing client fields. A
working browser login page does not establish an OAuth issuer. For a registered
public client, use the exact callback displayed by ChatGPT, PKCE `S256` and token
endpoint authentication `none`; the client identifier must actually be registered.
Authelia must issue signed JWT access tokens for the exact MCP resource audience,
including the allowed relay scopes. Qualify the deployed version and token shape.

The public edge must route both protected-resource metadata paths to the relay
without requiring a prior browser login. Their GET/HEAD responses must be 200 JSON.
An unauthenticated POST to `/mcp` must return 401 with a Bearer `resource_metadata`
challenge. GET `/mcp` returns 405 in this server; it is not the authentication test.
Preserve dashboard SSO and the relay's Bearer checks. Validate the actual upstream
and durable port source rather than copying the example port into live routing.
Discovery and source tests are separate from real client consent and tool use.

## Stage and read one request

Use an opaque request ID of8–128 letters, digits, underscores or hyphens. A private
JSON input has `requestId`, exact `prompt`, and optionally `previousRequestId`.
The latter must already have a saved reply. Existing IDs accept identical
content only; changed content refuses. Prompts retain leading/trailing whitespace.
`attachments` may be absent or empty. Nonempty attachments explicitly refuse:
this first relay does not upload/commit ChatGPT files. Never omit figures or
replace a frozen attachment packet with text to bypass that boundary.

```sh
export AURACALL_RELAY_OAUTH_CONFIG=/absolute/private/relay-oauth.json
node dist/bin/auracall-relay.js enqueue /absolute/private/request.json
node dist/bin/auracall-relay.js serve
```
In plain English: select the reviewed private settings, save one approved request,
then run the relay on its configured loopback port. This writes private request
state and starts a local server; it does not publish an endpoint or send a prompt.

After the existing approved endpoint is qualified, add its MCP URL and OAuth
connection in ChatGPT Plugins and complete the normal consent. Open
`relay_open` for the explicit request ID, load the request, verify the selected
model/intelligence in ChatGPT, and choose **Ask ChatGPT** once. The panel first
persists one exclusive claim and only a fresh claim permits its message request.
ChatGPT must read `relay_request`, complete the task, and call `relay_reply` with
the original request/claim IDs and the entire answer.

```sh
node dist/bin/auracall-relay.js status YOUR_REQUEST_ID
```
In plain English: read the original request and complete saved answer locally,
including after a server/client restart. This never sends or retries a message.
The output may contain private task material; keep it in the authorized workflow.

## Completion, uncertainty and limits

A successful panel message call is only message submission, not a model reply.
Claims never expire into a fresh dispatch and have no automatic stale recovery.
Repeated or concurrent claims cannot authorize a second panel message. Unknown
delivery leaves the original claim held; read back that original request, never
create another ID or resend. A late original answer can still be stored against
the original claim. Exact repeated answers read back; conflicting answers refuse.
An existing complete reply remains readable even if a later hold/cleanup fails.

Saved replies include their exact UTF-8 SHA256 digest. Prompts allow131,072
characters, answers262,144; oversize input refuses rather than truncates. Relay
HTTP bodies are bounded at2MiB; legacy frontend mode retains its64KiB ingress.
`providerResponseId:null` and `liveVerified:false` remain explicit: a relay claim
ID is not a native ChatGPT response ID, and OAuth delivery does not prove native
browser continuity, project, model or intelligence.

The existing owner must reconcile approval, current source/packet hashes,
original conditional intent and shared Send ledger **before staging/dispatch**.
These generic relay records do not issue browser grants or supersede that ledger.
In particular, the standing PD request2d52984e remains unclaimed until its eight
unchanged committed files, actual Pro, current project/custody and remaining
shared two-Send checks pass. Do not use a generic canary in its place. No watcher,
scheduler, automatic refresh/replay or provider call runs in this implementation.

## References

- [OAuth client/server flow](https://developers.openai.com/plugins/build/auth#oauth-flow)
- [Connect a custom MCP server](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Component bridge capabilities](https://developers.openai.com/plugins/reference#capabilities)
- [MCP App compatibility methods](https://developers.openai.com/plugins/build/chatgpt-ui#prefer-shared-fields-and-methods)
