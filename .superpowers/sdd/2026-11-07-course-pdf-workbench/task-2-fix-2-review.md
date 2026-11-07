**I2 — ADDRESSED.** The fix gives the expanded low-height desktop workspace a bounded scrolling region and enough allocated result height for a complete card. The gallery remains a separate finite lazy root. Scoped Spec: **APPROVED**. Scoped Quality: **APPROVED**. New breakage: **Critical 0 / Important 0 / Minor 0**.

## Finding verification

The reviewed range is `b7021c7c9ed49c8876e732ab2174aa9ee52f6700..25bfd40f225f57d4061fbc98c75064a2b0a14a1e`; the UI source commit is `353085aa6ba391d14a7767540ca036ae00639561`. The nine-commit packet includes identified Task3 checkpoint/report and controller documentation background. I did not treat those as UI-owner scope violations or repeat their separate review. The actual round-2 source changes are one CSS layout rule and the two scoped test files, 157 additions / 6 deletions, followed by the append-only report.

1. **The original collapsed/escaping gallery is resolved.** [style.css:109](../../../style.css#L109) changes the workspace rows to `max-content minmax(560px, 1fr)`, adds ordinary `overflow: auto`, and uses `scroll-padding-block: 16px 20px`. The desktop shell and editor still allocate the action row separately ([style.css:57](../../../style.css#L57)); the result column and gallery retain `min-height: 0` and the gallery retains its own overflow ([style.css:145](../../../style.css#L145), [style.css:164](../../../style.css#L164)). The batch panel retains its bounded internal overflow. This permits scrolling between the expanded batch content and the result area without making the gallery root as tall as its contents.

2. **The new regression checks actual access.** The added test in [tests/review.cjs:542](../../../tests/review.cjs#L542) seeds real stored pages and three pending/crop batch jobs, opens the disclosure, and preserves its open state. Its measurement includes viewport and clipping ancestors, document bounds, workspace/root dimensions, and hit tests at four corners plus center of the first card, selection box, time control and delete button. The unchanged RED assertion checks that the gallery stays within the allocated results height; the GREEN path scrolls the actual first card into view, checks complete containment and action-row clearance, then uses real selection and time controls. It does not assign busy/running flags or manufacture input events. The reported old `#pages` y718.390625 / h18 / bottom736.390625 against results bottom645 is consistent with what this retained assertion rejects.

3. **The three independently viewed final images support the layout conclusion.** The initial 1280×720 image shows expanded batch content and workspace content clipped above the action bar. The scrolled 1280×720 image shows a complete first-row card, selection/time/delete controls and video controls above the same bar. The 390×844 image shows two-column cards and their controls within the narrow viewport, with the action bar visible. Batch-open continuity comes from the assertions and report; it cannot be inferred from the scrolled images alone. The report records workspace scroll317, gallery506×244 at y401.390625…645.390625, action-row y665, and a241×170.5625 first card with20 passing hit points ([appended report:358](./task-2-report.md#L358)).

4. **Native input now proves the intended source and unchanged sorting goal.** [tests/integration.cjs:328](../../../tests/integration.cjs#L328) scrolls the first card into view, installs a passive once-only observer, performs mouse down and12px source motion, then asserts a trusted dragstart from the original first ID before scrolling the last card. It releases at the original `lastBox.x + lastBox.width - 4`, `lastBox.y + 12`. Exact first-to-last order, independent new-page persistence and Referer assertions remain at [tests/integration.cjs:350](../../../tests/integration.cjs#L350). The focused review also verifies the trusted source/drop IDs, exact `[11,12,13,10]` order, independent-page persistence, and equality of all stored metadata/signatures/image bytes after removing only the order field. Its [stored helper:24](../../../tests/review.cjs#L24) reads real IndexedDB assets and converts their image Blobs into data URLs for those comparisons. The unchanged [native handlers:788](../../../capture.js#L788) set the source through the drag event and persist order according to the actual right-half drop; the test does not assign `draggedPageId` or call the handler directly. The Ruling10 input separation is supported without an additional diagnostic read.

5. **The root bound is independent of the 1,000-page list.** The added final comparison restores1,000 cards and requires the same gallery height and outer workspace scrollHeight as the four-card case, while requiring gallery content height greater than ten root heights. It checks loaded images against the root plus200px and rejects any loaded image outside that bound. The reported values are root244px and outer scrollHeight918px for both lists, content377→94281px, and6 loaded/6 permitted thumbnails ([appended report:360](./task-2-report.md#L360)). The retained [memory checks:225](../../../tests/memory.cjs#L225) separately assert1,000 metadata/assets/cards, zero restore animations with normal motion enabled, max thumbnail concurrency2, revoked old URLs, reused keyed cards and preserved nonzero scroll. Their allowance cannot conceal a root inflated to the whole list because the new review independently checks root-height invariance. Product lazy-loading, revision, animation and storage code were not changed by this fix.

6. **The prior Stop protection survives.** The action group is outside the scrolling main element ([capture.html:264](../../../capture.html#L264)). The retained [running Stop test:661](../../../tests/review.cjs#L661) starts through the real batch UI and controller/save path, measures the enabled original Stop against actual clipping ancestors and five hit points before rescue scrolling, clicks its measured center, asserts immediate scanner-signal abort, and compares exact old plus newly committed page records/bytes. It keeps the batch disclosure open. It covers1280×800,1440×900,1920×1080 and390×844; it does not add a separate running1280×720 execution. The unchanged [Stop consumer:1639](../../../capture.js#L1639) still immediately calls `task?.abort()`, and the unchanged [scan path:1315](../../../capture.js#L1315) passes that signal and the real save callback. The report records2→3→3 retained pages. These checks use the existing synthetic scanner wait and permission fixture; they do not prove native permission UI.

## Integration input and coverage assessment

The Ruling11 change at [tests/integration.cjs:384](../../../tests/integration.cjs#L384) plans25%→75% of the contained image from public video client/raw dimensions and overlay coordinates, then uses native mouse input. It reads private crop state only afterward for logging. It keeps public native height720 and the original actual decode assertion `cropSize.w > 600 && cropSize.w < 660`, `cropSize.h === 360` ([tests/integration.cjs:406](../../../tests/integration.cjs#L406)). The unchanged producer uses the same public contain bounds and pointer normalization ([capture.js:853](../../../capture.js#L853)); [capture.js:937](../../../capture.js#L937) consumes real pointer events and [capture.js:959](../../../capture.js#L959) rounds the raw crop dimensions when creating the frame.

The reported417×235 client/canvas,1280×720 raw and417×234.5625 contained image support the explanation: the old whole-overlay half corresponds to approximately360.671 source pixels and rounds to361; image-half input corresponds to360. The reported points `(407.25,203.75)→(615.75,321.03125)` span117.28125 client pixels, half the contained image height. Expected360 remains fixed independently of output/private crop state. Removing the local old-input361 investigation guard does not weaken that retained product assertion. The packet contains no other UI-owner integration changes. The original order/new-page, Referer, cache/PDF, JPEG, crop and later IDB assertions have no removed or weakened hunks; the focused source read also confirms the exact order, PDF-after-cache-release, crop and subsequent byte-retention assertions.

The [appended report:314](./task-2-report.md#L314) records the genuine RED and intermediate failures, including the discarded200px-padding run and the original-helper wrong-source failure. These are historical evidence, not final coverage. It reports the measured-crop full integration→review19/19→memory14/14→library24/24 sequence at final CSS/review sources, followed by a final full integration after deleting only the investigation guard. I inspected the assertions; I did not execute these suites or independently collect their jobs.

| Frozen source / stage | SHA-256 and coverage interpretation |
| --- | --- |
| [style.css](../../../style.css) | `348d8ebf56ccd1b1801e121800f7e9fd8fb30147ae17cb1ec3f9c4930b109eb8`; final product CSS for the reported four-suite sequence and final integration |
| [tests/review.cjs](../../../tests/review.cjs) | `84a66cdc7a599c73fd46f379645c2f80f9b4ae98ca77ce1c93ec6fc3c3feb127`; final19-group review |
| Original integration fixture, identified by the brief/report | `8127cc73b66f834c6d83255d3e28f3a110bf756d5b62f2163b35956c5d0493d1`; pre-input-fix fixture, not final integration coverage |
| Native-start stage, identified by the report | `495deb43a3150b8b125465ff419b47af14945299558a3a7a012742bb44e07a64`; order passed, strict crop failed361 versus360 |
| Measured-crop integration stage, identified by the report | `fddf55b39bfd8b538597b7bf094834bf55ab379970db36cedb175e62d37add4e`; reported full four-suite sequence |
| [tests/integration.cjs](../../../tests/integration.cjs) | `7b9afb5971ca71835dc919c8183c8ec100ef2280a6e9bfc100484d54f73eac24`; final fixture and reported final full integration exit0 |

The later fixture-only deletion does not change the product resources or the other suites' code/inputs. Their prior final-resource coverage therefore remains relevant; no unrelated repeat is required. Hashes and run outcomes above are the frozen supplied identities and reported results, not hashes recomputed by this reviewer.

## New breakage and outside-scope observations

- **New Critical / Important / Minor findings: none.** No actionable reachable regression introduced by this bounded layout or the two authorized input changes was identified. No open fix finding remains in this review.
- **Outside-scope observations: none raised.** Identified Task3 metadata/version/docs/checkpoint work remains background. This verdict does not complete Task3 or replace the controller's final branch gate.

## Exact material and read ledger

All file reads below used the read tools. The package was read completely once with non-overlapping ranges; no second diff was obtained.

| Material | Exact inspected ranges / purpose |
| --- | --- |
| [Authoritative round-2 review brief](./task-2-fix-2-review-brief.md) |1–30, complete |
| [Re-review prompt, requested path](/Users/jasondai/.dsh/skills/subagent-driven-development/re-review-prompt.md) |1–116, complete; read backend displayed resolved [library path](/Users/jasondai/.config/magpie/library/skills/subagent-driven-development/re-review-prompt.md) |
| [Original Task2 brief](./task-2-brief.md) |1–15, complete |
| [Complete fix brief](./task-2-fix-2-brief.md) |Original1–33; original long line24 was truncated by the read backend. Controller then inserted only paragraph line breaks, and I read current24–30 completely to recover that text. All original substantive text was inspected; current file has39 lines. |
| [Frozen review package](./task-2-fix-2-review-package.txt) |1–200;201–400;401–550;551–750;751–920;921–1080;1081–1228, once each. Nine commits; supplied declared size150386 bytes. Controller documentation inside this mandatory packet was treated only as supplied scope/background; no separate audit/progress/verifier file was read. |
| [Same Task2 report](./task-2-report.md) |274–390, entire appended section. Original prefix not separately reread; the package shows the append and the report supplies its273-line prefix hash. Read commands/exits,15-job collection claim, failures, source matrix, geometry and environment. Linked raw logs/job ledger/JSON reports were not separately opened. |
| [Ponytail skill](/Users/jasondai/.dsh/skills/ponytail/SKILL.md) |Loaded through the skill tool, full guidance; used for scoped review and explicit limits. No other skill/resource discovery. |

Focused extra reads answered the concrete clipping, native-event consumer, crop-mapping, stored-byte and Stop/lazy-bound questions stated during review:

| Extra source | Exact access |
| --- | --- |
| [style.css](../../../style.css) |Targeted grep for workspace/gallery/results/action/breakpoint selectors, then48–73,80–180,260–309. Confirms finite desktop allocation, scroll boundaries, action-row positioning, contain overlay and narrow overrides. |
| [capture.html](../../../capture.html) |Targeted grep for workspace/results/pages/Stop/batch/version/script markers, then155–273. Confirms unchanged wrappers/controls, action row outside main, unique matched exact3.1.2 span and motion→capture→workspace script order. |
| [tests/integration.cjs](../../../tests/integration.cjs) |310–430. Confirms authorized native start, original target/order/new-page/Referer/PDF, public crop input, strict decode and subsequent IDB checks. Other fixture hunks inspected in the one-pass packet. |
| [tests/review.cjs](../../../tests/review.cjs) |Targeted grep for stored/seed/Stop/abort/retention helpers;24–84 and661–746. Added regression inspected fully in the packet. Confirms actual asset/signature comparisons and existing real controller/Stop test. |
| [tests/memory.cjs](../../../tests/memory.cjs) |Targeted grep for1,000-page/URL/concurrency/keyed-scroll assertions;225–265. Confirms zero restore animation and actual lifetime/concurrency assertions. |
| [page-store.js](../../../page-store.js) |One targeted grep for root/lazy/URL symbols; no matches, no file-content read or follow-up crawl. The independent root-height proof comes from CSS and the added review assertions. |
| [capture.js](../../../capture.js) |772–812;853–879;922–966;1315–1367;1639–1642 only. Confirms unchanged native sort/persist, public pointer mapping/frame rounding and signal/Stop consumers. |
| This review destination |Exact filename glob found no existing file before creation; no other file was written. |

Exactly three final actual images were independently opened with `read_image`, all from the declared final review run:

| Image | Inspection |
| --- | --- |
| [Expanded initial1280×720](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-before-scroll-1280x720.png) |1280×720; expanded three-job batch and clipped workspace above the action bar |
| [Expanded reachable1280×720](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-reachable-1280x720.png) |1280×720; full first-row cards and controls above the action bar after ordinary scrolling |
| [Expanded reachable390×844](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-reachable-390x844.png) |390×844; two-column gallery, complete controls and visible bottom action row |

No fourth image was needed: the remaining Stop/crop/input boundaries were answered by the allowed source and assertions. No diagnostic summary/image, recreated markup, recapture, broad crawl, standalone controller audit/progress/verifier read, command, Git operation, test execution, browser, network, credential operation or delegation was used. Parent start/key-finding/result handoffs are the only agent messages.

## Evidence limits and round verdict

The reported runs use macOS arm64, Node26.13.0 and Chromium156.0.8078.4 with localhost synthetic video/course fixtures and temporary contexts. Chrome114/Node20 minima, other operating systems, real school media/accounts, native permissions and manual PDF-reader behavior are not proved. Reported synthetic PDF rendering/comparison does not establish a human reader's bookmark/sidebar experience. No optional video was installed or retried. Images prove appearance, not trusted input, cancellation timing, persistence or encoding; those conclusions rely on inspected assertions/consumers and supplied run evidence. I did not independently recompute hashes, validate all linked artifacts, collect the reported15 jobs, audit all console channels, or rerun tests.

**Fix round: all scoped findings addressed, no new Critical/Important breakage.** I2 is closed for this bounded re-review. Task3 resume and final branch approval remain with the controller.
