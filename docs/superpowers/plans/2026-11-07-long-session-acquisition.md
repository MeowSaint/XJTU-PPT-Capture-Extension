# Long-session Acquisition and Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 课程读取失败不漏课次，命名不串日期，长录像可续扫，并用可导出的证据核对整课完整性。

**Architecture:** 复用 batch.js 管理有界 API 和目录读取，content.js 保存一个可查询/取消的读取会话，capture.js 消费增量快照。继续使用现有 IDB/OPFS 与流式 PDF；library.js 增加可选目录/覆盖元数据和纯报告函数。

**Tech Stack:** 原生 JavaScript、MV3、IndexedDB v3、OPFS、Node test、现有 Playwright/Sharp/pdf-lib 与本机 FFmpeg。

**Spec:** `docs/superpowers/specs/2026-11-07-long-session-acquisition-design.md`

## Global Constraints

- 保持原生 JavaScript / MV3、Chrome 114+、Node.js 20+，不新增运行时依赖，不安装依赖或浏览器。
- 不访问真实课程、凭据或日常浏览器资料，不上传课程资料，不修改域名授权和使用约定，不推送、发布或更新远程 main。
- 在隔离分支 fix/long-session-reliability 工作；主工作区保留已合并的 3.1.2，版本元数据暂保留 3.1.2。
- 保持 IndexedDB schema version 3；新元数据使用现有 settings/lesson 记录的可选字段，旧截图、手动命名、裁剪、忽略区和断点不得被清空。
- 图片、视频和导出继续走 IndexedDB / OPFS 流式路径；缩略图读取并发 ≤2，签名缓存最多 1000 个（82,944,000 bytes），不能因提高页数限制一并提高缓存预算。
- 保留 3.1.2 的课程域分离、逐图背压、三级 PDF 目录、原生取消、可见停止按钮、卡片复用和减少动态效果保护。
- 每任务由一个全新实现者串行实施，再由全新只读审查者给出规格和质量双结论；整体审查在本阶段末尾执行。

## Review Focus

- 首轮目录列举本身失败、部分分页或 next 跨域：保留旧目录并标未知；Task 1 测试。
- 取消发生在 JSON body/退避/最后一条详情完成之后：无幽灵重试或新课串入；Task 1 测试。
- 首次批量前刚手动改过上一节名称、旧日期同时存在：本次排课与既有手动命名分别保护；Task 2 测试。
- 达阈值时正处于成功页写入后、失败 checkpoint 前：只续安全边界，不能多算完成；Task 3 测试。
- 旧 done、局部重扫、零截图及导出中修改顺序：报告分别表达未知/部分/空/冻结快照；Task 4 测试。

---

### Task 1: 有界目录读取、全量占位与取消

**Files:** Modify `batch.js`, `content.js`, `capture.js`, `capture.html`, `library.js`, `style.css`, `package.json`, `tests/core.test.cjs`, `tests/library.test.cjs`, `tests/library.cjs`, `tests/bridge.cjs`; Create `tests/discovery.test.cjs`。只改这些文件及本任务报告；先 grep 直接调用者，若确需其他文件先报告控制器。

**Interfaces:**
- Produces `PPTBatch.requestJSON(path, {signal, fetchImpl=globalThis.fetch, timeoutMs=15000, retries=2, retryDelays=[500,1500]}={}) -> Promise<object>`，错误带 code/status/attempts，规则以 Spec §1 为准。
- Produces `PPTBatch.discover({page, readJSON, signal, previous=[], retryOnly=false, onProgress=()=>{}}) -> Promise<DiscoveryResult>`。readJSON(path,{signal})；onProgress(result) 同步/异步均须妥善处理，不允许静默丢失持久化失败。result 为 Spec §1 的目录，所有 jobs 有 discovery 字段，phase/计数可放 progress。
- Produces三个内容脚本消息：PPT_BATCH_DISCOVER / PPT_BATCH_STATUS / PPT_BATCH_CANCEL，消息与快照格式见 Spec §2。UI 每1000ms查询、消息10000ms期限；并发详情≤4。
- Extends `PPTLibrary.batch(db,page,jobs,discovery=undefined) -> Promise<void>`；未提供新参数时保留现有 discovery。PPTLibrary.put 的 relatedBatch 和内存 retainBatch 同样不能丢掉它。
- Existing job state/crop/source identity 保持；`PPTBatch.automatic(job)` 对无可用 URL 或 discovery 非 ready 的新占位返回 false，旧无 discovery 的 job 保持原兼容。
- Controller clarification: retryOnly不重新枚举排课，helper仅见previous jobs，故其complete=false；工具页保留前次持久化列举证据complete/total/eligible，仅更新详情结果/失败统计，不能把不完整或未知目录升级完整、也不能缩小已知远端总数。增加partial目录→retryOnly仍不完整与已知完整目录→retryOnly保留完整性的用例。

