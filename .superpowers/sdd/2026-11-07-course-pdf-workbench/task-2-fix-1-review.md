# Task 2 fix round 1 — scoped Spec + Quality review

**I1 — Expanded batch work hides the task’s Stop control below the capture scrollport — ADDRESSED.**

**Scoped Spec: APPROVED. Scoped Quality: APPROVED. New findings: Critical 0 / Important 0 / Minor 0. Fix round: APPROVED.**

Review range: `e3952346d71f1bd78cf105b2987d01a241f430bf..b7021c7c9ed49c8876e732ab2174aa9ee52f6700`. The supplied frozen package contains all three commits, including documentation-only fix-start `fe1798b988e67e3e5eef71faada7a7cb82c6757e`, product/test fix `76341d6141b2105a243ce2ee290f892a9fa678c6`, and report HEAD `b7021c7c9ed49c8876e732ab2174aa9ee52f6700`. No independent Git verification was performed; the controller supplied the frozen range and clean-scope checks.

## I1 resolution evidence

The diff removes the original Start/Stop group from the video-tools flow and inserts that same group after the editor layout, inside the app shell: [capture.html:266–269](../../../capture.html#L266-L269). Both original button IDs, labels, disabled defaults, native button types and group semantics remain. There is no duplicate Stop or replacement handler.

The app shell now reserves a third grid row: [style.css:57](../../../style.css#L57). The action group has its own surface, top border, bottom sticky positioning and stacking level, with a nonwrapping button row: [style.css:131–133](../../../style.css#L131-L133). Desktop layout therefore gives the action group space below both panes rather than overlaying the capture scrollport. The narrow layout permits document scrolling and supplies compact action-row padding and safe-area space: [style.css:272–281](../../../style.css#L272-L281), [style.css:298](../../../style.css#L298). This satisfies the updated design’s explicit priority ruling. Requiring containment within the former capture ancestor would reject the authorized correction for the wrong reason.

The new regression is a four-size loop covering 1280×800, 1440×900, 1920×1080 and 390×844: [tests/review.cjs:542–573](../../../tests/review.cjs#L542-L573). It seeds two retained image-backed pages, persists an automatic job and a pending-crop job, opens the native summary and clicks the real batch-start button. It waits for a real task, batch-running state, a committed active-lesson page and scanner entry. It does not directly assign busy, batchRunning, Stop-disabled or active-task flags.

The clipping check starts with the viewport and walks the Stop button’s actual ancestors, recording each overflow clipping axis and client bounds: [tests/review.cjs:576–600](../../../tests/review.cjs#L576-L600). Assertions require enabled/running/open state, a running lesson task, zero capture scroll, no document horizontal overflow, desktop editor/action separation, complete Stop containment in every recorded clipping context, and hit success at four inset corners plus the center: [tests/review.cjs:601–609](../../../tests/review.cjs#L601-L609). Moving outside the old pane does not silently drop clipping checks. Fully visible named essential controls must also avoid the action row and pass a center hit test. This is a bounded overlap check, not proof about every partially visible control at every document scroll position.

The test saves the running image before Stop and clicks the measured center with ordinary mouse input, avoiding locator-induced Stop scrolling or synthetic dispatch: [tests/review.cjs:610–613](../../../tests/review.cjs#L610-L613). It then requires the signal listener to have run, waits for actual idle/stopped batch state, checks Stop is disabled again, keeps batch details expanded, checks the retained-results status, and compares all stored page records before and after Stop: [tests/review.cjs:614–624](../../../tests/review.cjs#L614-L624).

The comparison includes asset image bytes serialized as data URLs, metadata and signatures, not only displayed counts: [tests/review.cjs:24–46](../../../tests/review.cjs#L24-L46). Existing two-page records must remain exactly equal; one newly committed page makes the asserted progression 2 → 3 → 3, with one active-lesson card.

## Fixture and cancellation assessment

The only scanner replacement saves one real frame through the supplied save callback and then waits on the supplied abort signal, with a 15-second failure deadline: [tests/review.cjs:554–565](../../../tests/review.cjs#L554-L565). The permission request is a local fixture shim. Neither establishes real extension permission UI or recognition accuracy, and neither manufactures the running control state.

The unchanged producer/consumer path supports the claimed test meaning:

- [capture.js:1604–1608](../../../capture.js#L1604-L1608) enters the real batch handler; [capture.js:1563–1596](../../../capture.js#L1563-L1596) sets running state, loads the source, calls fastScan and persists/stops the batch without collapsing details.
- [capture.js:1114–1158](../../../capture.js#L1114-L1158) creates the load controller, fetches/loads the localhost media and binds the real lesson; the media loader is not replaced by this regression.
- [capture.js:1315–1326](../../../capture.js#L1315-L1326) creates the scan AbortController and passes its actual signal and real save callback into the substituted scanner. [capture.js:968–996](../../../capture.js#L968-L996) retains the normal abort-aware encoding/write/render path and 1000-page guard.
- [capture.js:1639–1642](../../../capture.js#L1639-L1642) sets the batch stop request and synchronously calls `task?.abort()` with no animation await. [capture.js:1351–1367](../../../capture.js#L1351-L1367) preserves results, persists paused state and releases the task; the batch loop then records stopped status. [capture.js:694](../../../capture.js#L694) continues to enable the same Stop for actual work.

The immediate-abort assertion is observed in the next browser evaluation after the mouse click; it is not a measured latency budget. Source inspection supplies the synchronous-handler evidence. The scanner hold is restored after successful iterations, and the suite finally closes context, browser and HTTP service on failure as well: [tests/review.cjs:624–626](../../../tests/review.cjs#L624-L626), [tests/review.cjs:698–708](../../../tests/review.cjs#L698-L708).

## Independent visual assessment

Both requested final actual images were read with `read_image`:

| Image | Assessment |
| --- | --- |
| [Running 1440×900](../../../.test-output/v3.1.2/review-LR5goa/fix-1-expanded-running-1440x900.png) | Expanded automatic and pending-crop rows are present. The enabled Stop is completely visible in the separate bottom row; the disabled Start remains grouped with it. The action row is below both desktop panes. |
| [Running 390×844](../../../.test-output/v3.1.2/review-LR5goa/fix-1-expanded-running-390x844.png) | The document is at the natural batch-start scroll position. Expanded batch content remains present. The pinned Start/Stop row is entirely visible on one line, with no horizontal cut-off. Lower batch content remains available through vertical scrolling. |

No third image was needed: there was no remaining size-specific boundary that required it. Screenshots establish appearance only; running state, cancellation and retention are assessed through the assertions and source above.

## Reported execution evidence and its limits

The package contains the full appended fix report, including exact commands, RED details, final-size measurements and the final source-hash matrix. I assessed these as implementation evidence claims against the diff and focused source reads, without rerunning anything or separately opening logs.

| Reported run | Reported result | Review assessment |
| --- | --- | --- |
| Focused pre-fix RED | Exit 1; enabled running Stop at 1280×800 had y=820.0625, height=34, bottom=854.0625; viewport bottom=800, capture clip bottom=780; five hits false. Error: `AssertionError [ERR_ASSERTION]: enabled Stop escapes its actual clipping context viewport`. | The added clipping/viewport assertion detects the original reachable defect. The historical RED line 605 belongs to that test revision, not the final source line. |
| First and final focused GREEN | Each 1 group / 4 sizes, exit 0; final follows the narrow nowrap adjustment. | Four-size loop, state, clipping, real click and byte-retention assertions match the claim. |
| Sequential full review → memory → library | 18/18 → 14/14 → 24/24, all exit 0, on final product/test sources. | Kept distinct from the historical six-suite initial implementation evidence. The report supplies commands and source hashes; I did not independently hash files or execute suites. |

Reported final Stop bounds are `(668,756,120,34)`, `(668,856,120,34)`, `(668,1036,120,34)` and `(254,800,120,34)` respectively, each with five hits; reported narrow document width is 390. The two independently read images agree with their corresponding visible positions.

The existing desktop geometry group remains and checks pane placement, document bounds, action bounds and independent gallery scrolling: [tests/review.cjs:629–652](../../../tests/review.cjs#L629-L652). Existing reviewed assertions for live reduced motion, immediate focus, preview close and bounded visible-card motion were also present in the inspected helper/context range; the fix does not delete or weaken them. Review’s final script-error and nonlocal-request assertions remain: [tests/review.cjs:695–697](../../../tests/review.cjs#L695-L697).

The appended memory result reports 1000 pages, maxReads=2, activeURLs=allowedImages=10, animations=0, and bounded/oldRevoked/reused/preservedScroll=true. Those are reported final-layout measurements, not independently re-executed results or a universal URL count. Memory/library assertion sources were not additionally crawled. The product diff changes no JS, storage, scanner, export, source-scope, crop-mapping, lazy-root/margin, resource-list or version logic. It relocates the original HTML group and changes only the necessary layout CSS; no new runtime dependency or browser API is introduced. The report’s unique 154 IDs, single exact 3.1.1 span, motion load order and 34-resource baseline remain claims consistent with the scoped diff, not a fresh whole-branch audit.

Known limits remain explicit: macOS arm64 / Node v26.13.0 / Chromium 156.0.8078.4 evidence only; Chrome114/Node20 minimum combinations, real school media/accounts, daily profiles and native permission dialogs were not tested. Optional video was unavailable because Playwright ffmpeg1011 was missing; no video, recognition-accuracy or real-school claim is made. The new test deliberately bounds only the scanner wait. No unsupported-environment inference is treated as a defect.

## New breakage and out-of-scope observations

**New breakage caused by this fix diff: None. C0 / I0 / M0.** No new actionable finding has a reachable defect demonstrated by the inspected diff or evidence.

**Out-of-Scope Observations: None.** This review does not reopen the original whole UI, Task 3, historical integration work or controller audit decisions. Partially clipped content in a vertically scrollable narrow document is not itself a new blocking finding; the relevant Stop is pinned and hit-checked.

## Exact read and image ledger

Paths below are relative to this report unless an absolute location is shown. Package line ranges were consumed once, consecutively and without overlap. Focused source excerpts were read to resolve fixture/handler, retained-byte, responsive-flow and cleanup questions; no broad repository crawl was performed.

| Input | Exact read |
| --- | --- |
| [Authoritative review brief](task-2-fix-1-review-brief.md) | Lines 1–25, complete; first task read. |
| Scoped re-review template, requested `/Users/jasondai/.dsh/skills/subagent-driven-development/re-review-prompt.md` | Lines 1–116, complete; read tool resolved it to `/Users/jasondai/.config/magpie/library/skills/subagent-driven-development/re-review-prompt.md`. No fallback commands used. |
| [Original Task 2 requirements](task-2-brief.md) | Lines 1–15, complete. |
| [Fix brief and verbatim I1](task-2-fix-1-brief.md) | Lines 1–29, complete. |
| [Initial review](task-2-review.md#L28-L36) | Only lines 28–36. |
| [Frozen package](task-2-fix-1-review-package.txt) | Lines 1–350, then 351–450; complete once, supplied size 49,415 bytes. Includes appended report and the bundled controller documentation diff; no separate controller audit access. |
| [Review fixture/source](../../../tests/review.cjs) | Lines 1–240, 542–665, 688–709. |
| [Responsive CSS](../../../style.css#L269-L308) | Lines 269–308. Other fix CSS/HTML context came from the package. |
| [Capture controls](../../../capture.js#L669-L714) | Lines 669–714. |
| [Capture save/source release](../../../capture.js#L968-L1029) | Lines 968–1029. |
| [Capture remote load](../../../capture.js#L1114-L1206) | Lines 1114–1206. |
| [Capture scan path](../../../capture.js#L1307-L1420) | Lines 1307–1420. |
| [Capture batch/Stop handlers](../../../capture.js#L1560-L1661) | Lines 1560–1661. |
| Targeted handler search | One grep on `capture.js` for Stop, controls, save/load/scan and batch-start/stop identifiers; used only to locate those excerpts. |
| [1440 running image](../../../.test-output/v3.1.2/review-LR5goa/fix-1-expanded-running-1440x900.png) | One `read_image`; 1440×900. |
| [390 running image](../../../.test-output/v3.1.2/review-LR5goa/fix-1-expanded-running-390x844.png) | One `read_image`; 390×844. |
| Output existence check | Exact-name glob for this review report returned no existing file before creation. |
| Skill | `ponytail` loaded through the skill tool; no supplementary skill-resource crawl. |

Only this review report was written. No tests, Git, shell commands, browser sessions, network access, credentials, real profiles, dependency operations or subagents were used. No missing report context required opening the historical first 180 report lines. No source edits or Task 3 work were performed.
