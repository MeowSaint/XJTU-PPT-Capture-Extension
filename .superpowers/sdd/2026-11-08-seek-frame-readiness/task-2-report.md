# Task 2 report — DONE

Implemented the private review file-load driver repair in [tests/review.cjs](../../../tests/review.cjs). Source commit: `ed99176f5ad280387db59a2cbb5e0760a398f8e9` (`test: wait for review file-load ownership`). This report is committed separately; it deliberately contains no self-referential report-commit HEAD.

## Scope and source epochs

- Worktree: `/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/long-session-reliability`; branch `fix/long-session-reliability`.
- Actual Task 2 base: `ba7dcf0e27700342711124654fe609c8a678efb1`; controller-only direct parent: `33450411eb6907fa93b242dfca2c48e36c054a74`. Fresh complete-delta review remains based on `33450411`.
- Task 1 runtime source epoch remains `bf6b02852ca72cbe7bf8a47468bc64f8cfc9fd47`. No runtime, package, dependency, other fixture, version, permission, media codec, or pixel assertion changed.
- The sole tracked source change is [tests/review.cjs](../../../tests/review.cjs); the sole new tracked document is this report. The report was checked absent before creation. All generated evidence is under [task-2 raw evidence](../../../.test-output/seek-frame-readiness/task-2/).
- Read the activated brief, binding Task 2 spec section, complete local Ponytail guidance, complete review fixture, direct file/seek/busy/controls runtime contracts, test runtime loader, package scripts, and release inventory. Did not read old reports, controller documents, remote refs, PRs, or releases; did not repeat the completed diagnostic.

## Repair and regression evidence

The helper first waits for `ready`, `!busy()`, and an enabled file input. It then installs an owned capture-phase, once-only change listener that records the actual browser `File` fingerprint: `'file:' + JSON.stringify([file.name, file.size, file.lastModified])`. This preserves Playwright path-file behavior instead of rebuilding the selected file or substituting Node metadata. Capturing during change avoids racing the runtime's `finally` input clearing. After selection, success requires the requested `loadedIdentity.sourceKey`, `sourceReady`, idle, and native seekability. The listener is explicitly removed on success and failure, and its JSHandle is disposed in nested `finally` cleanup.

The deterministic synthetic protocol invokes the actual private helper against a separate owned loopback page. It presents pending operation ownership with a disabled input, then idle with the input still disabled, and finally an idle seekable old source while the requested fingerprint is not bound. The control gates protocol transitions without sleeps, retries, timeout changes, or native media claims. Its page/proxy is restored and closed in `finally`; it installs no hooks in the real workspace and creates no timers.

The RED source retained the original helper exactly and added only that control. It failed with numeric exit `1`:

```text
AssertionError [ERR_ASSERTION]: the driver must not select while another operation owns the disabled input
actual selection: ignored: true, name: 'review-video.mp4', size: 223138
expected selections: []
```

The separate native control performs first load and same-file reload using the original path input, verifies the exact basename/size/truncated filesystem mtime fingerprint, and verifies stable `loadedIdentity` after reselecting that same path. The original same-basename/different-file case and every original native action remain unchanged. The native input is cleared after loading in both controls and ordinary operation.

## Exact commands, environment, and results

Commands below ran from the stated worktree. The runner invokes `/opt/homebrew/Cellar/node/26.13.0_2/bin/node tests/review.cjs` as resolved by `process.execPath`; the machine-readable command records contain the exact executable path, arguments, cwd, relevant inherited `PPT_TEST_*` variables, source SHA-256, and UTC timestamps. Standard output and standard error are stored separately, including the RED failure. Exit records contain numeric status and signal.

Common explicit environment:

```text
PPT_TEST_BROWSER=/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
PPT_TEST_OUTPUT=<worktree>/.test-output/seek-frame-readiness/task-2/<run-label>
PPT_TEST_FILTER=<filter below>; absent for full
```

