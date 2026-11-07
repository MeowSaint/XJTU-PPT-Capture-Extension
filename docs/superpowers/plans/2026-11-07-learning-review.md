# Conservative Learning Review and 3.1.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留细小知识增量，给出可恢复的学习版与内容核验，并在全部功能完成后交付版本一致的3.1.3本地安装包。

**Architecture:** 既有192×108签名增加局部变化保护；学习排除只写pages元数据、核验写lesson证据；所有导出入口共用纯过滤函数并冻结raw/learning快照。复用逐图PDF/ZIP与3.1.2课程目录。

**Tech Stack:** 原生JS/MV3、IDB v3、Node test、已有Playwright/Sharp/FFmpeg/pdf-lib/Poppler。

**Spec:** `docs/superpowers/specs/2026-11-07-learning-review-design.md`

## Global Constraints

- 原生JS/MV3、Chrome114+/Node20+、现有运行时资源；不新增依赖、不安装浏览器/软件，不访问真实课程或凭据，不外传素材。
- 在隔离fix/long-session-reliability分支连续执行，保持之前两阶段已审查的目录/取消/命名/覆盖/媒体/报告接口、3.1.2三级PDF目录及有界图库、磁盘与逐图导出路径。
- IDB保持v3。旧页没有新字段视为保留；原JPEG/签名、裁剪、手动命名、断点不清空，签名仍192×108、缓存最多1000（82,944,000bytes）、缩略图读取并发≤2。
- 所有学习版排除由明确用户操作触发，可恢复；建议不是自动删除依据。保留现有永久删除/撤销和人工相似页对比；不能以学习版替代或破坏原始结果。
- 不承诺自动分清所有公式、视频、鼠标和投影噪声；未验证原录像/最低版本不能写成已通过。新鲜实现者串行、独立任务审查、最高模型末审。
- 最后同步manifest/package/lock/UI/README等当前版本引用到3.1.3并生成验证过的本地ZIP；不推送、打tag或远程发布。历史设计/审计的旧版本号保留历史事实。

## Review Focus

- 全页相似但局部公式/彩色批注新增，必须在采集/去重前保留：Task1规范签名与实际扫描用例。
- 建议、取消、视图过滤不是删除，undo与原删除资产租约不能串：Task2实际IDB/重开/lease/事务失败用例。
- 新页已存但lesson写失败不能保留陈旧“已核验”：Task2证据集合不符回退测试。
- raw/learning、当前/批量、所选/全部与异步命名/导出快照不能串：Task2各入口PDF/image/ZIP及报告交叉测试。
- 版本的当前值与历史升级比较、lock依赖版本不能盲目全替换；ZIP须含新增资源：Task3真实打包/源字节/版本一致性测试。

---

### Task 1: 保护小区域公式和批注增量

**Files:** Modify `media.js`, `capture.js`, `tests/core.test.cjs`, `tests/scanner.test.cjs`, `tests/improvements.cjs`。保持签名尺寸/缓存和现有scanSettings，不先实现学习版UI。

**Interfaces:**
- Produces `PPTCore.hasLocalChange(a,b,mask=null) -> boolean`，规范192×108签名中任意一个未mask像素maxRGB通道差≥48即true；与frameDistance相同的每通道绝对值≤8偏置修正，mask含义同frameDistance第三参数。逐像素判断，删除无作用的窗口/stride/最小计数参数。
- Extends已有similar：全页双阈值通过且无局部变化才similar；旧其他尺寸保持原比较。多个调用共用已计算指标，不能复制偏置/像素循环或给全局去重另写一套判定。
- New scan task `comparisonVersion:'local-v1'`；续旧无版本/其他版本任务记'mixed'，保留原断点与图片；report新增字段由Task2消费。

- [ ] **Step 1: 写失败测试**。规范签名中单个未遮罩强差像素应使similar=false；48/47边界按扣除原有浮点偏置后的差值构造，边界夹具可用低于48的分散反向变化抵消均值。不能为迎合未经补偿的raw48断言而给偏置取整。覆盖图像角落/边缘、部分mask和完全位于mask内的单像素；mask为既有每像素标记数组。新增上下标/单数字等价小区域，以及48黑像素公式/8彩色批注；两帧相同、≤8均匀亮度、mask内动效仍similar=true。证明小增量在旧全页双阈值下通过。实际Canvas路径复用前置合成画面或等价fixture，断言页图/pixels/sourceTime，不能只保留大于8像素的测试。

```js
assert.equal(frameDistance(a,formula).changed < 1.2, true);
assert.equal(similar(a,formula), false);
assert.equal(similar(a,annotation), false);
assert.equal(similar(a,maskedMotion,1.2,mask), true);
assert.deepEqual(savedKnowledgeFrames, [baseTime,formulaTime,annotationTime]);
```

