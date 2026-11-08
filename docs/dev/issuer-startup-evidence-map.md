# Issuer startup transaction: evidence/action map

Status: working checklist, not an approval, runbook or receipt. It records what
must be true before the authorization server (issuer) is restarted with a new
client registration, who supplies each piece and where to stop. Nothing here
qualifies a checkpoint, registration, startup, browser session or the
autonomous ChatGPT exchange.

## Labels

- `SOURCE_SUPPORTED`: established by public upstream source/docs or this repo.
- `ACTUAL_REQUIRED`: needs evidence from the real deployment; not yet supplied.
- `UNSUPPORTED`: an examined interface or method that must not be used for this
  purpose. It does not mean the goal is impossible by another interface.
- `UNKNOWN`: not yet examined. UNKNOWN never counts as ready.

Commands are TBD unless already qualified. Candidate command shapes below are
public syntax only, not execution-ready steps.

## Required order

1. Persistent restart inhibit, writer exclusion, request drain and a consistent
   checkpoint, all covering the live interval that follows.
2. Private key holder, staged config candidate and validation of that candidate.
3. Explicit no-force stop.
4. Known stopped exit (same container, native evidence).
5. Config commit through the original file (same inode).
6. Exactly one start.
7. Verification that the new process consumed the new inputs.
8. Restore restart policy/supervisor only after verified safe state.

A client-side timeout does not cancel a stop the daemon may already have
received. Any uncertain state stays inhibited with no automatic retry, start,
kill or restore.

## Map

| Row | SOURCE_SUPPORTED | ACTUAL_REQUIRED | Supplier | Next action | Stop if |
| --- | --- | --- | --- | --- | --- |
| INPUTS | Issuer root command loads and validates config, then builds providers ([root.go], [context.go]). Earlier release-byte match is historical only. | Incoming config bytes/inode, filters, overrides, env roles and source precedence for the next start. | Root preflight, after its corrected reader is accepted | One coalesced metadata acquisition | Any dynamic or unresolved input |
| CONTROL | `docker container stop/start/update` semantics ([stop], [start], [update]). | Actual CLI/daemon support, stop signal handling, init forwarding, restart policy, AutoRemove, external supervisor; writer exclusion and drain interfaces. | Existing deployment administrator/controller | Qualify these in the same acquisition | No same-container before/after readback of the inhibit |
| CHECKPOINT | Config-only rollback preferred; database restore is never automatic. | Storage backend type, its supported consistent snapshot method, protected destination owned by the original holder. | Original holder/administrator | Identify backend from incoming provider derivation | Snapshot lacks provenance or verification |
| SSO | Sessions, durable OAuth/device/replay/subject storage and the startup client registry are separate. Preserve sessions by default. | A real preservation/migration interface, or an explicit human choice for this exact reviewed transition. | Issuer lifecycle interface; human only when ready | None now; no abstract question is due | Neither preservation nor accepted transition exists |
| HOLDER | Client fields follow [chatgpt-relay.md] OAuth route rules (registered public client, PKCE S256, exact resource audience). | Protected key holder and custody; registration derived from that actual key. | Original holder/custodian | Qualify custody before any key action | Only a label/hash stands in for custody |
| STAGE_VALIDATE | Editor stages on the current original preimage, preserving unrelated and legacy bytes. | Validator argv, transitive I/O, log/output suppression and effect bounds (currently unselected). | Root, with qualified original binary/inputs | Freeze validator effects and output limits | Validation would emit raw diagnostics or secrets |
| STOP_COMMIT_START | Stop with SIGTERM and timeout -1 avoids SIGKILL escalation ([stop]). | Signal handler/init support; finite outer, stop-observation and startup-verification bounds. | Root plus controller | Qualify signal handling; agree finite bounds | Stop outcome unknown, or no native exited evidence |
| NEW_RECEIPT | Receipt must bind a new process epoch to the incoming inputs, not a digest or health check alone. | Creator interface and reader that prove startup consumption. | Native lifecycle controller | Define consumption proof under writer exclusion | Writers/sources still open, so consumption cannot be proven |
| VERIFY_RECOVERY | No token/grant/code minted as a readiness probe; no relay retry. After a possible start, return one recovery operation, never auto-repair. | A supported non-grant-minting verification interface and baseline for legacy clients. | Root | Name that interface and baseline | Any doubt; keep inhibitors |
| HANDOFF | Restore policy/supervisor last. | Whether the selected route needs the legacy relay (its deployed `-32603` cause is unresolved). | Chief and Root | Record outcome for later deployment and browser qualification | Exchange stays NOT_RUN until genuine success |

## UNSUPPORTED (examined)

- Default `docker container stop` timeout or `restart` for this transition: can
  escalate to SIGKILL ([stop]).
- Fallback kill, pause or freeze, or looping stop requests.
- Copying database files or sidecars as a backup; an arbitrary temp/cache
  directory as the protected destination.
- Using health checks, digests or labels as proof of startup consumption.
- Minting a token, grant or authorization code to test readiness.

## Open unknowns

Writer exclusion, drain, supervisor hold, backup destination and snapshot API,
SSO preservation, validator effects, finite deadlines, creator/consumer
verification, and legacy-client verification are all UNKNOWN until real
deployment evidence is supplied.

[root.go]: https://github.com/authelia/authelia/blob/1b524f7f4bbf7b5637f4c6b98f4f66fd4b4aed91/internal/commands/root.go
[context.go]: https://github.com/authelia/authelia/blob/1b524f7f4bbf7b5637f4c6b98f4f66fd4b4aed91/internal/commands/context.go
[stop]: https://docs.docker.com/reference/cli/docker/container/stop/
[start]: https://docs.docker.com/reference/cli/docker/container/start/
[update]: https://docs.docker.com/reference/cli/docker/container/update/
[chatgpt-relay.md]: ../chatgpt-relay.md
