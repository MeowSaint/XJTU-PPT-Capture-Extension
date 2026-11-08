# Learning Task 2 实现报告

状态：**DONE_WITH_CONCERNS**。Task2 实现、源码提交、所需检查和针对最终截图时机的补测已完成；本次原生下载交付未证项 L2 保留给控制器和独立审查，不宣称已解决或已通过整分支审查。

## 范围与来源

- 工作树：`/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/long-session-reliability`，分支 `fix/long-session-reliability`。
- 实际干净 BASE：`57ba0d498efb95c9edf82c92cfec182521b989d5`；直接产品来源为 Task1 `76405c483363e37d62a2c4bb08ab07ba50d1fe8f`。
- 唯一任务正文为本目录 `task-2-brief.md`；绑定规格为 `docs/superpowers/specs/2026-11-07-learning-review-design.md` §2–4、28–58 行。仅使用所指 Task1 报告 1–14 / 68–99 行与已完成 Media 审计 46 行、归档 Task2 报告 1–30 / 129–148 行作为接口交接；未扩大到完整计划、兄弟任务、其他工作树或控制器账本。
- 本轮只有一个实现者，没有子代理、fork、工作流或自建审查者。Task1 延后 Minor M1（changed 与 mean 的弱隔离控制）没有修补；未改比较核心、扫描器、媒体接入及其历史报告。
- 仅修改指定 11 个源文件：`capture.js`、`capture.html`、`style.css`、`library.js`、`page-store.js`、`tests/library.test.cjs`、`tests/library.cjs`、`tests/improvements.cjs`、`tests/memory.cjs`、`README.md`、`tests/README.md`。本报告为单独提交的唯一例外；证据位于忽略的 `.test-output/learning-task-2/`。没有额外直接消费者需要扩大范围。
- 保持 3.1.2、IDB v3、现有依赖和 PDF writer 字节协议；未做 Task3 版本同步、发行包、远程、主根目录或宿主操作。
- 已读并应用 ponytail full 的最小完整改动、共享边界、输入/错误边界和自审指导，模型调用禁用；中文文案按 humanizer-zh 保留事实和确定程度。固定获批规格优先于技能的新方案审批/委派建议。规则检索技能提到的专用工具未注册；限定范围的经验检索无匹配，没有据此扩展要求。

任务 brief 的六条全局约束原文如下；第六条属于后续版本任务，本轮遵守保留 3.1.2 的明确任务边界：

> 原生JS/MV3、Chrome114+/Node20+、现有运行时资源；不新增依赖、不安装浏览器/软件，不访问真实课程或凭据，不外传素材。
>
> 在隔离fix/long-session-reliability分支连续执行，保持之前两阶段已审查的目录/取消/命名/覆盖/媒体/报告接口、3.1.2三级PDF目录及有界图库、磁盘与逐图导出路径。
>
> IDB保持v3。旧页没有新字段视为保留；原JPEG/签名、裁剪、手动命名、断点不清空，签名仍192×108、缓存最多1000（82,944,000bytes）、缩略图读取并发≤2。
>
> 所有学习版排除由明确用户操作触发，可恢复；建议不是自动删除依据。保留现有永久删除/撤销和人工相似页对比；不能以学习版替代或破坏原始结果。
>
> 不承诺自动分清所有公式、视频、鼠标和投影噪声；未验证原录像/最低版本不能写成已通过。新鲜实现者串行、独立任务审查、最高模型末审。
>
> 最后同步manifest/package/lock/UI/README等当前版本引用到3.1.3并生成验证过的本地ZIP；不推送、打tag或远程发布。历史设计/审计的旧版本号保留历史事实。

## 实现与接口

### 原始页、图库和撤销

`pages` / `allPages` 仍是原始页。新页 `learningExcluded:false`，旧页缺字段按保留处理。图库 `learning-view` 的 all / kept / excluded 只决定可见卡片，切换清空选择，`Shift` 范围与全选仅使用可见页。导出范围 `export-view` 为 raw / learning，默认 raw，使用既有 settings 保存，独立于图库。

