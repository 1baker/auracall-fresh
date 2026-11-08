#!/usr/bin/env python3
"""Render the committed issuer preflight templates with the real Docker CLI.

Usage: python3 -I run_tests.py [--docker /usr/bin/docker] [--templates candidate.json]

The Docker CLI's Go text/template engine (with Docker's json/split/... helpers)
renders each template against synthetic container/image/version objects served
by a fake Docker Engine API on a private AF_UNIX socket. HOME, DOCKER_CONFIG and
the environment are isolated; no real daemon, host, config or secret is used.
Exit status is non-zero if any case fails.
"""
import json
import os
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATES_PATH = Path(sys.argv[sys.argv.index("--templates") + 1]) if "--templates" in sys.argv else HERE / "templates.json"
TEMPLATES = json.loads(TEMPLATES_PATH.read_text())
SECRET = "SYNTHETIC-SECRET-VALUE-MUST-NOT-RENDER"
API_VERSION = "1.41"


def container(env=(), args=("authelia", "--config", "/config/configuration.yml"), mounts=None, **over):
    obj = {
        "Id": "c" * 64,
        "Image": "sha256:" + "i" * 64,
        "Path": "/app/entrypoint.sh",
        "Args": list(args),
        "State": {"Pid": 4242, "StartedAt": "2026-01-01T00:00:00Z", "Running": True, "Restarting": False},
        "Config": {
            "User": "",
            "WorkingDir": "/app",
            "Env": list(env),
            "Entrypoint": ["/app/entrypoint.sh"],
            "StopSignal": "SIGTERM",
            "Labels": {"com.docker.compose.project": "fixture", "com.docker.compose.service": "issuer"},
        },
        # Like the real Engine API, nil omitempty fields (HostConfig.Init,
        # Config.StopTimeout) are absent unless a case sets them.
        "HostConfig": {"PidMode": "", "AutoRemove": False, "RestartPolicy": {"Name": "unless-stopped", "MaximumRetryCount": 0}},
        "Mounts": mounts
        if mounts is not None
        else [{"Type": "bind", "Source": "/srv/fixture/config", "Destination": "/config", "RW": True}],
    }
    for path, value in over.items():
        node = obj
        keys = path.split("__")
        for key in keys[:-1]:
            node = node[key]
        node[keys[-1]] = value
    return obj


class State:
    container = container()
    image = {"Id": "sha256:" + "i" * 64, "Config": {"Entrypoint": ["/app/entrypoint.sh"], "User": "", "StopSignal": "SIGTERM"}}


