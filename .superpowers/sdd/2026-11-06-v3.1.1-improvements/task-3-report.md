# Task 3 implementation report

Status: DONE. Local branch `fix/v3.1.1`; base `a09b3c7ca7896e01eb3a3da676294aaa234b0fdb`.

## Commits and scope

- `02cfe798f1881e7e2d89b953a5394eb7cfa837bc` — management dialog, atomic library removal, confirmed crop reuse and primary tests.
- `7764b1f697d752e2aa60fd1e21d977596b1fd564` — explicit deletion followed by rediscovery regression assertion.
- This report is committed separately after implementation/tests. No push, delegation, dependency installation, external browser research or real user data access/cleanup.
- Modified production files: `library.js`, `page-store.js`, `batch.js`, `capture.js`, `capture.html`, `style.css`. Modified tests: `tests/library.test.cjs`, `tests/library.cjs`. No version, export implementation or other documentation changes. Existing improvement/review suites were run unchanged.

## Delivered behavior and interfaces

### Library management

The native management dialog groups saved lessons by course, includes course-page context, lesson date/time, page count and estimated JPEG + thumbnail + signature bytes. It explicitly excludes video caches and browser storage overhead. Deletion requires a separate product confirmation naming the lesson/course and exact lesson/page counts, with an irreversible warning. Cancellation leaves disk and live state untouched.

`PPTPageStore.estimate(db, pages) -> Promise<{bytes, missing}>` uses optional nonnegative `page.assetBytes`; legacy records are read sequentially, one asset at a time. `PPTPageStore.add` writes byte metadata in the same transaction as the page/asset and publishes it only after commit. Lazy thumbnails update existing byte metadata atomically; legacy page records remain byte-for-byte unchanged, preserving exact undo metadata semantics.

`PPTLibrary.remove(db, {lessonIds, course = null, undoIds = []}) -> Promise<{lessons, pages, batches, activeId, naming}>` removes selected lesson pages/assets/settings and matching batch references in one `pages`/`assets`/`settings` transaction. Whole-course deletion also removes course batch snapshots, including queued references without pages. Reference matching includes course identity, so the same job id in another course survives. Only explicitly supplied removed-lesson undo assets are discarded; unrelated orphan assets and active undo leases are preserved. No global asset prune runs.

The UI publishes deletion only after commit. Active deletion detaches the removed lesson before releasing media, preventing release-time persistence from recreating it; it releases source, selection, undo, preview, thumbnails and dedupe state, then activates a remaining lesson or an empty state. Inactive deletion preserves the active source/selection/undo. DB failure retains the old state. Cleanup/UI failures after commit explicitly say deletion already succeeded. Estimate revisions prevent late reads from overwriting a newer dialog result. Reload and rediscovery do not restore deleted metadata/assets; a rediscovered recording can appear as a fresh pending job.

### Confirmed crop reuse

`PPTBatch.trackKey(source)` delegates signed-link identity to existing `PPTLibrary.key` canonicalization. It does not treat arbitrary same filenames or arbitrary URL query changes as equivalent. New helpers `zeroTrack`, `validCrop`, `cropMatches`, and `automatic` centralize the matching and automatic-selection rules.

Zero-track jobs retain `cropOverride = {crop: {x,y,w,h}, aspect, track, manual}`, plus `cropConfirmed`, `cropRejected`, and `manualPrepared`. Manual crop persistence uses the existing backward-compatible `PPTLibrary.put(db, lesson, relatedBatch = null)` transaction; failure restores the exact original field set, including absent fields.

The reuse dialog requires an explicit same-camera/framing checkbox and shows its target list. It selects only unfinished zero-track jobs in the source course, excluding the source, completed jobs, manually prepared jobs and manual overrides. Applying writes the source lesson and entire related batch snapshot atomically, then publishes editable clones. Postcommit rendering failure reports saved settings rather than claiming rollback.

Every target load rechecks finite normalized bounds, canonical selected zero-track identity and actual decoded video aspect within 1%. A mismatch preserves the override for adjustment, sets `needs-crop`, clears confirmation/selection, and cannot enter the scanner. Confirmed manual adjustment replaces that job's override. Stop, extraction failure, reload and rediscovery preserve overrides and flags; signed URL refresh preserves canonical identity. Same-aspect differing resolutions use the same normalized crop.

