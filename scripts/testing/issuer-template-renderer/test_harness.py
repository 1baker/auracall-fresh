"""Offline regressions for fixture containment, assertions and child cleanup."""
import copy
import importlib.util
import json
import os
import selectors
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("issuer_renderer", Path(__file__).with_name("run_tests.py"))
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class HarnessTests(unittest.TestCase):
    def child(self, script, **kwargs):
        return renderer.bounded_child(
            [sys.executable, "-I", "-B", "-c", script],
            {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
            **kwargs,
        )

    def tracked_child(self, action):
        children = []
        original = renderer.subprocess.Popen

        def start(*args, **kwargs):
            child = original(*args, **kwargs)
            children.append(child)
            return child

        with patch.object(renderer.subprocess, "Popen", side_effect=start):
            action()
        self.assertEqual(len(children), 1)
        self.assertIsNotNone(children[0].poll())
        self.assertTrue(children[0].stdout.closed)
        self.assertTrue(children[0].stderr.closed)

    def test_exact_output_bounds_are_accepted(self):
        code, out, err = self.child("import os;os.write(1,b'x'*64);os.write(2,b'y'*32)", stdout_cap=64, stderr_cap=32)
        self.assertEqual((code, out, err), (0, "x" * 64, "y" * 32))

    def test_stdout_overflow_kills_and_reaps(self):
        def action():
            with self.assertRaisesRegex(renderer.HarnessError, "stdout bound"):
                self.child("import os,time;os.write(1,b'x'*65);time.sleep(5)", stdout_cap=64)
        self.tracked_child(action)

    def test_stderr_overflow_kills_and_reaps(self):
        def action():
            with self.assertRaisesRegex(renderer.HarnessError, "stderr bound"):
                self.child("import os,time;os.write(2,b'x'*33);time.sleep(5)", stderr_cap=32)
        self.tracked_child(action)

    def test_timeout_kills_and_reaps(self):
        def action():
            with self.assertRaisesRegex(renderer.HarnessError, "deadline"):
                self.child("import time;time.sleep(5)", timeout=0.8)
        self.tracked_child(action)

    def test_selector_creation_failure_still_cleans_child(self):
        def action():
            with patch.object(renderer.selectors, "DefaultSelector", side_effect=OSError("fixture setup")):
                with self.assertRaises(OSError):
                    self.child("import time;time.sleep(5)")
        self.tracked_child(action)

    def test_partial_registration_failure_still_cleans_child(self):
        original = selectors.DefaultSelector

        class FailingSelector(original):
            def register(self, *args, **kwargs):
                super().register(*args, **kwargs)
                raise OSError("fixture registration")

        def action():
            with patch.object(renderer.selectors, "DefaultSelector", FailingSelector):
                with self.assertRaises(OSError):
                    self.child("import time;time.sleep(5)")
        self.tracked_child(action)

    def request(self, path, method="GET"):
        with tempfile.TemporaryDirectory(prefix="issuer-route-") as tmp:
            address = os.path.join(tmp, "api.sock")
            with renderer.running_server(address) as server:
                with socket.socket(socket.AF_UNIX) as client:
                    client.settimeout(2)
                    client.connect(address)
                    client.sendall(f"{method} {path} HTTP/1.0\r\nHost: fixture\r\n\r\n".encode())
                    data = bytearray()
                    while True:
                        chunk = client.recv(4096)
                        if not chunk:
                            break
                        data.extend(chunk)
                        self.assertLessEqual(len(data), 16384)
                return bytes(data), server.unexpected_request

    def test_exact_versioned_fixture_route(self):
        response, unexpected = self.request(f"/v{renderer.API_VERSION}/containers/fixture/json")
        self.assertIn(b" 200 ", response.split(b"\r\n", 1)[0])
        self.assertFalse(unexpected)
        self.assertEqual(json.loads(response.split(b"\r\n\r\n", 1)[1])["Id"], "c" * 64)

    def test_other_target_api_version_query_and_head_refuse(self):
        for path, method, status in (
            (f"/v{renderer.API_VERSION}/containers/other/json", "GET", 404),
            ("/v1.99/containers/fixture/json", "GET", 404),
            (f"/v{renderer.API_VERSION}/images/other/json", "GET", 404),
            (f"/v{renderer.API_VERSION}/containers/fixture/json?extra=1", "GET", 404),
            ("/other", "HEAD", 404),
            ("/version", "POST", 501),
        ):
            with self.subTest(path=path, method=method):
                response, unexpected = self.request(path, method)
                self.assertIn(f" {status} ".encode(), response.split(b"\r\n", 1)[0])
                self.assertTrue(unexpected)

    def test_server_closes_after_body_exception(self):
        with tempfile.TemporaryDirectory(prefix="issuer-cleanup-") as tmp:
            with self.assertRaisesRegex(ValueError, "fixture body"):
                with renderer.running_server(os.path.join(tmp, "api.sock")) as server:
                    raise ValueError("fixture body")
            self.assertEqual(server.socket.fileno(), -1)
            self.assertFalse(server.serve_thread.is_alive())

    def test_mount_assertion_refuses_wrong_source_type_and_writability(self):
        expected = {"type": "bind", "source": "/srv/c", "target": "/config", "rw": True}
        check = renderer.selected_mounts([expected])
        self.assertTrue(check({"mounts": [copy.deepcopy(expected), None]})[0])
        for key, value in (("source", "/other"), ("type", "volume"), ("rw", False)):
            with self.subTest(field=key):
                wrong = copy.deepcopy(expected)
                wrong[key] = value
                self.assertFalse(check({"mounts": [wrong, None]})[0])


if __name__ == "__main__":
    unittest.main()
