# Native retained ChatGPT consumer

**Current connection gate:** the normal receiving factory refuses before
`browser_open` with `consumer_identity_schema_required`. The reviewed producer
export does not yet contain the complete generation/authenticated-authority
identity required by Chief finding P266-IDENTITY-INTEGRATION-01. Local expectations
and returned controlRef cannot replace it. No live native connection is enabled.

AuraCall has a receiving adapter for Browser's reviewed
`agent-browser.retained-consumer.v1` contract. It uses an **already connected**
native MCP SDK client and a private owner-issued consumer admission. The source
factory `createNativeConsumerFrontend` targets the existing four frontend tools
once the identity gate is satisfied; it currently refuses acquisition.
It never creates a browser, launches a client, guesses a task, or repairs custody.
The native path does not need the separate OAuth relay endpoint.

## Exact connection and authority

The caller supplies the existing registered consumer capability, grant selector,
immutable own task key, exact browser/profile/tab/target expectations and unchanged
expiry privately. `browser_open` uses `profileMode: consumer`. Acquisition is once
on that same connection; its returned consumer task and control reference are
checked against the expected grant/profile/browser/tab. Internal `authorityRef`
is a fingerprint of decoded generation/process/custody/principal/capability
evidence and operation task/control/grant, never a relabeled control reference.
Every operation retains the same MCP session, task/control/grant/expiry and a
stable operation key. Native completed operation and acknowledgment must agree.
Queued results, metadata-only replay, changed authority or incomplete completion
are refused. Private capability values stay in memory/native MCP acquisition;
they are absent from public frontend tools, diagnostics and durable records.

The sealed r2 contract70fbb8e9 adds `targetObservation`: actual target/type/origin,
operation ID, after_action stage and bounded observation time. The adapter checks
it against acknowledged operation and expected target instead of copying local
expectations into an observed binding. That fragment still lacks the complete
public generation/auth tuple. No production decoder or guessed JSON field names
are installed. Offline fixtures mock the internal normalized-decoder module;
this is not configuration, authority or live compatibility evidence.
Neither factory nor session constructor accepts a decoder override. A producer schema addendum and
reviewed production decoder are required before it can acquire.

The adapter has no owner-key, registration, bootstrap, launch, navigation,
evaluate/probe alias, script, upload, download or ordinary Service catalog path.
JSON startup remains unable to invent/enable a native task. A qualified owner
hands the explicit receiving factory its existing connection and private binding.

## Replies and limits

The ChatGPT recipe requires an exact existing `/c/` conversation and visible
model/account controls. Native snapshots provide ordered conversation structure;
canonical native `gettext` reads supply exact composer, prompt and answer text.
The AX renderer omits a value equal to its accessible name, so an apparently
empty snapshot never substitutes for an exact empty-composer text check.
Unknown UI variants, missing rows, changed conversation/model, drafts and
generation stop input or completion. This provider recipe is fixture-verified;
actual installed ChatGPT UI compatibility remains unverified.

The request is saved before fill, and sending state before the only Send.
Identical request IDs read their saved receipt; changed content refuses. Native
input completion is only input confirmation. A full answer requires exact prompt
correlation, unchanged prior transcript, two stable full-text observations at
least one second apart, no generation/draft, and a matching conversation URL.
Native message IDs and Pro intelligence remain explicitly unverified; public
identity is `native_snapshot_sequence`. Complete bounded text is retained without
truncation and survives a new process with the native connection unavailable.
Replies over64,000 characters refuse. Supported prompt text remains8,192.

The separate private native journal writes/fsyncs immutable reservations before
calls. Failed/unknown reservations still consume their counters. Missing/torn
completion evidence blocks new operations. No stale-lock recovery, reconnect,
new-key replay or replacement grant clears a hold. Original-key `browser_continue`
returns only checked metadata; even a completed native ACK does not clear input
uncertainty or become a saved model answer.

Metadata/readback-only results must omit fresh targetObservation and page result;
the client explicitly reports `pageObserved: false`. Historical completion is
separate from fresh current identity. The legacy service rejects native-task
routes before building any evaluate/probe request; there is no script fallback.

The source conservatively enforces **2 Sends, 2 draft fills, 6 reserved model
controls and20 underlying native reads** across the same journal. Native
intelligence changes currently refuse; no model controls are spent. The adopted
packet calls the last limit `status_reads`; its exact unit has been asked through
Chief, without changing it. With all URL, draft and stable-answer guards, two
clean turns need28 underlying reads. The strict20-read fixture completes the
first full answer and preserves the second pending at the cap. This is an open
acceptance constraint, not permission to increase a limit or weaken a guard.

## Current acceptance boundary

The frozen v1 contract hash is
`a490173600d56ba67a0cb330413b194d49f24dcdfc99c29adc559b6f78f1bbd1`.
The sealed r2 observation fragment is70fbb8e9; neither has the full required
exported generation/auth identity. Earlier positive fixture results are core
behavior evidence and cannot prove real wire compatibility or attachment.
Browser's source completion/199 passing checks are owner/Chief-reported evidence,
not AuraCall reruns. Its exact candidate and private runtime binding/handoff are
still NOT_READY. No real connection, prompt, upload or provider test is run here.
The existing private task/Send ledger must be reconciled before activation.

The standing PD review retains all eight exact files, actual Pro and original
conditional intent. Uploads are unsupported by this native contract; never drop,
downsample or replace that packet with a generic canary. Stock Chrome and OAuth
relay remain separate approved options, with existing custody and holds intact.
See Plan0446 and the one ongoing AuraCall progress page for current evidence.