用真实scanner与frame/签名路径验证逐步公式保存，不只测新helper。A→B→A全局去重开/关、稳定确认、ignore区、人工相似页候选仍有覆盖；更新因业务改善而合法改变的断言时说明原因，不删除原知识保留断言。

- [ ] **Step 2: RED**。Run `node --test tests/core.test.cjs tests/scanner.test.cjs` 和新增improvements用例；预期旧similar吞小增量。
- [ ] **Step 3: 实现并自审**。不用OCR/高分辨率常驻图；局部保护只影响保守保留，不能承诺鼠标/视频语义识别。新版本记录不让已有可续任务失去断点。
- [ ] **Step 4: GREEN**。Run focused，再 `npm test`、`npm run test:improvements`、`npm run test:library`，有界签名/thumbnail和断点相关回归；syntax/diff check。完整套件仅最终一次，无新变化不重复。
- [ ] **Step 5: 自审并提交**。Commit `fix: retain local formula and annotation changes during capture`；报告真实RED/GREEN、含实际页图/时间证据和未验证原媒体范围。

### Task 2: 可恢复学习版、内容核验与导出映射

**Files:** Modify `capture.js`, `capture.html`, `style.css`, `library.js`, `page-store.js`, `tests/library.test.cjs`, `tests/library.cjs`, `tests/improvements.cjs`, `tests/memory.cjs`, `README.md`, `tests/README.md`。不改pdf writer字节协议；需要额外直接消费者时先报告控制器。

**Interfaces:**
- Produces `PPTLibrary.learningPages(pages,{view='raw',knowledgeReview='unreviewed'}={}) -> Page[]`，保持原顺序/对象、旧缺字段保留；knowledgeReview参数必须是先用本节全量原始页得到的knowledgeState有效结果，不能直接传lesson未验证字段。learning排除learningExcluded及effective no-content本节，raw保留全部；所选页先选raw范围再过滤，核验依据仍用全量。
- Produces `PPTLibrary.knowledgeState(lesson,pages) -> 'unreviewed'|'has-content'|'no-content'`，pages必须为本节全部原始页。只有Spec §2的knowledgeReviewEvidence四项sourceKey/trackKey/sourceDuration/pageIds与当前依据完全匹配才认可非unreviewed；source和track用当前来源推导，不用陈旧coverage值，有限正时长否则显式null，缺字段为未知。相同地址延长、相同batch job换通道需失效；已知签名参数续期且内容身份/时长/页集不变仍有效。
- Produces `PPTPageStore.learning(db,updates) -> Promise<oldFlags>`，updates为[{id,excluded:boolean}]，oldFlags同形；在同一个pages事务读取当前记录并仅改learningExcluded，找不到ID或写失败整体回滚；不读写assets。UI等commit后才改内存，oldFlags支持undo。
- Extends `PPTLibrary.integrity({...existingArgs,view='raw',reviewPages=pages})`：pages为本次请求raw范围，reviewPages是全量原始核验快照；各课次从reviewPages验证知识状态/统计原始savedPages，再过滤本次pages。原schema v1兼容增加rawCount/excludedCount/exportedCount、有效knowledgeReview/comparisonVersion、原ID/sourceTime→导出序号映射；excludedCount=rawCount-exportedCount，raw模式为0。新增knowledgeComplete，既有complete仍只表示目录/物理覆盖；学习版完整需两者均成立。保留公开字段投影/身份别名，不输出内部核验证据或原始URL。
- 页面metadata learningExcluded默认false；lesson知识字段/证据见Spec §2。新截图/实际来源变化使核验失效，旧无证据未知；mixed比较版本明确前段需核对。
- DOM IDs：learning-view(all/kept/excluded)、learning-exclude、learning-restore、learning-suggest、knowledge-review、export-view(raw/learning)。使用现有Stop和undo，最新操作undo类型互斥并正确释放原资产租约。
- 所有PDF/图片ZIP、本节/所选/整课PDF/分课ZIP入口调用共享过滤，冻结view、courseKey、命名、页ID/time/顺序后导出，成功才存receipt；raw是默认值。

- [ ] **Step 1: 写失败测试**。pure helper测旧页/排除/无知识/有效与陈旧四项证据/混合比较版本；同key同页集duration3→6、同batch job同duration换通道即使旧coverage未更新也unreviewed，重新明确核验可恢复，已知签名续期不误失效。全量3页核验后所选2页导出仍按全量证据处理no-content，所选与筛选子集不使核验自身失效。测试raw/learning计数及knowledgeComplete与原complete独立，未扫描/空页行无证据时不能被忽略。真实IDB测排除→重开→恢复/undo，事务故障无半更新/原图不变、切lesson清selection和undo lease。

```js
assert.equal(raw.length, originalPages.length);
assert.deepEqual(learning.map(p=>p.id), expectedKeptIds);
assert.deepEqual(restoredOriginalImageBytes, originalImageBytes);
assert.equal(knowledgeState(staleReviewedLesson,newPages), 'unreviewed');
assert.equal(afterCancel.excludedCount, before.excludedCount);
assert.deepEqual(exportedOriginalIds, frozenKeptIds);
assert.equal(report.lessons.find(l=>l.lessonId===partialId).scan.reachedEnd, false);
```

