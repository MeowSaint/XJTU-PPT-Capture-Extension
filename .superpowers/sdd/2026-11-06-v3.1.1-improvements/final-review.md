# v3.1.1 independent whole-branch final review

Review date: 2026-11-06. Exact review range: `40c02bb..f83fed69e63f93ca597e209f5bc5d9f8e84d77c5` on `fix/v3.1.1`.

**Spec: Issues. Quality: Needs fixes. Findings: Critical 0 / Important 1 / Minor 0.**

The four authorized feature groups are substantially implemented and the supplied evidence is extensive, but the new crop reuse transaction can silently overwrite a successful pending naming edit. This is a concrete persistence integration defect, separate from the closed task and integration findings. The branch should receive the focused repair below before final approval.

## Review boundary and method

I read the binding brief and all 5,942 lines of the supplied 513,846-byte review package once, in bounded consecutive chunks. The package covers the specified 44 commits and 35 changed files. Full new-file hunks supplied the current design, implementation plan, audit, task reports, integration follow-up reports, and documentation correction report; these were read as part of the package rather than reread separately.

I assessed the complete branch against all four authorized brainstorming groups, including the cross-task ownership, persistence, cancellation, selection, and export contracts. Prior approvals were treated as historical evidence, not as an integration verdict. Historical BLOCKED/Needs fixes passages were reconciled with their later closure reports. The two documented integration repairs remain present: guarded Run preserves active crop selection, and each batch row synchronizes eligibility before deriving checked/disabled/count states.

This was read-only source review. I ran no Git commands, regenerated no diff, executed no tests, opened no browser or network connection, read no credentials or user profiles, and delegated no work. The only artifact written is this report. Focused source reads and their concrete reasons are logged below.

## I1 — Crop reuse can overwrite a successful pending lesson rename

**Severity: Important.** Primary location: [capture.js:1316–1321](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L1316-L1321), specifically the direct whole-lesson write at line 1321.

**Reachable trigger:** Load a confirmed 0-track source with an eligible crop reuse target. Edit the source lesson's course name, date, or start time, then confirm crop reuse while that naming transaction is still pending. Pending naming writes are not part of `busy()` at [capture.js:375](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L375), so the crop reuse control remains available. A slow naming commit is already a supported, concretely exercised state in the supplied main-course export regression coverage; this finding does not require modifying application state out of band.

**Mechanism:**

1. [capture.js:299–313](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L299-L313) snapshots the new input values, starts a settings transaction, and updates the live lesson's `course`, `page`, and `namingManual` only after that transaction completes. While the transaction is pending, the input fields contain the new naming but `activeLesson` still contains the old values.
2. Crop reuse takes its eligible jobs and writes `PPTLibrary.put(db, activeLesson, {page: batchPage, jobs})` immediately. Unlike the other new manager/dismissal paths, it does not first await `namingSave` and `lessonSave`. The whole lesson is cloned for this later settings transaction while it still holds the old naming.
3. The earlier naming transaction commits successfully and updates the live lesson. The later crop reuse transaction then commits its old lesson snapshot over that durable record. Both operations report success. The live UI can continue to show the new name while IndexedDB holds the old one.
4. On reload or saved lesson activation, [capture.js:47–51](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L47-L51) applies the durable old lesson naming. The user's successful naming edit is silently lost. `exportNaming` can also disagree with the lesson record until the lesson naming is reapplied.

The crop reuse lesson-plus-batch transaction is atomic internally; that atomicity does not prevent it from overwriting an earlier successful edit with a stale whole-lesson snapshot. This is the missing integration boundary.

**Impact:** Confirming the newly added reuse operation can discard a user's saved naming metadata and make later library labels and export names revert after reload. Screenshot bytes and target crop data need not be lost for this to be a release-blocking persistence regression.

