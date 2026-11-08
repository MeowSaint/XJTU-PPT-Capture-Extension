# Learning Task1 implementation report

Status: DONE for Learning Task1 implementation. Required checks passed on the committed source epoch. This report covers only conservative local-detail preservation and scan comparison provenance; independent review remains the controller's next gate.

## Scope and interfaces

- Worktree: `/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/long-session-reliability`; branch `fix/long-session-reliability`; clean starting HEAD `8f838dd466a94eb60cf16ec47030fa1fda7f98c3`.
- Requirements: Task1 brief and binding design Spec §1, lines16–26. Read the named completed producer audit and bounded producer report sections. No full-plan/sibling requirement mining, independent reviewer, delegation, main/root operation, remote operation, installation or real-course access.
- Source scope is exactly [media.js](../../../media.js), [capture.js](../../../capture.js), [core.test.cjs](../../../tests/core.test.cjs), [scanner.test.cjs](../../../tests/scanner.test.cjs), [improvements.cjs](../../../tests/improvements.cjs). This report is the sole added durable report. Raw ignored test evidence is under `.test-output/learning-task-1/`.
- `PPTCore.hasLocalChange(a, b, mask = null) -> boolean` uses the same shared metrics pass as `frameDistance`/`similar`. For valid 82,944-value (192×108 RGBA) arrays, any unmasked pixel with post-bias maximum RGB channel difference >=48 vetoes similarity. Per-channel bias remains the original floating mean when its absolute value is <=8; no rounding, windows, strides or minimum pixel counts.
- Both old global conditions still apply: `changed < threshold` and `mean < Math.max(0.25, threshold / 2)`. Changed-pixel counting remains >=24. Noncanonical valid array lengths keep global-only comparison. Invalid shapes/masks and entirely masked inputs conservatively fail similarity; `frameDistance` retains its exact `{changed, mean}` result shape and 100/100 invalid fallback. Alpha remains ignored.
- One internal metrics function computes the existing bias and global metrics plus the local flag. `similar` does not call separate metric/helper loops. No caller-specific dedupe rule, OCR, new options, new dimensions, cache or dependency was introduced.
- `fastScan` adds `comparisonVersion` when constructing its full scan task. New scans and same-version resumes use `local-v1`; resumed absent/other/`mixed` versions use `mixed`. Eligibility, scan settings, task ID, checkpoint baseline, image data, coverage, partial-range behavior and existing comparison caches retain their existing paths.
- `mediaError`, scanner media context, preparation, native readiness, source identity, atomic binding/cancellation, candidates, coverage and receipts remain untouched. Version stays 3.1.2, IDB stays v3, dependencies remain unchanged. No learning UI/filter/review feature or release package was implemented.

## TDD and retained command evidence

Every run below retains `.command`, `.stdout`, `.stderr`, and actual decimal `.exit` files with that prefix under `.test-output/learning-task-1/`. Runs01 onward also retain `.before.json`/`.after.json` with timestamps and SHA256 of all five source files. `.command` contains the exact isolated `PPT_TEST_BROWSER` executable setting; it was already installed. No failed run was overwritten.

