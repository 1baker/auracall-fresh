# Plan0394 | Discoverable AuraCall memory routing

State: CLOSED
Owner: ecochran76
Work item: https://github.com/ecochran76/auracall/issues/251
Branch: docs/auracall-memory-routing
Target: main

## Current State

The populated auracall_main group successfully persisted and retrieved issue225 acceptance, but the repo omits its route and atlas discovery found no matching manifest. An earlier agent unavailable receipt attempted zero writes.

## Scope and acceptance

Document the explicit local-user-only group in AGENTS and operator docs, distinguish unresolved routing from service failure, retain one reviewed routing-only JSON manifest, publish it through the receipt-producing helper, and prove atlas discovery and source-group retrieval. No shared Graphiti code, service changes, raw private data or unrelated lanes. Docs/JSON validation and independent Standards/Spec review precede integration. Critical path is repo contract, review/publication, then live atlas verification.

## Acceptance | 2026-10-10

Independent Standards/Spec and prepublication privacy review at 642bdc975 passed with zero findings. Manifest fields, local links, published diff equivalence and diff hygiene passed. The single remember job 2e22c311-f85f-409a-ad79-a983af75fa0b completed; reconciliation confirmed grouped visibility of atlas episode 4af0b130-830d-46cd-a9c9-76ce6bd141c4. The original AuraCall inventory-repair routing query now returns auracall_main with local-user-only export; direct source-group search retrieves the issue225 repair. Private receipts remain under operator state diagnostics/memory-routing. No service changes or raw private data were introduced. GitHub reported no remote CI checks; this docs-only slice has no code-test claim. Memory disposition queued, then completed-visible and atlas retrieval verified.