报告现有实际schema在Task4实现报告中确认；若字段名不同，保持语义并在report记录映射，不凭空另造重复状态。测试所有导出入口至少一条真实消费链：用pdf-lib检查页数/目录目的地，解压JPEG比对图/时间、报告ID映射；异步切换view/课次/命名不串包。无内容本节学习版跳过但raw仍在；新页已写且lesson写失败后重开也unreviewed。

- [ ] **Step 2: RED**。Run `node --test tests/library.test.cjs` 和新增library学习版用例，预期接口/保存/过滤缺失。建议标记/取消要证明不自动排除。
- [ ] **Step 3: 实现**。三类建议严格按Spec §3；32资产批次，随取随释放，max1000签名不变，画面没有语义置信度不宣告桌面/公式无效。视图全选只选可见，metadata事务成功后再更新UI。保留现有人工相似页比较/删除/撤销及减少动效保护。
- [ ] **Step 4: GREEN**。Run focused，再 `npm test`、`npm run test:library`、`npm run test:improvements`、`npm run test:memory`。本地合成逐步公式/视频密集组/低变化与亮度/ignore fixtures，不访问学校。至少查看新控件正常/低高度布局截图，检查标签/禁用状态与键盘操作；收取后台job/关闭浏览器服务。
- [ ] **Step 5: 自审并提交**。Commit `feat: add reversible learning views and content review evidence`；完整报告列出过滤入口/冻结映射/原图保全/旧库兼容/测试/视觉证据。

### Task 3: 统一3.1.3并生成可验证的本地安装包

**Files:** Modify `manifest.json`, `package.json`, `package-lock.json`, `capture.html`, `README.md`, `tests/README.md`, `scripts/release.cjs`, `tests/release.test.cjs`, `tests/features.cjs`, `tests/integration.cjs`, `tests/improvements.cjs`, `tests/library.cjs`, `tests/memory.cjs`, `tests/review.cjs`；Create `docs/superpowers/plans/2026-11-07-v3.1.3-validation.md`，仅记录实际最终证据。禁止把旧归档设计/审计中的3.1.1/3.1.2历史改成新版本。

**Interfaces:**
- Consumes所有已审功能、media模块明确打包资源、用户最终版本3.1.3。
- Produces current metadata=3.1.3；package-lock根version和packages[''].version同步，所有依赖版本/integrity不改。
- Extends release校验manifest/package/lock根及packages['']版本一致；更新release fixture helper生成最小lock，并测试任一不符拒绝。继续确定性ZIP、CRC/源字节、路径安全/旧包归档验证。
- 本地 `ppt-capture.zip`，所有文件按release精确清单，不包含测试、凭据、录播、PDF或SDD目录。最终报告记录bytes/assets/SHA256与源码commit，不发布/推送/tag。

- [ ] **Step 1: 写失败测试**。release测试断言目标3.1.3及lock不一致拒绝（历史版本比较样例原样）；features的current release mock和界面值同当前版本。原release fixture无lock先补匹配lock以保留旧安全测试意义，不能删/弱化原安全断言。
- [ ] **Step 2: RED**。Run `npm run test:release`，记录版本/lock校验缺失失败；不为纯文案写无意义新单测。
- [ ] **Step 3: 精确同步版本与当前说明**。先grep直接引用；版本标签/当前mock/当期报告路径更新到3.1.3，历史tag/升级排序输入保留。README覆盖目录错误重试/取消、页数与配额、视频轨适用范围、学习版与完整性证据、原文件未知限制；保留原使用/权限约定。
- [ ] **Step 4: 最终GREEN和打包**。顺序运行 `npm test`、`npm run test:release`、`npm run test:bridge`、`npm run test:integration`、`npm run test:review`、`npm run test:features`、`npm run test:memory`、`npm run test:library`、`npm run test:improvements`。只用已装PPT_TEST_BROWSER，不下载依赖/浏览器。修复因功能协议改变而过时的测试producer/consumer需要具体证据并守原业务断言；超出文件范围先报告。然后 `npm run release`，读取ZIP内manifest，逐资源核对CRC/源码字节，验证source/ZIP版本一致并计算SHA256。已有同代码测试可引用，但最终元数据影响的套件按本任务矩阵执行，不重复无新风险的成功运行。
- [ ] **Step 5: 自审并提交**。Commit `chore: prepare verified 3.1.3 local release`；validation文档明确当前HEAD测试与早先commits测试来源、环境/最低版本/真实课程未测范围，保存report。控制器随后执行c8aaafb..HEAD最高模型整体审查与规定修复波次，若源文件有修复则刷新受影响测试/包/hash/文档，最终保留隔离分支交付。
