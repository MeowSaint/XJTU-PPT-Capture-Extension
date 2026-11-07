# Task 2 fix round 1 — fresh scoped Spec + Quality verification

Do not dispatch this review until the fix implementation, appended report and frozen package exist. The controller supplies the actual final fix HEAD and file paths. Previous-reviewed FIX_BASE is `e3952346d71f1bd78cf105b2987d01a241f430bf`, not the documentation-only fix-start `fe1798b988e67e3e5eef71faada7a7cb82c6757e`.

Read the scoped re-review template at `/Users/jasondai/.dsh/skills/subagent-driven-development/re-review-prompt.md`, the original [task requirements](task-2-brief.md), the [round-1 fix brief with the verbatim finding](task-2-fix-1-brief.md), and [initial review Issues:28–36](task-2-review.md). Consume the complete supplied fix package once; it includes commits/stat/context and appended fix-report evidence. Read the missing report context only if the package does not contain it. No second Git diff, commands, test runs, browser, network, credentials, or subagents. If an input is missing, ask the controller rather than using the template's fallback Git commands. Write ONLY `task-2-fix-1-review.md` in this owned plan workspace.

## Scope and binding constraints

Verify **I1 — Expanded batch work hides the task’s Stop control below the capture scrollport** as ADDRESSED or NOT ADDRESSED, with file:line evidence. Inspect new breakage caused by this FIX DIFF only; do not reopen the unchanged whole UI. Unrelated observations belong under non-blocking Out-of-Scope Observations for the final whole-branch gate.

- Chrome 114+/Node20+ compatibility, native DOM/no added runtime, schema and permission contracts remain in force; do not infer a compatibility defect solely from an untested environment.
- Same unique existing controls/IDs and immediate business handlers, no new busy lock/animation await, no changed abort/storage/export algorithm. Real Stop must stop ongoing work and preserve retained results. Version remains one exact 3.1.1 span here; Task3 owns 3.1.2.
- Running Stop visibility takes priority over the initial below-preview location, as recorded in the updated design:38/controller ruling. A reserved/pinned action region outside the former capture scrollport is permitted. Judge the NEW actual containing/clipping context plus viewport and corner/center hit targets; do not require obsolete ancestor containment or accept silently omitted clipping evidence.
- Keep batch details expanded during the test; a collapsed/idle image, `isVisible()` alone, preparatory scrolling, manually assigned busy flags or a synthetic Stop dispatch does not prove the missing state. Bounded faithful scanner/media fixtures are allowed if real batch-start, load/scan/save/Stop handlers and abort/preservation semantics remain exercised.
- Preserve 390px flow/no horizontal overflow, original crop mapping, focus, live CSS/JS reduce, keyed card nodes/scroll, root=#pages/margin200px/concurrency2/URL lifetimes and the 1000-page limit. No clone/image retention for motion.

## Evidence inspection

Check the added regression's real pre-fix RED and post-fix assertions/output claims against the diff. Inspect coverage of expanded RUNNING batch at 1280×800, 1440×900 and 1920×1080 and narrow behavior; confirm Stop is enabled and actually hittable in its current clipping/viewport context, clicked through the real handler, then work ends while batch stays open and retained results survive. Distinguish a static idle screenshot from real running evidence. Check any mocks/holds do not manufacture UI flags or bypass cancellation.

Use `read_image` on final actual expanded-running 1440 and narrow images explicitly named in the appended report; the controller will supply exact paths. Inspect another declared final size only for a named unresolved boundary and record why. Do not recreate markup or recapture images. Reported full covering suites are claims until their assertions/diff are assessed; do not rerun them to echo a green result. Preserve historical full-six-suite versus new covering-source evidence distinctions and the known optional-video environment limit.

Named focused additional source, only if a specific producer/consumer question remains after the package: current worktree `capture.js` relevant controls/batch-start/Stop handler ranges, `capture.html`, `style.css`, `tests/review.cjs`, `tests/memory.cjs`, `tests/library.cjs`, or design:31–52. State the question and exact range before reading; no broad crawl or controller-audit access. Ask before any other source.

Return a file report with I1 ADDRESSED/NOT ADDRESSED, independent scoped Spec and Quality verdicts, new C/I/M counts, out-of-scope observations separately, exact package/read/image ledger and evidence limits. Final handoff under 15 lines; stop after writing the report. The controller owns any next fix round or Task3 dispatch.
