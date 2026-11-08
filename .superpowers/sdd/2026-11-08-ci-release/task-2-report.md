# Task 2 — bounded native ZIP observation

Task 2 is complete within its activated local scope. The final fixture passed nine focused native controls and one full 16-case memory run. The 2,000-page export used a real Chromium download and `saveAs`; all existing assertions passed. The repaired fixture has not been run in remote Node 20 Linux CI.

## Scope and identities

- Activated brief: [task-2-brief.md](task-2-brief.md); binding requirements: [CI release design, Task 2](../../../docs/superpowers/specs/2026-11-08-ci-release-design.md#task22000页写包与原生下载观测的边界).
- Clean starting Git commit: `b976b425c37bf8f9ef9a0e4099f58fa1dd4cb3c5`.
- Source Git commit: `0221da371f26f6cee9712508a9eb9b29c2f3a238`, `fix: separate ZIP generation from native download deadline`.
- Source file: [memory fixture](../../../tests/memory.cjs). Final file-content SHA-256: `a5db5f0b881d247452e4e54dbdd32eb7ecdd9e176955b0421f65734d31403be9` (56,316 bytes). This is a content digest, not a Git commit ID.
- The final source is identical to both [green control source](../../../.test-output/ci-release-task-2/owned-controls.source.cjs) and [full-run source](../../../.test-output/ci-release-task-2/full-memory.source.cjs). [Source epoch fingerprints](../../../.test-output/ci-release-task-2/source-epochs.json) preserve the RED/final digests.
- The only tracked changes are the owning memory fixture and this report. The earlier features repair, runtime, ZIP writer, permissions, assets, versions, IDB schema, other documents and workspaces were not changed. No delegation, installs, other suites, remote actions, pushes, tags, releases, school access or browser profile access were used.
- The final callback and raw handoff record supply the exact report Git commit after it is created; the report cannot embed its own immutable commit hash.

## Supplied RED and actual local RED

The supplied remote run `42459142803` is evidence from another execution. Its Node 20 jobs on three operating systems and features/review/bridge/integration passed; memory passed its first 15 cases. The final fresh 2,000-page workspace then failed at the old line 463 with `page.waitForEvent: Timeout 30000ms exceeded while waiting for event "download"`. Node 20.20.2 exited on the unhandled rejection while the fixture was still awaiting `exportRetained('zip')`. The supplied log did not record whether that producer later finished or failed. Library/improvements were not reached in that supplied run.

The source demonstrated a fixture boundary flaw: the native wait started its deadline before generation, then its rejected Promise had no owner until after generation was awaited. That observation does not prove the Linux producer was slow, establish a product/download-policy failure, or equate this failure with historical L1/L2. No local Linux 2,000-page RED was executed or claimed. Historical original final M2 remains previously disclosed history; this task neither reran nor reclassified that wave.

The actual local RED used the legacy ordering with a 100 ms native budget and a deliberately delayed 300 ms producer, plus actual Chromium blob-link downloads. It passed the early-event case, then exited 1 on the unhandled native timeout before the delayed producer outcome was recorded. The archived [RED source](../../../.test-output/ci-release-task-2/red-controls.source.cjs) has content SHA-256 `08185f89f7178015b56f030183354c5882d3bf63269ec15a9369a3fdb33fd818`. This is a small-budget fixture reproduction, not the supplied Linux producer's conclusion.

A separate diagnostic RED execution attached an `unhandledRejection` logging handler, retained exit 1, let the delayed producer settle, and reached the runner's teardown/report path. Its stderr records `CONTROL_OBSERVED_UNHANDLED` and `PromiseRejectionHandledWarning: Promise rejection was handled asynchronously (rejection id: 1)`. This handler was confined to that diagnostic command; it is absent from the final source and full-run command. The first abrupt RED did not reach orderly final reporting, so it supplies no explicit browser/server teardown report of its own.

## Implementation and ownership

[observeNativeDownload](../../../tests/memory.cjs#L108) subscribes to `download`, `close` and `crash` before invoking the producer. It retains an early native event while separately awaiting the producer. A shared failure Promise and `Promise.race` own rejection before the producer callback runs, including synchronous throws and immediate rejection. An early download never converts producer failure into success.

Generation has a new finite 180,000 ms Node wall-clock guard. Three minutes is a conservative production ceiling for the sequential 2,000-entry OPFS fixture; it bounds a stalled evaluation independently of the page's fake retention clock. It is not an extension of the native wait, and is not claimed to be a measured Linux completion threshold. After production succeeds, the old 30,000 ms native budget starts. If an event arrived earlier, the stored native Promise resolves immediately; otherwise absence remains bounded by those 30 seconds. A missing event, page closure/crash, producer rejection or guard expiry fails the observation.

On failure the helper closes the synthetic page, stopping a still-running `page.evaluate` before the fixture can continue. It rethrows the original failure; a page-close cleanup error, if any, is retained in timing diagnostics. The `finally` block clears the active timer and removes the exact three observation listener references. Producer rejection remains owned even if it occurs after the guard wins. Both old 1,000-page and new 2,000-page call sites use this helper and retain their actual download, `saveAs`, download-failure and content assertions.

The long workspace's CDP session now detaches in `finally`, and the outer runner records context/browser/server state after teardown. Normal full mode still registers the same 16 cases; the nine small controls run only with `PPT_TEST_NATIVE_CONTROLS=1`.

## Local inputs

- Platform: macOS `darwin`, Node `v26.13.0`; actual browser version `156.0.8078.4`.
- Existing browser executable: `/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.
- Existing Playwright dependency resolved from `/Users/jasondai/XJTU-PPT-Capture-Extension/node_modules/playwright/index.js`; no dependency installation occurred.
- The shared runtime's existing launch options were used. No Chrome flags, security/download policy, native file path bypass, or runtime export hooks were added.
- Raw command records capture the executable, working directory and relevant environment overrides. Full mode used `PPT_TEST_NATIVE_CONTROLS=0` and an empty `PPT_TEST_FILTER`.

## Small-budget behavioral results

The final [control report](../../../.test-output/ci-release-task-2/memory-1794124237318/report.json) passed 9/9 with exit 0, zero browser errors and a 4,058 ms process duration. The native budget was 100 ms and producer guard 2,000 ms, except the guard-specific case used 100 ms.

| Control | Actual final observation |
| --- | --- |
| Early actual native event while production continues | Event 8 ms, producer completion 311 ms; event retained beyond the 100 ms native budget. |
| Production longer than the old native budget | Producer 306 ms, event 308 ms; succeeds without charging those first 300 ms against native absence. |
| Native event after producer completion | Producer 0 ms, event 49 ms; succeeds. |
| No native event after slow production | Producer 301 ms; expected missing-event failure and page teardown by 405 ms. |
| Immediate rejected producer | Exact error identity retained; no unhandled rejection. |
| Synchronous producer throw | Exact error identity retained; no unhandled rejection. |
| Initiated native click followed by producer failure | Exact error retained. In this run producer rejection was 5 ms and event 7 ms, during failure cleanup; that case's label alone does not prove event-before-failure ordering. |
| Producer guard and later rejection | 100 ms guard failed promptly, observation/cleanup 103 ms; later rejected producer remained owned. |
| Page closes during observation | Expected page-close error in 4 ms; observation resources removed. |

Every control checks that no helper-added listener identity remains. `async_hooks` tracks Timeout resource IDs created from the real helper; every case observed one or two such timers and ended with zero remaining. These checks allow Playwright to remove its own once-close listener/timer. Earlier attempted total-count checks failed because normal Playwright closure changes that baseline. Those real interim failures remain in the raw evidence: `green-controls` was 8/9 exit 1, and `final-controls` was 3/9 exit 1. Neither was a full memory run.

Two additional [ordered probes](../../../.test-output/ci-release-task-2/ordered-probes.result.json) executed the exact final helper extracted from the unchanged source, with actual Chromium downloads/evaluation; exit 0 in 1,892 ms:

- The first explicitly awaited the native event and checked that the helper had observed it before throwing a particular producer error. Native event and producer rejection both rounded to 7 ms; explicit await ordering proves the event came first, and the exact error still won. Observation teardown completed by 34 ms.
- The second ran a real never-resolving `page.evaluate`. The 100 ms production guard failed by 104 ms; closing the page rejected the evaluation by 105 ms, and that rejection was owned. Both pages closed and no download listeners remained. The probe closed its context/browser and started no HTTP server.

## One final full memory run

Exactly one full run was executed after final source edits: [full report](../../../.test-output/ci-release-task-2/memory-1794124291048/report.json), exit 0, 16/16 PASS, zero browser errors, process duration 20,410 ms. No source edits followed this execution. The original migration, rollback, OPFS/session, learning/cancellation, 1,000-page metadata/cache/thumbnail/preview, 256 MiB stream, quota/cancellation, old ZIP/failure, shared undo and 2,000-page tests all passed.

| Export | Native event from subscription | Producer completion | Observation completion | Final status |
| --- | ---: | ---: | ---: | --- |
| 1,000 pages | 1,111 ms | 1,117 ms | 1,117 ms | fulfilled |
| 2,000 pages | 2,796 ms | 2,801 ms | 2,801 ms | fulfilled |

The full 2,000-page case took 7,469 ms. It restored 2,000 metadata/card/asset records, retained the source-time endpoints 0 and 9,995, and preserved the 1,000-signature/82,944,000-byte cache bound, 2,000 visits in batches of at most 32, thumbnail maximum two concurrent reads, 11 live URLs within the allowed 11, card reuse and cache release.

The native [2,000-page saved ZIP](../../../.test-output/ci-release-task-2/memory-1794124291048/synthetic-2000-slides.zip) is 150,230,024 bytes with exactly 2,000 entries and 150,012,000 JPEG bytes. Each JPEG is 75,006 bytes with SHA-256 `20ba850012ee83785e07c8558e5968e3954f4ac82353b94b58ce25dbcc93c0d1`. Names span `001-00-00-00.jpg` through `2000-02-46-35.jpg`. All existing entry/hash/order/naming assertions passed. The actual image-read counters were active 0, maximum 1, total 2,000. Sampled Chromium JS heap rose from 5,202,280 to 5,367,440 bytes: delta 165,160, below the unchanged 67,108,864-byte limit.

The 60,001 ms page-clock advance preserved the retention boundary assertions, removed the ZIP cache/URL when expected, and preserved thumbnail URLs. Appending page 2,001 produced exactly one added card and zero removals while preserving scroll position, existing card identity and selection. These are sampled JS-heap measurements, not process RSS or a measured peak; the synthetic JPEG repeats intentionally.

The original native [1,000-page saved ZIP](../../../.test-output/ci-release-task-2/memory-1794124291048/synthetic-1000-slides.zip) is 75,114,024 bytes, exactly 1,000 entries and 75,006,000 JPEG bytes, with the same per-JPEG hash. Naming spans `001-01-23-15.jpg` through `1000-00-00-00.jpg`; its original retained-file size and 60,001 ms expiry assertions passed. Failed export still removed partial files and retained all 1,000 pages.

The unchanged 256 MiB streaming case wrote 268,435,456 bytes with checksum `f1cc9dc5`, 256 chunks produced/written, no overlapping write and source release; its sampled heap delta was 70,416 bytes. Learning streamed 1,001 assets with maximum batch/peak 32, zero live assets after release, 1,001 released assets and zero final cache, preserving its cancellation/view checks.

Independent Python standard-library reads of both saved ZIPs checked every entry CRC and JPEG digest without rerunning the suite. [Final integrity evidence](../../../.test-output/ci-release-task-2/final-integrity.json) records:

| Saved archive | SHA-256 | CRC/JPEG verification |
| --- | --- | --- |
| 1,000 pages | `d51f41e81877e55cc7a40a6b69bf118f2bd5992e2ecdb07f24073391168984ab` | All 1,000 CRCs and JPEG hashes valid. |
| 2,000 pages | `51fac114e5658902e52f2dd17f198caab7e0f3f9641376ea9a410fac5b3ffb33` | All 2,000 CRCs and JPEG hashes valid. |

## Preserved evidence and release inputs

Every named execution below has a separate actual command/stdout/stderr/exit quartet; no supplied log was overwritten:

| Execution | Raw quartet |
| --- | --- |
| Actual legacy-boundary RED, exit 1 | [command](../../../.test-output/ci-release-task-2/red-controls.command.json), [stdout](../../../.test-output/ci-release-task-2/red-controls.stdout.log), [stderr](../../../.test-output/ci-release-task-2/red-controls.stderr.log), [exit](../../../.test-output/ci-release-task-2/red-controls.exit.json) |
| Diagnostic owned-observation RED, exit 1 | [command](../../../.test-output/ci-release-task-2/red-owned.command.json), [stdout](../../../.test-output/ci-release-task-2/red-owned.stdout.log), [stderr](../../../.test-output/ci-release-task-2/red-owned.stderr.log), [exit](../../../.test-output/ci-release-task-2/red-owned.exit.json) |
| Final 9/9 controls, exit 0 | [command](../../../.test-output/ci-release-task-2/owned-controls.command.json), [stdout](../../../.test-output/ci-release-task-2/owned-controls.stdout.log), [stderr](../../../.test-output/ci-release-task-2/owned-controls.stderr.log), [exit](../../../.test-output/ci-release-task-2/owned-controls.exit.json) |
| Exact-source ordered probes, exit 0 | [command](../../../.test-output/ci-release-task-2/ordered-probes.command.json), [stdout](../../../.test-output/ci-release-task-2/ordered-probes.stdout.log), [stderr](../../../.test-output/ci-release-task-2/ordered-probes.stderr.log), [exit](../../../.test-output/ci-release-task-2/ordered-probes.exit.json), [probe script](../../../.test-output/ci-release-task-2/ordered-probes.cjs) |
| Final FULL16, exit 0 | [command](../../../.test-output/ci-release-task-2/full-memory.command.json), [stdout](../../../.test-output/ci-release-task-2/full-memory.stdout.log), [stderr](../../../.test-output/ci-release-task-2/full-memory.stderr.log), [exit](../../../.test-output/ci-release-task-2/full-memory.exit.json) |

The supplied [remote-job.log](../../../.test-output/ci-release-task-2/remote-job.log) remains 111,944 bytes, SHA-256 `e9cb99b7543dcb6d0b09dbab3021618a9dbd1e9cfb455a94933c80a2088d1b79`. The supplied [remote-job.raw.log](../../../.test-output/ci-release-task-2/remote-job.raw.log) remains 112,043 bytes, SHA-256 `5c20bd78c1c39e4e45e00b6b8572a048c6370b4959b2a8c764010a09994d6dfe`.

The original [release ZIP](../../../ppt-capture.zip) remains 1,303,886 bytes, 35 runtime entries, SHA-256 `37563515b543dafea4581ecb42f041eb7134543b853ada18b50d789e480172ec`. Every packaged runtime file is byte-identical to its current source; mismatches are empty. Both [initial input fingerprints](../../../.test-output/ci-release-task-2/inputs-integrity.json) and the final integrity evidence retain the comparisons.

## Cleanup, self-review and remaining limits

The final full report and final nine-control report each record `contextsRemaining: 0`, `browserConnected: false`, `serverListening: false`. The ordered probes record zero context pages and a disconnected browser. The full-run managed job `bash-ea98f75fe23b48bd` completed exit 0 and its output was collected. No MCP browser was opened. The first abrupt local RED lacks orderly teardown reporting, as disclosed above; subsequent diagnostic and successful executions completed their owned cleanup paths.

Self-review checked the full delta against the clean base, source syntax with `node --check`, whitespace with `git diff --check`, unchanged 16 normal registrations and all previous assertions, exact-source equality with the final run, timer/listener ownership, original failure preservation, native downloads/saveAs, all saved ZIP CRCs/JPEG hashes, release bytes and tracked scope. No runtime fault was observed and no out-of-scope runtime edit was needed.

Fresh independent specification/quality/whole-delta review and the actual remote CI run remain the parent's next gates. Local macOS Node 26 success does not establish repaired Node 20 Linux behavior, resolve the original Linux producer's unrecorded outcome, or validate Chrome 114 specifically. The original final M2 history remains untouched.
