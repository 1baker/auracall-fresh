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
- `test_harness.py`: offline regressions for exact routes, complete mount
  assertions, bounded pipes and child/server cleanup.

## Run

```sh
python3 -I -B scripts/testing/issuer-template-renderer/run_tests.py
# try a candidate template set without changing the committed one
python3 -I -B scripts/testing/issuer-template-renderer/run_tests.py --templates candidate.json
# regenerate after the generator changes (maintainers with the proposal file)
python3 -I scripts/testing/issuer-template-renderer/generate_templates.py <PREFLIGHT-R2-PROPOSED.json>
```

In plain English: Run the frozen templates, try a separate candidate, or rebuild
the public snapshot from a reviewed proposal. Only regeneration writes a file;
its default output replaces `templates.json`, so use a separate output path for
comparisons. These commands do not change the production issuer.

Check the harness itself with
`python3 -I -B scripts/testing/issuer-template-renderer/test_harness.py -v`.

Requirements: Python 3 standard library and a Docker CLI binary. No Docker
daemon, network, Go toolchain or credentials. HOME, DOCKER_CONFIG and the
environment are isolated in a temporary directory.

Recorded engine: Docker CLI 29.1.3 (Ubuntu 24.04 package), fake API version 1.52.
The original fixture advertised 1.41 but accepted arbitrary versioned routes;
strict checking observed the CLI using `/v1.52/`. The fixture now advertises and
accepts that exact version. A different CLI/API combination may refuse.

Only fixed ping/version routes and the `fixture` container/image are served.
Unexpected methods, identifiers, API versions or queries fail the case. Each
child has a 30-second whole-call deadline with reserved cleanup, 16 KiB stdout
and 4 KiB stderr caps. Its owned child is killed/reaped and pipes closed on
failure; server teardown runs in `finally`. No real daemon fallback is used.

## Coverage

- PUID/PGID/UMASK canonical and invalid values, duplicates, empty values.
- Secret roles redacted to `PRESENT`/`EMPTY`; `*_FILE` and path roles limited
  to allowed roots; enum controls; unknown `AUTHELIA_`/`X_AUTHELIA_` overrides.
- Args: direct `authelia`, `--config`/`-c`, filters, `--config=value`,
  out-of-root paths, dangling flags, over 64 args, empty args.
- Mount selection for the baseline, file-literal and env-path scenarios, and
  the over-64 bound.
- Nullable entrypoint, stop timeout and labels; image and version templates.
- Required image `User`/`StopSignal` omission must refuse instead of supplying
  Go zero values. Version-server absence must return `server:null` with the
  expected nonzero CLI refusal; it cannot become a successful readiness result.
- Every case also checks that a synthetic secret value never renders.

## Historical result (original 40 cases, sourceTemplate d6d7b09d)

37 of 40 cases fail. The selector and image templates use `{{json .Id}}`. On
Docker's typed inspect objects the field is `ID` (JSON name `Id`), so typed
execution fails and the CLI silently re-runs the template on the raw JSON map
(`missingkey=error`). The real Engine API omits nil `omitempty` fields such as
`HostConfig.Init` and `Config.StopTimeout`, and image `Config.Entrypoint` can
be `null`. The raw re-run then exits 1 (`map has no entry for key "Init"`,
`len of nil pointer`). Only containers that set both `Init` and `StopTimeout`
render.

A candidate with `{{json .Id}}` replaced by `{{json .ID}}` passes all 40
original cases. This comparison remains valid but is insufficient to select a
production fix: typed structs turn omitted image `User`/`StopSignal` into empty
strings, masking the required-field refusals of the existing raw-map contract.

## Native receiving result (43 cases)

The original 40 checks are retained, with the server-absent case and two required
image-field refusals added. The frozen R2 snapshot gives **6 PASS / 37 FAIL**.
The `.ID` candidate gives **41 PASS / 2 FAIL**, exposing the omitted-field issue.

A newer frozen selector snapshot gives **41 PASS / 2 FAIL** under these same
historical assertions. One is null image entrypoint; the other is a changed
contract: that newer selector reports absent controller labels as `null`, while
the historical fixture expects empty strings. A disposable image-only nullable
guard comparison gives **42 PASS / 1 FAIL**, retaining required-field refusals
and that explicit controller-contract mismatch. The historical assertion stays
unchanged; newer Source needs its own matched contract checks. The production
generator remains Root's and is unchanged by this PR. These are separate
comparisons, not a summed test total or current whole-reader acceptance.

## Limits

- The fake API returns fixed synthetic objects; real daemon field shapes may
  differ by Engine version.
- Docker CLI behaviour can change between versions; record the engine version
  with results.
- A failure here is a reproducible candidate defect, not proof of any live
  refusal's cause.
