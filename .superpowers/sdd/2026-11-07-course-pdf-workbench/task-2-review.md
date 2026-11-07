# Task 2 — independent Spec + Quality review

## Spec Compliance

❌ Issues found: the expanded batch layout can conceal the running task’s Stop control. This misses the explicit requirement that Stop remain visible during extraction. The other reviewed Task 2 contracts are satisfied within the evidence boundaries below.

**Quality: Needs fixes. Findings: Critical 0 / Important 1 / Minor 0.**

Reviewed frozen range: `3f666a69cf01071d03a08c2773f3507ca93cb33e..e3952346d71f1bd78cf105b2987d01a241f430bf`; source commit `1c67cbb886346982397e6e90c26c2016726d402c`, followed by the report commit. The [frozen package](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-review-package.txt>) lists these two commits and 14 changed files: 13 implementation/test/documentation files plus the implementer report. Dispatch identifies the package as 141,490 bytes; I did not independently run a byte-count command.

## Strengths and checked contracts

- Result-adjacent exports have explicit all-page, selected-page, and named current-course scopes. The existing current-course PDF/ZIP controls are direct children of a visible group rather than another disclosure, and the batch course has its own label and controls: [capture.html:162–176](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.html#L162-L176>), [capture.html:233–264](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.html#L233-L264>), [capture.js:268–276](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L268-L276>). The course identity assertion is backed by a fixture with distinct Synthetic A/B courses and real export assertions in [tests/improvements.cjs:390–410](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/tests/improvements.cjs#L390-L410>).
- The settings shortcut switches panels and focuses the editable name synchronously; tabs update ARIA, tab order, hidden state, and requested focus before feedback. Navigation does not start extraction or export: [capture.js:279–308](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L279-L308>).
- The small presentation helper captures computed transform/opacity before cancellation, has synchronous void methods, cancels on preference changes/page hide, and observes native open/close without delaying it: [motion.js:4–37](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/motion.js#L4-L37>). It introduces no business await, animation busy state, image clone, dependency, or crop interpolation. The crop success feedback follows persistence rather than gating it.
- New-card feedback follows successful page writing. Geometry filters visible cards and stops after 12; ordinary renders reuse nodes and restore scroll position, and deletion cancels feedback before releasing thumbnails: [capture.js:819–851](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L819-L851>), [capture.js:994–996](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L994-L996>). Preview feedback retains the existing revision/URL path and cancels on close: [capture.js:605–615](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L605-L615>), [capture.js:645–651](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L645-L651>).
- Source and course names use text content rather than HTML insertion. The new source hint is presentation-only and adds no authorization or network call: [workspace.js:20–25](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/workspace.js#L20-L25>), [capture.js:268–274](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L268-L274>).
- Reviewed motion assertions inspect real panel visibility, editable focus/input, intermediate marker position, running animations, live reduce cancellation, Escape cleanup, and returned focus. Card tests exercise more than 12 visible real stored cards and verify node/scroll preservation. The 1,000-page test explicitly runs with normal motion and asserts zero restore animations while retaining concurrency/URL bounds: [tests/review.cjs:191–241](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/tests/review.cjs#L191-L241>), [tests/memory.cjs:234–272](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/tests/memory.cjs#L234-L272>). These are meaningful behavioral checks, with the expanded-running-layout gap described below.
- Packaging adds the helper to the resource whitelist and disposable extension copy, loads it once before both consumers, and checks the current 34-member archive against source bytes: [scripts/release.cjs:6–15](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/scripts/release.cjs#L6-L15>), [capture.html:359–361](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.html#L359-L361>), [tests/features.cjs:89](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/tests/features.cjs#L89>), [tests/release.test.cjs:164–178](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/tests/release.test.cjs#L164-L178>). Current coverage documentation changes in [tests/README.md:47–57](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/tests/README.md#L47-L57>) retain the historical distinction.
- The package preserves the 3.1.1 version span and does not change the project README/version metadata, release workflow, PDF writer, page store, schema, dependencies, or authorization handlers. Existing IDs are moved rather than duplicated in the reviewed changes. The two local ordinal removals match the stated consistency correction. The saved zero-track test also checks visible manual preparation without loading media or enabling automatic batch start: [tests/library.cjs:268–281](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/tests/library.cjs#L268-L281>).

## Issues

### Critical — 0

None found.

### Important — 1

**I1 — Expanded batch work hides the task’s Stop control below the capture scrollport.**

- **Reachable trigger:** at 1440×900, expand a batch with an automatic row and a pending-crop row, then start its automatic batch. The final actual [expanded-batch screenshot](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.test-output/v3.1.2/review-mDvnrT/batch-wide-1440x900.png>) already shows the extraction buttons clipped at the lower edge of the capture pane; the Stop label is outside the visible scrollport. The batch start action is readily visible above it.
- **Cause and source evidence:** [style.css:108–118](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/style.css#L108-L118>) puts the expanded batch in an auto-sized first grid row, allows it up to 42dvh, and makes the remaining capture pane scroll. [capture.html:192–200](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.html#L192-L200>) leaves the shared Stop button in normal flow after the video and crop controls. [capture.js:1563–1608](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L1563-L1608>) starts and runs the batch without closing that disclosure or bringing capture actions into view. [capture.js:694](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L694>) correctly enables this same Stop control while the batch runs; [capture.js:710–712](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L710-L712>) disables the visible batch start controls instead of providing a visible stop action there.
- **Why it matters:** stopping a running extraction requires finding and scrolling the separate capture pane, or changing the batch disclosure first. This fails the explicit running-stop visibility requirement in [the design:38](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/docs/superpowers/specs/2026-11-07-course-pdf-workbench-design.md#L38>). Cancellation logic itself is not shown to be broken; the defect is that its control is concealed in the normal batch workflow.
- **Correction and check:** keep the existing shared Stop control in a portion of the layout that remains visible while batch details are open, retaining its immediate handler and unique ID. Add an expanded, running-batch assertion at the required desktop sizes that checks the enabled Stop against its actual scrollport as well as the viewport. The current desktop geometry check measures actions with the batch closed; the later expanded screenshot has no corresponding action-visibility assertion: [tests/review.cjs:546–585](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/tests/review.cjs#L546-L585>).
- **Evidence boundary:** the saved image is an idle synthetic state. Reachability while running follows from the focused handler/control reads; I did not claim to have executed or recorded a running batch.

### Minor — 0

None found. No severity was assigned to an environment limit or an unverified compatibility target.

## Actual-image review

All images below were opened with `read_image` at their reported final-source paths. No browser, recreated markup, image processing, or earlier artifact directory was used.

| Image | Size | Independent observation |
| --- | --- | --- |
| [desktop-1440x900.png](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.test-output/v3.1.2/review-mDvnrT/desktop-1440x900.png>) | 1440×900 | Clear preview/results split, primary extract/PDF emphasis, named course PDF/ZIP directly visible, secondary actions readable, and no visible horizontal clipping or repeated header. Stop is visible in this collapsed-batch state. |
| [results-390x844.png](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.test-output/v3.1.2/review-mDvnrT/results-390x844.png>) | 390×844 | All/current-course/selected exports and settings wrap readably; two-column thumbnail layout and selection/time controls fit the visible width. No visible horizontal clipping or repeated bands. This is the scrolled results viewport, not evidence of the top-of-page narrow layout. |
| [dark-1440x900.png](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.test-output/v3.1.2/review-mDvnrT/dark-1440x900.png>) | 1440×900 | Text, accent, control boundaries, and source-name wrapping remain readable. Screenshot colors are preserved. No second header or repeated lower raster band is visible. |
| [batch-wide-1440x900.png](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.test-output/v3.1.2/review-mDvnrT/batch-wide-1440x900.png>) | 1440×900 | **Named extra read:** the required three images leave the batch closed, so they cannot answer whether opening its manual/automatic rows leaves extraction controls visible. Before opening this image I stated that specific question. It shows clear independent course labels and manual crop controls, but also exposes I1. |

I did not open the other named sizes, narrow-top, contrast, reduce, or earlier screenshots. The required final images do not establish a compositor implementation guarantee or prove animation timing. No internal Chromium cause was inferred from their clean appearance.

## Exact read and image ledger

The workspace root for all project links is `/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2`.

### Required text and skill inputs

| Input | Tool and exact consumed extent |
| --- | --- |
| [Review brief](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-review-brief.md>) | `read(offset=1, limit=2000)` → all 47 lines. |
| [Task-reviewer template](</Users/jasondai/.dsh/skills/subagent-driven-development/task-reviewer-prompt.md>) | `read(offset=1, limit=2000)` → all 209 lines; tool resolved the alias to [this template path](</Users/jasondai/.config/magpie/library/skills/subagent-driven-development/task-reviewer-prompt.md>). |
| [Task brief](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-brief.md>) | `read(offset=1, limit=2000)` → all 15 lines. |
| [Implementer report](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-report.md>) | `read(offset=1, limit=2000)` → all 180 lines; its committed copy was necessarily also consumed within the whole package. |
| [Design](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/docs/superpowers/specs/2026-11-07-course-pdf-workbench-design.md>) | `read(offset=1, limit=2000)` → all 61 lines; applied global/UI/motion requirements and compatibility boundaries. |
| [Apple Design skill](</Users/jasondai/.dsh/skills/apple-design/SKILL.md>) | `read(offset=1, limit=2000)` → all 291 lines; tool resolved the alias to [this skill path](</Users/jasondai/.config/magpie/library/skills/apple-design/SKILL.md>). Applied response, interruptibility, restraint, wayfinding, and accessibility guidance within the binding native implementation scope. |
| Ponytail skill | `skill("ponytail")` → complete tool-provided instructions, full level. No additional referenced files opened. |

### Frozen package — one complete sequential pass

For the [package](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-review-package.txt>), the six `read` calls were exactly:

| Offset | Limit | Returned lines |
| --- | --- | --- |
| 1 | 400 | 1–400 |
| 401 | 300 | 401–700 |
| 701 | 300 | 701–1000 |
| 1001 | 280 | 1001–1280 |
| 1281 | 230 | 1281–1510 |
| 1511 | 257 | 1511–1767, EOF |

This covers the whole commit list, stat, report, and all hunks once without gaps or overlapping package reads.

### Named extra source inspection

**Question stated before the focused source reads:** does starting a batch close the expanded disclosure, scroll its extraction actions into view, or provide another visible Stop state, thereby resolving the clipping seen in the extra image?

- Two `grep` tool calls indexed only [capture.js](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js>): first pattern `batch-start|batch-panel|function (startBatch|runBatch|renderBatchJobs)|scrollIntoView|scrollTop|scrollTo` returned 9 matching lines; second pattern targeted `function controls` and the run/stop element references and returned 6 matching lines. These were file-content tool searches, not shell commands.
- `read(offset=1563, limit=54)` → [capture.js:1563–1616](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L1563-L1616>): complete batch runner and start handler, with the adjacent realtime function start returned by the bounded slice.
- `read(offset=669, limit=56)` → [capture.js:669–724](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/capture.js#L669-L724>): relevant control enable/disable logic, including Stop and batch start. I did not recrawl this source file.
- Answer: batch startup preserves the expanded layout, and the enabled shared Stop remains in the clipped capture flow. No second Stop control or capture scroll correction was found by these focused checks.

### Images and output-path check

- Four `read_image` calls: exactly the four full image paths listed in the Actual-image review table; each opened once.
- One exact-path `glob` for the designated review output returned no files before writing this report.
- No other repository files, raw logs, JSON artifacts, memories, external pages, or images were read. No controller audit content was read or altered.

## Validation evidence and its limits

The reported full sequence is review **17/17**, features **11/11**, memory **14/14**, library **24/24**, improvements **25/25**, release **17/17** with **34 resources**, each reported exit 0. I inspected the changed assertions in the package, not the raw run logs, and did not rerun commands. These counts remain implementer-reported execution evidence, distinct from the source/image judgments above.

The report clearly separates UI/motion RED results, intermediate focused GREEN runs, the full suites, and the final **5/5** focused run after deletion of two static local ordinal spans. Full review/features/memory ran on the final JS/CSS/resource lists with the two spans still present; library/improvements/release and the last focused run used final HTML. I do not label every full suite as a rerun on the final HTML. The five final groups cover discoverability, immediate input/reversal/reduce/preview close, the card budget, desktop geometry, and screenshots; they do not cover I1’s expanded running state. See [the report:55–117](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-report.md#L55-L117>).

Reported error/network boundaries also remain scoped: review and library assert their main-page errors and blocked request arrays; features uses the existing exact local transport replacement and permission shim; memory records page errors/marked unhandled rejections but does not count all attempted external requests; improvements has a global page-error array only for the later export context. None proves all-console zero warnings, native permission UI, or live-network behavior. See [the report:127–140](</Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2/.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-report.md#L127-L140>).

⚠️ Not independently verified here: Chrome 114/Node 20 minimum versions, other platforms, real courses or personal profiles, native permission prompts, manual PDF-reader presentation, continuous motion/velocity curves, or unmodified writer/storage/thumbnail internals beyond the supplied context. The package does not change the Task 1 writer or its identity/snapshot paths; the existing race/byte/resource assertions remain in the affected tests. This task review does not re-certify all unchanged code.

The optional recording failed before UI execution with `browserContext.newPage: Executable doesn't exist at /Users/jasondai/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac`. The report discloses that the temporary recording switches were removed and the ordinary final focused run passed. This is an artifact environment limit, not a product-test failure or evidence that a video exists. No dependency installation was attempted by this review.

## Out-of-scope observations

- Version 3.1.1 is intentional at this task gate; Task 3 owns the version update and final local package. Historical 33-member records are not a defect.
- Full keyboard reordering was explicitly excluded; preservation of the existing selection, preview, seek, crop, undo, and cleanup paths does not imply a new keyboard reorder feature.
- Transcription, cloud APIs, live-school testing, remote publication, and a full branch audit remain outside this review. No additional actionable out-of-scope defect was established.

## Assessment

**Spec: Issues found. Quality: Needs fixes. C/I/M: 0/1/0.** The implementation is otherwise appropriately small and preserves the reviewed UI/data boundaries, with meaningful motion and lifetime assertions. Resolve I1 and verify the expanded running state before approving Task 2.

This review performed no Git operation, command, test run, browser/network/credential operation, or delegation. Its sole file write is this report. No fix was implemented.