**Smallest required change:** Await pending `namingSave` and `lessonSave` before computing the eligible jobs and building the source lesson/batch snapshot in the apply handler. Recompute eligibility after the waits and preserve the existing single atomic source-lesson/related-batch commit and publication-after-commit behavior. Routing this operation through the existing naming-aware serialized persistence helper is also valid if it preserves those guarantees; a new abstraction is unnecessary.

**Coverage expectation:** Add one focused real-IndexedDB regression to the crop reuse coverage. Hold the naming transaction open after its writes are queued, verify that the inputs contain the new naming while the live lesson still contains the old naming, and confirm crop reuse through the dialog during that pending state. Release the transaction, await completion, and assert that the new naming and `namingManual` survive in the lesson record and after reload, while the intended target crop override is committed and unrelated lessons/batches remain unchanged. Preserve the existing asynchronous batch-write failure rollback assertions. The existing main-course export keepalive technique can exercise this ordering without a production hook.

## Contracts checked beyond the finding

- **Capture precision and comparison:** Fresh lessons select 0.5 seconds while saved 2/8-second settings and checkpoints remain supported. A single crop-relative ignore rectangle is validated and rasterized for comparison only. Raw JPEGs and signatures remain intact, compatible geometry gates masking of retained signatures, and legacy/mismatched geometry takes the conservative unmasked path. Scanner transition checks, confirmation checks, retained-page deduplication, realtime comparison, and similar-page review receive the intended comparison mask. The task cache bounds entries at 1,000, reads assets in batches no larger than 32, retains only raw signature arrays, and is invalidated across the relevant lifecycle boundaries.
- **Review and selection:** Sequential similar-page choices follow the surviving page through chains; nontransitive candidates are reevaluated. No deletion occurs until final confirmation; cancel and stale reads release candidate resources without committing. The final deletion remains one undo batch. Shift ranges use displayed order, stale anchors reset, S/V preview actions use editable/modifier and source identity guards, saved batch view can open screenshots/suspects without loading media, and suspect dismissal removes the exact selected reference only after a successful durable write.
- **Library and crop ownership:** Removal scopes pages, assets, lessons, and related batch records in one transaction, preserves unrelated courses and asset leases, and detaches a removed active lesson before source cleanup can save it again. Estimates distinguish retained JPEG/thumbnail/signature data from video/cache/storage overhead. Crop reuse requires explicit camera confirmation and targets eligible unfinished 0-track jobs. Canonical track identity and actual decoded aspect ratio within 1% gate application; mismatches remain available for manual confirmation. The loaded job's owning batch is distinguished from the batch displayed in the drawer for subsequent crop saves and manual completion, including colliding IDs in different courses. The new reuse handler's pending naming ordering is the exception described in I1.
- **Export behavior:** Ordered selected PDF/JPEG ZIP exports have separate controls and names from all-retained exports. Timestamp and bookmark settings require boolean true and default to false, invalid source times are omitted, default bytes remain covered by unchanged fingerprints, and handout destinations distinguish upper/lower positions and odd final sheets. Metadata/options are captured before asynchronous export work; images are read and streamed one at a time. Main-course ZIP resolves its course key after pending naming saves, while an explicitly displayed batch keeps its explicit course key.
- **Scope and compatibility:** Version declarations and fixtures move to 3.1.1 with no added runtime dependencies. The implementation preserves the existing storage and optional legacy metadata contracts and the 1,000-page/lazy-image limits. Audio/ASR implementation was not introduced. The supplied user/test documentation corrections match the actual suite ownership and saved screenshot usage.

## Evidence assessment and limits

The supplied final task report correctly describes staged evidence, not nine new runs at the final SHA:

- **A:** 207 unit checks; 17 release checks against a temporary 32-member ZIP; bridge checks for three origins and two fallbacks; review 13; features 11; memory 14; initial library 22; improvements 20, before the two small production integration repairs.
- **B:** Improvements 20 after the idempotent Run/crop guard repair at `a3f1ee080b3d0a5b6344fb0961ee89c4133b6ce9`.
- **C:** Full integration and library 22 after the batch row ordering repair at `f628ec3e6abbd7d522452e86f6f817709b5ac561`, sequential exit 0, no page errors or nonlocal requests reported, and all three Poppler PDF renders at 1280 × 720 with mean absolute differences below 4.