- [ ] **Step 1: 写失败测试**。tests/discovery.test.cjs 使用真实 batch.js/content.js 的内存夹具，固定以下断言；tests/library.cjs 增加可见错误/Stop/重试/迟到结果的端到端用例。

```js
assert.equal(result.jobs.length, 26); // 21成功，4项503，1项deadline
assert.equal(result.jobs.filter(j => j.discovery.state === 'error').length, 5);
assert.equal(retriedDetailIds.length, 5);
assert.equal(maxActiveDetails <= 4, true);
assert.equal(secondStart.requestId, firstStart.requestId);
assert.equal(cancelledFetches > 0, true);
assert.equal(restoredBatch.discovery.total, 26);
```

还覆盖成功 JSON body 挂起的 deadline、重试间取消、401/403/非JSON不重试、分页去重/循环/跨域拒绝/中页失败、最后一项完成与取消竞态、旧26条在失败刷新后保留、自动回查同页single-flight。测试使用短注入期限，不改变生产默认值，不用固定长 sleep。

- [ ] **Step 2: RED**。Run `node --test tests/discovery.test.cjs`，预期新接口不存在或旧行为断言失败；保留真实失败原因。
- [ ] **Step 3: 实现共享逻辑、消息和界面**。按接口和 Spec §1–2，加入“重试失败项”，Stop 可取消读取，显示所有行及逐项原因；保持课次进度、选择和裁剪。取消/刷新失败不删除已知记录。工作中不新增第二组实现代理。
- [ ] **Step 4: GREEN**。Run focused `node --test tests/discovery.test.cjs tests/core.test.cjs tests/library.test.cjs`，再顺序运行 `npm test`、`npm run test:bridge`、`npm run test:library`。用现有 tests/runtime.cjs / PPT_TEST_BROWSER 选择已安装隔离 Chromium，不下载安装；finally 关闭服务/浏览器并收取所有后台 job。修正合法的夹具协议消费，不弱化原业务断言。检查 syntax 和 `git diff --check`。
- [ ] **Step 5: 自审并提交**。提交消息 `fix: make course discovery bounded cancellable and lossless`。报告记录真实 RED/GREEN、修改文件、commit、未验证边界，不将本地夹具写成真实学校复验。

### Task 2: 课次日期来源与一致的课程上下文

**Files:** Modify `course.js`, `content.js`, `capture.js`, `tests/course.test.cjs`, `tests/discovery.test.cjs`, `tests/library.cjs`；必要的标签样式限 `style.css`，不改数据架构。

**Interfaces:**
- Consumes Task1 的 discovery 快照及 job.course；保留其协议和持久化字段。
- Produces `PPTCourse.forBinding(detected, displayed, {manual=false, sameSource=false}={}) -> normalizedCourse`。只有 sameSource && manual 的明确表单覆盖，其余只取 detected。
- Changes fromJSON/fromText/fromDocument 的课次时间语义，支持 my/study ID 过滤，保留 startParts 的上海时区规则；不把普通课程 start_time/coursedate/开课时间用作录制时间。
- bindLesson 新批量使用 job.course；已有 namingManual 保留，非手动可按同身份可靠排课纠正。acceptCourse/metadata 不让 DOM 或另一课旧 UI 盖掉权威时间。

