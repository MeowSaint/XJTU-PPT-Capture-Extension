# Task 5 实施报告：3.1.1 元数据、使用说明与完整回归

状态：**DONE，等待 Task5 独立审查**。3.1.1 元数据、使用说明和严格测试适配已完成。两次 integration 发现的产品缺陷均由原 Task1/Task3 拥有者修复并获新独立批准，当前没有未解决的 integration 阻塞。最终 integration 完整通过，包含真实复选框操作、精确课次数据隔离、页面错误/外部请求检查和 3/3 PDF 像素检查；最终 library 22/22 通过。下文区分首次八个通过结果、Run 修复后 improvements 20/20，以及渲染修复后 integration/library 的结果，不声称九套均在最终源码 SHA 上重跑。父任务仍负责本任务审查、全分支审查和本地打包交付。

## 范围与实现

工作目录和基线：

```text
/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1
branch: fix/v3.1.1
BASE: 25758e1092ce1aafa25da0e1f3c38a314a2955ba
original main: 40c02bb（未操作）
```

依据 Task5 brief、批准的全局计划及 61 行设计实施。Task1–4 在本任务前已独立批准；首次串行表的计数均为本任务执行结果，没有混入历史 Task1–4 记录。恢复阶段则明确区分自己新跑的 integration 与复用的原拥有者修复后证据，不声称重新执行九套。使用 ponytail full 控制修改范围，并以 humanizer-zh 校正新增中文说明。未委派、未使用真实课程或日常浏览器资料、未访问外网、未变更运行时依赖，未执行项目根目录的打包、发布或远程 Git 操作。

- 将 manifest、package、lockfile 两个根版本字段、界面两处版本标签和 README 当前版本统一为 `3.1.1`。lockfile 已与基线逐项比较，除这两个版本字段外完全一致。
- 更新 features 的“当前版本”响应、界面断言和报告标签，以及 integration 的当前发布响应、review/library 的当前产物目录；保留 `3.10.0`、预发布和其他有意比较旧版本的 fixture。
- 增加 `test:improvements` 脚本，补齐浏览器测试前提、自定义浏览器/依赖路径、串行顺序和本地合成验证的边界。
- README 说明 0.5 秒精细采样的耗时与漏页边界、旧 2/8 秒设置保留、单个比较忽略区与原始截图保留、逐对相似页决策/取消/一次撤销、Shift 连选/取消、预览 S/V 与导航、单条待复核确认、历史删除确认和大小估算、逐条读取旧素材、同机位 0 路裁剪复用与实际比例/轨道检查、所选导出页序、普通导出保留全部、默认关闭的时间/书签和讲义布局、批量 ZIP 的显示课程范围。
- 父任务在初次 integration 失败后明确扩展白名单，允许仅将四处旧 `cropEditing` 探针适配为 `selectionMode`：需要框选时严格比较 `'crop'`，已确认时严格比较 `null`。其余裁剪确认、换轨、断点、重载和图片保留断言原样保留；已允许套件内未发现其他同名旧探针。

## 最终证据汇总

本次仅整合报告，启动前核实干净 HEAD 为 `6811f444abd9b8d30dcf307adf48aef96a029322`。完整读取原 Task3 拥有者的 [修复报告](task-3-integration-followup-report.md) 和 [独立复核](task-3-integration-followup-review.md)，采用其中已收取的执行结果；没有重跑测试、浏览器、语法检查或修改源码、测试、元数据。父任务确认这些结果之后源码和测试均未改变。

| 阶段 | 精确生产源码提交/上下文 | 本次采用的证据 |
| --- | --- | --- |
| A：首次 Task5 | 生产源码沿用 Task5 BASE `25758e1092ce1aafa25da0e1f3c38a314a2955ba`；同时运行已准备好的 3.1.1 元数据和当前版本 fixture | 本任务八个其他套件通过；integration 的历史失败保留在后文 |
| B：Run 修复后 | `a3f1ee080b3d0a5b6344fb0961ee89c4133b6ce9`，仅使裁剪保护保持已有 crop 状态；新独立审查 Approved，C0/I0/M0 | 原 Task1 拥有者 improvements 20/20；其 integration 越过裁剪回归，后在旧清空预期超时；本任务后续严格 fixture 又发现复选框顺序缺陷 |
| C：渲染修复后，最终相关验证 | `f628ec3e6abbd7d522452e86f6f817709b5ac561`；原 Task3 拥有者将每行唯一一次同步调用移到派生控件状态之前，1 行新增/1 行删除；测试不变 | integration 完整 exit 0；library 22/22、exit 0。报告提交 `2c34c4f8103b6b69423e9fd7c1e09049e816dc4c`；新独立复核 Approved，原问题 ADDRESSED、新 C0/I0/M0、无范围外发现；父任务闭环提交为本次 HEAD `6811f444abd9b8d30dcf307adf48aef96a029322` |

