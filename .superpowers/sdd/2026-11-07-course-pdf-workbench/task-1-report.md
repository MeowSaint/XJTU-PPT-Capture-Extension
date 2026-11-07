# Task 1 — merged course PDF with Chinese hierarchical outlines

Status: DONE. Implementation/test commit: `49a4d348c6caf3e3b40d0315ef32e1e21597d860` (`feat: export merged course PDFs with Chinese outlines`). This report is committed separately immediately after that commit.

Worktree and baseline:

```text
/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2
branch: feat/v3.1.2
BASE: 20760988c0d41713b5b7f0c84464dd26655bf13d
observed Node: v26.13.0
```

Applied ponytail full. Implemented directly without subagents or reviewers. Read the exact task brief, named design/recon/implementer materials and authorized source/test files. Did not read the whole plan or prior conversation. Changes are limited to the six whitelisted product/test files and this report; probe scripts, logs and generated files remain ignored local test artifacts. No dependencies, versions, styles, workspace logic, storage schemas, API keys, archives, other worktrees or parent documents/ledger changed.

## Changes and interfaces

- [pdf.js](../../../pdf.js#L18) adds `writeCoursePDF(lessons, {title, layout = 'single', timestamps = false, readImage, write}) -> Promise<void>`. Each lesson is `{title, pages}` with existing read-only page metadata. It reuses the awaited streaming emitter: one original JPEG is read, written, and released before another is read. There is no course Blob, image collection or image `Promise.all`; only metadata/sheet/object planning is retained.
- [pdf.js](../../../pdf.js#L163) adds UTF-16BE hex strings with a BOM exclusively for the new course outlines. Valid surrogate pairs survive; isolated high/low surrogates become U+FFFD. The tree always contains course → nonempty lesson → page/time, with expanded descendant Counts, coherent Parent/Prev/Next/First/Last links, `/PageMode /UseOutlines`, and parent destinations equal to their first child's destination. Page labels use existing time validation and formatting even when printed timestamps are off. Empty writer input is a legal zero-page file without outlines.
- Sheet planning is per lesson. Single pages preserve existing geometry; handouts always start a lesson in the upper row. Odd boundaries retain blank lower rows rather than sharing them with the next lesson. A4 destinations remain y=758/364, slide labels are globally continuous, and physical-page footers use the final sheet total. Existing legacy flat ASCII bookmarks and legacy output bytes stay unchanged.
- [capture.js](../../../capture.js#L1196) adds `exportCoursePDF(courseKey, statusId = 'status') -> Promise<void>`. The main handler calls it without a key; the batch handler captures `batchCourseKey()` explicitly and passes `batch-status`. Explicit null never falls back to the active lesson. The controller awaits `namingSave` and then `lessonSave`, synchronizes retained pages, and only then resolves an omitted key and snapshots grouping/title/lesson labels/pages. Lesson sorting is date, start, created; page sorting is `order`. Empty lessons keep their original sorted indices for stable labels, but create no PDF nodes. Fallbacks are `未命名课程`, `未知日期`, and `未知时间`.
- The controller snapshots options and warning counts, rejects an empty course before creating a cache, writes through the existing OPFS cache, and suggests the sanitized course title plus `-整课.pdf`. Read/write/finish failures remove the failed cache, preserve the primary failure when cleanup also fails, and release busy state. Existing consent/task/realtime/batch/review/export/page-write guards and existing download URL/file lifetime are reused.
- [capture.html](../../../capture.html) adds only `course-pdf`, `batch-course-pdf`, and course-PDF help. Existing controls and markup layout remain in place. The bookmarks checkbox continues to govern legacy exports; the merged course path always has the full hierarchy.
- [tests/export.test.cjs](../../../tests/export.test.cjs#L835), [tests/library.cjs](../../../tests/library.cjs#L564), and [tests/improvements.cjs](../../../tests/improvements.cjs#L342) add the required writer and controller coverage. Existing assertions were retained.

## TDD and exact validation

The genuine RED preceded product implementation:

```sh
node --test tests/export.test.cjs > .test-output/task-1-export-red.log 2>&1
```

Exit 1: 88 total, 71 existing tests passed, 17 new tests failed because `writeCoursePDF` was absent (`TypeError [Error]: exportsWith(...).writeCoursePDF is not a function`, or expected a function but got undefined). This was a feature RED, not a broken fixture. Evidence: [RED log](../../../.test-output/task-1-export-red.log).

After implementing the writer:

```sh
node --test --test-name-pattern='course PDF|course handout' tests/export.test.cjs > .test-output/task-1-export-focused.log 2>&1
node --test tests/export.test.cjs > .test-output/task-1-export-green.log 2>&1
```

Both exited 0: all 17 new writer cases passed; the final complete suite passed 88/88. Evidence: [focused log](../../../.test-output/task-1-export-focused.log), [full export GREEN](../../../.test-output/task-1-export-green.log).

Required browser suites were run sequentially with the requested executable, ephemeral contexts and localhost fixtures:

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs > .test-output/task-1-library-green.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/improvements.cjs > .test-output/task-1-improvements-green-final.log 2>&1
```

Final results: library exit 0, 23 groups; improvements exit 0, 25 groups. Library asserts no browser script errors and no nonlocal requests across its context. Improvements asserts no page errors in its export context and no nonlocal requests across both contexts; the first improvements context has no added page-error listener. No Brave/MCP browser, user profile, credentials, real course, cloud request or dependency installation was used.

Writer tests cover recursive outline links and Counts; Chinese/emoji/parentheses/backslash/lone surrogates; duplicate and empty lessons; both layouts with printed timestamps on/off; zero, fractional, invalid/nonfinite/null/string/negative and 100-hour times; handout lesson sizes `[3,1]`, `[1,1]`, `[2,3]`; exact embedded JPEGs, row destinations, geometry, global slide numbers and physical footers; controlled read/write backpressure; 1000 metadata-only pages with one JPEG in flight; and read/header/image/outline/xref/final-write rejection with no subsequent reads/writes. All existing legacy hashes, option combinations, old flat outline checks, ZIP32/member/CRC checks and image tests passed.

Browser assertions cover active A versus explicit batch B scope, unselected partial lessons, persisted unmatched jobs/empty warnings, stable lesson numbering past empty lessons, exact JPEG order, snapshotting during an actual held cache write, competing export disabling, all eight real busy/consent guards, missing/null/empty scopes, OPFS read/write/finish/cleanup failure recovery, and real IndexedDB transaction holds. The naming case asserts the old live name and busy guard while the naming transaction is held, then validates the renamed single-course filename/tree/JPEGs and unrelated sibling. The library-put case uses the actual clone-at-call asynchronous `PPTLibrary.put`, changes the retained record only after commit, and verifies the fallback tree plus the committed `{}` course on disk.

Final syntax/whitespace commands exited 0:

```sh
node --check pdf.js
node --check capture.js
node --check tests/export.test.cjs
node --check tests/library.cjs
node --check tests/improvements.cjs
git diff --check
git diff HEAD^ HEAD --check
```

After final GREEN, only the explanatory fixture comment was clarified; executable test/product code did not change. Syntax and diff checks were repeated before committing. Passed export/library suites were not duplicated while debugging the new improvements fixture.

## Download fixture investigation — failures retained honestly

Four improvements attempts exited 1 at the new naming case's `download` event, after all preceding groups passed. Each used the same executable prefix and `node tests/improvements.cjs`; only the redirect log differed:

| Log | Observed result |
| --- | --- |
| [first attempt](../../../.test-output/task-1-improvements-green.log) | `page.waitForEvent: Timeout 30000ms exceeded while waiting for event "download"` |
| [stale-latch retry](../../../.test-output/task-1-improvements-green-retry.log) | Same timeout; clearing the old `window.releaseNaming` did not fix it |
| [state diagnostic](../../../.test-output/task-1-improvements-diagnostic.log) | New Unicode course live, correct current key, 3 pages, naming released, exportBusy=false, generated status; still no event |
| [native-click diagnostic](../../../.test-output/task-1-improvements-download-diagnostic.log) | This case's observer recorded exactly one native anchor click with `中文😀 (课程) _ 标题-整课.pdf`, a blob URL, and userActivation=true; no console warnings/errors; still no download event |

The first hypothesis was a stale release latch from the legacy ZIP test. The retry disproved that explanation. The final fixture contains no stale-latch workaround or native-anchor monkeypatch. Its event listener was always registered before clicking the button and before releasing the transaction.

A separate ignored [native-download probe](../../../.test-output/task-1-download-probe.cjs) used a tiny synthetic PDF Blob, a localhost HTTP button and an ephemeral context. It forwarded normal native clicks and changed no browser safety/download permissions. Its three executions used the same executable prefix with `node .test-output/task-1-download-probe.cjs`:

- [filename probe](../../../.test-output/task-1-download-probe.log): plain, Chinese, and emoji filenames all delivered normally.
- [repeated-download probe](../../../.test-output/task-1-download-repeat-probe.log): indices 0–9 delivered; index 10 produced no download event within 5 seconds; indices 11–17 delivered after that timeout. The probe's exit 0 reports diagnostic completion, not success of every attempted download.
- [document-isolation probe](../../../.test-output/task-1-download-document-probe.log): reloading before index 10 delivered all 18 without a fixed wait. The current probe script retains this final variant; prior variant outputs remain in the corresponding logs.

After the last existing improvements reload, ten downloads preceded the new naming case; its attempted download was eleventh. This matches the isolated observation. The fix reloads normally at the start boundary of the new independent fixture, before any new transaction is held or export clicked, then waits for Ready/not busy and installs the real hold. The previous ZIP export already awaited both save queues and idle before reaching this boundary; persisted synthetic IndexedDB content and full assertions remain. The final complete improvements run passed both new transaction cases and the no-error/no-nonlocal checks. This establishes an observed browser burst/download-delivery issue in this environment. Its precise timing/window and general document semantics were not measured and are not claimed as a stable Chromium specification. No production workaround, fixed sleep, synthetic activation, reduced assertion or permission change was introduced.

## Evidence and self-review

- [library GREEN log](../../../.test-output/task-1-library-green.log), [library results JSON](../../../.test-output/v3.1.1/library-3B6BQ3/results.json), and [library artifacts](../../../.test-output/v3.1.1/library-3B6BQ3) include the ordered Chinese course ZIP and merged PDF.
- [improvements final log](../../../.test-output/task-1-improvements-green-final.log) and [final artifacts](../../../.test-output/v3.1.1/task4-c9XgAV) include [default merged A](../../../.test-output/v3.1.1/task4-c9XgAV/merged-default-A.pdf), [handout A](../../../.test-output/v3.1.1/task4-c9XgAV/merged-handout-A.pdf), [independent batch B](../../../.test-output/v3.1.1/task4-c9XgAV/merged-handout-B.pdf), [write-time snapshot](../../../.test-output/v3.1.1/task4-c9XgAV/merged-snapshot.pdf), [real naming commit](../../../.test-output/v3.1.1/task4-c9XgAV/merged-pending-naming.pdf), and [real library-put commit](../../../.test-output/v3.1.1/task4-c9XgAV/merged-pending-lesson.pdf).
- Reviewed the complete product and test diffs. The implementation is additive to the existing ZIP/single-page functions; shared emitter changes preserve legacy bytes as checked by unchanged tests. Course planning stores only metadata. Hierarchy Unicode encoding is confined to the new branch. Controller waits precede default grouping/title/page snapshots; explicit scope is preserved. Existing lazy thumbnails, storage rollback, per-lesson 1000-page guard, task/stop/permission/consent behavior and URL lifetime were not changed. The small duplicated course-filter/warning calculation intentionally avoids refactoring legacy exports in this task.
- All 11 background jobs were collected with `job_output`; all completed and none remain running: `bash-482852fbb120420b`, `bash-7cf7a0362ed14a3f`, `bash-d6983a9fdb3f4a1c`, `bash-9cb1ec6e75604783`, `bash-b78c792d84904cac`, `bash-f1aefe06c9424bb5`, `bash-f5104e66280d4a6d`, `bash-f3026d5910054a6a`, `bash-5a7de5c7a37f45d5`, `bash-630f5fd2958e4861`, `bash-306d7fb92ee840ff`. Fixture browsers and servers close in their normal `finally` paths.

## Limits and handoff

No known implementation blocker remains. Automated parsing validates PDF structure, links, destinations, exact JPEG bytes and geometry. Actual outline expansion/scroll behavior has not been manually exercised in PDF.js, Acrobat or Preview. Chrome 114 and Node 20 themselves were not run; the code uses native features compatible with the binding versions, and validation used the supplied Chrome for Testing executable and Node v26.13.0. No real media/course performance or network behavior was tested. Task 2 UI work, version/README/dependency documentation changes and fresh review belong to the controller's later tasks. This implementer stops mutating after the report commit and handoff.
