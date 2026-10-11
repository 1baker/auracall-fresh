# Issue253 control diagnosis

The isolated public withAutomation loop reproduces the exact installed SyntaxError without a browser, provider, profile resolution or retained transition. Command: node docs/dev/evidence/issue253-control-diagnosis/repro.mjs. Observed exit1: Unexpected end of JSON input, effects0, preserved=true. Removing the empty fixture record admits exactly one effect; reinstating it yields the same SyntaxError.

The loop expects an actionable invalid-ownership error while retaining unknown custody, so it remains red on current source. It does not authorize silently admitting automation. The cause of the parser crash is established; creation of the live zero-byte file and its unknown owner remain unattributed. Source inspection shows owner.json is written directly after lock-directory creation; interruption during publication is plausible but unproven.

The transition-only probe exceeded the fast feedback budget and was interrupted; do not interpret it as a completed result. Existing transition code has nested bounded retries, so this distinct coordination symptom needs its own bounded seam before any change. No production files or browser effects were changed.

Next repair: validate owner records and report invalid custody without destroying evidence, then separately qualify atomic publication and operator recovery. Full native acceptance remains blocked by retained unknown ownership. Memory disposition: forbidden; no memory write authorization.