九个套件当前采用的通过记录如下。A/B/C 是上表的源码阶段；库和 integration 的最终记录覆盖了较早记录。日志路径以工作目录为根，缩写的产物子目录均位于 `.test-output/v3.1.1/`。

| 套件 | 采用结果/退出码 | 阶段、执行归属 | 日志与结构产物 |
| --- | --- | --- | --- |
| `npm test` | 207/207，0 | A，本任务 | `.test-output/v3.1.1/task5-npm-test.log` |
| `npm run test:release` | 17/17，0；临时 fixture 验证 32 个成员 | A，本任务 | `.test-output/v3.1.1/task5-test-release.log` |
| `npm run test:bridge` | 3 种 iframe 来源及 2 种课程地址 fallback，0 | A，本任务 | `.test-output/v3.1.1/task5-test-bridge.log` |
| `test:integration`（`node tests/integration.cjs`） | 完整流程，0；不虚构组数 | C，原 Task3 拥有者 | `.test-output/v3.1.1/task3-followup-integration.log`；`task3-followup-integration/` |
| `npm run test:review` | 13/13，0 | A，本任务 | `.test-output/v3.1.1/task5-test-review.log`；`review-uHff8A/results.json` |
| `npm run test:features` | 11/11，0；复制资源前后哈希相同 | A，本任务 | `.test-output/v3.1.1/task5-test-features.log`；`features-oxDV1U/results.json` |
| `npm run test:memory` | 14/14，0 | A，本任务 | `.test-output/v3.1.1/task5-test-memory.log`；`.test-output/memory-1793970038054/report.json` |
| `test:library`（`node tests/library.cjs`） | 22/22，0；页面错误 0、非本地请求 `[]` | C，原 Task3 拥有者 | `.test-output/v3.1.1/task3-followup-library.log`；`library-PvEAYX/results.json` |
| `test:improvements`（`node tests/improvements.cjs`） | 20/20，0；无外部请求 | B，原 Task1 拥有者 | `.test-output/v3.1.1/task1-followup-improvements.log`；`task4-DgxRYO/` |

最终两个浏览器命令逐条执行；原拥有者先收取 integration 退出 0，再启动 library。两次之间及之后没有源码/测试改动。原报告所列精确命令为：

```sh
set -o pipefail
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/integration.cjs 2>&1 | tee .test-output/v3.1.1/task3-followup-integration.log
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/library.cjs 2>&1 | tee .test-output/v3.1.1/task3-followup-library.log
```

最终 integration job `bash-927707ce6a99405a`、library job `bash-9d4e0e49f1e84762` 均已由原拥有者收取，exit 0。本轮报告整合没有启动新作业。本任务此前启动的所有作业也已收取。

integration 在原有裁剪保护、实际拖动、持久化/立即重载、续签、断点、换轨、完整画面和提取场景后，通过清空课次仍保留已确认 crop/override、pending/selected、task/suspects 重置和 `[4,4,0]` 检查；严格 DOM checked=true 后，真实 uncheck 使模型 false，队列禁用、原生 A/B 不重复排队，A 单独清空并重跑后恢复 `[4,4,0]`，其他课次原字节和顺序保持完全相同。没有额外 render、check→uncheck、派发事件或等待绕行。

该运行到达第 544 行最终断言，页面脚本错误为 0、意外外部请求为 `[]`，随后完成全部 3/3 Poppler 检查：每页 1280×720，按源页顺序比较，平均绝对像素差均小于 4。没有记录每页具体差值，因此不补写数值。末尾日志为：

```text
JSON-only discovery, local import, stop, cropping, isolated lesson clear, batch rerun and HTTP error preservation: passed; browser errors: 0
PDF render: all 3 retained pages correct aspect ratio, order, and visual content
```

最终 library 还覆盖删除/引用隔离、裁剪复用与实际加载拒绝、所属批次独立持久化和最后准备步骤失败后的保护。当前没有已知未解决的范围内实质问题；本次 DONE 仍须由父任务安排 Task5 独立审查，随后作全分支审查及本地包验证。