VERSION = {
    "Version": "29.1.3-fixture",
    "ApiVersion": API_VERSION,
    "MinAPIVersion": "1.24",
    "Os": "linux",
    "Arch": "amd64",
    "Components": [],
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def address_string(self):
        return "fixture"

    def reply(self, status, body):
        data = json.dumps(body).encode() if body is not None else b"OK"
        self.send_response(status)
        self.send_header("Api-Version", API_VERSION)
        self.send_header("Ostype", "linux")
        self.send_header("Content-Type", "application/json" if body is not None else "text/plain")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path.split("?")[0]
        tail = path.split("/", 2)[-1] if path.startswith("/v1.") else path.lstrip("/")
        if tail == "_ping":
            return self.reply(200, None)
        if tail == "version":
            return self.reply(200, VERSION)
        if tail.startswith("containers/") and tail.endswith("/json"):
            return self.reply(200, State.container)
        if tail.startswith("images/") and tail.endswith("/json"):
            return self.reply(200, State.image)
        return self.reply(404, {"message": "not found"})


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def render(docker, env, argv):
    proc = subprocess.run([docker, *argv], env=env, capture_output=True, text=True, timeout=30)
    return proc.returncode, proc.stdout, proc.stderr


def cell(out, name):
    return [e["cell"] for e in out["env"] if e and e["name"] == name]


def numeric_cases():
    rows = [
        ("PUID", "1000", True), ("PUID", "0", True), ("PUID", "2147483647", True),
        ("PUID", "2147483648", False), ("PUID", "0123", False), ("PUID", "", False),
        ("PUID", "PUBLICBAD", False), ("PUID", "-1", False), ("PUID", "12345678901", False),
        ("PGID", "100", True), ("PGID", "1e3", False),
        ("UMASK", "022", True), ("UMASK", "0022", True), ("UMASK", "888", False),
        ("UMASK", "02", False), ("UMASK", "00222", False),
    ]
    for name, value, ok in rows:
        def check(out, name=name, value=value, ok=ok):
            expected = {"kind": "CONTROL", "value": value} if ok else {"kind": "UNSUPPORTED", "value": None}
            return cell(out, name) == [expected], f"{name}={value!r} -> {cell(out, name)}"

        yield f"numeric {name}={value!r}", container(env=[f"{name}={value}"]), "baseline", check


def selector_cases():
    yield from numeric_cases()

    def secrets(out):
        cells = cell(out, "AUTHELIA_SESSION_SECRET") + cell(out, "AUTHELIA_STORAGE_ENCRYPTION_KEY")
        return cells == [{"kind": "PRESENT", "value": None}, {"kind": "EMPTY", "value": None}], str(cells)

    yield "secret values redacted to PRESENT/EMPTY", container(
        env=[f"AUTHELIA_SESSION_SECRET={SECRET}", "AUTHELIA_STORAGE_ENCRYPTION_KEY="]
    ), "baseline", secrets

    def secret_file(out):
        return cell(out, "AUTHELIA_SESSION_SECRET_FILE") == [{"kind": "PATH", "value": "/secrets/session"}], str(out["env"])

    yield "secret *_FILE path selected", container(env=["AUTHELIA_SESSION_SECRET_FILE=/secrets/session"]), "baseline", secret_file

    def bad_path(out):
        return cell(out, "AUTHELIA_STORAGE_LOCAL_PATH") == [{"kind": "UNSUPPORTED", "value": None}], str(out["env"])

    yield "path outside allowed roots unsupported", container(env=["AUTHELIA_STORAGE_LOCAL_PATH=/etc/passwd"]), "baseline", bad_path

    def dup(out):
        return cell(out, "PUID") == [{"kind": "CONTROL", "value": "1"}, {"kind": "CONTROL", "value": "2"}], str(cell(out, "PUID"))

    yield "duplicate control emits every occurrence", container(env=["PUID=1", "PUID=2"]), "baseline", dup

    def enums(out):
        return (
            cell(out, "AUTHELIA_LOG_LEVEL") == [{"kind": "CONTROL", "value": "debug"}]
            and cell(out, "AUTHELIA_LOG_FORMAT") == [{"kind": "UNSUPPORTED", "value": None}]
            and cell(out, "X_AUTHELIA_CONFIG") == [{"kind": "CONTROL", "value": "/config/configuration.yml"}]
            and cell(out, "X_AUTHELIA_CONFIG_FILTERS") == [{"kind": "CONTROL", "value": ""}]
        ), str(out["env"])

    yield "enum and config controls", container(
        env=["AUTHELIA_LOG_LEVEL=debug", "AUTHELIA_LOG_FORMAT=yaml", "X_AUTHELIA_CONFIG=/config/configuration.yml", "X_AUTHELIA_CONFIG_FILTERS="]
    ), "baseline", enums

    yield "unknown AUTHELIA_ override flagged", container(env=["AUTHELIA_SOMETHING_NEW=1"]), "baseline", lambda o: (o["unknownOverrides"] is True, o["unknownOverrides"])
    yield "unknown X_AUTHELIA_ override flagged", container(env=["X_AUTHELIA_OTHER=1"]), "baseline", lambda o: (o["unknownOverrides"] is True, o["unknownOverrides"])
    yield "known-only env not flagged", container(env=["PUID=1", "AUTHELIA_LOG_LEVEL=info", "HOME=/root"]), "baseline", lambda o: (o["unknownOverrides"] is False and cell(o, "HOME") == [], o["unknownOverrides"])

    def args(expected):
        return lambda o: (o["args"] == [*expected, None], o["args"])

    yield "args direct + --config", container(), "baseline", args([{"kind": "DIRECT_AUTHELIA", "value": None}, {"kind": "CONFIG", "value": "/config/configuration.yml"}])
    yield "args -c and filters", container(args=["authelia", "-c", "/config/a.yml", "--config.experimental.filters", "template"]), "baseline", args(
        [{"kind": "DIRECT_AUTHELIA", "value": None}, {"kind": "CONFIG", "value": "/config/a.yml"}, {"kind": "FILTERS", "value": "template"}]
    )
    yield "args --config=value unsupported", container(args=["--config=/config/a.yml"]), "baseline", args([{"kind": "UNSUPPORTED", "value": None}])
    yield "args config outside roots unsupported", container(args=["authelia", "--config", "/etc/a.yml"]), "baseline", args(
        [{"kind": "DIRECT_AUTHELIA", "value": None}, {"kind": "UNSUPPORTED", "value": None}]
    )
    yield "args dangling --config unsupported", container(args=["authelia", "--config"]), "baseline", args(
        [{"kind": "DIRECT_AUTHELIA", "value": None}, {"kind": "UNSUPPORTED", "value": None}]
    )
    yield "args over 64 unsupported", container(args=["x"] * 65), "baseline", lambda o: (
        len(o["args"]) == 66 and o["args"][-2] == {"kind": "UNSUPPORTED", "value": None} and o["args"][-1] is None,
        len(o["args"]),
    )
    yield "args empty", container(args=[]), "baseline", args([])

    def mounts(expected_targets):
        return lambda o: ([m["target"] for m in o["mounts"][:-1]] == expected_targets and o["mounts"][-1] is None, o["mounts"])

    common = [
        {"Type": "bind", "Source": "/srv/c", "Destination": "/config", "RW": True},
        {"Type": "bind", "Source": "/srv/o", "Destination": "/var/lib/other", "RW": True},
        {"Type": "volume", "Source": "/srv/s", "Destination": "/secrets", "RW": False},
        {"Type": "bind", "Source": "/srv/cs", "Destination": "/config/sub", "RW": True},
    ]
    yield "mounts baseline selects /config only", container(mounts=common), "baseline", mounts(["/config"])
    yield "mounts file literal adds /secrets", container(mounts=common), "fileLiteral", mounts(["/config", "/secrets"])
    yield "mounts env path selects /data", container(
        env=["CUSTOM_USERS_PATH=/data/users.yml"], mounts=[*common, {"Type": "bind", "Source": "/srv/d", "Destination": "/data", "RW": True}]
    ), "envPath", mounts(["/config", "/data"])
    yield "mounts over 64 is null", container(mounts=[common[0]] * 65), "baseline", lambda o: (o["mounts"] is None, o["mounts"])

    def nullable(o):
        return (
            o["entrypoint"] is None and o["stopTimeout"] is None and o["controller"] == {"project": "", "service": ""},
            {k: o[k] for k in ("entrypoint", "stopTimeout", "controller")},
        )

    yield "nullable entrypoint/stopTimeout/labels", container(Config__Entrypoint=["/a", "/b"], Config__Labels=None), "baseline", nullable

    def scalars(o):
        return (
            o["pid"] == 4242 and o["running"] is True and o["restartName"] == "unless-stopped" and o["stopTimeout"] == 15,
            {k: o[k] for k in ("pid", "running", "restartName", "stopTimeout")},
        )

    yield "scalar fields with Init/StopTimeout present", container(Config__StopTimeout=15, HostConfig__Init=True), "baseline", scalars


def main():
    docker = sys.argv[sys.argv.index("--docker") + 1] if "--docker" in sys.argv else shutil.which("docker")
    if not docker:
        raise SystemExit("docker CLI not found")
    failures = 0
    with tempfile.TemporaryDirectory(prefix="issuer-template-") as tmp:
        sock = os.path.join(tmp, "docker.sock")
        server = Server(sock, Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        os.makedirs(os.path.join(tmp, "home"), mode=0o700)
        os.makedirs(os.path.join(tmp, "config"), mode=0o700)
        env = {
            "PATH": "/usr/bin:/bin",
            "HOME": os.path.join(tmp, "home"),
            "DOCKER_CONFIG": os.path.join(tmp, "config"),
            "DOCKER_HOST": "unix://" + sock,
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
        }
        version = render(docker, env, ["version", "--format", "{{.Client.Version}}"])[1].strip()
        print(f"engine: docker CLI {version} at {docker} (Go text/template)")
        print(f"templates: {TEMPLATES_PATH.name} sourceTemplate {TEMPLATES['provenance']['sourceTemplateSha256'][:12]}")

        def run_case(name, argv, check):
            nonlocal failures
            code, out, err = render(docker, env, argv)
            try:
                if code != 0 or err:
                    raise AssertionError(f"exit={code} stderr={err.strip()[:300]}")
                if SECRET in out:
                    raise AssertionError("secret value rendered")
                ok, detail = check(json.loads(out))
                if not ok:
                    raise AssertionError(detail)
                print(f"PASS {name}")
            except (AssertionError, json.JSONDecodeError) as error:
                failures += 1
                print(f"FAIL {name}: {str(error)[:500]}")

        for name, obj, scenario, check in selector_cases():
            State.container = obj
            run_case(f"selector[{scenario}] {name}", ["container", "inspect", "--format", TEMPLATES["selector"][scenario], "fixture"], check)

        State.image = {"Id": "sha256:" + "i" * 64, "Config": {"Entrypoint": ["/app/entrypoint.sh"], "User": "", "StopSignal": "SIGTERM"}}
        run_case("image single entrypoint", ["image", "inspect", "--format", TEMPLATES["image"], "fixture"],
                 lambda o: (o["entrypoint"] == "/app/entrypoint.sh" and o["stopSignal"] == "SIGTERM", o))
        State.image = {"Id": "sha256:" + "i" * 64, "Config": {"Entrypoint": None, "User": "1000", "StopSignal": ""}}
        run_case("image null entrypoint", ["image", "inspect", "--format", TEMPLATES["image"], "fixture"],
                 lambda o: (o["entrypoint"] is None and o["user"] == "1000", o))
        run_case("version client and server", ["version", "--format", TEMPLATES["version"]],
                 lambda o: (o["server"]["version"] == "29.1.3-fixture" and o["server"]["minApi"] == "1.24" and o["client"]["os"] == "linux", o))
        server.shutdown()
        server.server_close()
    print(f"{'FAILED' if failures else 'OK'}: {failures} failure(s)")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
