# Opening-policy review

Base: 9ef680de2; spec: operator clarified browser opening must not be blocked by desktop input ownership, while configurable native pool grows/shrinks and wraps at maximum. Plan0405 revision governs this packet.

Standards: serial primary review against AGENTS.md and architecture/testing policy. Shared browser-service admission remains unchanged. AuraCall-specific command policy retains exact process/generation verification before opening and ordinary gate enforcement for existing-page interaction. Fresh browser launch retains pool/profile locks and no unverified existing-profile reuse. No accepted blocking standards finding.

Spec: fresh browser launch no longer acquires the input-control gate. Target.New and Target.createTarget retain endpoint custody but do not require input ownership. Existing pool capacity2/4 growth/wrap and shrink guards pass; actual wire fixture proves creation under human control and damaged ownership while existing-page reload remains rejected.25 tests across6 files pass. No installed ownership file changed and no provider submission performed. Installed/live opening acceptance remains pending. No accepted source blocker.