- [ ] **Step 1: 写失败测试**。覆盖课程根开课时间、DOM唯一开课日期、明确capture/lesson字段、ID不匹配、两个课次、多层JSON及正确时区；浏览器真实首次绑定与重开，不仅测纯函数。

```js
assert.deepEqual(PPTCourse.fromText('课程名称：A\n开课时间：2026-09-14 00:00'), {name:'A'});
assert.deepEqual(PPTCourse.forBinding({name:'A',date:'2026-09-15',start:'16:40:00'}, {name:'A',date:'2026-09-14',start:'00:00:00'}), {name:'A',date:'2026-09-15',start:'16:40:00'});
assert.equal(savedFirstLesson.course.start, '16:40:00');
assert.equal(savedManualLesson.course.name, '我的手动名称');
```

还验证第一次批量前改过上一节表单不串入、本次未知日期保持空、刷新纠正自动旧日期但不改手动、两门课切换/恢复不串字段；批量已有时单来源零候选不再显示无范围的“还没找到视频”。

- [ ] **Step 2: RED**。Run `node --test tests/course.test.cjs tests/discovery.test.cjs`，预期新增日期语义/绑定断言失败。
- [ ] **Step 3: 实现解析和绑定保护**。按 Spec §3，界面课程选项优先识别名，批量运行/目录上下文覆盖笼统来源等待；不改学校标签标题，不覆盖旧手动命名。
- [ ] **Step 4: GREEN**。Run focused unit，再 `npm test`、`npm run test:bridge`、`npm run test:library` 顺序验证；不重跑其他同字节已过套件。记录首次真实绑定与持久化断言，syntax / diff check。
- [ ] **Step 5: 自审并提交**。提交消息 `fix: bind lesson times from matching recording metadata`，完整报告写到本任务 report。

### Task 3: 可调整页数保护与安全续扫

**Files:** Modify `capture.html`, `capture.js`, `library.js`, `tests/library.test.cjs`, `tests/library.cjs`, `tests/memory.cjs`。若改 render 抽取 helper，保留现有卡片 ID、选择、拖动和 lazy URL 生命周期。

**Interfaces:**
- Produces `PPTLibrary.pageLimit(value) -> integer`，100..20000 的整数值原样保留，其他返回5000。
- Global setting `captureLimits: {maxPages}`，独立于 scanSettings/task.settings；DOM id `page-limit`。提高预算不影响 canResume。
- Page/space protection errors carry `code: 'PAGE_LIMIT' | 'STORAGE_LOW'`；任务 state=paused，已写截图保留，批量项有明确部分/暂停原因。navigator.storage.estimate 缺失/失败不推断配额不足。STORAGE_LOW 是全局保护：立即停止该批，不再加载/缓存后续课次，最终提示保留原因；PAGE_LIMIT 为单课次保护，可继续其他课次。新增回归断言低空间之后没有下一节 load/download，且释放空间后未完成项可重启。实际 QuotaExceededError 同样阻止后续加载，并保持失败事务回滚/安全断点，不伪装已保存。
- Checks at scan start and every25 committed new pages，free<33554432 bytes 则下一页提交前暂停。签名缓存维持1000，thumbnail并发≤2。

- [ ] **Step 1: 写失败测试**。unit 验证边界、无效保存值；浏览器验证合法设置恢复、旧默认、保护时的安全页/checkpoint、改阈值继续、QuotaExceededError、estimate未知；2,000页夹具验证增量渲染与导出。

```js
assert.equal(PPTLibrary.pageLimit(undefined), 5000);
assert.equal(PPTLibrary.pageLimit(1388), 1388);
assert.equal(PPTLibrary.pageLimit(20001), 5000);
assert.equal(afterResume.pages, 1388);
assert.equal(afterResume.duplicateScanTimes, 0);
assert.equal(maximumSignatures, 1000);
```

页数保护不能要求清空截图。使用真实 save/IDB/scanner 端到端路径核对1,388到尾；长素材可由本机FFmpeg生成合成变化录像或有界scanner夹具，但不得直接赋done/截图数伪造完成。2,000页检查只一张JPEG在导出读取中、URL允许范围和旧节点/scroll保留。

