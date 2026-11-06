# Task 1 implementation report

Status: DONE. Ready for the parent's independent review.

Base: `b75e26df29ba430b7ab381a67810b6b773cd4c9a`.
Implementation and tests: `daf30d30a61eb06e3543ae20793f171d80e6405a` (`feat: improve precise scanning and masked slide comparison`). This report is committed separately; its commit is supplied in the handoff so this document does not contain a self-referential hash.

## Scope and changes

Only Task 1 was implemented. Changed production files: `capture.js`, `capture.html`, `media.js`, `scanner.js`. Changed tests: `tests/core.test.cjs`, `tests/scanner.test.cjs`, `tests/library.cjs`, `tests/memory.cjs`; added `tests/improvements.cjs`. No schema, page-store, style, version, audit, plan, spec, credential, global configuration or parent-worktree changes were made by this task. Parent changes to the two plan/audit files remain unstaged and untouched.

- Fresh lessons and scanner callers omitting a step use 0.5 seconds. Valid saved 2/8-second modes and checkpoint settings remain valid. Existing coarse continuity fixtures explicitly select 2 seconds. The choice/help text explains that coarse scans can miss short slides and that sampling cannot guarantee arbitrarily short events.
- One normalized `ignoreRect` is stored per lesson, relative to its capture crop. The UI provides draw/clear buttons, a dashed overlay, pointer clipping, keyboard move/resize, Enter confirmation and Escape cancellation. Full raster coverage is rejected. Crop geometry changes clear the rectangle with feedback. Persistence failures restore the prior comparison state. Ignore changes invalidate resume compatibility and reset transient comparison state.
- Original signatures, captures and exported JPEGs are unchanged. `signatureCrop` is copied when a frame is captured, then stored as lightweight page metadata. The existing metadata projection already supports this field, so no database migration or page-store edit is needed.
- Transition, confirmation, realtime candidate/last-frame comparison, global dedupe and adjacent similar-page cleanup use the same ignore rule. Retained pages missing `signatureCrop`, or with differing crop geometry, compare conservatively without a mask.
- A task-local raw-signature cache is keyed by retained page ID. It loads awaited batches of at most 32, tracks invalid/missing signatures as checked, stores no image blobs, accepts only exact-length byte typed arrays, and copies oversized backing buffers. Its 1000-entry ceiling bounds retained raw signature buffers to exactly 82,944,000 bytes. Pages beyond the ceiling are still compared through bounded reads. New signatures enter only after successful page commit. End, stop, error, source change and lesson change invalidate and release it. Read errors propagate; cancellation checks after asynchronous reads/encoding prevent subsequent page commits.

## Interfaces and compatibility decisions

- `PPTCore.ignoreMask(rect, width = 192, height = 108)` builds a pixel mask using floor/ceil bounds; absent rectangles return no mask, invalid or fully covering rectangles are rejected.
- `PPTCore.frameDistance(a, b, mask = null)` and `PPTCore.similar(a, b, threshold = 1.2, mask = null)` retain their original arguments and add an optional final mask. Channel bias, changed fraction and mean difference count only unmasked pixels. Existing unmasked callers remain supported.
- `PPTScanner.scan` defaults `step` to `0.5` and accepts optional `compare = PPTCore.similar`; every internal comparison, including stable confirmation and fallback dedupe, uses it.
- Capture helpers maintain one dedupe context with a crop/mask snapshot and cancellation state. `frame()` snapshots crop before later encoding; `save()` checks cancellation and source lesson around asynchronous work. Global retained-page matching uses metadata geometry before applying a task mask.
- Self-review found that an ignore-region edit could accidentally satisfy a manual batch job's crop-confirmation requirement. The final implementation uses an explicit `confirmCrop` flag only for crop/full-area actions, and the focused browser suite asserts this distinction.

## Verification

All successful commands exited 0. No dependencies were installed. Browser tests used isolated Playwright contexts, synthetic local fixtures and loopback servers; external requests were blocked. No user browser profile, login data or external sites were accessed.

```sh
node --check capture.js
node --check media.js
node --check scanner.js
node --test tests/core.test.cjs tests/scanner.test.cjs
node --test tests/*.test.cjs
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/memory.cjs
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/improvements.cjs
git diff --check
```

| Check | Final result |
| --- | --- |
| Core/scanner Node tests | 42 passed, 0 failed |
| Entire Node test suite | 197 passed, 0 failed, 0 skipped |
| Existing library browser suite | 10 groups passed |
| Existing memory browser suite | 14 groups passed, 0 browser errors |
| Focused improvement browser suite | 10 groups passed, no external requests |
| Syntax and whitespace | Passed |

The final focused browser run followed the crop-confirmation self-review fix. The full Node run, library and memory runs preceded this small UI-only flag fix; the focused rerun exercises it directly. No further broad reruns were necessary.

