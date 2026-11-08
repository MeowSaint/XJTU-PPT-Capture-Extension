# Task 1 report — completed discovery cancellation baseline

Status: DONE. The test now waits for the Promise returned by the actual native discover click handler before taking its old-course cancellation baseline. The single final full installed-extension feature run passed all 11 original business cases. No product source changed.

## Scope and source revision

- Branch: `fix/long-session-reliability`.
- Verified clean starting HEAD: `db7aeffa69f6a3a3009b3406b0f3892930c907d4`.
- Binding inputs read: [task brief](task-1-brief.md), [design](../../../docs/superpowers/specs/2026-11-08-ci-release-design.md), the failing case/server and direct callers in [features fixture](../../../tests/features.cjs), [capture discovery](../../../capture.js), [workspace queue](../../../workspace.js), [preflight probe](../../../preflight.js), and [browser options](../../../tests/runtime.cjs).
- Source commit: `4cb4b79f2ebcdf6d1b5e98d0a8e394837ed90a2e`, `fix: await completed discovery before cancellation baseline`.
- Source SHA-256 before and after the final run: `3b6ea785d29deddab9fc62473ddfc8490be1feb6aa1c27ab78447dac99cd9262` (45,538 bytes).
- Only the feature fixture and this report are committed for this task. Raw evidence is ignored under the authorized [task output directory](../../../.test-output/ci-release-task-1/). No other SDD workspace or root ledger was read. No agents, dependency installs, remote operations, CI reruns, release/tag changes, host changes or real school/profile access were performed.

## RED provenance and established event order

The supplied RED is Linux browser CI run `42456976695`, job `128657981903`, source `d79d89c`: feature fixture line 278, `cancelled old queue never starts another request`, actual `4 !== 2`. Node 20 jobs on all three operating systems passed, as supplied in the activated brief. This is controller-provided evidence, not an execution or independently downloaded log from this task.

No local RED is claimed. No preliminary local full run or retry was made. The diagnostic observation retained in the final passing run is not labeled RED, and it did not reproduce the CI assertion failure.

The read-only source explanation is concrete: discovery cancels at entry, awaits tabs/scripts/messages/storage, and eventually calls `updateSources(true)` at capture line 2268. The storage-change caller can call `updateSources()` at line 2315 while those awaits are in progress. Workspace `refreshSources(..., {reset: true})` cancels and rebuilds the generation. Seeing the first two HTTP requests therefore does not establish that discovery has finished rebuilding its queue.

The final run directly observed the sequence below. Times are `performance.now()` milliseconds in the same extension page, rather than wall clocks across processes:

| Observed event | Time (ms) |
| --- | ---: |
| Actual old-course trusted click | 2001.300 |
| Old non-reset refresh | 2006.700 |
| First `/old/late.mp4` probe | 2010.300 |
| First `/old/second.mp4` probe | 2011.100 |
| Final old-course reset refresh | 2017.500 |
| Replacement `/old/late.mp4` probe | 2021.000 |
| Replacement `/old/second.mp4` probe | 2021.500 |
| Actual old discovery Promise fulfilled | 3027.800 |
| Actual fresh-course trusted click | 3096.700 |
| Actual fresh discovery Promise fulfilled | 4118.100 |

This establishes two starts before the reset and another two after it, all before old discovery completion. It supports the test-boundary diagnosis without treating the original controller hypothesis as proof. The snapshot taken after the original `>= 2` polling condition already contained four requests on this machine, with the click Promise still incomplete. It does not prove that this local polling snapshot caught the narrower two-request window seen in Linux CI. No artificial delay, gate or scheduling intervention was introduced to force that window.

## Change and assertion contract

The observer forwards `handler.apply(this, args)` and returns that exact Promise. The receiver, actual event object, original arguments and return identity are preserved. It attaches a fulfillment observer and exposes the actual Promise for Playwright evaluation to await; `locator.click()` remains the source of both trusted clicks. Refresh and probe observers only record events and forward the original receiver/arguments/return. They do not replace cancellation, synthesize source state, resolve held responses, change permission results or mock the queue. All three original functions are restored in `finally`, with identity restoration asserted and recorded.

Before cancellation, the test awaits actual discover completion and verifies two checking options, the explicit third old URL still queued, and two open held server responses. It asserts that the old discover reached its final reset, that the trusted click used the correct receiver, and that the third URL has never reached the server. The request-count baseline is then taken. The fresh course is selected by the actual course navigation and discover click; its actual Promise is also awaited. Held old responses are released only after fresh sources settle. The original fresh-valid, show-all/no-old-options and exact old-count stability assertions remain, with an additional explicit third-URL absence assertion after cancellation/release.

| Boundary | Total old requests | Still-held responses | Handler completion |
| --- | ---: | ---: | --- |
| Original first-two polling condition snapshot | 4 | 2 | Old incomplete |
| Completed old discovery, before flip | 4 | 2 | Old complete |
| Fresh discovery settled and old responses released | 4 | 0 | Old and fresh complete |