`PPTPageStore.learning(db, updates) -> Promise<oldFlags>` 接收 `[{id,excluded:boolean}]`。它仅打开一个 `pages` readwrite 事务，读当前记录后只改 `learningExcluded`，返回同形旧标记。缺页、put 异常、get 的同步无效 ID 异常均中止整笔事务；不访问 assets。UI 只在 complete 后发布标记和新 undo。失败保留旧页面、选择与永久删除 undo 的资产租约。旧删除与新标记 undo 互斥；成功替换时才释放旧删除资产，切换课次仍沿原有流程清空选择/撤销。原始 JPEG / 签名不改写。

图库仍增量复用节点、保留滚动，缩略图读取并发 2；新增页走原 append 路径，排除页视图则按当前过滤呈现。保留永久删除/撤销、原人工相似页比较、减少动态效果与既有 Stop。

### 内容复核

- `PPTLibrary.knowledgeEvidence(lesson,pages)` 从当前 lesson.source 推导 `sourceKey`；无 source 才回退 lesson.key / null。轨道使用既有 integrity 的当前来源推导，无法识别为 null。`sourceDuration` 仅接受有限正数，否则字段明确为 null。`pageIds` 记录整节原始页。
- `PPTLibrary.knowledgeState(lesson,pages)` 只认可 has-content / no-content，且 evidence 的 sourceKey / trackKey / sourceDuration / pageIds 四个自有字段齐全、与当前整节依据完全一致。ID 为集合匹配，不受顺序/排除/显示子集影响。
- 相同 URL 时长 3→6、同 batch job 换轨、新原始页或永久删页均使旧核验无效；已知签名参数续期且身份/时长/页集相同仍有效。不会使用旧 task.coverage 的来源或时长冒充当前依据。
- 内容选择是独立、明确的人工操作；lesson 写入成功才发布。新页已写而 lesson 保存失败后重开，仍按全量页集得到 unreviewed。
- `PPTLibrary.learningPages(pages,{view='raw',knowledgeReview='unreviewed'}={})` 按原顺序返回原对象；raw 保留全部，learning 排除标记页，或在有效 no-content 时跳过整节。调用者先用全量原始页求 knowledgeState，再过滤本次原始请求子集；所选导出不能绕过整节 no-content。

### 三类中性建议

仅有相邻近似、低变化、短时间多页三种。相邻要求同 timeline、尺寸相同且时间递增，调用共享 `PPTCore.similar`，不绕过 local-v1 的局部新增保护。低变化以未忽略像素 RGB 各通道算术均值为依据，至少 95% 像素三个通道与均值差均 ≤6。密集为同来源 15 秒内至少保存 8 页。

建议读取资产每批最多 32 条，处理一条后立刻置空该资产记录，只保留前一条用于相邻比较的签名；未创建额外无界签名缓存，原 1000 签名上限不变。显示页号、时间和原因；可对照两页或查看原图（包括被图库筛选隐藏的页）。单页预览使用当前建议的 fullraw 快照，不改图库或选择。勾选与最终确认分开；取消/重开均不保留勾选，也不自动排除或判定桌面、公式无效。

## 导出与公开 schema 映射

所有产品入口最终使用同一 learningRange → knowledgeState(fullraw) → learningPages(raw request) 过滤。课程三个入口保留原 producer 顺序：先 await 已发起的 namingSave / lessonSave，检查 active lesson owner 未变化，再同步冻结全部输入，之后才进入 writer / 报告读取。显式 courseKey / directoryPage 保留请求参数，只有 undefined 允许求默认，null 不回退新 active；命名与课次来自已提交 record，不以旧 form 覆盖。原始请求与整节 reviewPages、lesson/source/有效内容状态、view、courseKey、命名、原 ID、sourceTime 和顺序都在异步 writer 前固定。本节 / 所选入口则点击后先捕获请求与命名，再等保存；批量行使用该行明确 lesson。页面对象深拷贝，writer 开始后视图、选择、课次、命名、时间与顺序变化不能重写当次结果。

