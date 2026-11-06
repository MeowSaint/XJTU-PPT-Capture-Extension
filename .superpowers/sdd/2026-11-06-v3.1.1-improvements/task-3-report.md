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

## Review fix round 1 — I1 and I2

Status: **DONE**, pending parent rereview. This section supersedes the initial self-review's “no known unresolved defect” statement: the independent review found two important caller/lifecycle defects, both addressed here. Rereview base: `343688d5e4574f7432e26f52ff7addbb2a6be9e1`; the fix began at `ad005e9ed2d9b498713c15a8007c333fefe251b8` after the parent committed review material. Implementation/test commit: `13cf51d009bf36f762e44cb5225ece8223cf27f5`.

### I1 — owning batch versus displayed batch

Before the fix, reopening lesson B while batch A remained displayed either used a fallback job or persisted B's crop with A's batch snapshot. B's saved override could therefore replace the new crop on reload. Added `jobBatch(job = activeBatchJob)` to resolve the loaded job's owning page and snapshot; `persistBatch(job = null)` retains the existing displayed-batch default while allowing manual scan completion to save the owning job. Crop confirmation, actual-load crop validation and lesson-setting saves now use that ownership. Resume loads clone the owning saved batch when it differs from the displayed batch. Discovery and library deletion preserve an unrelated loaded job's association instead of clearing or replacing it by a colliding displayed job ID. Batch display scope remains independent of active lesson scope; export logic was not changed.

The regression covers different courses sharing a job ID and different batch pages of one course with distinct job IDs. It refreshes A while B is loaded, injects an asynchronous IndexedDB failure only on B's batch write, checks exact disk/live crop and retained-snapshot rollback, retries, manually scans B, checks B's completion/override and unchanged A, then reloads B and checks its crop again. Shared setting-save and scan-completion callers are included.

### I2 — failed final preparation save

Before the fix, a successful zero-track load followed by failure of the final manual-job save cleared `activeBatchJob`, leaving `sourceReady` true and bypassing the scan crop guard. Final preparation now writes a proposed snapshot before publishing `manualPrepared`/manual state. A final-save failure preserves the loaded job association and crop restriction, restores its retained state label, and reports the failed save. The final save is busy-gated. Failed actual loads still detach unusable jobs.

The regression rejects only the final manual-state batch write, after the source is ready. It covers both unconfirmed crop and an aspect-rejected override, verifies no scanner entry and no newly published `manualPrepared` flag, then explicitly confirms a crop, retries successfully and checks the override after reload.

### Red/green evidence and commands

Every browser invocation used the following executable assignment; no download or default executable fallback was used:

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
```

The exact focused commands were:

```sh
PPT_TEST_FILTER='reopened crop adjustments' PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs
PPT_TEST_FILTER='final manual preparation save failure' PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs
PPT_TEST_FILTER='reopened crop adjustments|final manual preparation save failure' PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs
```

- **I1 red, exit 1:** `.test-output/v3.1.0/library-CAB6hu/results.json`, with `failure.png`. The B-only batch fault was never reached; status was `adjusted` instead of matching `/范围保存失败/`. This ran before wiring the owning-batch helper into crop callers; the additive helper existed but was unused on that path.
- **I2 red, exit 1:** `.test-output/v3.1.0/library-P1OC6g/results.json`, with `failure.png`. `Start cannot enter scanner after only the final save fails`: observed **1** scanner call instead of **0**. This ran before changing preparation failure handling.
- **Green, exit 0:** `.test-output/v3.1.0/library-329EXe/results.json`, **2/2** new groups.
- **Final strengthened green, exit 0:** `.test-output/v3.1.0/library-LZTPIc/results.json`, **2/2**, after adding the shared manual-scan completion assertion. No production edits followed the full affected-suite run below.
- Fixture corrections: the initial fixture omitted `options: []` (`job.options is not iterable`, `.test-output/v3.1.0/library-Gux9bX/results.json`); a later same-course fixture reused one job ID for two different lessons despite the library's course+job identity (`.test-output/v3.1.0/library-y0yExp/results.json`). Corrected the fixtures to use distinct job IDs within one course, while retaining the intentional same-ID cross-course case. Neither failure was counted as a product regression or a passing test.

Final affected-suite command:

```sh
node --check capture.js && git diff --check && PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs && PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/improvements.cjs
```

Exit **0**: library **22/22**, improvements **13/13**, **35 distinct browser groups** in this round. Full library evidence: `.test-output/v3.1.0/library-5fXwm7/results.json`. Improvements prints its assertions to stdout rather than an evidence file; completed harness job `bash-5bb29e2891c0477f` contains all 13 PASS lines, including exact-field rollback, atomic lesson+batch failure and retained snapshot publication. Both suites reported no external requests or browser script errors. Final `git diff --check` passed. Node and review suites were not rerun in this scoped fix round; their earlier 8/8 and 13/13 results remain historical, not newly claimed validation.

### Fix-round self-review and limitations

Reviewed every new ownership-helper caller, clone-before-edit boundaries, commit-before-publication, unchanged displayed scope, failure guards and the native transaction fault. Only `capture.js` and `tests/library.cjs` changed in the implementation commit; this report is a separate commit. No dependency, version, export, external-site or parent-worktree changes. Tests use isolated local synthetic videos and deterministic scanner probes; the final-preparation fault is injected at the batch persistence interface, while owning-batch atomicity uses a real asynchronous IndexedDB transaction abort. No known remaining I1/I2 defect; parent fresh rereview is required before proceeding.