| Prefix | Actual command after browser setting | Exit | Actual result/source epoch |
| --- | --- | --- | --- |
| `00-baseline-1` … `00-baseline-5` | retained worktree/branch/HEAD/status/diff preflight commands | 0 each | exact authorized branch, clean actual BASE |
| `01-node-red` | `node --test tests/core.test.cjs tests/scanner.test.cjs` | 1 | 59 tests:55 pass/4 fail; original product sources |
| `02-canvas-red` | `env PPT_TEST_LOCAL_DETAIL_ONLY=1 node tests/improvements.cjs` | 1 | fixture setup failure, not accepted as behavior RED |
| `03-canvas-red` | `env PPT_TEST_LOCAL_DETAIL_ONLY=1 node tests/improvements.cjs` | 1 | real behavior RED: actual saved times `[0.25]`, expected `[0.25,1.25,2.25,3.25,4.25,5.25]`; original product sources |
| `04-node-green` | `node --test tests/core.test.cjs tests/scanner.test.cjs` | 0 | 59/59; final product sources, earlier test epoch |
| `05-canvas-green` | focused improvements command above | 1 | 5/6 frames; initial 10px subscript disappeared from signature |
| `06-self-review` | `git diff -- media.js capture.js tests/core.test.cjs tests/scanner.test.cjs tests/improvements.cjs` | 0 | own scoped diff inspected |
| `07-canvas-green` | focused improvements command above | 1 | 5/6 frames; bold12 subscript maximum difference33, below48 |
| `08-subscript-probe` | `node .test-output/learning-task-1/probe-subscript.cjs` | 0 | native Canvas visibility probe: sizes12/13/14/15/16 had strong counts0/0/1/1/3 and maxima33/25/58/56/74 |
| `09-canvas-green` | focused improvements command above | 0 | actual scanner/frame/save group passes on the final five-file source epoch |
| `10-final-node` | `npm test` | 0 | 344/344, final source epoch |
| `11-syntax-media` … `15-syntax-improvements` | `node --check` on each of the five source files | 0 each | final syntax checks |
| `16-final-improvements` | `npm run test:improvements` | 0 | 26 groups; no external requests; final source epoch |
| `17-diff-check` | `git diff --check` | 0 | no whitespace errors |
| `18-scope-status` | `git status --short --branch` | 0 | exact branch; exactly the five authorized source modifications |
| `19-diff-stat` | scoped `git diff --stat` | 0 | five files,213 insertions/12 deletions |
| `20-final-library` | `npm run test:library` | 0 | 56 groups; inherited explicit native gap; final source epoch |
| `21-stage-source` | exact five-file `git add -- ...` | 0 | no controller/report/raw files staged |
| `22-staged-source-scope` | `git diff --cached --name-only` | 0 | exactly the five authorized paths |
| `23-provenance-audit` | `python3 .test-output/learning-task-1/audit-provenance.py` | 1 | final suite hashes passed; audit incorrectly included its own not-yet-written exit file |
| `24-provenance-audit` | same script with explicit current-run exclusion argument | 0 | final suite hashes equal before/after/final source; all completed-run quartets complete |
| `25-staged-diff-check` | `git diff --cached --check` | 0 | exact staged source patch clean |
| `26-source-commit` | required exact `git commit -m` | 0 | source commit76405c4 |
| `27-source-provenance` | `git show --format=fuller --stat HEAD` | 0 | complete source hash/date and five-file ownership |

Behavior RED details: run01 failed with `AssertionError ... superscript ... true !== false`, `TypeError: core.hasLocalChange is not a function`, the old eight-pixel assertion, and scanner A–B–A actual `[0.25]` versus expected `[0.25,1.25,2.25]`. Run03 independently exercised actual Canvas→frame→scanner→save→IDB and saved only the base. These occurred before any product edit. Run02 used the invalid select value `.5` rather than option `0.5`; the scan returned null after rejecting step0, producing `Cannot read properties of null (reading 'saved')`. That failed attempt remains retained and is not counted as proof of the behavior defect.

The only adapted old business assertion changes eight strong red-channel pixels from similar=true to false, because one strong unmasked pixel now deliberately protects small detail. Its uniform-brightness and substantial-text assertions remain. No existing knowledge/pixel/cancellation/data protection assertion was removed. The two subscript fixture failures were corrected by selecting a visible native glyph after measurement, without changing the comparator or rounding bias. Final fixture is a 14px bold serif subscript with exactly one strong signature pixel. Added a separate mean-only rejection control above the <=8 brightness tolerance after focused run04; final `npm test` covers it. Required complete suites run once each after all final source edits.

## Actual Canvas, pixels, source time and storage evidence

Final integration evidence: [final Canvas evidence](../../../.test-output/learning-task-1/canvas-ER2pVb/evidence.json), six `knowledge-{0..5}-{1..6}.jpg` files and six matching `.rgba` files (82,944 values each). Earlier focused passing evidence: `canvas-G2k9xt/`; behavior RED evidence: `canvas-io5dDE/`. Failed focused artifacts `canvas-EpNu4G/` and `canvas-LysiNH/` remain retained.

The fixture uses native Canvas text/rectangles at710×378 and the real `frame` crop/resample to192×108. Synthetic seek properties/events on the dedicated video element provide deterministic source times; the real `PPTScanner.seek`/scan, comparison injection, disk dedupe, `save`, JPEG encoding, IDB assets and manual adjacent review execute. This proves the Canvas/scanner/frame/save path, not native video decode or real source acquisition.

| Change | Persisted page ID | sourceTime | Strong signature pixels versus previous stage |
| --- | --- | --- | --- |
| Base | 1 | .25 | 0 |
| Superscript2 | 2 | 1.25 | 3: indices3884,4076,4268 |
| Subscripti | 3 | 2.25 | 1: index5617, RGB255→197 |
| Single data digit1 | 4 | 3.25 | 3: indices5082,5274,5466 |
| Added formula term `+ C` | 5 | 4.25 | 9 |
| Colored annotation | 6 | 5.25 | 12 |

All six stored JPEG byte arrays equal their independently encoded expected Canvas frames, and all six stored signature arrays equal expected frame signatures; all source keys are `synthetic-local`. Every increment passes the old global changed/mean conditions. The JSON records actual before/after RGB values at each changed pixel. Separate exact192×108 Canvas controls retain a48-black-pixel formula and an8-colored-pixel annotation through scan/save. These assert asset pixel values, unique IDs and time rather than counts alone.

