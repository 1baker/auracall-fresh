"""TEST ONLY: frozen carrier + its public synthetic providers, anonymous stdio.

Creates a temporary synthetic authority record, never original P266 accounting.
Production bootstrap/providers are deliberately not supplied by this fixture.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import time

# TEST-ONLY selection: reviewed 8c6e/07ff Python bundle (270e finite delta).
# Pin its complete local import/data closure before executing any of it. This
# neither selects a production producer nor imports the operator's Node runner.
REVIEWED_SOURCE = {
    "original_callback_carrier.py": "4062c82c1d55762cd2ff3c5e258602b46edf229e688024f7338f90706f019d4c",
    "aura_guard_bridge.py": "56ce0a0fd38389ea9da96d015b8230324860da100260a0b1aaed4c6d67d74375",
    "original_reservation_guard.py": "86e74ecaa4e2d975ae9f493ffde4af4347580c4a34fb7aeb5f5b05b2f14cef5b",
    "original_guard_pipe.py": "393a6d4881dfc090f53424de171337a04bcd6c54bcd2299cc3eebb6735c37535",
    "isolated_publication_guard.py": "852c2fc8aefa547d90060023740d915456d734e69c498bb0b461c99c561c824f",
    "test_original_callback_carrier.py": "0f8e43d298a2c0682e69791908c685681a936f076be89743b879c4efc2e09d6c",
    "synthetic-native-observation-v2.json": "74e327bfa4804caf835879ebfc0bc77b90b4016f97f65bb2392c59a71cc3c154",
}
source = Path(sys.argv[1])
for name, expected in REVIEWED_SOURCE.items():
    if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected:
        raise RuntimeError("frozen public IPC fixture dependency mismatch")
sys.path.insert(0, str(source))
from original_callback_carrier import OriginalCallbackCarrier
from original_reservation_guard import OriginalAuthorityPin, OriginalReservationGuard
from test_original_callback_carrier import PublicBindings, TASK, WIRE

async def main():
    with tempfile.TemporaryDirectory(prefix=".auracall-public-node-peer-", dir=Path.home()) as directory:
        root = Path(directory)
        record = root / "public-identity"
        record.write_bytes(b"PUBLIC NODE IPC FIXTURE ONLY; NO P266 AUTHORITY\n")
        record.chmod(0o600)
        rs, ident = root.stat(), record.stat()
        pin = OriginalAuthorityPin({"directory": str(root), "directoryDev": rs.st_dev,
            "directoryIno": rs.st_ino, "identityName": record.name, "identityDev": ident.st_dev,
            "identityIno": ident.st_ino, "identitySha256": hashlib.sha256(record.read_bytes()).hexdigest(),
            "originalScopeDigest": "f" * 64})
        now = time.time_ns() // 1000000
        base = {"receiptDigest": "1" * 64, "producerSha256": "2" * 64, "expiresAtMs": now + 90000}
        budget = {**base, "admissionDigest": "3" * 64, "ledgerDirectory": str(root / "public-ledger")}
        target = {k: TASK[k] for k in ("profileId", "browserId", "tabId", "targetId")}
        wire = json.loads(json.dumps(WIRE))
        wire.update(receiptDigest=base["receiptDigest"], producerSha256=base["producerSha256"],
                    observedAtMs=now, validUntilMs=now + 30000)
        wire["grant"]["expiresAtMs"] = base["expiresAtMs"]
        wire["grant"]["producer"].update(target)
        guard = OriginalReservationGuard(pin, base).acquire()
        before = (guard.backend.claim_fd, guard.backend.journal_fd)
        carrier = OriginalCallbackCarrier(guard, base, target, PublicBindings(guard), 3, 4,
                                         callback_timeout_seconds=3)
        os.close(3); os.close(4)
        os.write(5, (json.dumps({"context": base, "budget": budget, "target": target, "task": TASK, "wire": wire}) + "\n").encode())
        os.close(5)
        try:
            await carrier.run()
            if carrier.tasks:
                await asyncio.wait_for(asyncio.gather(*tuple(carrier.tasks)), 3)
            assert before == (guard.backend.claim_fd, guard.backend.journal_fd)
        finally:
            guard.backend.close()  # synthetic fixture owner, NEVER carrier cleanup

asyncio.run(main())