| 入口 | 原始请求 / 核验范围 | 输出与快照 |
| --- | --- | --- |
| 本节 PDF、图片 ZIP | 本节全部 raw / 同一整节 raw | `exportRetained` 冻结后过滤，单图读取/原 writer |
| 所选 PDF、图片 ZIP | 先选本节 raw 子集 / 仍用整节 raw | 相同冻结；有效整节 no-content 必须为空 |
| 当前课程整课 PDF、分课 PDF ZIP | `freezeCourse` 固定课程的每节 raw / 各节 fullraw | 相同 entries 用于 writer 与成功 receipt |
| 批量区域整课 PDF、分课 PDF ZIP | 明确批量课程与目录范围 / 各节 fullraw | 相同 freezeCourse；不回退当前课程 |
| 批量行 PDF | 行所属课次 raw / 同一课次 fullraw | `downloadPDF` 获得明确 lesson 后共享过滤并冻结 |
| 当前/批量 JSON 报告 | 与对应课程/目录相同的 frozen raw | 同一 integrity projection 加历史成功 receipt |

`PPTLibrary.integrity({...existingArgs,view='raw',reviewPages=pages})` 保留 schema version 1。`pages` 是本次筛选前请求；`reviewPages` 是完整核验快照。逐节 `savedPages` 是 fullraw 数，`rawCount` 是请求数，`exportedCount` 是实际输出数，`excludedCount` 是两者差，raw 为 0。新增有效 `knowledgeReview`、`comparisonVersion`（local-v1 / mixed / unknown），保留 `knowledge.state` 并投影有效状态。原 `export.lessons[].pages` 的 id / sourceTime 保留，增加从 1 起的 `exportIndex`；空输出课次仍在顶层 lessons，沿用原 export.lessons 仅列非空输出的 schema。

`knowledgeComplete` 需要至少一行且每一行有效核验；未扫描、无页、缺 lesson 的目录行没有证据时仍未审。原 `complete` 继续表示目录/物理覆盖，只有它与 knowledgeComplete 同时成立才可提示学习版完成核验。公开报告只投影来源/轨道别名与安全字段，不携带内部 evidence、raw source key、签名 URL、sourceName、notes 或凭据。

空学习版不会成功下载空 PDF / ZIP；相关入口禁用，直接调用也给出无页面提示。原始页与 raw 输出仍可用。receipt 只在 writer/原有下载调用成功后保存；不将该调用成功扩称为操作系统原生交付证明。

## 真正 RED、聚焦迭代及原始证据

每个前缀在 `.test-output/learning-task-2/` 下独立保留 `.command`（cwd / argv / env）、`.stdout`、`.stderr`、实际十进制 `.exit`、执行前后 11 个源文件 SHA-256/时间 `.before.json` / `.after.json`。01/02 的新 Node / browser 测试先于产品行为改动；历史源码由 BASE、这些当时的摘要及增量实现记录区分，没有将最终源码冒充 RED epoch。17 起另保存完整 `*.source-before/` / `*.source-after/` 字节快照。后续命令从不覆盖旧前缀。

