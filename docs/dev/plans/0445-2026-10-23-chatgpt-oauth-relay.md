# P445: OAuth MCP request/reply relay

State: OPEN — reviewed source delivered; real setup/acceptance pending.
Owner: AuraCall, thread01a16096-da12-7753-8d44-e299c2172cef.
Parent: P444 / private personal work-tracker81.

## Authority and outcome

Direct human approval: "sounds like a plan. implement that and also i have
agent browser open so you can attach to it." Extend the existing OAuth HTTP MCP
resource server with a minimal ChatGPT relay panel. Codex stages an explicit
request locally; the authenticated ChatGPT client reads it and returns a complete
reply. Preserve request identity, linked reply context and full durable readback.
Reuse installed SDK1.32.0 and jose; no dependency installation or second server.

## Boundaries

- Own AuraCall checkout/branch only; preserve the preexisting AGENTS.override.md.
- Same3.6M/source3568600, fixed143981 baseline, carried spending and holds.
- Browser owns its active P266 producer, lifecycle, custody and private handoff.
  A no-launch plan selecting another profile or proposing launch is not usable.
- Keep the stock Chrome human sharing task. No route is silently replaced.
- Conditional PD request2d52984e remains unclaimed until its exact current-source,
  eight-file, actual Pro, project/custody and shared two-Send gates pass. This
  source slice stages no real provider job and consumes no provider Send.
- OAuth protects access to relay tools. It neither signs into ChatGPT nor proves
  the selected model, website intelligence, native conversation ID or live reply.
- No provider API, generic browser control, issuer/client registration, service
  activation, public/LIVE deployment, scheduler, wake or new writer.

## Implementation and proof

1. Private durable request/claim/reply store: stable IDs, conflicts refuse,
   exclusive claim before the panel's only message request, no claim renewal or
   automatic uncertainty replay; exact full text survives a new store instance.
2. Relay-only mode on the existing HTTP OAuth transport. Explicit fixed subject,
   audience/issuer validation and separate read/dispatch/reply scopes. Never
   construct frontend/browser services in relay mode. Preserve frontend mode.
3. MCP tools plus static in-ChatGPT panel. Require an explicit request ID and
   user action, feature-detect the supported component bridge, and refuse repeat
   dispatch. No external scripts or browser cookies/tokens in the panel.
4. Local producer CLI for enqueue/readback using the same private owner config.
   Attachments remain explicitly unsupported in this first relay slice; never
   discard them or pretend tool text is eight committed ChatGPT uploads.
5. Focused store, actual loopback OAuth MCP and panel behavior tests, then
   typecheck/build/scoped lint and separate native Standards/Spec review.

## Current state

Existing source a7887b3c already has a frontend-only OAuth HTTP resource server.
No reviewed P266 producer export/private consumer handoff has arrived. The fresh
no-launch access plan selected another Service profile and proposed tab_new /
launch_new_browser; no effect was executed. Approved DEV issuer/resource/private
deployment bindings are requested through Chief; no URL is invented. Source and
synthetic roundtrip proof can proceed while these live dependencies remain open.

## Source result and remaining acceptance

The relay store, six scoped MCP tools, current-conversation panel and local
enqueue/status CLI are implemented. Native Standards PASS and source Spec PASS
follow the initial blocking panel race finding and its retained regression/fix.
Overlapping loads cannot replace a request during dispatch; uncertainty remains
bound to the captured original request. Tool descriptors explicitly permit panel
access while keeping reply submission model-only. Full task Spec remains PARTIAL.

Production build, full typecheck and scoped lint pass. The same 94 affected checks
pass on a fresh Linux validation copy with exact source hashes, the same lockfile
and the existing cached dependency versions; no install or timeout change.
The Windows-mounted checkout retained a 93/94 result: the unchanged compiled CLI
process fixture exceeded its five-second startup wait. Direct import timings
there were 1.523s for config and 13.611s for the HTTP server. The unchanged fixture
passes on Linux storage. An exploratory change to the ordinary MCP CLI entry was
reverted; it was unnecessary to the relay. Initial failures remain in evidence.

Evidence: prep/auracall/validation/evidence/oauth-relay-20261023 relative to the
shared workspace, including LINUX-FINAL-CHECKS.json, copy/hash/dependency parity,
panel race and widget access RED/GREEN receipts and native review adjudications.
No live endpoint/issuer/subject binding is configured; example values are inert.
Chief has the existing-binding request. Browser's reviewed producer contract and
exact private consumer handoff remain absent. An open browser is not that handoff.
Stock Chrome sharing and the original conditional PD task remain preserved.

Next eligible actions are to qualify the approved OAuth endpoint and consent,
receive Browser's reuse-only handoff, then verify the actual client/model and
complete correlated reply/readback within the existing Send ledger. This slice
uses zero real Sends, uploads or browser input. Actual acceptance stays 3/6=50%.