## 恢复后的验证与第二个阻塞（已闭环历史）

恢复基线：`38334bea57e9e78fb19c948ba1858418e658efa7`，已核实分支和干净工作树。首次任务基线仍为 `25758e1092ce1aafa25da0e1f3c38a314a2955ba`，用于父任务完整 Task5 审核，不把恢复基线误当作全任务起点。

父任务要求先读原拥有者的 follow-up report/review 和更新后的 21 行 brief。源码修复提交 `a3f1ee080b3d0a5b6344fb0961ee89c4133b6ce9` 仅在 Run 保护中增加 `selectionMode !== 'crop'` 条件，使重复保护点击保留已有裁剪。新独立复核批准，Critical/Important/Minor 均为 0。本任务没有修改生产源码。

| 验证阶段 | 证据与结果 | 复用边界 |
| --- | --- | --- |
| 首次 Task5、源码修复前 | 下文九条串行命令中的八个其他套件通过，integration 失败 | 历史记录，不声称修复后重跑了九套 |
| Task1 源码修复后、原拥有者执行 | `task1-followup-integration.log`：裁剪保护、真实拖动、持久化、重载、续签、断点、换轨、完整画面与提取通过，旧清空预期第 517 行超时；`task1-followup-improvements.log`：20/20、exit 0 | 采用拥有者已收取的执行结果；job 为 `bash-6090b6ac8f7a4fd7` / `bash-683e365ad21848d2`，未由本任务重复执行；导出产物 `task4-DgxRYO/` |
| Task5 恢复、按新 brief 适配清空 fixture 后 | `npm run test:integration`，job `bash-7dd65de3ae0041aa`，exit 1，完整日志 `task5-test-integration-final.log` | 已收取最终状态；无其他套件重跑或生产源码修改 |

上述新日志和导出产物的根目录都是 `.test-output/v3.1.1/`。本次恢复运行的精确命令如下；运行前 `node --check tests/integration.cjs` 与 `git diff --check` 均通过：

```sh
set -o pipefail
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:integration 2>&1 | tee .test-output/v3.1.1/task5-test-integration-final.log
```

原拥有者后续报告、父任务和新复核人已独立裁定：清空事务仅移除页面并重置 task/suspects，保留已确认裁剪和 override；`PPTBatch.automatic(job)` 允许未被拒绝的已确认 0 路裁剪自动排队。因此旧的 `needs-crop` 及无队列假设过时。本次窄适配严格验证裁剪/override 原值、确认、未拒绝、pending/selected、task=null、suspects=[]，保留 `[4,4,0]` 及其他课次原字节和顺序断言；随后仅通过该课次的真实 checkbox 取消勾选，再保留原 A 单独清空和重跑检查。未跳过场景或修改产品来满足 fixture。

恢复运行已通过原裁剪保护/真实拖动及上述清空保持断言；在 `tests/integration.cjs:528` 的新增真实取消勾选检查失败：

```text
AssertionError [ERR_ASSERTION]: only the cleared 0-only lesson is explicitly deselected
true !== false
```

只读检查定位到界面与模型失配的顺序：`capture.js:1358` 先用旧 `job.selected` 设置 checkbox.checked；`capture.js:1362` 才调用 `syncBatchJob(job)`，其第 1348 行把已清空的完成课次改为 pending/selected=true。controls 第 681–683 行仅刷新 disabled，不刷新 checked。原先未选中的手工 0 路课次因而显示未勾选，而模型已选中；Playwright 的真实 `uncheck()` 对已未勾选控件不会发送 change，随后严格模型断言仍为 true。这一 DOM 状态没有另作运行时快照；证据是已通过的严格模型状态、实际 checkbox 操作后的失败以及同步源码顺序。onchange 第 1359 行同步更新模型，不是等待持久化的问题。

父任务独立读过这一顺序，接受为具体产品缺陷，要求交回原 Task3 拥有者修复。按明确授权，在原真实 uncheck 前增加 `assert.equal(await fallbackRow.locator('input[type="checkbox"]').isChecked(), true, ...)`，直接保护用户可见勾选状态；其后的真实取消勾选、模型 false、原生 A/B 已完成、无队列、A 单独重跑和精确其他课次数据断言均保留。第二次阻塞交接时该新增 DOM 断言尚未执行；父任务明确不重复运行 RED，已有实际操作失败和源码顺序足以交接。之后它在阶段 C 的完整 integration 中执行并通过。测试没有 check→uncheck、强制派发事件、额外 render、等待或全选切换绕行；此前失败运行没有被改写成完整通过。

