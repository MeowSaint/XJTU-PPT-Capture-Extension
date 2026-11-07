# Task 2 — Workbench and motion review

You are a FRESH, READ-ONLY combined Spec + Quality reviewer. Do not implement, delegate, commit, use Git, run tests/commands, browse, make network requests, inspect credentials/profiles, or modify source. Your only write is your final report below. Follow the task-reviewer template; judge findings independently and do not infer that passing reports prove all contracts.

## Workspace and authoritative inputs

Workspace: `/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2`.

Read these once with appropriate offsets, avoiding repeated reads of complete hunks:

- `/Users/jasondai/.dsh/skills/subagent-driven-development/task-reviewer-prompt.md`
- `.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-brief.md`
- `.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-report.md`
- `.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-review-package.txt` — the controller will supply the frozen BASE and HEAD on dispatch. Read the whole package once; do not run your own Git commands.
- `docs/superpowers/specs/2026-11-07-course-pdf-workbench-design.md` — the workbench/motion requirements and compatibility boundaries.
- `/Users/jasondai/.dsh/skills/apple-design/SKILL.md` — the user's explicitly requested skill, not a request to replace the native implementation. The conditional Ready-only response does not apply to this concrete task.

All relative paths above and below resolve from this isolated workspace.

## Binding globals copied from the plan

- 保持 Chrome 114+、Node.js 20+；不改变 IndexedDB schema、使用约定、域名授权或真实任务的 busy/停止保护。
- 当前是原生 JavaScript / MV3 / IndexedDB / OPFS。保留这些结构；不迁移 React，不新增运行时依赖或云服务。
- 整课合并始终生成完整目录；现有 bookmarks 选项继续只控制单课、所选及分课 ZIP 的平级页码书签。旧导出字节不变。
- 生产路径每次读取/写完一张 JPEG 后再读下一张，保留原字节和背压；仅允许 O(页数+课次数) 元数据。
- 两种整课格式都等待 namingSave、lessonSave，再解析缺省课程键、快照标题和页序；显式 null 不回退当前课次。
- 保留每课 1000 页、缩略图读取并发 ≤2、IntersectionObserver root=#pages / rootMargin=200px、离开范围释放 URL、节点复用与 scrollTop。
- 业务处理器不 await 动画；不新增 animationBusy，不延迟授权点击、原生 modal 关闭或缺字段聚焦。减少动态效果同时覆盖 CSS 与 JS。
- 全部实现仅在隔离 feat/v3.1.2；不编辑原工作区、旧 worktree、真实课程数据或既有发布产物。浏览器只跑本地合成夹具，不使用浏览器资料目录或联网服务。
- 每次一个实现者，完成后由全新只读审查者检查 Spec 和 Quality；控制器不直接修源码。所有任务完成后整体审查并构建本地安装包；转录暂缓。

## Review focus

1. **Wayfinding and real DOM:** batch entry spans the work area; primary extraction/crop/stop are understandable; all/selected/current-course exports, naming and settings stay near results. Current-course merged PDF and ZIP must be directly visible with their named scope. Batch-course scope remains independent. Existing IDs, native tabs/details/dialogs, controls, keyboard selection/seek/undo/cleanup and focus behavior survive; the two removed local heading ordinals are a deliberate consistency correction, not a new workflow.
2. **Motion and immediate behavior:** inspect the actual new helper and consumers. The public void reveal/cancel/cancelAll contract, presentation-value interruption, bounded visible-card feedback and live reduced-motion handling must work without business awaits, animation busy flags, changed permission timing, delayed field focus/modal close, crop interpolation or new image clones. Static screenshots do not establish the animated behavior; inspect the meaningful interaction assertions as well.
3. **Data and resource lifetimes:** rearranged DOM preserves page node identity, root #pages, lazy read concurrency, URL release/revision behavior and scroll. No all-1000 restore stagger or hidden image cache. New hints render untrusted source/course names safely and do not start permission/network work themselves. The Task 1 writer and course identity/snapshot contracts remain intact.
4. **Actual presentation:** independently inspect the exact final-source desktop 1440x900, results 390x844 and dark 1440x900 PNGs named in the implementer report. Use read_image, not a recreated mockup. Additional named sizes/contrast/reduce images may be read only for a concrete uncovered question. Judge usable hierarchy, visible controls, clipping/wrapping, real horizontal overflow and dark/contrast legibility. Earlier fullPage/rapid-resize screenshots had repeated raster bands; evidence found a single app-shell and clean measured layout, and viewport capture/two RAFs after preference/size/scroll changes removed the artifacts. Chromium compositor internals were not proven. Verify the final evidence without turning that inference into a browser guarantee.
5. **Packaging and compatibility:** motion.js is included once and before capture.js/workspace.js, current release membership is 34, old historical counts remain historical. At this task versions intentionally remain 3.1.1, including EXACTLY one `<span class="version">3.1.1</span>` and the README current-version field; Task 3 updates them. No dependency/schema/release-workflow change is authorized.
6. **Evidence and scope:** check actual test assertions rather than mirroring implementation. Distinguish focused RED/GREEN, full passed suites and the later static-only heading-label delta; use the final report's exact coverage matrix. Avoid redundant reruns. Missing minimum-version/live-course/native-permission/manual-PDF-reader verification is an honest limit unless source reveals a reachable defect. Optional native video recording was not a gate; its missing ffmpeg-1011 executable must be disclosed as an artifact environment limit rather than a failed product test or secretly installed dependency.

## Narrow extra reads

Only if a concrete producer/consumer question is unresolved by the package, read the focused caller/function in `capture.js`, `workspace.js`, `page-store.js`, `tests/runtime.cjs`, or `.github/workflows/release.yml:40–66` (exact version marker consumer). State the question before that read and include it in your read ledger. Do not crawl other files or search outside this workspace. Source HTML/CSS/helper/tests are already fully or contextually in the package; do not re-read complete content gratuitously. If evidence is insufficient, report exactly what cannot be verified to the controller.

## Output and stop

Write only `.superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-review.md`. Provide independent Spec and Quality verdicts; C/I/M findings need a concrete reachable trigger and file/line evidence. Include reviewed scope, named extra-read ledger, actual image paths, evidence limits, and out-of-scope observations separately. Do not assign a severity merely to satisfy a quota. Return a short verdict/counts/report-path handoff, then STOP. The controller alone decides fixes and the next task.