- [ ] **Step 2: RED**。Run `node --test tests/library.test.cjs` 与新增 focused browser 用例，旧1000上限应阻断1,388或设置API不存在。
- [ ] **Step 3: 实现预算与增量保存呈现**。按 Spec §4；保护异常与普通错误区别处理，继续安全边界，不能改变签名预算或将所有JPEG载入内存。
- [ ] **Step 4: GREEN**。Run `npm test`、`npm run test:library`、`npm run test:memory` 顺序；已有1,000页恢复/复用测试保持语义，新增2,000检查。记录实际耗时/视口/读取峰值，不能把JS heap称RSS。syntax / diff check。
- [ ] **Step 5: 自审并提交**。提交消息 `fix: allow long lessons with resumable storage guards`，报告附页数、终点、断点和导出证据。

### Task 4: 覆盖证据与课程完整性报告

**Files:** Modify `scanner.js`, `library.js`, `capture.js`, `capture.html`, `tests/scanner.test.cjs`, `tests/library.test.cjs`, `tests/library.cjs`, `README.md`, `tests/README.md`。PDF/ZIP writer 保持不变；仅控制器增加冻结报告。

**Interfaces:**
- Consumes Task1 `{page,jobs,discovery?}`，Task3 paused保护、现有page/lesson模型。
- `PPTScanner.scan(options)` 保留 saved/unstable 并返回 `completedTo:number`，最后安全采样完成且checkpoint被await之后才返回。
- `task.coverage={version:1,sourceKey,trackKey,duration,ranges,reachedEnd}`；ranges用已有mergeRanges，只在安全提交后合并，来源/设置变更重开，旧任务不补造从0覆盖。
- Produces `PPTLibrary.integrity({batch,lessons,pages,exportedAt=null,format=null}) -> report`；schema version1，目录/扫描/知识核验/导出快照分别表达，字段至少覆盖 Spec §5；不写签名URL。
- UI ids `course-report` / `batch-course-report`：当前课程和批量课程独立作用域。lastExport 存 settings `courseExport:<courseKey>`；成功后保存该次snapshot，失败保留前一份。独立JSON下载，原格式不额外触发第二下载。

- [ ] **Step 1: 写失败测试**。scanner证明completedTo等于安全尾且失败/取消无成功返回；unit固定报告目录26、未完成1、旧done未知、零截图、待复核和已排除/未审知识默认；browser冻结命名/lesson保存再导出与迟到修改页序。

```js
assert.equal(report.version, 1);
assert.equal(report.lessons.find(x=>x.jobId==='unfinished').scan.reachedEnd, false);
assert.equal(report.lessons.find(x=>x.jobId==='legacy').scan.verified, false);
assert.equal(report.complete, false); // 26份文件不能覆盖未完成一节
assert.deepEqual(lastExport.pageIds, frozenPageOrder);
assert.equal(JSON.stringify(report).includes('access_token='), false);
```

还覆盖resume旧checkpoint>0而无前段证据、局部补扫不完成全节、不同轨道不拼范围、末尾尚有suspects、报告按钮课程A/B隔离、导出失败不写成功receipt。

- [ ] **Step 2: RED**。Run `node --test tests/scanner.test.cjs tests/library.test.cjs`，预期新增报告/覆盖接口未满足。
- [ ] **Step 3: 实现覆盖持久化、报告与提示**。按 Spec §5，保留现有部分结果导出，默认知识状态unreviewed；原目录/日期索引沿用3.1.2。更新实际使用说明，区分物理扫描、目录完整与知识内容核验。
- [ ] **Step 4: GREEN**。Run `npm test`、`npm run test:library`、`npm run test:improvements` 顺序；回归原异步命名、课程域与流式整课导出。syntax / diff check。实现者不代跑其他同字节已过套件。
- [ ] **Step 5: 自审并提交**。提交消息 `feat: report course discovery and scan coverage honestly`。本阶段后由控制器冻结整个阶段diff、最高模型整体审查、必要一次修复波次；通过后继续独立媒体计划。