| 前缀 | 命令（环境详见对应 .command） | 实际退出与发现 |
| --- | --- | --- |
| 01-node-red | `node --test tests/library.test.cjs` | 1；35 pass / 2 fail，`library.knowledgeState is not a function`、`undefined !== 2` |
| 02-browser-red | `PPT_TEST_FILTER='^learning ' node tests/library.cjs` | 1；`new reversible gallery controls exist`，`0 !== 1` |
| 03-node-iteration | 同 01 | 1；36 pass / 1 fail，旧精确映射尚未包含要求新增的 exportIndex |
| 04-browser-metadata | 聚焦 library 学习版 | 0；实际 IDB 回滚、排除/恢复/撤销/重开和完整 JPEG / signature 字节 |
| 05-browser-exports | 聚焦 library 学习版 | 1；新图片 ZIP 误用原中文 PDF 包的 UTF-8 文件名断言 |
| 06-browser-suggestions | 聚焦 improvements learning | 1；fixture 未接收 add 返回的 ID，release 计数 `0 !== 41` |
| 07-browser-exports | 聚焦 library 学习版 | 1；新 fixture 错将无内容课次要求留在原本只列非空输出的 export.lessons，`Cannot read properties of undefined (reading 'pages')` |
| 08-browser-suggestions | 聚焦 improvements learning | 0；三类建议、局部内容、阈值、取消/重开/确认/撤销 |
| 09-browser-memory | 聚焦 memory learning | 0；1001 资产、有界读取/释放/取消/可见选择/减少动态效果 |
| 10-browser-exports-visual | 聚焦 library 学习版 | 1；9 个 PDF/ZIP 和第一个 JSON 原生落盘后，第二个同名 JSON 等待 download 事件超时（L2） |
| 11-invalid-key-red | 聚焦 library metadata | 1；真实无效 ID 同步异常使前一页 flag 提交，`invalid ID cannot leave an earlier page flag committed` |
| 12-browser-visual | 聚焦 library controls | 0；正常/低高度/建议/空输出截图和键盘 |
| 13-browser-learning | 聚焦 library 学习版 | 1；无效 ID 修复后 metadata pass；下载串后的 raw 所选 PDF 无原生 download 事件（L2） |
| 14-browser-learning | 聚焦 library 学习版 | 0；全部 3 组，保留第二 JSON 的实际生产 Blob/dispatch 层验证；独立重开后 raw PDF 与冻结 PDF 原生落盘 |
| 15-hidden-preview-red | 聚焦 improvements neutral | 1；图库 kept 隐藏的原始页在建议中打不开预览，`false !== true` |
| 16-hidden-preview-green | 同 15 | 0；建议使用 fullraw 预览，不改图库/选择 |
| 17-final-node | `npm test` | 0；346/346，中间 epoch，后有 runtime 改动，最终采用 26 |
| 18-final-library | `npm run test:library` | 0；59 组，中间 epoch，后有 runtime 改动，最终采用 27 + 30 |
| 19-final-improvements | `npm run test:improvements` | 1；前 15 组 pass；旧 label `/本节全部.*3 页/` 与新 `原始全部 · 3 / 3 页` 不同 |
| 21-focused-legacy-exports | `PPT_TEST_FILTER='^(PDF defaults\|selected \|PDF preferences\|annotations \|merged \|batch course\|main )' node tests/improvements.cjs` | 1；前 7 组 pass，显式 null courseKey 被默认回退，原 missing-scope 断言真实检出回归 |
| 22-focused-legacy-exports | 同 21 | 1；前 11 组 pass，pending 真实 lesson put 后应为 `未命名课程-整课.pdf`，过早 freeze/form 覆盖给出旧名称 |
| 24-owner-guard-red | `PPT_TEST_FILTER='^(PDF defaults\|main course requests)' node tests/improvements.cjs` | 1；真实异步等待后 owner 变化仍创建 writer，`1 !== 0` |
| 25-focused-legacy-exports | 同 21 | 0；13 组，原 pending rename / 真实 put / fallback / byte / TOC 断言完整通过，新增 owner guard 通过 |
| 26-final-node | `npm test` | 0；346 tests / 346 pass / 0 fail / 0 skip，8395.427958ms |
| 27-final-library | `npm run test:library` | 0；59 组，输出 `library-P40SkJ`；随后仅视觉夹具增加两行等待，受影响视觉组采用 30 |
| 28-final-improvements | `npm run test:improvements` | 0；28 组，无外网请求；`canvas-wZV8id`、`task4-oqPjOx` |
| 29-final-memory | `npm run test:memory` | 0；16/16，0 browser errors；`memory-1794104189984/report.json` |
| 30-visual-paint | `PPT_TEST_FILTER='^learning controls' node tests/library.cjs` | 0；最终视觉夹具 1 组，四图 / 几何 / 键盘，`library-02zuYd` |

20-base-fixture 从实际 BASE 导出旧 improvements fixture；23-hook-provenance 从原始编辑记录导出最初 export fixture；27b/27c 保存/纠正工具失败审计（成功 replace-all 不能误列失败）；28b `git diff --check`、28c `git status --short`、31-final-source-audit、32 精确 stage、33 staged SHA/paths/check、34 SOURCE commit、35/36 provenance 命令均为实际 exit 0，逐个 quartet 也保留。它们不是额外 broad suite。