Controls in the same integration group:

- A→B→A with global dedupe on saves `.25,1.25`; with dedupe off saves `.25,1.25,2.25`. Exact one-pixel B is retained, and its saved black pixel is asserted.
- The same one-pixel change entirely inside the ignore mask saves only `.25`; uniform -8 brightness also saves only `.25`.
- Stable glyph/control scans report zero unstable confirmations. The real-comparator scanner test additionally rejects an unstable initial confirmation and records suspect time0 before retaining stable time.75.
- The base/superscript pair is absent from adjacent similarity candidates. Two identical real saved assets remain a candidate; choosing both retains both IDs. Existing manual mask/realtime/cache/cancellation tests pass unchanged.
- Core boundary tests use dispersal below48 to balance the exact channel mean, so post-bias47 stays similar and post-bias48 does not, across all RGB channels at corners, edges and an interior point. A raw48 single change without balancing correctly stays below48 after fractional bias. Partial/full masks, identical frames, alpha-only differences, malformed/fully masked inputs and noncanonical lengths are covered. Historical qualification added during the final whole-branch M1 fix: the original run passed the weak-change and mean-only controls, but the all-pixels weak fixture crossed both global thresholds and did not independently isolate changed-percentage rejection. The mean-only control remains valid; independent changed-only coverage was corrected at the final fix epoch described below.

## Resume provenance evidence

For each initial version absent, `old-v0`, `local-v1`, `mixed`, the integration stores an existing image and a paused task at checkpoint1 with baselineTime.25. `canResume` remains true. Actual seeks begin `[.25,1]`, then continue through1.5/2/2.5/2.95, proving baseline hydration plus checkpoint resume rather than restart. Original task IDs `checkpoint-null`, `checkpoint-old-v0`, `checkpoint-local-v1`, `checkpoint-mixed` persist; original page IDs and exact JPEG/signature bytes persist; count stays1; scanSettings remain byte-equal; final checkpoint is2.95. Both live and IDB task versions are respectively `mixed,mixed,local-v1,mixed`. The new knowledge scan is `local-v1`.

## Source epochs and commits

Runs01/03 used original product hashes:

- [media.js](../../../media.js): `355637816b931916170363f90828a5a269642e5ce9882cc7b7c34eb28165566b`
- [capture.js](../../../capture.js): `2835b60336655cfac19f33da23d33261187d3b7d0eba8cab3ffb9694b2bf1b1d`

Final source epoch (run09 and required final suites):

| File | SHA256 |
| --- | --- |
| [media.js](../../../media.js) | `7efe9941352754d9e4b9e7c52b0eb84395a80cf3f0cd9b5abc64225d0a09192a` |
| [capture.js](../../../capture.js) | `fe5aa72698b8fe5ec83772c171a42700b6d4448ac8a414305f179f06481ea8f2` |
| [core.test.cjs](../../../tests/core.test.cjs) | `d520fa4f841a4c355ff9b2b5e96c334d1c8de074bbe2a91b1373f592a57374a9` |
| [scanner.test.cjs](../../../tests/scanner.test.cjs) | `496861594e4e0d6d13827b4e7d4720f5b22ff5182d2194d8d01d28af36e17c70` |
| [improvements.cjs](../../../tests/improvements.cjs) | `100c6b9f2f0558d80e75c9be461b33434031340b4cebe1339d5d64d08330acb2` |

Run04 uses final product hashes but earlier core/browser test hashes, explicitly recorded in its snapshots. Run09 uses the exact final five-file epoch. The successful run24 provenance audit compares each final suite's before/after snapshots to final source bytes and verifies identical hashes. Final suite windows (+08:00): Node09:01:22.124319–09:01:29.361810; improvements09:01:40.877501–09:01:51.498547; library09:02:01.440091–09:04:00.160599. All used the exact same final five-file epoch. Run23's bookkeeping assertion was corrected by excluding its own still-running quartet; its actual exit1 is retained. No product/test edit or broad-suite rerun resulted from that audit correction.

Source commit: `76405c483363e37d62a2c4bb08ab07ba50d1fe8f`, `fix: retain local formula and annotation changes during capture`, author/commit time2026-11-08 09:06:04 +0800, parent `8f838dd466a94eb60cf16ec47030fa1fda7f98c3`. It contains exactly the five authorized source files. This report is the sole file of the following separate report commit, titled `docs: record Learning Task1 implementation evidence`, with source commit76405c4 as its parent. The report commit's resolved hash and final clean status are retained in subsequent raw provenance commands and the final handoff, avoiding a self-referential commit hash inside its own content. No source changes followed final successful checks. Ordinary report staging (run28) returned actual exit1 because `.superpowers` is ignored; the task's explicit sole-report exception authorizes force-adding only this exact report path. Subsequent report-stage, staged-scope/check, report-commit, clean-status and commit-chain commands retain their own raw quartets after run28.