Node was `v26.13.0`, macOS `darwin/arm64`; installed browser was Google Chrome for Testing `156.0.8078.4`; FFmpeg was `9.0.2`. Existing installed Playwright, Sharp, and pdf-lib were used; no installation or replacement browser was performed. Exact tool commands/output are in [browser version](../../../.test-output/seek-frame-readiness/task-2/browser.version.json) and [FFmpeg version](../../../.test-output/seek-frame-readiness/task-2/ffmpeg.version.json).

| Run | Exact recorded invocation | Result | Raw evidence |
| --- | --- | --- | --- |
| RED, old helper | `node .test-output/seek-frame-readiness/task-2/run.cjs red 'synthetic driver protocol'` | exit 1, expected ownership assertion | [command](../../../.test-output/seek-frame-readiness/task-2/red.command.json), [stdout](../../../.test-output/seek-frame-readiness/task-2/red.stdout), [stderr](../../../.test-output/seek-frame-readiness/task-2/red.stderr), [exit](../../../.test-output/seek-frame-readiness/task-2/red.exit.json) |
| Initial GREEN | `node .test-output/seek-frame-readiness/task-2/run.cjs green 'synthetic driver protocol\|seek requires matching persisted source identity'` | exit 0, synthetic control + original native identity group | [command](../../../.test-output/seek-frame-readiness/task-2/green.command.json), [stdout](../../../.test-output/seek-frame-readiness/task-2/green.stdout), [stderr](../../../.test-output/seek-frame-readiness/task-2/green.stderr), [exit](../../../.test-output/seek-frame-readiness/task-2/green.exit.json) |
| Final focused GREEN | `node .test-output/seek-frame-readiness/task-2/run.cjs focused-final 'synthetic driver protocol\|native file driver\|seek requires matching persisted source identity'` | exit 0, all three groups | [command](../../../.test-output/seek-frame-readiness/task-2/focused-final.command.json), [stdout](../../../.test-output/seek-frame-readiness/task-2/focused-final.stdout), [stderr](../../../.test-output/seek-frame-readiness/task-2/focused-final.stderr), [exit](../../../.test-output/seek-frame-readiness/task-2/focused-final.exit.json) |
| One frozen FULL | `node .test-output/seek-frame-readiness/task-2/run.cjs full` | exit 0, original 19 + two distinct controls = 21 groups; no browser script errors or external requests | [command](../../../.test-output/seek-frame-readiness/task-2/full.command.json), [stdout](../../../.test-output/seek-frame-readiness/task-2/full.stdout), [stderr](../../../.test-output/seek-frame-readiness/task-2/full.stderr), [exit](../../../.test-output/seek-frame-readiness/task-2/full.exit.json), [results](../../../.test-output/seek-frame-readiness/task-2/full/review-x7P754/results.json) |

The displayed table escapes pipe characters for Markdown; the machine-readable command records and runner retain the exact regex alternations.

| Source epoch | Review SHA-256 | UTC execution interval |
| --- | --- | --- |
| Base original | `d26baee4aac6e6189587266b71d90c7ce177c10690fa48060eb0c2c9822af51d` | before Task 2 |
| RED: old helper + protocol control | `309d20e9c873206caea1e51d049fdc9bb584832405c8973b1a25d3f1b2438c41` | 12:55:42.476–12:55:45.690 |
| Initial GREEN: repaired helper + protocol control | `a43a0c5594e8360a518df29341de568e41cc40d4889c07ee099c3b98695451aa` | 12:56:26.053–12:56:30.191 |
| Final focused: adds native same-file control | `a1eb6d3dfe67d27737f14815641c2d4216382d8f6841cb9b1465a1e0c656cd3e` | 12:57:13.537–12:57:17.785 |
| Frozen FULL: identical final source | `a1eb6d3dfe67d27737f14815641c2d4216382d8f6841cb9b1465a1e0c656cd3e` | 12:57:39.486–12:57:58.409 |

