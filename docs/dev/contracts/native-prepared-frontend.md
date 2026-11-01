# Private prepared-run frontend host

This source continuation lets the existing initial-v4 factory own a private MCP
connection before it can acquire a native frontend. It is a compiled operator
interface, not a CLI/JSON mode, deployment command, transport grant or public tool.
Actual G2 custody, authenticated peer/channel, full accounting, usable rights,
native authority and canonical terminal verification remain required.

## Same-factory lifecycle

1. Construct `createPreproducerAccountedNativeCallbackIntegration` once with the
   actual selected binding, parent transport and original accounting selection.
   Its existing `prepare(binding, source)` returns the actual opaque capability.
2. Call that same factory's `retainPreparedRun(cap)` in reserved phase. It issues
   one opaque `RetainedPreparedNativeRun`. The same module's
   `takeRetainedPreparedNativeRun` consumes it once; clones, JSON and repeat
   consumers refuse. The handle retains the actual factory's `checked` /
   `assertPhase`, one peer, actor, producer and native-link methods. It constructs
   none of them again. Existing factory methods retain their own once/hold gates.
3. `startPreparedNativeFrontendStdioHost({prepared, intent, channel})` consumes the
   handle, checks the actual run/channel and connects one `McpServer` over the
   explicitly supplied streams. The same four frontend tools are declared but
   refuse before native linking; connecting, catalog reads and ping never start
   a producer or acquire a runtime.
4. The returned private `runProducer(operation, run)` explicitly delegates to the
   same factory under its original reservation and phase driver. No tool or ping
   invokes it. Its opaque value remains local through the original AFTER checks.
5. The private `linkNative({input, ownerAuthority, producerTaskId})` verifies the
   actual native input/link through that same factory, consumes its resulting
   native integration once, and calls the existing runtime/finite-facade binder
   once. The same server, transport and SDK client remain connected. No native
   IDs or prospective receipt are invented before this step.

The host's `runtime` is undefined before promotion. After acquisition it retains
the original runtime, including one acquired late after channel loss; callers
must reconcile it rather than restart. `readOriginalTrace` delegates only the
existing same-capability trace read and makes no new readback/recovery guarantee
when authority is held. Server close/EOF holds the actor/runtime; it does not
release the producer, cancel input or refund rights.

## Guarded ping has a narrow meaning

Only the prepared host replaces the SDK automatic pong. Its handler runs the
same factory-derived phase assertion and the actual private-channel check,
with currentness/hold checks around awaits. It performs no producer, SDK, page,
observer reservation, control or Send operation. Guard calls are additional
control-plane activity whose real trace/cost qualification must not be silently
excluded from runtime accounting.

The SDK accepts request metadata through `Client.request`; its convenience
`Client.ping` has no metadata argument. This source handler does not interpret
canonical metadata or create either `CanonicalDispatchAuthority` callback.
An empty pong from an arbitrary or legacy server remains ordinary liveness.
Actual authenticated, source-bound channel and business authority must be
qualified independently. There is no metadata echo or terminal-proof shortcut.

Known ping cancellation holds the prepared actor while its guard is still
pending; a late guard ACK cannot restore it. This does not cancel an original
external operation or restore rights.

The original single-peer operation rule is retained. Overlapping host ping,
producer, promotion or frontend operations hold/refuse before another peer
assertion; they do not race a second driver or queue unboundedly. Native service
calls use their existing finite/SDK guards as well. Producer/link metadata is
copied before any awaited guard, preserving the actual opaque native-input
reference. Refusal, hold, lost ACK, EOF and late results never admit a replacement
attempt. Failed initialization holds the consumed prepared actor.

Legacy native-first startup retains its existing four-tool behavior and ordinary
ping. Neither this host nor its ping supplies a usable tranche from the same-run
UNKNOWN history. Old two-Send history, LOCAL2/read-only ACK, PD and old5354 remain.

## Validation boundary

`frontend.nativeProducerAccounting` tests the real local actor and one-use
prepared reference with public synthetic parent replies. `mcp.nativeStdioHost`
uses a real SDK/stream connection with synthetic factory/runtime collaborators
to test early connection, explicit producer, one promotion, guard refusals,
concurrency, exact input capture, lost channel and late retained acquisition.
These are focused source checks, not real private custody, ChatGPT Pro control,
automatic prompt submission or a model reply.