恢复测试提交：`208561cfc7e4152a0110cfc30e6e6bb66e41a42c`（`test: cover confirmed crop queue selection after clear`），仅 `tests/integration.cjs`，13 行新增、2 行删除。当时最终 `node --check tests/integration.cjs` 与 `git diff --check` 均 exit 0。第二次 BLOCKED 报告单独提交为 `fc8039e9394e2e4183d4938e5d7ff2f3fa6c176d`，随后停止修改，交由原 Task3 拥有者完成上文阶段 C 的修复、验证及新独立审核。本次按父任务授权复用这些未被后续源码/测试修改影响的证据，不重复九套。

## 实际验证环境

```text
Node.js: v26.13.0 (darwin / arm64)
Playwright: 1.62.1
Sharp: 0.35.4
pdf-lib: 1.17.1
Google Chrome for Testing: 156.0.8078.4 (chromium-1248)
PPT_TEST_BROWSER=/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
ffmpeg: /opt/homebrew/bin/ffmpeg, 9.0.2
pdftoppm: /opt/homebrew/bin/pdftoppm, 26.10.0
```

使用已有父目录 node_modules，未安装或下载任何内容。默认 Chromium 1234 缺失；每个浏览器命令均显式设置上面的同一个 `PPT_TEST_BROWSER`。套件只使用合成数据、隔离上下文或测试临时扩展配置及本地/拦截响应，不使用 Brave MCP 或专用/日常用户资料。

## 首次串行回归（源码修复前）

每条命令均通过 `set -o pipefail` 与 `tee` 捕获完整日志；下表命令前的浏览器环境变量与上文完全一致。输出根目录为当前工作目录。

| 顺序 | 命令 | 本次结果 | 退出码 | 完整日志/主要证据 |
| --- | --- | --- | --- | --- |
| 1 | `npm test` | 207/207 | 0 | `.test-output/v3.1.1/task5-npm-test.log` |
| 2 | `npm run test:release` | 17/17，32 个成员的临时目录打包测试 | 0 | `.test-output/v3.1.1/task5-test-release.log` |
| 3 | `npm run test:bridge` | 3 种 iframe 来源场景及 2 种课程地址 fallback | 0 | `.test-output/v3.1.1/task5-test-bridge.log` |
| 4 | `npm run test:integration` | 初次在旧裁剪探针失败；细节见下节 | 1 | `.test-output/v3.1.1/task5-test-integration.log` |
| 5 | `npm run test:review` | 13/13 组 | 0 | `.test-output/v3.1.1/task5-test-review.log`；`review-uHff8A/results.json` |
| 6 | `npm run test:features` | 11/11 组，full feature suite，运行前后复制资源哈希一致 | 0 | `.test-output/v3.1.1/task5-test-features.log`；`features-oxDV1U/results.json` |
| 7 | `npm run test:memory` | 14/14 组 | 0 | `.test-output/v3.1.1/task5-test-memory.log`；`.test-output/memory-1793970038054/report.json` |
| 8 | `npm run test:library` | 22/22 组 | 0 | `.test-output/v3.1.1/task5-test-library.log`；`library-KmnVO1/results.json` |
| 9 | `npm run test:improvements` | 20/20 组 | 0 | `.test-output/v3.1.1/task5-test-improvements.log`；`.test-output/v3.1.1/task4-mHgekz/` |
| 10 | `npm run test:integration` | 修正四处探针后在持久化确认断言失败 | 1 | `.test-output/v3.1.1/task5-test-integration-corrected.log` |
| 11 | `npm run test:integration` | 父任务授权的状态/几何诊断，确认真实扫描保护缺陷 | 1 | `.test-output/v3.1.1/task5-test-integration-diagnostic.log`；`task5-integration-crop-diagnostic.json` |

review/features/library 的证据子目录和诊断 JSON 均位于 `.test-output/v3.1.1/`。release 测试只在临时 fixture 内验证打包脚本，没有生成本次待交付 release ZIP。

所有后台作业均已用 job_output 收取最终状态，没有遗留作业；下列退出码对应上表顺序：

