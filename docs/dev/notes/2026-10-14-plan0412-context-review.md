# Plan0412 populated context repair review

Primary serial review; no delegation. Base pinned to
a761df02c8a161c824a52a045d791e61bd6c5e4e, the installed PR312 source.
Review scope is the exact working-tree patch on fix/issue165-populated-context.
Origin/main readback remains that base. Spec: Plan0412 and parent Plan0411
context-read acceptance, preserving first fallback, identity/custody/role guards,
cache behavior and private-evidence boundaries.

## Standards

Sources: AGENTS.md, CONTEXT.md, docs/agents/codex-stack.md and runtime-proof.md;
architecture, documentation, testing, commit/integration and validation policies;
Matt's smell baseline. No CONTRIBUTING/CODING_STANDARDS files exist.

One owning-module policy correction; no new public runtime interface or selector.
Temporary real-DOM qualification executes actual CSS/message expressions on
synthetic representative markup. Review cleanup removes that provisional test
dependency and duplicated harness; the retained regression extends the existing
public route harness with one denied-payload scenario. External endpoint/CDP,
payload and message-page results are transport doubles; production service,
affinity, coordinator, governor, registry and reader remain real. Literal expected
messages and bounded completion prove behavior, not just helper option shape.

Candidate findings: none. Accepted Standards blockers:0.

## Spec

Explicit allowNavigation is the canonical precedence rule. Settled payload retry
must therefore set allowNavigation=false; preserveActiveTab alone does not
establish direct-only behavior. The change affects that retry only; first fallback,
current-page role extraction, route/account checks, warning stops and cache
publication remain unchanged. Current representative role markers already read
correctly, so no speculative selector fix is added.

Native telemetry separately qualifies direct404, first fallback without exact
payload, successful message-stage entry and second fallback admission followed
by60second timeout. Offline public replay catches the same deadline miss under
120second navigation cooldown. Removing the one-line fix from the minimized
temporary fixture gives readable-payload pass/denied-payload failure in2.91s;
restoring it gives both modes green. The retained harness also passes the new
case and existing controls. This is source causality, not installed acceptance.

Candidate findings: none. Accepted Spec blockers:0.

## Validation

209focused tests/four files plus28broader tests/four files, typecheck, scoped
Biome and full build pass across the validation runs. After review cleanup,
the changed shared route harness passes all8cases; final typecheck is repeated.
Planning library audit has33existing findings and zero added findings. Raw
private diagnostics and provider account/message identifiers stay out of Git.
Reviewed integration, compiled promotion and one paced installed read remain.
Full parent changed/quiet/guard/scheduler acceptance remains OPEN.

Accepted findings: Standards0 / Spec0; no accepted severity on either axis.