The focused suite covers: fresh/saved/checkpoint defaults; keyboard and pointer ignore selection; persistence rollback and full-mask rejection; crop reset; frame geometry snapshot and raw JPEG/signature equality; actual PDF export retaining the original JPEG and ignored content; cache valid/invalid/missing entries and oversized backing buffers; legacy/mismatched geometry; realtime and adjacent cleanup; overflow beyond 1000 entries; read failures; cancellation during reads/encoding; failed commits; lifecycle release; reload persistence and incompatible resume settings.

The Node additions cover default A→B→A retention, masked animation plus a real unmasked slide change, confirmation comparator use, mask bounds, invalid/full masks, denominator and channel-bias correctness, and input immutability. Existing scanner asynchronous checkpoint/save/failure tests remain passing.

Memory integration reads 1000 signatures once across repeated dedupe lookups, verifies batches ≤32, exactly 82,944,000 retained signature bytes, no cached blobs, and release to an empty cache. Existing 1000-page JPEG-preserving export and OPFS coverage still pass. Synthetic evidence: `.test-output/v3.1.0/library-S0dXf7/` and `.test-output/memory-1793953584457/report.json`. The memory report records metadata heap 3,804,124 bytes and sampled video heap delta 51,536 bytes; these are one-run measurements, not general performance guarantees.

## Limitations and resolved setup failures

The installed Playwright package initially expected absent Chromium 1234 and could not launch its default executable. Tests were rerun successfully using the existing Chromium 1248 executable shown verbatim above; no browser download was attempted. Early focused-fixture failures were corrected (`'0.5'` HTML select value and `applyLesson()` reading global active lesson), then all final groups passed.

Precise 0.5-second sampling still cannot guarantee capture of slides shorter than the sample/confirmation window. Legacy pages lack recoverable crop geometry and intentionally receive conservative unmasked comparisons, which can retain extra pages. Pages beyond the cache cap can require repeated bounded reads; none are silently omitted. Cache release clears retained references; garbage-collection timing is browser controlled. Cancellation prevents subsequent writes but does not undo a transaction already committed. Verification is synthetic and local; real authenticated course playback is outside this task's authorization. No known unresolved implementation concern remained after the initial self-review; independent review subsequently identified I1/I2, addressed below.

## Fix round 1 — I1 and I2

Status: addressed, ready for fresh scoped review. Fix base: `98b128ea56b5d0b63552cad2c9b6e2bb9eebbde2`. Fix implementation/tests commit: `661f9990a2d0c4d373d6438dfd738129ece2abd8` (`fix: persist crop confirmation atomically and restore exact state`). The appended report is committed separately and its hash is supplied in the handoff.

The parent extended the write allowlist to `library.js` and `tests/library.test.cjs` for this round. The fix changes only `capture.js`, `library.js`, `tests/library.test.cjs`, `tests/improvements.cjs` and this report. Initial-scope statements above describe the original implementation, before this extension.

- **I1:** `PPTLibrary.put(db, lesson, relatedBatch = null)` preserves existing callers and optionally writes both snapshots in one existing settings-store transaction. Required manual crop confirmation passes the related batch through the serialized lesson-save operation. Ignore-only changes save just the lesson. There are no compensating writes. Both ordinary batch saves and related saves publish `savedBatches` only after successful persistence. Restored editable jobs are cloned from retained snapshots, preventing mutations through shared references before a save succeeds.
- **I2:** comparison-setting rollback deletes newly introduced lesson properties absent from the prior snapshot before restoring prior values. Optional `cropConfirmed` presence is restored as well. The retained lesson object keeps its identity and its exact prior property set.

Added unit coverage checks existing two-argument `put` behavior, optional batch snapshot isolation, one transaction, resolution only on transaction completion, and transaction abort/rejection if the second write throws. Added three browser groups exercise real IndexedDB and reloads: legacy absent-field rollback including the complete lesson; asynchronous second-request failure after a successful lesson request, atomic rollback of both records and confirmation state, followed by successful atomic persistence; and failed standalone batch persistence preserving the last retained snapshot. The second-request failure is injected with a duplicate-key `add` and verifies exactly one lesson request success and one batch request failure. Both live state and reloaded state equal the complete pre-change snapshots.

Exact fix-round commands:

```sh
node --check capture.js
node --check library.js
node --test tests/library.test.cjs
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/improvements.cjs
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs
git diff --check
```

Final output/counts: Node library `tests 7`, `pass 7`, `fail 0`; browser improvements `13 focused improvement groups passed; no external requests.`; browser library `10 focused library groups passed.`; all exited 0. Syntax and whitespace checks passed. Library evidence: `.test-output/v3.1.0/library-rHM9pE/`. The existing library suite was run because its shared persistence API and restored batch objects changed. The full Node and memory suites were not repeated; their original results above are historical, not claims of fresh fix-round execution.

An initial new browser fixture lacked the existing batch renderer's required `course`/`options` fields and timed out on reload; the fixture was corrected. The next run exposed the real restored-job/snapshot alias covered by I1; clone-at-restore fixed it. The final run passed all 13 groups. All testing remained isolated, synthetic and local with the existing Chromium 1248; no dependency installation, external site access, or user browser data was used. Self-review found no remaining I1/I2 issue; fresh scoped independent review is pending.