```text
1  bash-d03786f4826048ac  exit 0
2  bash-ece160b8be8d4097  exit 0
3  bash-69a4fe1098e94abf  exit 0
4  bash-86241c0b51734c27  exit 1
5  bash-5d9003261c8a47f5  exit 0
6  bash-22bd0040e77b4c85  exit 0
7  bash-0f68acf0871f4071  exit 0
8  bash-03095a52b6bb458f  exit 0
9  bash-9159620ef9c24862  exit 0
10 bash-5ff46d083cea4d36  exit 1
11 bash-18ff9d7a102c4408  exit 1
```

bridge 断言无页面错误；review、features、library 断言无页面错误且无意外外部请求。memory 记录 0 浏览器错误并阻止非本地请求，但没有外部请求次数为零的统计断言。improvements 断言没有外部请求；其页面错误断言只覆盖第二个导出上下文，不能扩大成整个套件的全局页面错误保证。表中历史 integration 失败运行没有到达末尾的页面错误/外部请求断言或 PDF 像素复核；阶段 C 最终成功运行已到达并通过，分别陈述。

memory 实测缩略图最大并发读取为 2，1000 页签名缓存按 32 页分批读取，释放 82,944,000 字节；256 MiB 合成流的采样 JS 堆增量为 51,544 字节。这些值反映此次 JavaScript 堆与缓存行为，不代表浏览器进程 RSS 或真实课程的固定占用。

## 首次失败、裁定与修正（历史）

第一次 integration 到达 MP4/HLS/本地提取与自动批量完成后，在原第 426 行等待已移除的变量时终止：

```text
page.waitForFunction: ReferenceError: cropEditing is not defined
at main (.../tests/integration.cjs:426:16)
```

已向父任务报告；父任务确认其为 Task1 界面状态更名后的旧测试探针，更新 brief 并授权上述四处严格适配。

第二次运行越过该探针，但在原第 433 行失败：

```text
AssertionError [ERR_ASSERTION]: drawing a crop persists confirmation before any scan or later write
false !== true
```

父任务授权仅在 integration 内记录边界诊断，第三次运行保留了相同失败。完整状态见忽略目录下的 `task5-integration-crop-diagnostic.json`，这次明确排除了裁剪矩形不在视口和异步保存尚未结束两种推测：

| 状态 | 点击扫描保护前 | 点击保护后、拖动前 | 拖动后 |
| --- | --- | --- | --- |
| selectionMode | `'crop'` | `null` | `null` |
| overlay pointer-events | `auto` | `none` | `none` |
| sourceReady / busy / reviewBusy | true / false / false | true / false / false | true / false / false |
| 活动 job / cropConfirmed | batch-c / false | batch-c / false | batch-c / false |
| 持久化 cropConfirmed | false | false | false |
| 两个预期指针落点 | 尚未拖动 | 实际命中 `video` | 实际命中 `video` |

overlay 始终完整可见，矩形为 x=264、y=132.5、width=496、height=279，视口为 1280×720，无页面滚动。预期指针坐标为 (363.2, 188.3) 与 (660.8, 355.70000000000005)。点击前提示“本节只有 0 路视频。请在预览中框选 PPT 区域，再点击‘开始快速提取’”；点击后提示“请先在 0 路视频画面中框选 PPT 区域；PPT 已占满画面时，点击‘使用完整画面’即可”，但选择层已失效，画面裁剪仍为完整范围。

根因位于未修改的生产源码：`capture.js:1545–1550` 的 `#run` 保护在缺少确认时无条件调用 `startSelection('crop')`；`capture.js:836–845` 的同模式切换逻辑 `if (selectionMode === mode) cancelSelection();` 会取消已经由 0 路加载打开的选择状态。后续指针因 `pointer-events: none` 命中视频，根本没有进入裁剪提交，不是等待保存的问题。

父任务确认这是 Task1 的可达产品缺陷，要求交回原拥有者。按授权保留了一条紧邻扫描保护的窄回归断言：`selectionMode` 必须严格为 `'crop'`；原有持久化、立即重载、换轨、断点和图片字节断言全部保留。临时诊断代码已从最终测试 diff 移除，忽略目录的 JSON 与三次失败日志保留。未添加等待、滚动或重新激活框选的测试绕行，也未修改生产源码。新增窄断言未另跑一次，第三次诊断已经记录了它要求的状态实际为 `null`；父任务已要求停止重复运行并交接。

