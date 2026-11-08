# Issuer preflight template renderer

Renders the issuer startup preflight's generated Docker `--format` templates
with a real Go `text/template` engine: the installed Docker CLI, talking only
to a fake Engine API on a private Unix socket. This closes the gap left by
static and Python-only checks. It is not proof of real Docker, host or
loaded-issuer behaviour.

## Files

- `templates.json`: committed, sanitized templates plus provenance (proposal
  hash, `sourceTemplate` hash, generator hash). The private config namespace is
  replaced by the public placeholder `/config`.
- `generate_templates.py`: rebuilds `templates.json` from a frozen preflight
  proposal. It takes only the pure builders (`canonical_path`, `_prefix`,
  `_path_pred`, `_arg_template`, `_numeric_control_cell`, `_selector`) and the
  fixed `IMAGE_TEMPLATE`/`VERSION_TEMPLATE` by AST, without executing the
  proposal's module body, private context, sender or main.
- `run_tests.py`: fake Engine API plus cases. Exits non-zero on any failure.

## Run

```sh
python3 -I -B scripts/testing/issuer-template-renderer/run_tests.py
# try a candidate template set without changing the committed one
python3 -I -B scripts/testing/issuer-template-renderer/run_tests.py --templates candidate.json
# regenerate after the generator changes (maintainers with the proposal file)
python3 -I scripts/testing/issuer-template-renderer/generate_templates.py <PREFLIGHT-R2-PROPOSED.json>
```

Requirements: Python 3 standard library and a Docker CLI binary. No Docker
daemon, network, Go toolchain or credentials. HOME, DOCKER_CONFIG and the
environment are isolated in a temporary directory.

Recorded engine: Docker CLI 29.1.3 (Ubuntu 24.04 package), fake API version 1.41.

## Coverage

- PUID/PGID/UMASK canonical and invalid values, duplicates, empty values.
- Secret roles redacted to `PRESENT`/`EMPTY`; `*_FILE` and path roles limited
  to allowed roots; enum controls; unknown `AUTHELIA_`/`X_AUTHELIA_` overrides.
- Args: direct `authelia`, `--config`/`-c`, filters, `--config=value`,
  out-of-root paths, dangling flags, over 64 args, empty args.
- Mount selection for the baseline, file-literal and env-path scenarios, and
  the over-64 bound.
- Nullable entrypoint, stop timeout and labels; image and version templates.
- Every case also checks that a synthetic secret value never renders.

## Current result (sourceTemplate d6d7b09d)

37 of 40 cases fail. The selector and image templates use `{{json .Id}}`. On
Docker's typed inspect objects the field is `ID` (JSON name `Id`), so typed
execution fails and the CLI silently re-runs the template on the raw JSON map
(`missingkey=error`). The real Engine API omits nil `omitempty` fields such as
`HostConfig.Init` and `Config.StopTimeout`, and image `Config.Entrypoint` can
be `null`. The raw re-run then exits 1 (`map has no entry for key "Init"`,
`len of nil pointer`). Only containers that set both `Init` and `StopTimeout`
render.

A candidate with `{{json .Id}}` replaced by `{{json .ID}}` passes all 40
cases. The production generator is owned by Root; this harness does not change
it.

## Limits

- The fake API returns fixed synthetic objects; real daemon field shapes may
  differ by Engine version.
- Docker CLI behaviour can change between versions; record the engine version
  with results.
- `VERSION_TEMPLATE` is exercised only with a reachable server; a
  server-absent case needs the CLI's error path and is not covered.
- A failure here is a reproducible candidate defect, not proof of any live
  refusal's cause.
