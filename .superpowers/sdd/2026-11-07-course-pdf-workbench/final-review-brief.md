# 3.1.2 final whole-branch review

This brief is for a fresh read-only reviewer after all three task gates are complete. Do not dispatch or review an incomplete package. The controller supplies the actual final HEAD and the complete `ae75c719e5ec4660363b5e29098a22b8de466940..HEAD` package at dispatch. Use the highest available capable model then.

Read the named package once, plus this brief, the permanent audit, and the design/plan requirements where they are not already present in the package. Do not derive a second Git diff. Read additional source only for a concrete named producer/consumer risk; name the risk and exact range in your report. No Git mutations, source edits, test reruns, browser sessions, network, credentials, real course data, or subdelegation. Write only the report path supplied by the controller. Review supplied test evidence as claims and check what the implementation and assertions actually establish.

## Binding global constraints

- 保持 Chrome 114+、Node.js 20+；不改变 IndexedDB schema、使用约定、域名授权或真实任务的 busy/停止保护。
- 当前是原生 JavaScript / MV3 / IndexedDB / OPFS。保留这些结构；不迁移 React，不新增运行时依赖或云服务。
- 整课合并始终生成完整目录；现有 bookmarks 选项继续只控制单课、所选及分课 ZIP 的平级页码书签。旧导出字节不变。
- 生产路径每次读取/写完一张 JPEG 后再读下一张，保留原字节和背压；仅允许 O(页数+课次数) 元数据。
- 两种整课格式都等待 namingSave、lessonSave，再解析缺省课程键、快照标题和页序；显式 null 不回退当前课次。
- 保留每课 1000 页、缩略图读取并发 ≤2、IntersectionObserver root=#pages / rootMargin=200px、离开范围释放 URL、节点复用与 scrollTop。
- 业务处理器不 await 动画；不新增 animationBusy，不延迟授权点击、原生 modal 关闭或缺字段聚焦。减少动态效果同时覆盖 CSS 与 JS。
- 全部实现仅在隔离 feat/v3.1.2；不编辑原工作区、旧 worktree、真实课程数据或既有发布产物。浏览器只跑本地合成夹具，不使用浏览器资料目录或联网服务。
- 每次一个实现者，完成后由全新只读审查者检查 Spec 和 Quality；控制器不直接修源码。所有任务完成后整体审查并构建本地安装包；转录暂缓。

## Cross-task review focus

1. The new merged course writer has a recursively linked course/lesson/page outline with Unicode titles and correct physical page/row destinations. Odd handout lessons never share a sheet with the next lesson; labels and destinations share the same plan. Empty/unknown metadata and invalid times are handled explicitly. Existing single/selected/ZIP paths retain their bytes and original JPEGs.
2. Main current-lesson scope and explicit batch-list scope remain distinct through the redesigned layout. The complete export snapshot follows both pending save queues; a captured null never silently chooses a different course. Abort/read/write failures and OPFS cleanup remain honest. Real held IndexedDB transactions and decoded PDF JPEG/outline assertions substantiate the race and membership claims.
3. Source/import, start/crop/stop, saved batch rows, page review, and current/selected/course exports are visibly findable with meaningful labels and focus paths. In expanded RUNNING batch states, the unique enabled shared Stop must remain visible and hit-testable in its actual clipping context and viewport, with real cancellation/retained-result evidence; a collapsed/idle screenshot or a plain isVisible() check is insufficient. Preserve the Task2 review/fix history and the recorded priority ruling rather than assuming earlier green cases cover this state. Also inspect the integration-found I2 low-height1280x720 expanded-batch layout follow-up: the gallery must have bounded ordinary access to full cards without overflowing below the fixed bar, not be an18px strip or inflate to the1000-card list height. Check native drag starts on the intended first card and the original exact-order/new-page persistence assertions survive; closing the batch or moving a different card cannot substitute for this evidence. Moving settings preserves handlers, disabled-state semantics, consent, and permission gestures. On narrow displays the actual controls are usable without horizontal overflow; status, counts, and selected/current-course scope remain explicit.
The I2 follow-up also includes TWO previously authorized native test-input corrections, not product sort/crop changes: Ruling10 requires trusted intended first-ID dragstart after real source motion and BEFORE normal target scrolling, retaining the original width-4/y12 drop goal and exact order/new-page checks; Ruling11 plans real image25→75% points from PUBLIC video/client/raw/canvas/contain geometry, retaining original actual decode STRICT h360/width range and every later assertion. Public417x235/raw1280x720/contain417x234.5625 explains old-overlay half360.671→361; no private crop/output derives expected. A local old361 investigation-only guard was removed, actual360 stayed strict, final7b9 integration reran. Assess actual input/assertion correctness and preserved source boundaries, not an unsupported ban on all fixture changes. CurrentTask2 final source353085/report25bfd has fresh scoped approval after both rounds; final whole-branch compatibility remains this review's job.

4. Motion is presentation-only, interruptible, and immediately cancellable when reduce-motion changes. There is no business input lock or timeout dependency. Card identity, lazy root/margin, concurrency, URL lifetime, scroll position, and the 1000-page boundary remain intact; at most 12 visible new cards animate. Do not claim full keyboard reordering where none was implemented.
5. Version labels and current fixtures are 3.1.2; historical comparisons remain intentional. All runtime scripts, including motion.js before capture/workspace, are shipped in the 34-file allowlist and tested. CI adds the improvements suite. Distinguish current-source affected checks from earlier broad runs; do not describe staged evidence as nine suites repeated on the final SHA.

## Output and completion boundary

Return independent Spec Compliance and Quality verdicts. List each Critical/Important/Minor finding with file:line, reachable trigger, consequence, and minimal repair direction. Identify evidence limits and any focused extra reads. The controller supplies all deferred-minor/parked entries before dispatch; triage them without assuming earlier task approvals establish whole-branch compatibility.

Actual local ZIP creation and byte/CRC/hash verification occur after this source review; their absence during this gate is expected. External publication, ASR, real-course login, minimum-runtime execution, and manual PDF-reader behavior must not be invented as tested. If this review yields findings, the controller allows one combined final repair dispatch and one fresh scoped review, then adjudicates residuals under the skill rules.