All four server paths are exactly `/old/late.mp4`, `/old/second.mp4`, `/old/late.mp4`, `/old/second.mp4`, using `GET` and `Range: bytes=0-65535`. `/old/queued.mp4` never starts. The test retains an equality against the measured completed baseline; it does not substitute a hard-coded four, add a tolerance or relax the original count assertion. The fresh video is valid and no old candidate remains even with show-all enabled.

## Actual validation and raw evidence

Environment: Node `v26.13.0`; existing Google Chrome for Testing `156.0.8078.4`, macOS arm64. Existing Playwright and Sharp resolve from the repository's existing node_modules. No installations or environment changes were made.

Exact child test command, also retained in [command](../../../.test-output/ci-release-task-1/full.command.txt):

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' PPT_TEST_OUTPUT='/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/long-session-reliability/.test-output/ci-release-task-1' node tests/features.cjs
```

The managed Python subprocess wrapper captured stdout/stderr and the child return code directly. Run start: `2026-11-08T07:20:12.310182+00:00`; end: `2026-11-08T07:20:32.070567+00:00`. Exit **0**. This was the only full local feature execution for the task; source was unchanged afterward.

- [stdout](../../../.test-output/ci-release-task-1/full.stdout.txt): 11 PASS cases and the evidence directory; 1,111 bytes; SHA-256 `ce6dfa95fdccc7debed1967970d2d8816360a5472ea1267f11c402965809f22b`.
- [stderr](../../../.test-output/ci-release-task-1/full.stderr.txt): empty, 0 bytes; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- [exit](../../../.test-output/ci-release-task-1/full.exit.txt): `0`; SHA-256 `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa`.
- [run metadata](../../../.test-output/ci-release-task-1/full.metadata.json): exact command, UTC timestamps, exit and matching source hashes; SHA-256 `669cd05fbafe989596eaf4997785b52a0aaf5367e4f7002d2bee50e97c2e3fd8`.
- [structured results](../../../.test-output/ci-release-task-1/features-mVKA1z/results.json): all 11 original cases passed; 112 media/API requests; 14 update GETs; initial concurrency peak 2; 24 cancellation trace events; three boundary snapshots; 20 unchanged copied product source hashes; zero page/worker/cleanup errors; zero unexpected external requests. SHA-256 `f504f775b59f33d66da016a8c40eaed7c261b629b5b65aa40910f3c62bf72423`.
- [evidence hash inventory](../../../.test-output/ci-release-task-1/evidence-hashes.json) covers the source, raw quartet, metadata, structured results and ZIP.
- Eleven existing screenshot outputs were generated by the unchanged full suite. No visual acceptance claim is made beyond the suite's native modal, focus, overflow and bounds assertions.

All original cases remain: first-use refusal/storage failure; automatic preflight classification/manual selection; real MP4/HLS decode and Referer; real-click permission timing; cancellation and stale results; concurrent update serialization; held automatic update behavior; manual update/read-only terms during load; terms/update without screenshot storage; prerelease/offline extraction; obsolete consent renewal. Other unaffected local suites were not repeated.

Static checks: `node --check tests/features.cjs` and `git diff --check` passed before the final run/source commit. Self-review examined the scoped diff and final fixture, confirming preservation of the original 11 test bodies' assertions, native permission/update paths, release ordering and exact request-count equality. No sleeps, retry loops, timeout increases or dependency changes were added. Existing condition-based fixture polling remains; new waits are actual Promise completion or explicit queue/server preconditions.

## Archive, resources and limitations

The existing [release ZIP](../../../ppt-capture.zip) was checked before and after the run without rebuilding it: **1,303,886 bytes, 35 entries**, SHA-256 `37563515b543dafea4581ecb42f041eb7134543b853ada18b50d789e480172ec`. It is unchanged.

The sole managed job `bash-2d101717fdaa44b6` completed with exit 0 and was collected with `job_output`. The fixture reports `browserClosed: true`, `serverClosed: true`, `tempRemoved: true`; pending old/update/load callbacks are all zero. Observer restoration is true. The fixture used its own disposable extension/profile, verified the resolved temporary target before removal, closed its browser context, cleared its own timers and closed its HTTP connections/server. No MCP browser context was opened.

Limitations: this local run uses macOS Chrome 156 and Node 26, not Linux/Node 20. It validates the actual pre-reset/replacement ordering but does not claim a local reproduction of the supplied Linux 4-versus-2 RED. The original final M2 remains a disclosed historical limitation; this task neither re-ran that wave nor claims to clear it. Existing local permission and update-transport fixture limitations remain recorded in structured results: permission timing uses the existing contains/request shim on an already-granted local host, and the update URL is redirected only in the disposable extension copy. Raw evidence is retained locally under the ignored output directory; the committed report records the observed facts and hashes.

Report delivery check: all 16 relative links resolved, the source hash still matched the tested fixture, and final `node --check` / `git diff --check` passed. Normal report staging returned exit 1 because the SDD directory is ignored (`The following paths are ignored by one of your .gitignore files: .superpowers`). The correction uses `git add -f` for this single explicitly authorized report path; no ignore rules are changed.

The controller owns fresh independent review of the full task range, remote push, CI revalidation and publication. This implementation makes no claim that those later gates have run.
