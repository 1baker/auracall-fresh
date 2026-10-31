# Private canonical dispatch span

This is the Aura-owned ac91382b integration in the existing RelayStore and
dispatchRelayRequest. It is executable source, not a new public MCP tool or
JSON startup mode. Runtime admission, genuine operator authority and the
canonical Bastion store are separate mandatory inputs.

## Selected caller

dispatchRelayRequest accepts an optional compiled execution object:
generation (actual selected dispatch generation), intent (64-hex exact canonical
intent digest), and authority. It uses the SAME supplied frontend and store.
No second sender, factory, SDK acquisition, nonce retry or new quota is created.

Authority implements two asynchronous methods:

- assertCurrent(binding, stage), with admit/configure/send/readback/publish/
  settle/fence stages. Bind actual controller/custodian, lifetime and permissions
  to the whole exact request, not a generation label. Admit runs before and
  after durable reservation; its claim ID is allocated by the canonical store.
  Before effects, that claim and the pending span must already be committed.
- verifyTerminal(binding, originalOperation, terminalReceipt), from the actual
  matched original frontend completion. A local hold, closed Promise, route
  label, opaque-handle digest or JSON status assertion is insufficient.

All binding fields are immutable: requestId, fingerprint, claimId, routeId,
expectedUrl, expectedModel, intent and generation. The span is an in-process
opaque capability, never reconstructed from serialized callbacks.

## Exact transitions

beginExactRequest receives the binding WITHOUT claimId. Under one existing
request lock, it refuses any existing legacy or canonical claim, creates the
unchanged strict v1 claim and sender records, and commits dispatch.json.
The returned span.binding contains the actual claim ID. Partial writes retain
non-fresh rights; no timeout takeover is available.

The explicit generation path observes/qualifies the target and model, reserves
that claim/span, then may configure Pro under the span and the existing
configuration journal. It independently inspects Pro before Send. A failed
configuration consumes this once-only claim. Legacy Pro-before-claim and
prepare-only behavior remain unchanged.

span.recordOriginal commits the exact frontend_send method/requestId/routeId,
prompt digest and previous-request ID before the one Send callback. Its
operationId is the actual frontend request ID. It is not a native action,
provider response or browser message ID. The original operation is consumed
before awaiting the publication ACK; failures never permit a second call.

fenceExactRequest requires actual fencing authority and appends a durable fence
for the exact existing binding. It returns cancelled:false. A fence, hold or
lost callback cannot release pending rights or authorize another generation.

originalDispatch takes the FULL actual binding and independent current
original-readback authority. It returns a readback/publication/settlement-only
span. It cannot configure, record a new Send, promote a legacy claim or replace
the original generation. No old physical custody is impersonated.

span.settleOriginal requires exact completed receipt fields matching the
recorded original operation and conversation, then invokes verifyTerminal.
Only after that verification and current publication checks does it create the
full canonical reply. It commits matching settlement separately, preserving
create-only/idempotent conflict semantics. Lost ACKs keep the original pending.
Generic submit/relay_reply cannot publish for a generation-bound claim.

exactRequestStatus is metadata, not authority: pending/fenced/settled, original
operation, savedReplySha256 and matching settlement. Generic status and linked
requests do not consume a saved-but-unsettled generation reply. Existing strict
claim, reply and hold files and all legacy behavior remain read-compatible.
The relay still reports liveVerified:false and no provider response ID; no
native provenance is invented.

## Preproducer caller and unchanged Python boundary

The private canonical Node caller may beginExactRequest before producer work,
retain that SAME span while the genuine home factory/peer/frontend starts,
then pass execution.span to dispatchRelayRequest with the SAME RelayStore.
attachExactRequest consumes that local capability once, checks its exact
binding/currentness, and preserves its original claim. A serialized object,
readback span, changed store/intent or repeated attachment refuses.
The dispatcher still freshly inspects the target/model and observed Pro before
its one Send; a supplied preproducer span never skips that qualification.

All canonical APIs are asynchronous and local to the owning canonical Node
process. They are an outer request span, NOT one of the Python controller's
five synchronous methods. No Node Promise/opaque capability/JSON span is put
into strict preproducer Binding, NativeContext or NativeOwnerSource.
The existing real home guard remains local and retains all native callbacks,
current acquired task, full dispatch, witness reservation and AFTER fences.
There is no new carrier, nested phase driver or second startup acquisition.

The actor/run/producer association must be supplied by actual private
composition: canonical intent/request and real controlled lifetime are linked
outside the unchanged Python schemas; actual native receipt joins only after
producer/link. The opaque span is never transferred across processes.
The admitted same-lifetime transport/enforcement path is still required; this
source supplies no remote authority or synchronous Python-to-Node shortcut.

## Operator consumption and remaining boundary

Select the exact compiled store.js and dispatch.js alongside the compatible
unchanged relay/frontend modules. Use the real canonical store and owner,
existing authenticated same frontend transport, actual intent/generation, and
genuine authority methods. The existing P447 function performs admission,
Send, bounded original readback, full publication and settlement.

The authority methods need a real whole-operation lifetime/currentness path
between the Bastion canonical dispatcher and the retained home frontend.
Per-page status probes, a guessed port, an unbound callback, a Source hash,
WSL path alias or a new local store are not substitutes. The operator must
qualify this binding before construction/execution. No authority is supplied by
this source slice.

Old untracked legacy operations cannot be retroactively declared settled by
creating a new span. Preserve their original claims, uncertainties and held
rights. Complete host quarantine/administrative coverage and separately
admitted g2 physical identity/order remain required where the recovery plan
uses them. This source grants no private FD, manager reload, freeze, restart,
browser launch, SDK call, Send allowance or runtime activation.
