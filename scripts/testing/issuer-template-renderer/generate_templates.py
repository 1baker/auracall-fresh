#!/usr/bin/env python3
"""Regenerate templates.json from a frozen issuer preflight proposal.

Usage: python3 -I generate_templates.py <ISSUER-...-PREFLIGHT-R2-PROPOSED.json> [out]

Only the pure template builders are taken from the proposal's sourceTemplate
(by AST, never executing its module body, private context, YAML loader,
sender or main). The private config namespace is replaced by the public
placeholder "/config". Nothing here contacts Docker or any host.
"""
import ast
import hashlib
import json
import re
import sys
from pathlib import Path

FUNCTIONS = ("canonical_path", "_prefix", "_path_pred", "_arg_template", "_numeric_control_cell", "_selector")
CONSTANTS = ("IMAGE_TEMPLATE", "VERSION_TEMPLATE")
PUBLIC_CONFIG_NAMESPACE = "/config"

# Role rows as _references emits them when no literal reference qualifies.
# Names mirror the public Authelia environment variables in ROLE_TABLE.
ROLES = (
    ("SESSION_SECRET", False, "AUTHELIA_SESSION_SECRET"),
    ("STORAGE_ENCRYPTION_KEY", False, "AUTHELIA_STORAGE_ENCRYPTION_KEY"),
    ("OIDC_HMAC_SECRET", False, "AUTHELIA_IDENTITY_PROVIDERS_OIDC_HMAC_SECRET"),
    ("OIDC_LEGACY_PRIVATE_KEY", False, "AUTHELIA_IDENTITY_PROVIDERS_OIDC_ISSUER_PRIVATE_KEY"),
    ("STORAGE_LOCAL_PATH", True, "AUTHELIA_STORAGE_LOCAL_PATH"),
    ("AUTH_USERFILE", True, "AUTHELIA_AUTHENTICATION_BACKEND_FILE_PATH"),
    ("SERVER_CERTIFICATE", True, "AUTHELIA_SERVER_TLS_CERTIFICATE"),
    ("SERVER_PRIVATE_KEY", True, "AUTHELIA_SERVER_TLS_KEY"),
    ("LOG_FILE", True, "AUTHELIA_LOG_FILE_PATH"),
)


def ref(role, ispath, env, kind="UNSUPPORTED", argument=None):
    return {"role": role, "index": 0, "pathRole": ispath, "env": env, "reference": {"kind": kind, "argument": argument}}


def scenarios():
    base = [ref(*r) for r in ROLES]
    file_literal = [*base, ref("OIDC_JWKS_KEY", False, None, "FILE_LITERAL", "/secrets/jwks/key.pem")]
    env_path = [*base, ref("AUTH_USERFILE", True, None, "ENV_PATH", "CUSTOM_USERS_PATH")]
    return {"baseline": base, "fileLiteral": file_literal, "envPath": env_path}


def load(proposal_path):
    proposal_bytes = Path(proposal_path).read_bytes()
    proposal = json.loads(proposal_bytes)
    source = proposal["sourceTemplate"]
    source_sha = hashlib.sha256(source.encode()).hexdigest()
    if source_sha != proposal["sourceTemplateSha256"]:
        raise SystemExit("sourceTemplate hash mismatch")
    tree = ast.parse(source)
    picked, constants = [], {}
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in FUNCTIONS:
            picked.append(node)
        elif isinstance(node, ast.Assign) and len(node.targets) == 1:
            name = getattr(node.targets[0], "id", None)
            if name in CONSTANTS:
                constants[name] = ast.literal_eval(node.value)
    if sorted(n.name for n in picked) != sorted(FUNCTIONS) or sorted(constants) != sorted(CONSTANTS):
        raise SystemExit("expected template builders not found")

    class Unsupported(Exception):
        pass

    namespace = {
        "json": json,
        "re": re,
        "Unsupported": Unsupported,
        "PRIVATE_CONTEXT": {"configNamespace": PUBLIC_CONFIG_NAMESPACE},
    }
    exec(compile(ast.Module(body=picked, type_ignores=[]), "sourceTemplate", "exec"), namespace)
    return proposal_bytes, source_sha, namespace, constants


def main():
    if len(sys.argv) not in (2, 3):
        raise SystemExit(__doc__)
    proposal_bytes, source_sha, ns, constants = load(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) == 3 else Path(__file__).with_name("templates.json")
    doc = {
        "provenance": {
            "proposalSha256": hashlib.sha256(proposal_bytes).hexdigest(),
            "sourceTemplateSha256": source_sha,
            "generatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "functions": list(FUNCTIONS),
            "substitutions": {"PRIVATE_CONTEXT.configNamespace": PUBLIC_CONFIG_NAMESPACE},
        },
        "selector": {name: ns["_selector"](refs) for name, refs in scenarios().items()},
        "image": constants["IMAGE_TEMPLATE"],
        "version": constants["VERSION_TEMPLATE"],
    }
    out.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n")
    print(f"wrote {out} from sourceTemplate {source_sha[:12]}")


if __name__ == "__main__":
    main()
