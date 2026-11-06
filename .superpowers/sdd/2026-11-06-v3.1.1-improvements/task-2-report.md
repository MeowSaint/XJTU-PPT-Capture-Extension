# Task 2 implementation report

Status: DONE

Branch: `fix/v3.1.1`  
Base: `5bf50e4002a46dfef7badc7d6a814a29005689da`  
Implementation commit: `8442466e1465146b34fd751d4ecbb85418504806` — `feat: add deliberate screenshot review and saved lesson navigation`

This report is committed separately after the implementation commit; its commit can be identified with `git log -1 -- .superpowers/sdd/2026-11-06-v3.1.1-improvements/task-2-report.md`.

## Changes

Only the six allowed source/test files changed in the implementation commit:

- [capture.js](../../../capture.js): sequential similar-page review, Shift checkbox selection, lightbox selection and shortcuts, saved-batch navigation, and precise write-first suspect dismissal.
- [capture.html](../../../capture.html): comparison dialog with page numbers, source times, earlier/later/both decisions, cancel and final confirmation; visible lightbox selection control and S/V labels; revised review instructions.
- [style.css](../../../style.css): responsive two-image comparison layout and selected lightbox-toggle appearance, using existing dialog styles.
- [tests/review.cjs](../../../tests/review.cjs): new selection, preview, sequential review, cancellation, persistence-failure and URL-lifetime assertions; existing automatic-cleanup regression adapted to deliberate confirmation. The same 16-page fixture still retains exactly IDs 3–16 and restores all 16 with one undo.
- [tests/library.cjs](../../../tests/library.cjs): saved-batch navigation without media requests, cross-lesson selection reset, and exact persistent suspect dismissal with aborted-write recovery.
- [tests/improvements.cjs](../../../tests/improvements.cjs): Task 1 masked-candidate assertion now supplies real synthetic images and drives the comparison dialog. It still requires masked deletion of ID 1 and preservation of legacy unknown-geometry pages.

No schema, export implementation, version, dependency, parent-worktree, global configuration, or later-task changes were made. No delegation, research-browser access, real course access, credentials, or external network sites were used.

## Interfaces and behavior

### Sequential comparison

Internal controller functions are `cleanSimilar()`, `nextSimilar(review)`, `chooseSimilar(choice)`, `releaseSimilarImages(review)`, and `closeSimilar()`; `choice` is `earlier`, `later`, or `both`.

The review snapshots current display order and scans one surviving earlier page against the next page. Keeping the earlier page compares that survivor with the following page, not the removed page. Keeping both retains the earlier page and advances to the later page. Candidate eligibility still requires the existing `sameTimeline(a, b)`, finite increasing source times, matching dimensions, valid signatures, and threshold `Math.max((Number(diff) || 1.2) * 2.5, 3)`. Comparison still calls `comparisonMask(a.signatureCrop, b.signatureCrop)` so unknown or mismatched crop geometry remains unmasked. Original images/signatures are unchanged.

The dialog defaults focus to “两页都保留”. Decisions remain only in memory until final confirmation calls the existing `deletePages(ids)` once, preserving its atomic transaction and single undo unit. Cancel, Escape, and dialog closure discard the pending list. Candidate asset reads are limited to the current comparison. Object URLs are revoked on advance, close, and failure; late asynchronous reads after cancellation cannot reopen the dialog or publish images.

### Selection and preview

`selectionAnchor` records only an ordinary page-checkbox action. Shift clicks select or deselect the inclusive range in current `pages` display order. Lesson changes, clearing, and removal of the anchor invalidate it. Checkbox Space behavior is retained.

`#lightbox-select` exposes `aria-pressed` and synchronizes with cards through `updateSelection()`. S toggles selection; V invokes the existing identity-checked seek action. Existing editable-control guards, arrows, Delete/Backspace, Escape, focus return and tab containment remain in place.

### Saved batches and suspect persistence

Each `.batch-view` button resolves `batchLesson(job)` and invokes existing `switchLesson(id)`; it opens the suspect panel and brings the retained page area into view. It does not invoke media loading. A saved lesson with suspects but no pages can be viewed; absent lessons and busy operations disable navigation.

