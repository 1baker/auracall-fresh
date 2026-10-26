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

source = Path(sys.argv[1])
if hashlib.sha256((source / "original_callback_carrier.py").read_bytes()).hexdigest() != "a3f69a172068b1afb8233d090966aeb3dbae601ae24daed367d9dd62e717befe":
    raise RuntimeError("frozen carrier mismatch")
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
