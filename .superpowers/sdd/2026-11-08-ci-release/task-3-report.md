# Task 3 implementation report

Status: **DONE**. Meaningful focused RED captured; focused GREEN passed 3/3; one final full library passed 61/61 on the final source. Source committed separately as `b6d79ea7ee383f1490834a34cef65d3dc14b5906`; this report is the subsequent report-only commit. Remote Linux CI and independent reviews remain controller-owned.

## Scope and implementation plan

Sole implementer; no subagents. Starting branch `fix/long-session-reliability`, clean BASE `304ecd90e9d4977da246f140421ba16fc1043cc6`. Requirements were the [activated brief](task-3-brief.md), the Task3 section of the [binding design](../../../docs/superpowers/specs/2026-11-08-ci-release-design.md#L21), and Task3/review focus of the [named plan](../../../docs/superpowers/plans/2026-11-08-ci-release.md#L47). Direct source inspection covered the helper and real consumer, startup/control owners, IDB-open implementation, fixture startup/seed/filter/cleanup, and the management case that seeds the dependent deletion case.

Execution plan: retain the supplied Linux failure; add an actual held-startup counterexample and obtain focused RED; add startup readiness to the count predicate; obtain focused GREEN including the original management/deletion pair; run one final full library on the final source; inspect the whole delta and unchanged resources; commit source and this report separately. No further design or approval gate was introduced.

Only [the library fixture](../../../tests/library.cjs) and this report are authorized source/report changes. Raw evidence uses exclusive, new paths beneath the existing [Task3 output directory](../../../.test-output/ci-release-task-3/). No other fixture, runtime, documentation, version, dependency, permission, ZIP, foreign index entry, branch or remote was modified.

## Failure and direct cause

The immutable [remote log](../../../.test-output/ci-release-task-3/remote-job.log#L1194) records the real Linux failure in run `42463292679`: after management passed, the original empty-library assertion at old line 2205 failed with `true !== false`, actual `true`, expected `false`, exit 1. Node20 on all three operating systems and features/review/bridge/integration/memory had passed; improvements was not run. The later diagnostic status saying restoration completed does not establish readiness at the failed assertion's sampling instant. This local work is a controlled counterexample, not a claim to replay that Linux schedule.

The original [count helper](../../../tests/library.cjs#L21) checked only `!busy()` and exact DOM card count. An initial empty document already meets the zero-card predicate. The existing `idle()` at line 20 requires `ready`; [real startup](../../../capture.js#L31) opens IndexedDB, reads settings, prunes, restores lessons/pages/batches and then sets `ready=true` and synchronously renders/updates controls at line 50. [Management controls](../../../capture.js#L897) use `active || !ready`. The actual IDB-open handler is [the page-store owner](../../../page-store.js#L18). There was no evidence of a product fault after real startup completed.

The helper change is exactly `ready &&` before its existing busy/count conditions. Counts remain exact, including zero. The original management-enabled `false` expectation, empty/disk/whole-course deletion/reload semantics, and every prior case/assertion remain intact.

## Regression boundary and cleanup

The new [held-startup group](../../../tests/library.cjs#L276) seeds an empty database, arms one reload through session storage, and transparently calls the original `IDBFactory.prototype.open` with its original receiver/arguments and returns the native request. A capture listener holds the actual `course-ppt`, version 3, native success event before the production `onsuccess` handler runs. It never assigns `ready`, `busy`, card DOM, or disabled state. Release restores the IDB prototype, removes the listener using the matching capture flag, clears the safety timer, and delivers the saved native event once to the real success handler with the request as receiver. Real settings/prune/restore/render/controls then complete.

The hold is finite: an 8000ms safety timer releases it automatically. That timer is a failure guard, not a synchronization delay; success requires `automatic=false`. Two actual animation frames give the helper polling opportunities while the database callback is held. The regression separately runs the old predicate, then starts actual `count(0)` and requires it to remain pending. The `finally` block releases the hold even when that assertion fails, awaits the helper and real `dbReady`, records evidence, and removes its probe/session flag. The guarded init script remains inert for later documents and disappears when the existing context closes.

Both RED and GREEN evidence show the held quartet `{ready:false, busy:false, cards:0, disabled:true}`, the actual database/version, and `oldPredicateSettled=true`. RED shows `countSettledWhileHeld=true`; GREEN shows `false`. After explicit release both show `{ready:true, busy:false, cards:0, disabled:false}`, `delivered=1`, `hookRestored=true`, `timerActive=false`, and `automatic=false`. Thus failure-path release/restoration is observed, not merely assumed. The original fixture's awaited finalizer releases source state, closes context/browser, closes all server connections and awaits server close. Each captured command exits after that finalizer; no separate browser, server, timer or job was launched outside the fixture.

## Commands, source epochs and raw evidence

All three commands use `node tests/library.cjs` from this worktree, with fresh headless loopback fixtures and `PPT_TEST_BROWSER` set to the supplied existing executable:

```text
/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
```

Each evidence directory contains an actual command/environment/start-time record, stdout, stderr, exit/end-time record, and source snapshot. Files were exclusively created; no supplied remote evidence was overwritten. `PPT_TEST_OUTPUT` names the corresponding directory below. No filter was set for FULL.

| Wave | `PPT_TEST_FILTER` | Result | Evidence |
| --- | --- | --- | --- |
| RED | `empty gallery count waits for real held IndexedDB startup` | exit 1; intended `count(0) must remain pending until actual IndexedDB startup finishes`, `true !== false` | [RED directory](../../../.test-output/ci-release-task-3/implementer-red-20261108-1647/) |
| GREEN | `empty gallery count waits\|management cancellation and transaction abort\|active, empty and whole-course deletion` | exit 0; all 3 groups passed; stderr empty | [GREEN directory](../../../.test-output/ci-release-task-3/implementer-green-20261108-1648/) |
| Final FULL | unset | exit 0; all 61 groups passed; stderr empty | [FULL directory](../../../.test-output/ci-release-task-3/implementer-full-20261108-1649/) |

RED source SHA-256: `10852184b5f30f1225ef64bc6b6bd9963778889734d8e670b21cc83fbd0d592f` (new regression, original helper). GREEN/final source SHA-256: `56098dcae7b64ad8a053a57bb5e0c848e818eac1908477a2d97c235204775960` (same regression, fixed helper). Start/finish hashes are recorded per wave; the final source was not edited during validation. The command records name the clean BASE HEAD because source was not committed until validation completed.

Observed RED evidence: [held boundary and failure cleanup](../../../.test-output/ci-release-task-3/implementer-red-20261108-1647/library-AxBwQo/held-startup.json), [actual stderr](../../../.test-output/ci-release-task-3/implementer-red-20261108-1647/stderr.log), [exit](../../../.test-output/ci-release-task-3/implementer-red-20261108-1647/exit.json). GREEN evidence: [held boundary and released real startup](../../../.test-output/ci-release-task-3/implementer-green-20261108-1648/library-4Ekhsf/held-startup.json), [actual passing output](../../../.test-output/ci-release-task-3/implementer-green-20261108-1648/stdout.log), [exit](../../../.test-output/ci-release-task-3/implementer-green-20261108-1648/exit.json). The focused management test is deliberately included before the dependent active/empty deletion test, preserving its original seed and state transitions.

## Final full-library verification

The final command ran once, 2026-11-08 16:48:50.561236 through 16:50:53.451338 +08:00 (about 122.89 seconds), and exited 0. [Actual stdout](../../../.test-output/ci-release-task-3/implementer-full-20261108-1649/stdout.log) records 61/61 groups; [stderr](../../../.test-output/ci-release-task-3/implementer-full-20261108-1649/stderr.log) is empty. [The result inventory](../../../.test-output/ci-release-task-3/implementer-full-20261108-1649/library-MW30KB/results.json) contains all 60 original groups plus the new regression, with `errors=[]` and `blocked=[]`. [The exit record](../../../.test-output/ci-release-task-3/implementer-full-20261108-1649/exit.json) confirms final source SHA-256 unchanged. [Environment](../../../.test-output/ci-release-task-3/implementer-full-20261108-1649/library-MW30KB/environment.json): Node v26.13.0, darwin arm64, Playwright 1.62.1, Chromium 156.0.8078.4.

Normal-path coverage includes exact positive and empty counts through lesson switching, learning views, undo and reload; real native PDF/ZIP downloads and frozen JPEG/mapping consumers; media transport and binding cancellation at native IDB; fetch/XHR acquisition and persistence; v2 migration; checkpoint/integrity coverage; the real scanner's 1388 committed pages; persisted page limits, quota rollback and storage stops; the original management cancellation/deletion/reload cases; whole-course deletion; cleanup-failure reporting; and crop-reuse/manual guards. The actual empty-gallery management consumer passed with its original `false` assertion. No case was skipped by filter in FULL.

The independent native batch-report button consumer saved [its actual downloaded file](../../../.test-output/ci-release-task-3/implementer-full-20261108-1649/library-MW30KB/learning-native-batch-report.json), SHA-256 `b11cc0931c09268a9859738ea3527f004cdbe60d14cd0131b089c6ebbc37ee81`, after a real document reload. The unchanged test verifies real download success, batch/current scope separation, filtered order `[613,612]`, mappings and public projection. This is a native consumer proof, not a substituted blob or fake lifecycle.

The full [held-startup evidence](../../../.test-output/ci-release-task-3/implementer-full-20261108-1649/library-MW30KB/held-startup.json) again shows old predicate settling during the hold, fixed count pending, and manual release exactly once with hook restored and timer inactive. All three background job results were collected: RED exit 1, GREEN exit 0, FULL exit 0. The fixture completed its existing context/browser/server finalizer in each wave; there are no remaining owned jobs. No independent OS process audit was performed.

The existing media differential still prints `EXPLICIT GAP: browser-tolerates-damaged-audio`. That qualification and the original M2 qualification remain; passing group registration does not convert either into new media verification. No additional media or unaffected suite rerun was made.

## Self-review and invariants

Whole-delta inspection found only the one readiness predicate change and the new 60-line self-contained regression. A normalization check removed that new group and reverted only `ready &&`; the result was byte-for-byte equal to the BASE fixture. This proves every previous test registration and assertion was preserved, including the actual deletion/reload consumer's `isDisabled() === false` check (now line 2265). The new test owns its empty seed and does not depend on an earlier management fixture. The old active/empty case's existing dependency is preserved in focused execution. No sleeps, retries, count relaxation, button-wait substitute, product changes or control-state forcing were introduced.

The [persisted scope evidence](../../../.test-output/ci-release-task-3/implementer-scope-20261108-1649.json) records exact source/resource hashes and equality checks against BASE:

- All 35 runtime archive member paths match BASE byte-for-byte; no build or repack was run.
- [The package](../../../ppt-capture.zip) remains 1,303,886 bytes, SHA-256 `37563515b543dafea4581ecb42f041eb7134543b853ada18b50d789e480172ec`.
- [Task1 fixture](../../../tests/features.cjs) remains equal to BASE, SHA-256 `3b6ea785d29deddab9fc62473ddfc8490be1feb6aa1c27ab78447dac99cd9262`.
- [Task2 fixture](../../../tests/memory.cjs) remains equal to BASE, SHA-256 `8e0132b86631878edd4c6b7b06c186fac777a6eb05ffb5dfb7423c5f55e343ff`.
- The supplied [remote log](../../../.test-output/ci-release-task-3/remote-job.log) SHA-256 is `dc0d7bd1ce7fcbd220ff4ae5ee454fbd40b3d6e440bba41023b7b05e9ee3167a` and was never edited.

Existing package metadata remains oldCRC; this report does not relabel it newCRC. The original final M2 qualification remains disclosed and unchanged. No Node suite, other seven browser suites, memory, release, dependency installation, real profile, school access or browser MCP was run. Local environment is macOS arm64 with Node `v26.13.0`; this is not Node20/Linux verification. Fresh independent task/complete-stage reviews and actual remote CI remain controller responsibilities after this implementation.

## Commits and handoff

Source-only commit: `b6d79ea7ee383f1490834a34cef65d3dc14b5906` — `test: wait for library startup before counting empty pages`; only [the library fixture](../../../tests/library.cjs) changed. The subsequent report-only commit contains this full report alone; its HEAD is returned in the callback so the report does not need to embed its own commit hash. All raw evidence remains in the exclusively created output paths and is not staged. No remote operation is part of this task.

Self-review result: no actionable issue within Task3. The fix uses the actual startup owner and retains busy/count/consumer semantics; the regression proves the old failure boundary and failure-path release; the complete existing fixture passed once on the final source. The controller can proceed with independent task/stage review and remote CI without rereading or rerunning unaffected local suites.
