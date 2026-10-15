# Issue165 governance repair research — 2026-10-15

Question: What is the authoritative repair for the 33 plan-audit findings and
missing registration of the owned-backend-request-admission repair lane?

Scope: primary repository policies, installed selector catalog/manifest, Git
history, deterministic audit code/results and first-party GitHub reads. Primary
researcher, serial; 20-minute or resolved-repair-path stopping bound. This report
proposes corrections; it does not apply policy/catalog/plan-state repairs or grant
integration, installation, provider, warning-clearance or scheduler authority.

## Conclusion

The 32 missing policy targets are **duplicate wiring reintroduced by a rollout**,
not 32 missing policy modules. Retain all 34 existing canonical policy files and
remove only the 32 nonexistent duplicate references after explicitly resolving the
handoff's no-removal boundary. Normalize the older plan's CLOSED header while
preserving its historical authorization text. These address the observed 33 plan
findings without weakening the validator. Lane readiness is a separate, larger
reconciliation: current catalog validation reports 107 findings, and the repair
plan is missing metadata required even for unregistered-plan discovery.

## Evidence and authority

1. Commit [126ade11d](https://github.com/ecochran76/auracall/commit/126ade11ddbce98358291cb90eb95bc56b139495)
   removed exactly these 32 dangling duplicate links. Its fixes-log entry says to
   identify policies by module identity, retain existing canonical files and
   remove only nonexistent duplicate targets. Commit
   [c430938b0](https://github.com/ecochran76/auracall/commit/c430938b056325bd822323c1fa5484b9a9f17d77)
   re-added the same links during the v0.1.32 rollout without creating those 32
   policy files. Thus the prior correction's intent is explicit primary evidence,
   not an inferred audit exemption.
2. The [installed selection workflow](../../../.agents/skills/repo-policy-selector/references/selection-workflow.md)
   identifies adopted modules by filename module id, **not ordinal prefix**, and
   requires one retained canonical file when reconciling identity. All 32 missing
   suffix identities have exactly one existing canonical file and appear in the
   [installed catalog](../../../.agents/skills/repo-policy-selector/policy-library/catalog.yaml).
   The [manifest](../../../.agents/skills/repo-policy-selector/release-manifest.json)
   pins v0.1.32, source63792dff3237ef0b2a92634378b86df669286cac,
   library SHA256 da630bd1bf353c4a5e89af6ec8410761367cfa4b08b81c7ca4807fb6f5a53423.
   [Rollout receipt](2026-10-07-policy-rollout-v0-1-32.md) independently names v0.1.32.
3. [Policy management](../policies/0001-policy-management.md) and
   [upgrade management](../policies/0002-policy-upgrade-management.md) require
   deterministic enumeration, intentional upgrades and preservation of local
   customizations. Restoring 32 arbitrary copies or blindly rerunning adoption
   would contradict that intent. This differs from
   [issue20's genuinely missing module](2026-09-16-issue-20-policy-target-integrity.md):
   0030 had no retained same-identity file, so restoration was appropriate there.
4. The [older plan](../plans/0406-1-2026-10-12-native-collection-acceptance.md)
   already records completed native acceptance. Its line is
   `State: CLOSED — user authorized up to ten additional serial submission packets.`
   The [auditor](../../../scripts/audit-plan-library.ts) accepts only a standalone
   `State: <UPPERCASE>` line. Proposed correction: `State: CLOSED`, followed by a
   separate historical scope/authorization line preserving the complete suffix.
   Do not reopen the plan, rewrite its acceptance history or renew its allowance.
5. [Active-lane policy](../policies/0028-active-lane-coordination.md) makes the
   canonical default-branch catalog the discovery projection, distinguishes plan
   outcome from Git custody and requires exact refs/checkpoints/overlaps. It
   explicitly keeps the auditor read-only and publishes registration through the
   protected-default workflow. This establishes **role ownership**: the repair
   lane's primary prepares its proposal; an authorized repo integrator controls
   canonical publication. Sources do not assign a specific named governance owner.

## Canonical readback and lane findings

Research source checkout/remote repair head: ef9968bc986df38bdbe1f2c9c758334c10f516b6.
[PR323](https://github.com/ecochran76/auracall/pull/323) is OPEN/DRAFT, target main;
GitHub mergeability returned UNKNOWN, which is not evidence of a conflict or of
merge readiness. Canonical main was pinned to
[3711d41a8ce52988bfeb829a6e730ee60852ba78](https://github.com/ecochran76/auracall/commit/3711d41a8ce52988bfeb829a6e730ee60852ba78).

- Canonical AGENTS blob846889cadd5adfe4bbde24ab7e848cfb60dc5772 still contains the
  duplicate links; canonical policies contain 34 files. This is inherited on
  main, not introduced by the request-admission branch.
- The [canonical catalog at the pinned main](https://github.com/ecochran76/auracall/blob/3711d41a8ce52988bfeb829a6e730ee60852ba78/docs/dev/active-lanes.yaml),
  blobc2242cfc1440e43e6d90f44f9c5b94fbbab9b9f2, has no repair-branch entry.
  P92 still names fix/issue165-project-index-budget-yield and Plan0411; do not
  silently repoint its identity to this different branch.
- [Plan0420](../plans/0420-2026-10-14-owned-fetch-request-admission.md) is already
  OPEN and names the repair branch. It is a candidate registration anchor, so no
  new plan is inherently required. Its role/state must be reconciled against
  completed successor slices and still-open production/acceptance requirements.
  Add correct Lane and Integration metadata before relying on discovery; do not
  mark broad issue165 acceptance CLOSED.
- The installed [lane auditor](../../../.agents/skills/repo-policy-selector/scripts/audit_active_lanes.py)
  discovers unregistered active plans only if both Lane and Branch headers exist.
  Plan0420 has Branch but no Lane, so an absent unregistered-plan finding does not
  prove registration. Exact branch selectors bound discovery, while catalog
  validation still visits registered entries.
- One read-only exact-branch audit returned exit1, ok=false, **107 problems across
  90 catalog entries**. P92 findings include missing checkpoint, missing remote_ref,
  missing plan Lane/Integration metadata and ACTIVE_WORKTREE with no worktree.
  The report marks its old source tip merge-ancestral to main. Broader findings
  need owner triage; a single new registration row cannot imply whole-catalog pass.
- The auditor reported P92 local_only because the catalog omits `remote_ref`, so
  it never reads that ref. Direct `git show-ref --verify` and `git ls-remote`
  confirm local, remote-tracking and remote branch all equal
  a5cea19b0b6b387ff5d6fe1847f5a2e3526096af. Do not infer remote deletion or
  divergence from that incomplete catalog projection. Verify exact refs before
  a future audit and fetch only if needed/authorized; the auditor must not fetch.

## Non-mutating candidate qualification

A temporary probe imported the real collectMissingPolicyTargets function, matched
all missing suffixes to the actual installed catalog and existing canonical files,
and evaluated a modified AGENTS string **in memory**. Missing-target result:
32 before, 0 after. The actual state regex on the proposed separated CLOSED header
changes null to CLOSED. This qualifies the candidate edits for the named findings;
it is **not** a passing full plan/lane audit, and no governing repo file was edited.

Receipts: /tmp/issue165-policy-target-map.json,
/tmp/issue165-policy-wiring-probe.mts,
/tmp/issue165-policy-wiring-probe-result.json,
/tmp/issue165-research-lane-audit.json. Canonical API bodies are retained at
/tmp/issue165-research-main-agents.json, /tmp/issue165-research-main-policy-names.txt,
/tmp/issue165-research-main-plan0406.json and /tmp/issue165-research-main-lanes.json.
These temporary receipts are reproducible from the pinned sources and commands.
The 33 current plan findings were exactly reconciled to the prior final receipt
in [the existing acceptance note](2026-10-15-issue165-source-window-reconciliation.md).

Read-only audit command:

```sh
python .agents/skills/repo-policy-selector/scripts/audit_active_lanes.py \
  --repo-root . --default-ref refs/remotes/origin/main \
  --branch fix/issue165-owned-backend-request-admission --json
```

## Proposed repair sequence, not executed

1. Resolve the handoff's explicit no-removal boundary using this evidence. In a
   separate governance slice based on fresh canonical main, retain existing policy
   bodies and remove only the verified duplicate wire-in targets. Normalize the
   older CLOSED header with its historical suffix retained separately. Run the
   policy-entry tests and full plans:audit; do not invent exemptions. Judge any
   newly exposed findings on evidence rather than promise zero findings in advance.
2. Reconcile exact old/new issue165 lane refs, current worktrees and main ancestry;
   preserve P92 history. Reuse Plan0420 if its reconciled contract fits, add required
   Lane/Integration metadata, choose an unclaimed stable id, and record checkpoint,
   remote ref, dependencies and explicit overlap with the parent lane. Publish
   canonical registration through the repo workflow. Triage the other catalog
   findings separately; do not rewrite 90 lanes under this repair's authority.
3. Repeat relevant plan/lane audits against the fresh canonical ref, integrate
   governance through its proper lane, then re-evaluate PR323's integration gates.
   None of these steps selects the production request ceiling, supplies genuine
   changed-B evidence or permits installed/native effects.

Research complete: authoritative candidate repair and the larger lane limitation
are established. Research does not revoke the earlier no-removal instruction or
apply the proposal. Memory disposition forbidden: no explicit memory-update request.

## Exact duplicate identity mapping

The first 34 existing entrypoint targets remain. Each row below is a nonexistent
extra target and the single existing same-identity target; both identities were
checked against the installed catalog.

| Nonexistent duplicate | Retained canonical file |
| --- | --- |
| `0035-policy-management.md` | `0001-policy-management.md` |
| `0036-policy-upgrade-management.md` | `0002-policy-upgrade-management.md` |
| `0037-policy-adoption-feedback-loop.md` | `0003-policy-adoption-feedback-loop.md` |
| `0038-notes-and-memories.md` | `0004-notes-and-memories.md` |
| `0039-graph-backed-memory-usage.md` | `0021-graph-backed-memory-usage.md` |
| `0040-codegraph-usage.md` | `0022-codegraph-usage.md` |
| `0041-code-testing-discipline.md` | `0029-code-testing-discipline.md` |
| `0042-planning-discipline.md` | `0005-planning-discipline.md` |
| `0043-model-selection-and-calibration.md` | `0030-model-selection-and-calibration.md` |
| `0044-goal-execution-governance.md` | `0023-goal-execution-governance.md` |
| `0045-parallel-plan-design.md` | `0006-parallel-plan-design.md` |
| `0046-git-worktree-hygiene.md` | `0010-git-worktree-hygiene.md` |
| `0047-commit-history-discipline.md` | `0011-commit-history-discipline.md` |
| `0048-branch-and-integration-strategy.md` | `0012-branch-and-integration-strategy.md` |
| `0049-commit-and-push-cadence.md` | `0013-commit-and-push-cadence.md` |
| `0050-multi-agent-reconciliation.md` | `0014-multi-agent-reconciliation.md` |
| `0051-subagent-workflow-optimization.md` | `0015-subagent-workflow-optimization.md` |
| `0052-versioning-and-release.md` | `0016-versioning-and-release.md` |
| `0053-turn-closeout.md` | `0017-turn-closeout.md` |
| `0054-policy-harvest-loop.md` | `0024-policy-harvest-loop.md` |
| `0055-validation-and-handoff.md` | `0018-validation-and-handoff.md` |
| `0056-subagent-runtime-governance.md` | `0025-subagent-runtime-governance.md` |
| `0057-memory-service-runtime-governance.md` | `0026-memory-service-runtime-governance.md` |
| `0058-architecture-guardrails.md` | `0008-architecture-guardrails.md` |
| `0059-documentation-change-control.md` | `0009-documentation-change-control.md` |
| `0060-preview-artifact-review.md` | `0027-preview-artifact-review.md` |
| `0061-active-lane-coordination.md` | `0028-active-lane-coordination.md` |
| `0062-work-item-traceability.md` | `0031-work-item-traceability.md` |
| `0063-collaborative-development-workflow.md` | `0032-collaborative-development-workflow.md` |
| `0064-forge-issue-reporting.md` | `0033-forge-issue-reporting.md` |
| `0065-github-issue-operations.md` | `0034-github-issue-operations.md` |
| `0066-upstream-fork-maintenance.md` | `0019-upstream-fork-maintenance.md` |
