# Task 4 implementation report

Status: DONE. Implemented only the approved Task 4 export changes. Parent review remains pending.

Branch: `fix/v3.1.1`. Starting commit: `12f61cee20d305f66805b67791f13db5f1def3f7`. Code and tests commit: `8920aace706596ee5a428f24015468d5f6ec650b` (`feat: add selected exports and PDF navigation options`). This report is committed separately. Normal staging of the report was rejected because the repository's local exclude rule ignores `.superpowers/`; `git check-ignore -v` confirmed that rule, so the explicitly requested report alone is staged with `git add -f`.

## Interfaces and implementation choices

- `makePDF(pages, options = {})`, `writePDF(pages, options)` and `writeCourseZIP(lessons, options)` accept `timestamps` and `bookmarks`, both defaulting to false. Only boolean `true` enables either option. All existing PDF/ZIP default fingerprint assertions pass unchanged.
- Valid PDF times are finite nonnegative numbers, floored to seconds and formatted `HH:MM:SS`; hours can exceed two digits. Missing, null, string, negative and nonfinite values produce no timestamp. Bookmarks include valid times even when visible timestamp labels are disabled, as specified.
- Single-slide PDFs add a 28-point external footer only when a valid timestamp is displayed. The original image dimensions/aspect remain intact above the footer. Handouts place time beside each existing slide number. JPEG streams remain verbatim.
- PDF outlines use ASCII `Page N - HH:MM:SS` titles (page number only without valid time), linked outline entries, and `/XYZ` destinations. Single-slide destinations point to page top; handout destinations use the corresponding upper/lower slide region, including an odd final slide. No added font or runtime dependency.
- The approved `exportPDF` IndexedDB settings record stores `{layout, timestamps, bookmarks}` without a schema migration or modifying `exportNaming`. Missing/invalid values normalize to `single/false/false`. Preference saves lock competing actions and restore the last successfully saved controls on transaction failure.
- `downloadPDF(list, course, options = pdfOptions())` snapshots page metadata; existing per-job callers therefore inherit layout and both options. `downloadPages` forwards annotations to the streaming PDF writer. All-retained, selected, per-job and both course ZIP paths are covered.
- `exportRetained(kind, selected = false)` snapshots metadata in displayed order and PDF options before asynchronous work. Selected PDFs use `-selected.pdf`; selected JPEG ZIPs use `-selected-slides.zip`. Zero selection disables the selected actions. Existing header exports always include all retained pages.
- `exportCourseZIP(courseKey, statusId = 'status')` shares the streaming implementation between course and batch buttons. The batch key is derived from `batchPage` and its displayed jobs, independently of `activeLesson`. ZIP names come from the matched course. Empty/unavailable/incomplete messages, cleanup and busy safeguards remain in place; batch messages also appear in the batch panel.
- Used existing wrapping control styles; no CSS change was necessary. Image payloads remain lazy, and asynchronous writers await each chunk/read before moving to the next JPEG. Outline metadata is linear in page count, with no additional image retention.

## Changed files

- [pdf.js](../../../pdf.js): timestamp formatting, external footer/handout labels, outlines, option propagation.
- [capture.js](../../../capture.js): persisted PDF controls, selection snapshots, shared explicit-course export, all PDF caller propagation.
- [capture.html](../../../capture.html): timestamp/bookmark controls, selected export buttons, batch course ZIP shortcut and accurate helper text.
- [tests/export.test.cjs](../../../tests/export.test.cjs): option combinations, invalid times, outline links/destinations, image order, course propagation, streaming/backpressure/bounded-read coverage. Existing assertions retained.
- [tests/improvements.cjs](../../../tests/improvements.cjs): six export browser groups using a separate empty browser context and synthetic JPEG fixtures. Existing thirteen groups retained.

No changes to versions, dependencies, packaging, documentation outside this report, database schema, extraction behavior or other task source areas. Parent explicitly authorized reading the relevant settings context in the existing workspace script and approved the separate `exportPDF` settings key.

## Commands and results

Commands ran from `/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1` with Node `v26.13.0` and inherited development dependencies. No installs or downloads.

```sh
node --test tests/export.test.cjs
```

Exit 0: **71/71 tests passed**, approximately 6.0 seconds. Coverage includes both layouts; all timestamp/bookmark combinations; zero/one/two/three slides; odd final handout; default byte hashes; invalid times; strict booleans; raw JPEG preservation and order; course ZIP members; asynchronous backpressure; read/write error propagation; 1000-page bounded image reads; ZIP32 boundaries. Background job `bash-dcbda7e45a4b4099` was collected.

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/improvements.cjs
```

Exit 0: **19/19 focused groups passed** (13 existing, 6 added). New behavior checks cover zero/one/many selections and displayed order; all-retained independence; filenames; persisted settings and failed-save rollback; legacy/invalid settings; all PDF export paths; cross-course batch scope after lesson switching; metadata/options snapshots before asynchronous writes; busy controls; empty/missing/unavailable course messages. No external requests or browser page errors. Background job `bash-29903d2578be495d` was collected. Synthetic downloads: [.test-output/v3.1.1/task4-qhYWQB](../../../.test-output/v3.1.1/task4-qhYWQB/).

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/review.cjs
```