## Self-review and limits

Own diff reviewed for scope, completeness, API shape, bias/mask equivalence, boundaries, resume preservation and meaningful pixel/time evidence. Corrections made: invalid select setup, subscript visibility, evidence indexing by actual sourceTime when a frame is skipped, creation of the evidence directory on a fresh checkout, raw signature/pixel evidence, and a mean-only global-threshold control. Production remains a focused shared-metrics refactor plus one task field. The existing large capture/test modules remain large; no unrelated restructuring was added. No unresolved implementation issue identified by this self-review; independent review belongs to the controller after this handoff.

The one-pixel gate intentionally may retain cursor/projector/compression/video noise. It does not infer knowledge or distinguish formulas semantically and cannot protect detail that vanishes during192×108 resampling. Fixtures/fonts/isolated Chromium were validated on this host only. No original course recording, damaged original media, Chrome114 or Node20 minimum runtime was verified. Knowledge-detail fixtures use synthetic seeks and therefore supply no native-video knowledge-detail evidence. The mandatory library suite includes its existing native-media controls and reports `EXPLICIT GAP: browser-tolerates-damaged-audio`; its56 passing groups do not resolve that inherited gap. Version/schema/dependencies and prior phase contracts were preserved by narrow scope and required regressions. No separate previous-phase native-media suite was rerun for reassurance. The OpenViking rule-search tool named by the loaded skill was unavailable in this session; the explicit local brief/spec and user scope governed implementation. No additional owner was needed.

## Managed jobs and resource cleanup

Managed jobs started: `bash-197e05c5c9b64194` (02), `bash-4b557a99a9ec4895` (03), `bash-8aabc8ffd3b14740` (05), `bash-447914ed58ad4cd8` (07), `bash-c85f909887b044d2` (08), `bash-0898732b67984d4c` (09), `bash-e1830f925f814e97` (10), `bash-76dfb2bd80ce481a` (16), `bash-ab5ab5d397414b4d` (20). All nine have been collected with `job_output`; final `job_list` reports all completed and zero running. The observed list, run mapping and actual exits are retained in [job cleanup evidence](../../../.test-output/learning-task-1/job-cleanup.json). All recorded failed child process exit codes are actual1; successful runs actual0; no SIGTERM/signal code was invented. No duplicate jobs or polling loops.

Every browser run uses its own isolated test Chromium. The new context closes in `finally`; the fixture restores `drawImage`, releases dedupe and closes manual-review URLs/dialogs. Existing suite finally blocks close the browser and await loopback-server closure; scanner seek listeners/timers settle on seeked, and scans/persistence/IDB operations are awaited. The probe closes its browser in `finally`. No browser/server/watchdog was started outside these managed commands, no Brave MCP/daily browser was used, and no software downloads/installations, external network, authentication or host reload occurred. Mandatory existing export tests generated only their synthetic local PDF/ZIP downloads under ignored test-output paths. All managed jobs and owned runtime resources are closed/collected before this handoff. Source and report provenance are separated as recorded above; no running job, browser context, server, watchdog or task timer remains owned by this worker.

## Final whole-branch M1 qualification — added after the historical Task 1 handoff

The paragraphs, source hashes, commands, run counts and timestamps above describe the original Task 1 execution. Its all-20,736-pixel balanced red control had local=false, changed=100% and mean≈3.9215686%, so its passing result did not prove independent changed-percentage rejection. This qualification corrects that claim; it does not convert the old run into a run of the corrected fixture. The exact pre-edit report bytes are preserved in [the final-fix baseline copy](../../../.test-output/learning-final-fix-wave/before-1-task-1-report.md), SHA256 `758f28adf15d13e159edf3961d3b56ab0481376ad6bf7a0d629649fabca8a3d4`.

At the final fix epoch, the old fixture first failed the new `mean < .6` independence assertion. The correction limits balanced ±30 red changes to 256 pixels and checks local=false, changed≥1.2%, mean<0.6%, then actual dissimilarity. The separate +9 brightness control retains changed=0, local=false and actual dissimilarity, with an explicit mean≥0.6% assertion. The new focused run passes 1 test, the complete core file passes 22, and the single final `npm test` passes 346. These are new final-fix executions, separate from the historical Task 1 runs. Exact source/commit chronology, raw RED/GREEN and applicability evidence are recorded in [the final-fix report](branch-fix-report.md). The production comparator was unchanged; combined approval remains with the controller's fresh scoped review.
