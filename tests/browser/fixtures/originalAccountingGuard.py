"""Public synthetic guard fixture; no actual P266 authority or browser actions."""
import json
import os
from pathlib import Path
import sys
import fcntl
import hashlib

source, root = Path(sys.argv[1]), Path(sys.argv[2])
sys.path.insert(0, str(source))
from original_reservation_guard import OriginalAuthorityPin, OriginalReservationGuard

context = json.loads((root / 'test-context.json').read_text())
identity = root / 'identity'
s, i = root.stat(), identity.stat()
pin = OriginalAuthorityPin(dict(directory=str(root),directoryDev=s.st_dev,directoryIno=s.st_ino,
 identityName='identity',identityDev=i.st_dev,identityIno=i.st_ino,
 identitySha256=hashlib.sha256(identity.read_bytes()).hexdigest(),originalScopeDigest='f'*64))
guard = OriginalReservationGuard(pin,context).acquire()
locks=[]
for writer in ['native','stock','browser-owner','human-relay','proposal']:
 fd=os.open(root/(writer+'.lock'),os.O_RDWR)
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);locks.append(fd)
print(json.dumps({'pid':os.getpid(),'startTime':Path('/proc/self/stat').read_text().split(') ')[1].split()[19]}),flush=True)
try:
 for line in sys.stdin:
  command=json.loads(line)
  if command=='exit':break
  if command=='unlock':fcntl.flock(locks[0],fcntl.LOCK_UN)
  if command=='check':guard.assert_current(context)
  print(json.dumps({'ok':True}),flush=True)
finally:
 for fd in locks:os.close(fd)
 guard.backend.close()
