# Triage labels

| Canonical role | GitHub label | Meaning |
| --- | --- | --- |
| needs-triage | needs-triage | Maintainer evaluation required |
| needs-info | needs-info | Waiting for reporter information |
| ready-for-agent | ready-for-agent | Fully specified for agent implementation |
| ready-for-human | ready-for-human | Human implementation required |
| wontfix | wontfix | Will not be actioned |

Categories are `bug` and `enhancement`. A triaged issue has exactly one category and one state label. Preserve unrelated labels. Conflicting state labels require maintainer resolution, not an automatic choice.

Reuse existing `wontfix`, `bug` and `enhancement`. The four other state labels were provisioned under the operator-approved setup (#273); exact names and before/after readback are recorded in `docs/dev/evidence/matt-skill-setup/label-receipt.json`. The temporary provisioning permission was consumed and removed. Subsequent triage applies existing labels through the forge registry; creating or changing labels requires new explicit authority.