一次环境探测尝试通过 `require('sharp/package.json')` 读取版本，因包 exports 限制抛出 `ERR_PACKAGE_PATH_NOT_EXPORTED`；改用公开的 `require('sharp').versions.sharp` 后成功，非测试/产品失败。版本、lockfile 元数据一致性、目标 JavaScript 语法及 `git diff --check` 均通过。后续测试适配已做对应语法和空白检查，原 Task3 拥有者也检查其源码修复；本轮只改报告，按授权不重复检查未改动的代码。

## 供父任务复核的现成证据

以下都是已运行套件的现成截图，未另开浏览器补拍。桌面 1440 和较小 1280 布局来自首次 review/features；integration 界面及 PDF 像素图采用阶段 C 成功运行后保存的副本，已由原拥有者从本次成功输出复制保存，避免后续 fixture 覆盖。父任务已读取成功界面图；本轮未新增图像检查。

```text
.test-output/v3.1.1/review-uHff8A/desktop-1440x900.png
.test-output/v3.1.1/review-uHff8A/desktop-1280x800.png
.test-output/v3.1.1/review-uHff8A/first-layout-1440.png
.test-output/v3.1.1/features-oxDV1U/normal-1440x900.png
.test-output/v3.1.1/features-oxDV1U/normal-1280x800.png
.test-output/v3.1.1/features-oxDV1U/terms-1440x900.png
.test-output/v3.1.1/features-oxDV1U/update-1440x900.png
.test-output/v3.1.1/task3-followup-integration/verified-interface.png
.test-output/v3.1.1/task3-followup-integration/slides-test.pdf
.test-output/v3.1.1/task3-followup-integration/pdf-page-1.png
.test-output/v3.1.1/task3-followup-integration/pdf-page-2.png
.test-output/v3.1.1/task3-followup-integration/pdf-page-3.png
```

导出证据目录包含 default-all、selected-one、selected-many、annotated-single、annotated-handout、annotated-selected、snapshot 等 PDF，以及 JPEG ZIP、course-A、batch-course-B 和 renamed-local-course 等课程 ZIP；覆盖页序、图片字节、PDF 结构、讲义/书签及异步快照。

## 首次提交、自查与交接边界

实现提交：`e5029ebad6cf6632838c395d8e697880ff3397be`（`chore: prepare v3.1.1 metadata and usage docs`），包含 10 个白名单文件，66 行新增、33 行删除。按父任务的阻塞交接要求先提交已完成部分及严格回归探针；这是 BLOCKED 交接，不是通过批准。报告另作单独提交，其 SHA 在最终交接消息中提供。自查仅限本任务白名单 diff；临时诊断代码已移除，未削弱原断言。最终语法和 `git diff --check` 已通过。父任务修改的计划、brief、audit/ledger 未纳入本任务提交，忽略目录的合成输出未提交。

首次交接后的 Task1 扫描保护修复，以及第二次交接后的 Task3 渲染顺序修复，现均完成且通过新独立审查。八个首次通过结果仍标明产生于修复前；阶段 B improvements 和阶段 C integration/library 的新结果独立列在最终矩阵。没有把历史 RED 删除或把九套记录合称最终源码的全量重跑。

本轮从干净 `6811f444abd9b8d30dcf307adf48aef96a029322` 开始，只更新本报告。自查报告中的源码 SHA、执行归属、作业号、结果、产物及限制；仅暂存自己的已跟踪报告，单独提交，最终 SHA 随交接消息提供。实现 `e5029ebad6cf6632838c395d8e697880ff3397be` 与严格 fixture `208561cfc7e4152a0110cfc30e6e6bb66e41a42c` 均已提交；本轮没有代码或元数据变更，没有测试或浏览器作业。当前无已知未解决的范围内实质问题，状态为 DONE、等待 Task5 独立审查。

Chrome 114、Node.js 20 和真实课程站点没有验证。浏览器原生授权提示由测试替身验证请求时机，未声称测试真实用户点击授权或实际站点登录。PDF 书签结构有合成断言，但没有在各 PDF 阅读器中手工查看大纲面板；不能据此承诺所有阅读器表现一致。精细扫描仍可能漏掉短于采样/稳定确认窗口的画面；大小为图片数据估算；相同机位须由用户确认。没有音频或 ASR 实现及承诺，其可行性问题另行讨论。

父任务负责本任务独立审核、全分支最终复核，以及批准后的根目录 `npm run release`、ZIP 成员/内嵌版本核对、SHA256 与本地安装包交付。当前不存在可声称已交付的 3.1.1 release ZIP。
