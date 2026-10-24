# Native retained ChatGPT consumer

**Source compatibility:** sealed P266r2 contract70fbb8e9, owner result109ff0c5.
**Runtime:** NOT_READY; no installed qualified private connection has been handed
to AuraCall. Source compatibility does not activate a route or authorize an Open.

The receiving factory accepts an **already connected** MCP SDK client and private
owner-issued admission. It never launches a client/browser, discovers a profile,
creates a tab, guesses a task or repairs custody. JSON startup cannot enable this
native path. The separate OAuth relay endpoint is not a prerequisite.

## Exact connection and identity

Browser owns authentication, registered capability revision, generation, process
and custody validation on every operation. These stay inside its sealed protocol;
AuraCall does not require invented public generation/auth fields or supply a
normalized-authority decoder. The former extra decoder gate and mock seam were
removed when this complete public contract was adopted.

The owner supplies the existing consumer capability, grant selector, immutable
own task key, exact browser/profile/tab/target expectations and expiry privately.
Acquisition calls browser_open with profileMode consumer once on the SAME client.
The returned taskId/controlRef are consumer references, not a legacy handle or a
new client-minted authority. Returned profileId/browserId/tabId are checked against
admission; targetId comes from actual targetObservation, never from an expectation.
Local route metadata retains the exact returned controlRef. Its consistency hash
is only a local fingerprint; it grants no permission and contains no invented
server identity. Old authorityRef route objects are rejected, not silently upgraded.

Each fresh result must have data.consumerAck, operation, targetObservation and
result. Verify stable session/task/control/grant/acquisition/expiry, completed
operation key/action and matching ACK. targetObservation must match operationId,
expected target, page type, https://chatgpt.com origin, after_action stage and
operation/completion/current timestamps. Missing/mismatched proof holds input.
Generation/custody/authentication refusals from Browser are preserved as held
outcomes. Queued ACKs and metadata replay never substitute for fresh observations.
Capabilities stay in private memory and acquisition; never in public tools,
diagnostics or durable records.

The exact closed Browser action catalog has thirteen entries: snapshot, url,
title, gettext, click, fill, type, press, wait, scroll, select, hover, screenshot.
This bounded ChatGPT recipe needs url/snapshot/gettext/fill/click only. It does not
advertise implementations of the other eight actions. Input ACKs are Boolean
objects such as {filled:true}, {clicked:true} (or {pressed:true} in Browser's press
contract); these confirm input, never a model reply. evaluate, standalone focus,
probe, ui_action, scripts and uploads are unsupported. fill uses the supported
composer action; it does not call a standalone focus alias.

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

Contract SHA256:
70fbb8e92fa82d548566a921d1bde5f2e8a57f8dc96a941e80f48cbcd1071229.
Browser result SHA256:
109ff0c52e7252ef7754d49e889a0cce7850e9b010af105004efb8486ab90407.
All43 archived source hashes are verified. Browser's186 PASS/1ignored and native
source reviews are owner/Chief evidence, not AuraCall reruns. Real private runtime
qualification, installed candidate and connection remain NOT_READY. The existing
private task/Send ledger must be reconciled before activation. No real provider
Open, prompt, upload or browser test is run by this source adaptation.

The standing PD review retains all eight exact files, actual Pro and original
conditional intent. Native uploads are unsupported; never drop/downsample/split
or substitute a canary for the packet. Stock Chrome and OAuth relay remain
separate options. All budget, custody and runtime holds remain binding.
