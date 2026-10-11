# AuraCall Graphiti memory

Canonical group: `auracall_main`. Audience: local user agents. Export: local user only. The [reviewed routing manifest](dev/memory/auracall-main.manifest.json) supplies atlas metadata; it does not replace repository or runtime authority.

At the start of relevant work, run `graphiti-runtime doctor`, then search this group directly. Atlas routing is for discovery across repositories; failure to locate an atlas manifest does not invalidate this explicit repo route.

```sh
graphiti-runtime discover --group-id auracall_main 'AuraCall relevant feature prior decisions acceptance'
```

Store compact source-backed decisions and accepted repair summaries. Exclude credentials, cookies, OAuth state, browser profiles, screenshots, tenant messages, raw logs and speculation. Runtime receipts stay outside this repository.

## Closeout

Every substantive closeout records one explicit disposition through `graphiti-runtime remember`: queued, duplicate_noop after exact reconciliation, not_durable, forbidden, or unavailable. The helper accepts queued/not_durable/forbidden/unavailable; duplicate_noop is a reconciled result, not a CLI disposition flag.

Qualify the summary, source artifact, destination and audience before writing. Use an explicit stable name, source description and reference time. Queue acceptance is sufficient for ordinary closeout but does not prove persistence or retrieval. Use `remember-reconcile` before retrying ambiguous writes; never repeat a pending write simply because extraction is slow.

Distinguish the cause in both prose and the machine-readable receipt reason:

- **Routing unresolved**: destination or audience not established after bounded discovery. Record unavailable with that precise reason if no safe route exists; do not claim the service is down. AuraCall's documented route normally resolves this case.
- **Service unavailable**: a current health/read/write check actually fails. Name the failed boundary. Database/API health alone does not prove model processing or retrieval.
- **Queued/running**: the service accepted asynchronous work; retain job custody and reconcile instead of retrying.
- **Completed/visible/retrieved**: separate observed gates. Only claim each after checking it.

Publishing or refreshing the atlas manifest is a separate reviewed write. Match the exact name `memory_cloud_manifest: auracall_main reviewed` in memory_atlas_main before publication, preserve a remember receipt, reconcile processing and group visibility, and test atlas discovery. Do not publish private source-group content into the atlas.