## Validation

All browser invocations explicitly used this existing executable, with isolated contexts and loopback-only fixtures:

```text
/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
```

Successful full focused run (executed sequentially with `&&`; exit 0):

```sh
node --check capture.js
node --check page-store.js
node --check library.js
node --check batch.js
node --test tests/library.test.cjs
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/improvements.cjs
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/review.cjs
```

Results: Node **8/8**, library browser **20/20**, improvements **13/13**, review **13/13**. Total **54 distinct tests/groups**; browser groups include multiple behavioral assertions. Evidence: `.test-output/v3.1.0/library-YEqKuH/results.json` and `.test-output/v3.1.0/review-tE9VDc/results.json`. Improvements reports its 13 groups to stdout and does not write an evidence directory. The existing harness output-directory naming was retained; no version files were changed.

After the final production change (honest postcommit crop-save error reporting), reran the affected crop groups, exit 0:

```sh
node --check capture.js && git diff --check && PPT_TEST_FILTER='same-camera|rediscovery retains|actual target' PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs
```

**3/3**, evidence `.test-output/v3.1.0/library-uMj9q8/results.json`. Then strengthened the synthetic fixture to use an actual 640×360 source and 320×180 target. The same filtered browser command, without the syntax/diff prefix, passed **3/3**, evidence `.test-output/v3.1.0/library-7ADk3H/results.json`.

After adding the explicit deletion→rediscovery assertion, ran the final library suite:

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs
```

**20/20**, exit 0; final library evidence `.test-output/v3.1.0/library-2d4Qlp/results.json`. No browser script errors or nonlocal requests. `git diff --check` also passed before each implementation/test commit. Reruns are not added to the 54 distinct total.

New tests cover byte metadata/sequential legacy reads; cancel and asynchronous transaction abort; active/inactive/empty/single/course deletion; retained asset/undo references; cross-course matching; postcommit cleanup errors; reload/rediscovery; explicit same-camera confirmation; atomic crop-save failure; postcommit rendering failure; completed/manual/other-course exclusion; real equal-aspect differing resolutions; canonical signed-link refresh; stop/fail persistence; actual-load aspect/track/bounds rejection without scanner calls; per-job manual adjustment. Node assertions exercise the 1% boundary and invalid numeric crop values.

## Debugging and self-review

- An initial unchanged review test caught lazy thumbnail generation adding `assetBytes` to legacy page metadata, breaking exact undo equality. Fixed by updating byte metadata only on pages already carrying it; legacy estimates remain sequential. Final unchanged review suite passed 13/13. Initial evidence: `.test-output/v3.1.0/review-cbhoFx`.
- An initial library run stopped after its existing 12 groups because a new assertion expected the literal `JPEG` while the product said `截图`; corrected the assertion to the actual byte-estimate explanation. Evidence: `.test-output/v3.1.0/library-pL0uAx`.
- A crop probe initially called `runBatch()` without its required permission promise, so it never scanned. Fixed the synthetic call to `runBatch(Promise.resolve(true))` and used the product Stop control to exercise stopped state. Evidence: `.test-output/v3.1.0/library-rWFmIh`; subsequent focused crop runs passed.
- Self-review checked commit-before-publish boundaries, detached-active cleanup, exact rollback fields, canonical identity, late estimate cancellation and preserved undo assets. Added postcommit failure messages/tests and explicit real-resolution and rediscovery assertions before handoff. No known unresolved Task3 defect.

## Limits and intentionally skipped work

Validation is local synthetic Chromium/Node coverage, not a live authenticated university recording check. Crop tests decode real local MP4s; scanner methods are stubbed only to observe the crop at entry and inject deterministic stop/failure outcomes. Existing scanner/library regressions exercise real scan behavior separately. No benchmark, full repository suite, real user data deletion, external site interaction, version update or export redesign was performed. Cross-window coordinated UI updates are not added; existing asset lease behavior is preserved. Parent fresh spec/quality review remains the next gate.