`dismissSuspect(range)` identifies the exact array occurrence by reference/index, creates a copied lesson with that one record omitted, awaits existing writes, and calls existing `persistLesson(copy)`. It publishes `lesson.suspects` only after the database write succeeds. Duplicate-valued, overlapping and adjacent records are preserved. On failure the original live and stored state remains, the interval remains visible, and the button becomes retryable. Dismissal does not require video readiness. The existing `PPTLibrary.put(db, lesson, relatedBatch = null)` interface is unchanged.

## Validation

Environment: Node `v26.13.0`; existing Playwright Chromium executable explicitly supplied; fresh synthetic browser contexts and loopback-only servers. No downloads or dependency installation were needed.

```sh
export PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
node --check capture.js
node --check tests/review.cjs
node --check tests/library.cjs
node --check tests/improvements.cjs
node tests/review.cjs
node tests/library.cjs
node tests/improvements.cjs
git diff --check
```

Final results after substantive edits:

| Check | Result |
| --- | --- |
| Syntax checks | All four passed |
| Review browser suite | **13/13 groups passed** |
| Library browser suite | **12/12 groups passed** |
| Task 1 improvements browser suite | **13/13 groups passed** |
| Diff whitespace validation | Passed |

Total: **38 passing browser groups**. Review and library suites assert zero page errors and zero unexpected external requests; improvements asserts zero external requests. Final commands exited 0 and emitted clean passing output.

Evidence directories (existing harness naming retained):

- [.test-output/v3.1.0/review-j2vR8R](../../../.test-output/v3.1.0/review-j2vR8R): review screenshots and synthetic export evidence.
- [.test-output/v3.1.0/library-I8q4lo](../../../.test-output/v3.1.0/library-I8q4lo): library synthetic fixtures and export evidence.

Coverage includes:

- No deletion before final confirmation; cancellation during choices, at final confirmation, and during a pending asset read.
- Earlier/later/both decisions, A/B/C survivor sequencing, a nontransitive similarity chain, keep-all and no-candidate/empty behavior.
- One undo restoring original order, image data, signatures, naming, and working thumbnails; atomic final-delete failure leaves data unchanged.
- Candidate URL release on advance, cancellation, and read failure after an earlier decision; stale reads cannot resurrect UI.
- Shift select/deselect in reordered display order, keyboard Space, deleted/cleared anchors and lesson switching.
- Visible preview selection, S/V, successful identity-matched seek, unloaded/wrong-source guards, and input/textarea/select/contenteditable shortcut guards.
- Batch navigation to saved pages and suspect-only lessons without setting a video source; unavailable and busy controls.
- Exact suspect removal among duplicate, overlapping and adjacent ranges; state unchanged while the write waits; actual IndexedDB abort keeps the record and retry state; successful retry survives reload and leaves the other lesson unchanged.
- Prior migration, scan/resume, local suspect rescan, course ZIP, selected-versus-all export, masking, cached dedupe, and Task 1 exact rollback regressions.

### Failures encountered and resolved

These runs are not counted as passing validation:

1. Initial review run stopped at `Fixture database reset is blocked` after five groups. Fixture reseeding was moved to a blank same-origin synthetic page after closing the application database, following the library suite's isolation approach. The strict blocked-reset check remains.
2. Two subsequent review runs stopped at `Invalid nontransitive fixture` after eight groups. The synthetic percentages had not accounted for the comparator's bias correction and mean-distance cutoff. Parent authorized narrow comparator inspection; the implementation was found in already-allowed [media.js](../../../media.js), so no additional source was changed. The final fixture uses 0%, 0.5%, and 1% white pixels. At threshold 3, A/B and B/C mean distances are approximately 0.989 and 0.998 (similar), while A/C is approximately 1.977 (not similar). The test explicitly checks that precondition before exercising review behavior.

TDD was not specifically required for this task. Focused behavior assertions were added alongside implementation; the above fixture failures are not presented as product RED/GREEN evidence.

## Self-review and limitations

I read the source and test diffs, checked all six requested behaviors against the brief, verified the write-first boundary and single-deletion transaction, checked mask compatibility and asynchronous cancellation, and verified the staged allowlist before committing. Self-review tightened the anchor rule so Shift clicks never replace the latest ordinary checkbox anchor. No unresolved correctness concern was found.

The controller remains a large existing file; this task adds local functions without restructuring other subsystems. Validation covers the supplied Chromium build and synthetic data, not Chrome 114, real course media, a packaged extension installation, or other browsers. No broad unrelated suites or future-task functionality were implemented or tested. Independent review remains the parent's responsibility.