The supplied tests preserve actual checked → unchecked DOM interaction, model state, no unintended queue entry, A-only rerun, unrelated JPEG bytes, and retained order. The legacy probe adaptations match the changed product state: confirmed cleared 0-track jobs remain cropped/pending and are then deliberately deselected. The assertions are not replacements for the behavior they claim to test.

These are evidence limits rather than additional defects:

- The reported execution environment is Node 26.13.0 and Chrome 156 with synthetic fixtures. Node 20, Chrome 114, live course behavior, and native permissions were not directly executed in the supplied final evidence. Interaction during a native permission prompt is not sufficiently established to elevate the separately inspected permission-await question into a finding.
- The reported 51,544-byte memory figure is sampled JavaScript heap delta during a 256 MiB synthetic stream, not RSS or whole-process memory. The signature-cache evidence separately establishes 82,944,000 bytes for 1,000 raw signatures and release behavior.
- The improvements suite's page-error assertion covers its second export context; its first context does not provide that assertion. Nonlocal requests are explicitly checked as described. The memory suite blocks external requests but does not supply a zero-request-stat assertion. These boundaries are declared accurately.
- PDF destinations and structure are exercised programmatically and rendered with Poppler, but manual outline-reader interaction was not proved. Parent-supplied desktop screenshots cover the stated modern-browser viewport checks, not a complete accessibility or minimum-browser audit.
- The actual delivery ZIP has not yet been generated or verified. The future 32-member/source-byte/CRC/version/SHA-256 gate belongs to the parent. Temporary release-test ZIP success does not establish that future artifact's contents or checksum.
- I independently assessed source and supplied evidence; I did not rerun any suite under this read-only review protocol. I1 is established by the transaction/snapshot ordering in source and has not been runtime-reproduced by this reviewer.

## Focused extra-read log

All repository source reads beyond the package were limited to the two concrete producer/consumer gaps identified after the full package read. No repository crawl or unrelated-file read was performed.

| Focused source range | Concrete purpose |
| --- | --- |
| [capture.js:285–394](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L285-L394) | Resolve when naming is published to the lesson, how naming/lesson queues interact, and whether pending naming enters the busy guard. This established the producer side of I1. |
| [capture.js:1232–1319](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L1232-L1319) and [capture.js:1320–1346](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L1320-L1346) | Trace the new reuse consumer, atomic apply boundary, owning-batch helper, and exact final line references. Adjacent manual completion/apply code provided the relevant persistence context. |
| [capture.js:34–108](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L34-L108) | Check whether the existing serializer refreshes naming from inputs, whether reuse bypasses it, and how stored naming becomes visible after activation/reload. |
| [capture.js:1412–1495](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L1412-L1495) | Trace pending manual permission, discovery/owner association, and the point at which loading establishes its guards. |
| [capture.js:1067–1127](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L1067-L1127) | Check the permission consumer, task guard, naming wait, release/load sequence, and final crop validation. |
| [capture.js:639–681](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L639-L681) and [capture.js:198–261](/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1/capture.js#L198-L261) | Check whether the new manager is disabled during the permission phase and how deletion detaches source ownership. Native prompt interactivity remains unverified; no speculative second finding is asserted. These reads also confirm the contrasting wait-before-manager-write boundary. |

## Disposition

One combined focused fix wave and one fresh scoped review can address I1 under the supplied protocol. The focused review should inspect the new ordering and its pending-naming/crop-reuse regression evidence, preserve the atomic failure behavior, and keep the future delivery ZIP gate separate. No existing closed finding is reopened, and no minor item is parked by this report.

I skipped runtime reruns, browser/native-permission checks, and actual delivery artifact verification as required by the review scope. The material remaining risk is I1: crop reuse can silently revert saved naming until the persistence ordering is repaired.