All execution intervals above are on 2026-11-08. Each run's exact source snapshot, generated fixture size/mtime/SHA-256, stdout/stderr hashes, command, exit, output path, and cleanup record is indexed by [closure.json](../../../.test-output/seek-frame-readiness/task-2/closure.json). Synthetic and native evidence are explicitly separate groups.

## Frozen inputs and self-review

[Baseline](../../../.test-output/seek-frame-readiness/task-2/baseline.json), [final frozen input inventory](../../../.test-output/seek-frame-readiness/task-2/frozen-final.json), [post-run inventory](../../../.test-output/seek-frame-readiness/task-2/final.json), and [explicit suite input map](../../../.test-output/seek-frame-readiness/task-2/input-map.json) record SHA-256 for every tracked file, all unchanged fixture inputs, all 35 release resources, and the actual package's member names, sizes, hashes, and equality to the working tree. All 35 package members match the unchanged resources. The eight other suites are mapped to their existing package commands and unchanged fixture hashes; none was rerun, and this report assigns no new pass credit to them.

The actual [local package](../../../ppt-capture.zip) SHA-256 remains `d05d7747e809974e0ac85f8ea6b85b588fa4a2ef71391ef26d29b4fb847470ae`; all bytes are unchanged. No build, new CRC run, package mutation, runtime workaround, or unrelated main-worktree ZIP access occurred. Version remains `3.1.3`, IDB remains `3`, and existing dependencies and release resources remain unchanged.

[Self-review evidence](../../../.test-output/seek-frame-readiness/task-2/self-review.json) verifies all original 19 group names in order and all original 202 assertion call sites, including their 186 containing assertion/action lines, retained verbatim. The only two removed source lines are the old helper's unconditional selection and old-source-only readiness wait. Original callers, pixel/time/encoding/source/abort/checkpoint/dedupe/retention/business assertions, native actions, and other fixtures remain unchanged. Added call sites exercise protocol ownership/identity, exact path metadata, and same-file reload; total static assertion call sites are 215. The 10-second driver default, 30-second seek bound, and 45-second load bound are unchanged. `git diff --check` passed before staging. Explicit staging contained only the allowed source file before the source commit.

## Cleanup and handoff limits

All four managed jobs were collected: `bash-fd6e909ea4b54937` (RED, exit 1), `bash-ea370e5330ba4b8d` (initial GREEN, exit 0), `bash-4773dfb1e86741e1` (final focused, exit 0), and `bash-4e490f17d0cb48fb` (frozen FULL, exit 0). No active owned job remains. Each suite's original `finally` closed the owned browser context, browser, and loopback HTTP server; GREEN/final runs additionally emit explicit cleanup records. [Full cleanup](../../../.test-output/seek-frame-readiness/task-2/full/review-x7P754/cleanup.json) records `contextClosed`, `browserDisconnected`, and `serverClosed` all true. RED predates the cleanup-artifact addition, so its closure evidence is the preserved finally path and process exit, not a claimed retrospective cleanup artifact.

The capture listener/state is removed on both helper success and failure; the owned metadata handle is disposed; the synthetic page/proxy is restored in `finally`. No new timer or production hook was installed. Existing fixture hooks and timers are destroyed with their owned context. No browser profile, shared browser MCP task, host reload, network outside isolated loopback fixtures, or external mutation was used.

This finishes Task 2 implementation. A fresh independent Task 2/new-delta review from `33450411` and real complete remote CI remain controller work. Local Node 26/macOS/Chrome 156 is not the original Node 20/Linux/Chrome 151 environment. The completed earlier diagnostic was accepted as supplied, not repeated: this repair does not claim to reproduce the original CI 10-second timeout or establish its native cause. The synthetic control proves driver protocol behavior only; native evidence uses generated local testsrc media. Historical qualified M2, AAC native GAP, original five recordings/29 frames, L1/L2, and platform/semantic/RSS/OS-save limits remain unchanged; this local pass does not certify them anew.