03 只给原精确断言添加 exportIndex，原 ID / 时间 / 顺序 / 隐私断言全留，控制器明确确认这是既有 Spec 54 的新增字段。05 将 ZIP helper 的中文成员约束设为默认 true，仅 ASCII 图片 ZIP 的新消费链关闭该额外断言；原中文 PDF 包断言不变。06 正确接收真实 API 的 ID。07 改为验证顶层 no-content 行的 savedPages / exportedCount / 状态与 export.lessons 非空成员，保持原 schema。没有删除业务断言来获得 GREEN。

11 的修复在单一 pages 事务内包住请求 enqueue 和回调同步异常，显式 abort；后续 13/14 通过实际存储前后比较证明整批回滚，不能只解释为 Promise reject。15 的修复仅让建议内单页查看使用当前建议 raw 快照；旧图库翻页规则不变。

非进程工具失败的原始 request/response 记录在 `tool-attempts.json` 与 `final-tool-attempts.json`：不存在 `core.js` 的内容检索、一次不存在旧串的 edit、证据 runner 一次匹配两处的 edit、一次 decompress 相对导出路径被解析到根目录而 ENOENT（改用本工作树绝对证据路径成功），以及最终清理检查的 memory 越界 read、报告文案替换误带引号的未匹配 edit。它们没有进程十进制退出码，未伪造为 shell quartet；均未产生产品改动，后两项用正确 offset / 旧串完成。早期压缩摘要另记录一次 old/new 相同的无差异 edit，本次未重获其原响应；不为它补造退出或称已有 raw 记录。

## 视觉与可访问操作

实际使用 read_image 查看了 12 的 `library-zs32dO/` 四图，并再次查看最终 27 的 normal / low 图。27 的 low 图底部出现重复 header 图块，不能仅凭 DOM geometry 宣称肉眼可见 Stop；原图未覆盖。只在既有视觉夹具 resize 后加入两次 requestAnimationFrame 与缩略图读结束等待（两行），运行 30，再实际 read_image 查看 `library-02zuYd/learning-normal-1440x900.png`、`learning-low-1440x720.png`、`learning-suggestions-low-1440x720.png`、`learning-empty-disabled-1440x900.png` 四张。30 的 low 图底部清楚显示 Stop，normal 两张原图已显示；未改产品/CSS、未据此归因浏览器或声称普遍截图问题已修复。

- 正常高度：raw / learning 与 all / kept / excluded 独立，长的 no-content 标签可读，排除卡片虚线与恢复按钮可见。
- 720 高度且展开批量：新增七个控件在视口内，原 Stop 在底部可见；图库继续使用既有滚动区域，部分卡片在下方。
- 建议模态：原因、页号、时间、对照/查看、取消与最终确认可见；未勾选时确认禁用，已排除页复选框禁用。取消有焦点，可 Esc 关闭。
- 空学习版：显示 0 / 2，所有相关 PDF / ZIP 禁用，原始两张卡片仍在。
- 实际键盘：选择控件空格、排除 Enter、Ctrl/Cmd+Z 撤销、建议 Enter / Esc；几何与状态结果存于同目录 `learning-visual.json`。

## 最终检查与自审

最终结果采用 26 Node **346/346**、27 full library **59 组**、28 improvements **28 组**、29 memory **16/16、0 browser errors**，全部 exit 0。17/18 是 runtime 修正前的中间成功，不用于无条件认证当前源码。实际 Node `v26.13.0`，Chromium `156.0.8078.4`，平台 darwin。

源 epoch 映射在 `final-source.json` 与 31 的实际断言：26/27/28/29 的 runtime、所有共享依赖、各自执行的测试与最终一致，唯一整体文件 SHA 差异是 `tests/library.cjs` 两行局部截图等待（该 fixture 不由 26/28/29 执行）。其旧 SHA 为 `7ee92bb8034aa45dffac9dfe13acc167f4210a35d1bd45f27769b81c4ec4081a`，最终为 `0e3e5d76d845d75ae6202f82ceaf30724c405580300763eb164425d9b0432128`。31 实际验证删除这两行后文件逐字等于 27 源副本；30 在最终文件执行受影响视觉组 exit 0。**准确表述是旧 full59 + 最终受影响 visual1**，没有声称最终全文件 SHA 上重跑 full59，也没有为了形式重复其余未变检查。最终 `capture.js` SHA-256 `635aac8436ac18c9934502a721baae69fada49d1eb6d17c037f3db5edb8ae47c`；其余 10 文件完整摘要在 final-source.json。