Exit 0: **13/13 existing focused review groups passed**, including all-retained JPEG ZIP/handout exports with selection, invalid naming, selection/Shift/lightbox guards, atomic deletion/undo, cleanup and three desktop viewport layouts. Background job `bash-3f10d5f968ff40f4` was collected. Evidence: [.test-output/v3.1.0/review-UUH4rb](../../../.test-output/v3.1.0/review-UUH4rb/).

```sh
pdftoppm -r 72 -png -f 1 -l 1 .test-output/v3.1.1/task4-qhYWQB/annotated-single.pdf .test-output/v3.1.1/task4-qhYWQB/render-single
pdftoppm -r 96 -png .test-output/v3.1.1/task4-qhYWQB/annotated-handout.pdf .test-output/v3.1.1/task4-qhYWQB/render-handout
git diff --check
```

All succeeded. Used `read_image` on every rendered output:

- [Single slide](../../../.test-output/v3.1.1/task4-qhYWQB/render-single-1.png): 842 × 502 rendered pixels. The complete colored image and all border edges remain visible; `00:01:03` sits in the separate white footer below the image, with no overlap. PDF geometry is 842 × 501.625 points, comprising 473.625 points of image plus 28 points of footer.
- [Handout sheet 1](../../../.test-output/v3.1.1/task4-qhYWQB/render-handout-1.png): 794 × 1123 rendered pixels from 595 × 842 points. Two complete landscape images, distinct `1 - 00:01:03` and `2 - 00:01:01` labels, unobstructed note lines and sheet footer.
- [Handout sheet 2](../../../.test-output/v3.1.1/task4-qhYWQB/render-handout-2.png): same A4 geometry. Odd final portrait image is centered and fully visible in the upper slot, label is `3` with no fabricated null timestamp; lower slot stays empty and `2 / 2` footer remains visible.

## Self-review and limits

Reviewed the final diff against all six Task 4 interfaces and global constraints. Checked saved option rollback, caller propagation, snapshots before asynchronous work, selection versus retained behavior, displayed batch independence, default byte compatibility and stream backpressure. No remaining implementation concern identified. Changed/staged only the five authorized code/test files and this report; synthetic output remains local and untracked/ignored.

Used only loopback synthetic fixtures and isolated Playwright contexts, never live courses, credentials, external network or personal browser profiles. No push/merge/publish. Did not run the full nine-suite regression or packaging/version checks, which are reserved for Task 5. Actual runtime execution used the supplied modern Chromium and Node 26; Chrome 114 and Node 20 were not separately launched. Added syntax/APIs are within those minimums. Outline destinations were parsed and verified structurally with pdf-lib; manual PDF-viewer clicking was not exercised. Parent must perform the requested fresh combined specification and quality review.

## Review fix round 1 — pending naming writes and main course scope

Status: DONE, ready for re-review. Starting HEAD was `f9ce7d8dfe3be39ef5504c5e31853d048011ba31`. Addressed Important I1 from [task-4-review.md](task-4-review.md). Code/tests commit: `aa65c75c5d6c4f2e84d0ae793e8c217701cc9815` (`fix: resolve main course export after pending naming saves`). This addendum is committed separately.

The main course ZIP button now calls `exportCourseZIP()` without capturing a course key. The shared function acquires its existing busy guard and snapshots PDF options first, waits for `namingSave` and `lessonSave`, then resolves the current course key when the argument is `undefined`. Explicit batch keys remain captured from the displayed batch and are not replaced; an explicit missing batch scope still reports the missing-list error. Existing page metadata snapshots, image streaming and other export behavior are unchanged. Source changes are confined to [capture.js](../../../capture.js); the regression is in [tests/improvements.cjs](../../../tests/improvements.cjs).

The new regression uses two nonempty local lessons with no course-ID URL in the same name group. It holds the actual naming write transaction open using queued IndexedDB reads, edits the active lesson's name, clicks the main course ZIP button while the write remains pending, and verifies the export busy guard is held. After releasing the transaction, it checks the ZIP member count, exact intended JPEG sequence/PDF sheet count, member name and archive filename. The sibling retains the old name, so a stale-key export would succeed with the wrong lesson rather than merely fail as empty. The existing independent batch-scope and snapshot tests run in the same suite.

The exact command was run once before the source fix and once after:

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/improvements.cjs
```

- Before fix: exit **1**, existing **19 groups passed**, then the new regression failed in `inspectPDF` with `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 1 !== 2`. The stale course exported the old sibling's one-sheet PDF instead of the intended active lesson's two-sheet PDF. Collected job `bash-099ef251ec684366`; artifacts: [.test-output/v3.1.1/task4-8XeU2n](../../../.test-output/v3.1.1/task4-8XeU2n/).
- After fix: exit **0**, **20/20 groups passed**, no unexpected external requests or browser page errors. Collected job `bash-9a1c37251fa0481e`; artifacts: [.test-output/v3.1.1/task4-L5XtVQ](../../../.test-output/v3.1.1/task4-L5XtVQ/).
- `git diff --check`: passed. Reviewed the minimal diff; only the main entry point delays key resolution. No PDF generator, image, geometry, layout, version or dependency edits. As requested, did not rerun Node/PDF tests, Poppler renders or the full regression for this controller timing fix; their prior results above remain historical evidence, not new runs.

The parent's audit document had an unstaged change during this round; it was left untouched and excluded from both implementation commits. All round-1 modifications are limited to the two authorized source/test files and this appended report.
