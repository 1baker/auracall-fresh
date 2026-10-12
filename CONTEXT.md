# Aura-Call

Aura-Call coordinates model requests through configured provider accounts and browser runtimes while preserving explicit identity, execution, and artifact ownership.

## Language

**AuraCall runtime profile**:
A named Aura-Call configuration entry that selects execution defaults and provider bindings for one operator context.
_Avoid_: Profile, runtime config

**Browser profile**:
A browser-runtime and account-family configuration referenced by an AuraCall runtime profile.
_Avoid_: Profile, Chrome profile

**Source browser profile**:
A native Chromium profile used only as the source for bootstrap state such as cookies.
_Avoid_: Browser profile, managed profile

**Managed browser profile**:
An Aura-Call-owned browser state directory used for automation.
_Avoid_: Source profile, user profile

**Provider binding**:
The provider-specific account, target, model, and workflow defaults selected for an AuraCall runtime profile.
_Avoid_: Service binding, provider config

**Browser launch plan**:
The fully resolved, immutable description of one browser launch, including its browser profile, managed browser profile, provider binding, and launch policy. For user-config launch fields, explicit runtime browser overrides precede browser-profile settings and configured global defaults. Source identity and opt-in copying remain separate from managed browser identity.
_Avoid_: Browser config, launch profile

**Provider prompt**:
One requested model interaction routed through a provider binding, including its target, attachments, completion posture, and progress evidence.
_Avoid_: Browser prompt, request

**Materialization attempt**:
One bounded effort to turn a selected provider asset into a verified local artifact and durable receipt.
_Avoid_: Download attempt, materialization run

**Acceptance run**:
A bounded provider-specific verification workflow that produces operator-readable evidence about an Aura-Call behavior.
_Avoid_: Smoke, acceptance script

**Viewer download control**:
A download action outside the conversation-turn cards, used after a selected artifact opens its preview. Generic inline `Download file` labels do not establish viewer authority.

**Artifact cache reuse**:
A local conversation attachment matching a currently discovered artifact ID, filename and URI. Readability, size and any retained checksum are checked before reuse. New transfer budget excludes reused artifacts; explicit force bypasses reuse. Context refresh alone does not force transfer. A requested fresh context read must succeed before artifact materialization; provider failure cannot silently authorize cached download controls. Explicit refresh=false can use cached context.

**Provider session custody**:
A retained browser session must have a reachable caller owner. A proof-only read closes a session created on its private options; it preserves a session supplied by the caller. Deadline-scoped conversation reads and explicit-target utility wrappers return retained-session custody to their session-enabled caller.

**Provider response activity**:
The observed running response or pending tool approval on a provider page. This can differ from lease effect state after an external/CDP submission. TTL cleanup must not infer provider inactivity from a settled lease; active or unknown ChatGPT activity preserves its tab.
**AuraCall remote-view client**:
An operator-facing application view dedicated to AuraCall's owned desktops and managed browsers.
_Avoid_: Root desktop, source browser profile

**Root desktop display**:
The general desktop view available independently of the AuraCall remote-view client.
_Avoid_: AuraCall remote-view client

**AuraCall desktop**:
A desktop owned by AuraCall and used to display its managed browsers. Its allocation is distinct from an AuraCall runtime profile, which remains available when no desktop is assigned.
_Avoid_: Browser profile, AuraCall runtime profile

**Control handoff**:
An explicit transfer of interaction ownership between automation and a human operator.
_Avoid_: View selection, browser launch

**Memory routing**:
The selection of a reviewed Graphiti group and audience for qualified source-backed memory. AuraCall uses `auracall_main`. Unresolved routing is distinct from a verified memory-service failure.


**Installed runtime**:
The user-scoped AuraCall package adopted from integrated source, with compiled
code identity and required application surfaces verified before promotion. Its
source commit is distinct from browser processes, browser profiles and the
package version, which alone cannot prove feature preservation.
_Avoid_: Version-only runtime identity

**Desktop control ownership record**:
The retained identity and role governing desktop interaction. Invalid or incomplete ownership preserves unknown custody and blocks interaction with recovery guidance. Atomic publication prevents partially written records from being exposed. Browser opening is independent of this interaction ownership.

**Browser opening custody**:
The retained managed-profile process identity plus current desktop assignment that qualifies creation of a new tab/window. A current window cannot be a prerequisite for creating its replacement. Existing-page interaction separately requires current window proof and desktop input ownership.

**Cold-start browser handoff**:
The creation and lease qualification of a replacement page before retiring the selected incompatible startup page. This preserves the browser lifetime and keeps replacement custody explicit when retirement fails.

**App composer qualification**:
The unique visible enabled ChatGPT rich editor owned by the composer and outside dialogs, recognized by either legacy ID or current data-composer-markdown/Ask ChatGPT shape. Missing or ambiguous qualification blocks input; app identity is read from this editor, not an unrelated page pill.

**App mention option**:
A qualified visible enabled picker row for the installed app. Current rows require its exact name and description to exclude same-name custom GPTs; the chosen composer pill must then prove the exact plugin identity before Send.

**Selected app mention identity**:
The exact installed app identifier retained by its composer pill, using legacy plugin attributes or a current complete app:// URI. Presence or display name alone does not authorize Send; malformed or multiple mentions do not qualify.

**Startup close confirmation**:
A bounded observation of the exact selected startup target disappearing after one close request. Acknowledgment is not physical-removal proof; uncertain confirmation preserves replacement custody.

Developer-app submitted tests have two custody phases: exact utility inventory read and settlement, then shared submission lifecycle tab acquisition. The app/account observation crosses this local handoff; shared lifecycle still checks live account and canonical app identity before Send. Never nest submission acquisition under active inventory ownership or relax process ownership to permit it.

Leased browser endpoints retain service-qualified browser process identity and managed browser directory into provider-session authorization, bound to the exact leased target. The process owning a tab lease can be the CLI and is not evidence of the browser process.

Developer-app response collection uses the resolved browser launch policy deadline. Fresh-root Chat/current app-test posture does not replace the selected browser.timeoutMs. A timeout after Send preserves effect evidence and forbids automatic resubmission.

**Lease retirement audit**: durable history of AuraCall expiry-close intent and outcome, distinct from the mutable final lease snapshot. Acting process identity is distinct from browser process identity; already-missing is an observation, not proof of an AuraCall close.