19 的旧显示断言以实际 BASE 导出的 `base-improvements.cjs:523` 为证，仅改为精确新 raw 标签并增加 raw 默认值断言，保留原 3 页、原图顺序、全量独立所选等业务断言。21/22 则是产品回归，未改原 missing scope / pending put / fallback 期望：仅 undefined 默认、raw 空提示保留旧语义；三个课程入口恢复先 await 保存再冻结，去掉 stale form 覆盖。控制器核实原 producer 顺序后确认该修复在既有合约内。24 新增真实 owner-change RED，25 通过；请求参数不在等待中重取，owner 变化在 writer 前拒绝。没有用删业务断言修夹具。

自审覆盖共享 helper / store / UI / 所有导出消费链与完整自身 diff。主动发现并用 RED→GREEN 修复了同步 IDB 异常部分提交和建议隐藏页无法查看两项。保留了原 PPTLibrary.bind 的原子 owner、commit 赢 Stop 的顺序、原始来源/candidate/manual/crop/task/coverage/receipt/native prepare-readiness 合约；没有把新设置写进 scanSettings。

合成测试检查实际 JPEG / 所有 signature bytes、原 ID/time→导出序号、三级 PDF TOC / 目的地、ZIP 成员内容、成功 receipt 的冻结、有效/陈旧 evidence、signed renewal、subset no-content、新页+lesson 写失败重开、UI/undo/lease 失败边界。1001 页测试读取上限 32、逐条释放、取消、原签名缓存不增长；堆断言仅是 JSHeapUsedSize，不等于总进程内存。

## 已知未证项与上游交接

- **L2，本轮下载交付观察**：10 的第二次连续同名 JSON 没收到 native download 事件，13 的同一下载串后 raw selected PDF 也未收到。页面成功文案/截图只证明调用流程；不能证明文件落盘，未确认产品或浏览器根因。14 保留首个 JSON 原生落盘，并截取第二按钮真正生产的 Blob 文本，同时调用原 downloadBlob，验证完整 projection、ID、计数、隐私与历史 receipt；该层只证明生成内容/dispatch。raw PDF 在独立重开路径实际落盘，不代表原串已恢复。所有失败与当时源摘要、顺序留存；没有改协议/命名规避，也未称 BASE 已复现、L2 已解决或与旧 L1 同因。
- L2 的 hook / 交付层级历史（从原始测试编辑记录核实，未补做 native 试验）：07 在第一项课程 receipt 的空 export row 假设断言处停止，尚未执行 JSON。07 / 10 原 fixture 的 `take` 是 `Promise.all([page.waitForEvent('download'), page.locator(button).click()])`，没有 Blob、anchor 或 download wrapper；10 的两次 JSON 都是 Playwright 真实按钮点击。10 之后才为第二 JSON 加入 `downloadBlob` wrapper：保存真正生产的 Blob/name，并用同参调用原函数，仍通过真实按钮点击，finally 还原；从未拦截 anchor click。13 的 raw selected PDF 在该 wrapper 已恢复后真实点击，后面的 writer mutation hook 尚未执行。14 的重开是**同一 page、同一 context 的 `page.reload()`**，没有新 page/context；重载后 raw selected PDF 实际落盘只是独立路径成功。最终 writer 冻结实验才通过 evaluate 调用课程导出，并在 writer hook 内改 view/lesson/name/order/time，不能把它描述为真实按钮交付。初始实际 fixture 导出在 `.test-output/learning-task-2/initial-learning-export-test.txt`，原始 turn 导出在 `history-export-test-hooks.txt`。
- **L1，上游旧限制**：已完成 Media 报告带入的旧 Acq JSON 原生超时是历史事实，不是本轮 L2 的归因证据。
- Task1 Minor M1 留给最高审查裁定，本轮不改。原始用户录像未提供，最低 Chrome114 / Node20 未实测，AAC 特殊原录像与语义正确性不作认证。本轮 synthetic / loopback 检查不能证明完整课程或所有公式内容。
- 尚未执行控制器后续新鲜 Spec / Quality / 最高审查；本报告只交付 Task2 实现与证据。

## 提交来源与资源清理

SOURCE 提交：`b133057b4d6784a3a6f9c1662f13d106b82b1b0f`，标题 `feat: add reversible learning views and content review evidence`，11 files changed / 727 insertions / 99 deletions。32 仅 stage 上述 11 文件；33 实际断言 staged path 集合完全相等、每个 staged blob SHA 与 final-source.json 相同且 diff --cached --check 通过；34/36 为实际 commit / 完整 hash 输出。

本报告将随后独立提交；报告不写自身提交 hash，避免自引用。外部最终消息提供 SOURCE 和 REPORT 的确切 hash；本报告内的最终检查对应 SOURCE 字节，报告提交只增加本报告。

所有 28 个 managed job 均已用 job_output 收取实际退出；最终 job_list 无 running。同步的取证、stage / hash / commit 命令均已直接取得实际退出，详见各 quartet；没有遗弃、重复启动或按进程名杀进程的 job。

| 前缀 | managed job ID | 实际退出 |
| --- | --- | --- |
| 01 | bash-6d971119f9ad4dc0 | 1 |
| 02 | bash-a6170fe07f46443d | 1 |
| 03 | bash-ac23aa9b4be5408c | 1 |
| 04 | bash-f0845047e7184efe | 0 |
| 05 | bash-2cdb893411694e06 | 1 |
| 06 | bash-94205f96c4084a4f | 1 |
| 07 | bash-d3aa9e4c5a634095 | 1 |
| 08 | bash-f814edba691f4094 | 0 |
| 09 | bash-023a7a29765b4d0d | 0 |
| 10 | bash-d176f13a8b964bb2 | 1 |
| 11 | bash-f722766a0a8b4c18 | 1 |
| 12 | bash-77111010f5ef419a | 0 |
| 13 | bash-5cb42ae859574bc1 | 1 |
| 14 | bash-99b84cf8cd0c4be6 | 0 |
| 15 | bash-9850b362722c4e31 | 1 |
| 16 | bash-a754c69293cb444f | 0 |
| 17 | bash-3cc197500e7d4215 | 0 |
| 18 | bash-e0a6c31c3c7048ec | 0 |
| 19 | bash-c59edfd353914876 | 1 |
| 21 | bash-9f87a2fe184e4d6c | 1 |
| 22 | bash-7491c81731454990 | 1 |
| 24 | bash-ea0b3222b7b04ae9 | 1 |
| 25 | bash-eb162b9e28b3437d | 0 |
| 26 | bash-829e4bc4a9a94a06 | 0 |
| 27 | bash-32907a67947540e4 | 0 |
| 28 | bash-1fea37a2d8674789 | 0 |
| 29 | bash-a49e075ab2244d3a | 0 |
| 30 | bash-066bffd5b89b4c98 | 0 |

使用现有隔离可执行文件 `/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`，没有下载/安装、访问真实学校或认证、日常浏览器/有声媒体或宿主 reload。浏览器套件串行，只用自己的 loopback 与 Playwright 临时上下文，没有 MCP 浏览器、独立 CDP 服务、watchdog 或额外守护任务需要移交。library finally 等待 task abort / releaseSource、context.close / browser.close / server.close（并 closeAllConnections）；improvements finally 关闭 browser/server；memory finally 关闭全部 context/browser/server，新 memory CDP 在自身 finally detach。失败命令也走这些 finally。全部测试自然退出并完成持久化断言；上下文销毁结束页面监听器、持久化请求、建议取消代次、图片/下载 URL、延迟清理计时器和 OPFS 会话租约。1000 页 ZIP 还实际验证 retention timer 释放文件；没有保留活跃 browser/context/server/job 供 DONE 后收尾。测试资产、数据库夹具与日志作为静态证据保留，不触碰日常资料或其他任务资源。
