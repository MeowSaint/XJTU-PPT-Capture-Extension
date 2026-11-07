# Task 2 实现报告：操作层级与可打断动效

状态：DONE。完整实现了工作台层级调整与原生动效层，完成实际 DOM 交互、截图检查和规定的顺序验证。未委派子代理，未开展后续任务或独立审查。

## 提交与范围

- 工作目录：`/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2`，分支 `feat/v3.1.2`。
- 起点：`3f666a69cf01071d03a08c2773f3507ca93cb33e`。
- 源码提交：`1c67cbb886346982397e6e90c26c2016726d402c`，`feat(ui): rebuild capture workbench and interruptible motion`，13 个明确列出的文件，471 行增加、101 行删除。
- 本报告单独提交。报告提交 SHA 以 `git log -1 --format=%H -- .superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-report.md` 为准，精确值另附在最终交接消息中。文件无法内嵌其自身提交的 SHA 而不改变该 SHA，因此这里不给出虚构的自引用值。
- 权威材料仅使用指定 Task 2 brief、设计文档的全局/UI/动效部分、已有 UI 调研和 implementer 模板。应用 ponytail full、Apple Design 和 humanizer-zh。没有另建方案审批环节。
- 控制器在任务期间修改了审计记录；这是控制器确认的预期改动。我没有读取、修改、暂存或回退该文件。源码提交后工作区只留下该控制器改动。

没有更改版本、项目 README、依赖、锁文件、数据库结构、后台、内容脚本、扫描/PDF 写入逻辑或上游工作树。保留唯一的 `<span class="version">3.1.1</span>`，留待后续发布任务统一升版。

## 交付内容

| 文件 | 最终变化 |
| --- | --- |
| [capture.html](../../../capture.html) | 顶栏标明当前课次和流程导航；保留三个 inspector 页签；来源、提取、结果重新组织；原生批量 details 移入宽工作区；结果附近直接显示本节、所选页、当前课所属整课的导出入口与范围；保留原按钮 ID 和所有原生 dialogs/details。 |
| [style.css](../../../style.css) | 系统字体、暖白/中性灰与克制的酒红重点；桌面视频/结果分栏，各自可滚动；390px 顺序堆叠；暗色、增强对比度、实色后备和减少动态效果；100ms 按压反馈。 |
| [capture.js](../../../capture.js) | 仅 UI 信息与呈现：命名范围、即时导出设置快捷入口、页签/位置指示、有限新卡片反馈、预览反馈及关闭取消、已保存裁剪状态反馈。没有让业务处理器等待动画。 |
| [workspace.js](../../../workspace.js) | 仅在现有 `syncControls()` 中增加 6 行选中来源全名和 0/2 路附近提示；许可手势、同意流程、更新和预检语义保持原样。 |
| [motion.js](../../../motion.js) | 新增 38 行原生 WAAPI 层，提供同步 `window.PPTMotion.reveal(element,{x=0,y=6,duration=180}={})`、`cancel(element)`、`cancelAll()`，返回值均为 void。 |
| [scripts/release.cjs](../../../scripts/release.cjs) | 仅把 motion.js 加入当前资源白名单，当前资源数 34。 |
| [tests/release.test.cjs](../../../tests/release.test.cjs) | 仅更新当前资源列表和对应 34 项断言；保留历史归档/字节保护检查。 |
| [tests/review.cjs](../../../tests/review.cjs) | 新增真实 DOM 的可发现性、窄屏、焦点、连续反向切换、live reduce、预览关闭、最多 12 张卡片及截图检查；旧业务断言保留。原 240px 结构断言按新设计改为 260–280px。 |
| [tests/features.cjs](../../../tests/features.cjs) | 临时扩展副本的资源列表加入 motion.js；其余业务检查不变。 |
| [tests/memory.cjs](../../../tests/memory.cjs) | 在原 1,000 页恢复/懒加载检查中加入正常动效模式下恢复不动画、非零 scrollTop 保留和节点复用断言；保留并发、URL、资产字节、OPFS 等检查。 |
| [tests/library.cjs](../../../tests/library.cjs) | 新增已保存 0 路批量课次的宽区入口、待框选、手动准备可见及不误加载/启动检查。 |
| [tests/improvements.cjs](../../../tests/improvements.cjs) | 给现有独立课程 PDF 导出测试增加当前课 A/批量列表课 B 的可见命名范围断言；保留写入、冻结快照和真实事务竞争检查。 |
| [tests/README.md](../../../tests/README.md) | 只更新本任务相关覆盖说明及当前 34 项资源记录，保留原历史证据。 |

当前课次属于哪个课程、批量列表属于哪个课程分别标明。当前课的“合并整课 PDF”和“分课 PDF 包”直接显示在结果区，不再藏在新增折叠项里；批量列表仍使用各自原处理器。保留本节全部、所选页、逐课次、整课 PDF 和 ZIP 入口。文件名、PDF 选项摘要和“导出设置”靠近结果，点击快捷入口后同一轮处理即切换页签并聚焦课程名输入框。

来源下方完整显示选中名称，长名称换行；0 路提示要求加载后先确认 PPT 区域。视频下先框选/使用完整画面，再开始/停止提取，保留当前页及维护操作次之。裁剪几何没有插值，原键盘操作与 1:1 指针映射未改。

## 动效与即时响应

- `reveal()` 先读取当前计算后的 transform/opacity，再取消旧动画并从该呈现值转向新目标，避免重复点击从旧起点跳回。只使用 transform/opacity，采用单调短缓动，没有引入通用弹簧引擎。
- 页签、原生 details/dialog 内容与预览使用约 160ms 反馈，按钮为 100ms。位置下划线承接快速反向页签切换；页签的 ARIA、hidden、tabindex、焦点以及输入始终先同步更新。
- 成功写入新页后才请求新卡片反馈，每次最多 12 张实际可见卡片；普通重绘、恢复 1,000 页均不会批量 reveal。选中反馈只针对改变的可见项。
- 初始 reduce 设置会跳过空间动效；设置 live 改变时立即 `cancelAll()`。CSS 同时取消 transition/animation 及按压位移。没有 `animationBusy` 或动画期间输入锁。
- 原生关闭先立即关闭/清理/恢复焦点；预览异步读取仍由原 revision 保护，close 清空 src、撤销全图 URL，并取消对话框和图像动画。详情关闭也取消相应内容效果。
- 未增加图片 DOM 克隆、完整图片预读、裁剪几何动画或额外运行时依赖。保留 `#pages` 观察根、`rootMargin: '200px 0px'`、缩略图读取并发上限 2 和越界 URL 释放。

## RED、修复与遇到的问题

所有浏览器命令使用同一个明确的测试可执行文件：

```text
/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
```

先添加行为断言，再修改产品代码。两次有意义的 RED：

```bash
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/review.cjs --ui-only > .test-output/task-2-red-ui.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/review.cjs --motion-only > .test-output/task-2-red-motion.log 2>&1
```

| 失败/观察 | 根因、处理与结果 |
| --- | --- |
| UI RED，exit 1：`AssertionError [ERR_ASSERTION]: batch work has a permanent wide workspace entry`，`false !== true`，当时 tests/review.cjs:166 | 批量入口仍在窄 inspector 中。移到宽工作区且保留原 details/summary 与处理器，之后断言通过。日志：[RED UI](../../../.test-output/task-2-red-ui.log)，证据目录 review-Qc3LAw。 |
| Motion RED，exit 1：`AssertionError [ERR_ASSERTION]: shared motion layer is loaded`，actual `undefined` / expected `function`，当时 tests/review.cjs:191 | 原来没有共同动效 API。新增并在 capture/workspace 前加载原生 motion.js，之后正常/实时 reduce、反向切换与关闭断言均通过。日志：[RED motion](../../../.test-output/task-2-red-motion.log)，证据目录 review-0lXAZG。 |
| 初次截图中 390px fullPage 图重复呈现顶部条带，dark 图 y≈814 出现重复页头；当时几何断言已经通过 | 没有把这两张图作为完成证据。DOM 实测只有一个 `.app-shell`，后来静态核验也证实所有 ID 唯一。改为所要求的 390×844 真实 viewport 截图，并在 resize/scroll/media 变化后等待两帧渲染，dark 前回到 scrollY=0。相同真实 DOM 的后续截图无重影。证据支持截图栅格/布局同步伪影；没有证明 Chromium 内部具体原因，不将推断写成产品 DOM 重复的事实。原始问题图留在 review-KfPEnH，修正验证在 review-DgYlhC，最终图在 review-mDvnrT。 |
| 控制器检查发现整课导出最初仍在本次新增折叠项中 | 移除该新增 fold，原 `course-pdf` / `course-zip` 节点直接显示；未复制业务按钮，也未改导出处理器。新增直接可见断言，全量 review 及后续 PDF 套件通过。 |
| 控制器发现顶栏 1/2/3 与面板局部 1/2 编号冲突 | 只删除面板两个局部编号 span，保留顶栏流程。按控制器要求不重跑已通过整套业务测试；用最终源码的 5 组 focused 交互/布局/截图检查覆盖此静态变化。 |
| 可选真实动效录制尝试，exit 1：`browserContext.newPage: Executable doesn't exist at /Users/jasondai/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac` | 控制器建议仅在现有能力可用时顺手记录。临时启用 Playwright recordVideo 后在 newPage 即失败，尚未执行 UI 组。未安装组件、未改运行时或绕过限制；两个临时录制改动已全部撤回，再用普通上下文通过最终 focused 验证。没有交付或声称存在视频。日志：[可选录制失败](../../../.test-output/task-2-final-focused-ui.log)，目录 review-z4pvrw。 |

中间 focused 验证记录如下，均不是最终全量验证的替代：

| 命令主体（均带上文完全相同的 PPT_TEST_BROWSER） | 结果 | 日志/证据 |
| --- | --- | --- |
| `node tests/review.cjs --ui-only` | 2 组，exit 0 | [首次 GREEN](../../../.test-output/task-2-ui-green-1.log)，review-okYwuI |
| `PPT_TEST_FILTER='source, batch\|rapid tab\|committed new\|1280\|real workspace screenshots' node tests/review.cjs` | 5 组，exit 0 | [首次视觉检查](../../../.test-output/task-2-ui-visual-1.log)，review-KfPEnH；两张问题图如上说明，未接受为最终图 |
| `PPT_TEST_FILTER='1280\|real workspace screenshots' node tests/review.cjs` | 2 组，exit 0 | [截图同步验证](../../../.test-output/task-2-visual-capture-2.log)，review-DgYlhC |

未出现新的下载计数问题。既有独立命名 fixture 的 reload 仍只在独立起点、idle 之后且真实 IDB hold 之前；没有在持有事务期间 reload，没有加入 sleep、强制事件或许可绕行，也没有弱化下载/字节/竞争断言。

## 顺序最终验证

下列完整序列严格依次执行，全部收集了实际进程结果；每个命令重定向 stdout/stderr 到对应日志。日志中的“focused”只是部分套件的既有打印标签；下列全量命令没有传 filter 或 only 参数。

```bash
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:review > .test-output/task-2-final-review.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:features > .test-output/task-2-final-features.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:memory > .test-output/task-2-final-memory.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:library > .test-output/task-2-final-library.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:improvements > .test-output/task-2-final-improvements.log 2>&1
npm run test:release > .test-output/task-2-final-release.log 2>&1
```

| 套件 | 实际结果 | stdout/证据 |
| --- | --- | --- |
| review | 17/17，exit 0 | [日志](../../../.test-output/task-2-final-review.log)、[结果](../../../.test-output/v3.1.2/review-59miOu/results.json) |
| features | 11/11，exit 0 | [日志](../../../.test-output/task-2-final-features.log)、[结果与源码 hash](../../../.test-output/v3.1.1/features-pY7Trs/results.json) |
| memory | 14/14，exit 0，0 browser errors | [日志](../../../.test-output/task-2-final-memory.log)、[指标](../../../.test-output/v3.1.2/memory-1794038234030/report.json) |
| library | 24/24，exit 0 | [日志](../../../.test-output/task-2-final-library.log)、[结果](../../../.test-output/v3.1.2/library-MtAEUo/results.json) |
| improvements | 25/25，exit 0 | [日志](../../../.test-output/task-2-final-improvements.log)；前 13 组旧任务证据仍在 `.test-output/v3.1.1/task4-tK60DC` |
| release | 17/17，exit 0，34 个资源/无 fail/cancel/skip | [日志](../../../.test-output/task-2-final-release.log) |

完整序列后，针对两个静态编号 span 的最终差异刷新了真实 UI：

```bash
PPT_TEST_FILTER='source, batch|rapid tab|committed new|1280|real workspace screenshots' PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/review.cjs > .test-output/task-2-final-focused-ui-2.log 2>&1
```

结果为 5/5，exit 0，[日志](../../../.test-output/task-2-final-focused-ui-2.log)、[结果](../../../.test-output/v3.1.2/review-mDvnrT/results.json)。覆盖可发现性/命名范围/窄屏、立即输入/页签反向/live reduce/动画期间关闭预览、12 张反馈预算/重绘复用、三种桌面尺寸和最终截图。

可选录制失败的完整命令为同一 focused 命令前加 `PPT_TEST_VIDEO=1`，重定向至 `.test-output/task-2-final-focused-ui.log`；当时该环境变量由临时 recordVideo 开关读取，最终源码中已无此开关。失败进程 exit 1，后面的普通上下文验证 exit 0。

### 最终源码覆盖边界

- 全量 review、features、memory 运行在最终 JS/CSS/资源列表上；当时 HTML 还带两个局部编号 span。之后唯一产品变化是删除这两个 span。library、improvements、release 和最后 focused 运行在最终 HTML 上。没有把前面全量结果说成这两个 span 删除后的全量重跑。
- features 的临时扩展副本记录 `changedDuringRun: []`。其 capture.html SHA-256 为 `ae07e9855e4b87a1ee4fb1c2ae6e5bd7536d0c77601ef8d726abeac094dd1b00`；最终 HTML 为下表值，差异就是上述两个 span。其他表列 JS/CSS 的最终 hash 与 features 副本完全一致。
- 先前 PDF 任务的 export 88/library 23/improvements 25 不是本次验证结果；本次没有据此跳过新受影响的 UI 检查，也没有声称重跑了独立 export 88 或全部 npm test。

| 最终 UI 文件 | SHA-256 |
| --- | --- |
| [capture.html](../../../capture.html) | `a3007ec519e877ea4376da6da14734501e762b7d8476f9101442404537b00dfe` |
| [capture.js](../../../capture.js) | `57908d171efeab0d6365c16ad087c4a688089068cefbccdf30e097c88b44f560` |
| [style.css](../../../style.css) | `b1291f70503c2a3513fbb043068f4d50ae3c0151db8a7a6867e214529fc60876` |
| [motion.js](../../../motion.js) | `991b6b1bec9bb1cd9758aba19dcf54aaa345ddbf188a73e0999a7094c9a5854e` |
| [workspace.js](../../../workspace.js) | `93a9680bb4ae62ef79f2bd78a9b7cc260095049b17544588047397b508584ca8` |

### 错误、请求断言与测试环境

| 上下文 | 实际观察/断言范围 |
| --- | --- |
| review 全量及最终 focused | 单个临时 context/实际主页面收集 `pageerror`；context route 允许本地 origin、blob/data，记录并阻断其余请求。结束断言 `errors: []`、`blocked: []`。这不是浏览器所有 console 文本的零警告证明。 |
| features | 临时解包扩展和一次性测试 profile；真实后台/工具页交互。既有 wrapper 仅把固定 GitHub API URL 转向本地更新服务，保留 fetch options；非本地媒体/API 由合成路由响应，未知请求被拦截并汇总 `unexpected: []`，收集错误为 `errors: []`。Chromium service worker 请求不通过 context.route，因此使用的是测试已有的精确 URL 本地替换，不声称对所有外部服务做过实网测试。许可检查使用临时扩展已经授予的 localhost 加 faithful contains/request shim，验证真实点击到请求的同步顺序；未验证 headless 原生权限弹窗。 |
| memory | 每个 `fresh()` context 的每个 page 收集 pageerror，以及专门标记的 `UNHANDLED_REJECTION` console error；最终 `errors: []`。route 只允许本地/本地 blob，其他请求被阻断，但该套件不累计一个“尝试外联次数为零”的列表，因此不据此声称没有外联尝试。 |
| library | 实际主页面 pageerror 与同一 context 的非本地请求列表，结束分别断言空数组；本地 origin 以及 blob/data 放行。 |
| improvements | 两个 context 的非本地请求合并到同一个 blocked 数组，最后断言为空。pageerror 数组只接在后面的导出 context（12 组）并断言为空；前面旧任务 context（13 组）没有同等全局 pageerror 计数，不能把“无浏览器脚本错误”扩展到该部分。 |
| release | Node 的 17 项包装/资源字节/历史 ZIP 保全测试，无浏览器脚本错误或网络计数范围。 |

实测环境为 macOS arm64、Node `v26.13.0`，memory 报告记录浏览器 `156.0.8078.4`。Chrome114+/Node20+ 是保留的兼容目标，本次没有逐个跑最低版本或其他系统/profile。

所有 fixture 使用既有依赖与 localhost/合成内容。没有使用 Brave/MCP 浏览器、日常 profile、凭据、真实课程数据或外网下载。每次运行的浏览器/上下文/本地服务均由原有 finally 清理；包括可选录制失败路径。所有启动的后台 job 都已逐一 `job_output` 收集，无仍运行或未收集的相关 job。

## 实测关键结果与截图

在正常动效设置下恢复 1,000 页：1,000 metadata、1,000 assets、1,000 card 节点，未对恢复卡片发起动画。memory 指标为 `animations: 0`、`maxReads: 2`、`activeURLs: 13`、`allowedImages: 13`、`bounded: true`、`oldRevoked: true`、`reused: true`、`preservedScroll: true`。该数字对应当次视口，不是对所有视口固定 13 的承诺。仍通过 256 MiB 真 OPFS 顺序写入/校验和、1,000 页 ZIP 字节与释放、配额/取消和失败导出清理检查。

32 张真实提交的新页 fixture 中，可见数大于 12，断言恰好只有 12 张动画；普通 render 后 node/scroll 保留。快速页签反转读取了正在呈现的 marker 位置，未跳回起点；立即输入可用。live reduce 后所有动画取消且无残余 transform；在预览入场时按 Escape，焦点回到原缩略图、src 和全图 URL 立即清理。以上为浏览器交互/呈现状态断言；没有把静态截图说成完整时间曲线录像。

最终截图均是实际应用 DOM，由我直接 `read_image` 查看，未重建 HTML、未拼合/修图、未生成检查缩略图。路径位于 `.test-output/v3.1.2/review-mDvnrT/`：

| 实际图片 | 直接检查的内容 |
| --- | --- |
| [desktop-1440x900.png](../../../.test-output/v3.1.2/review-mDvnrT/desktop-1440x900.png) | 视频与结果并列；选项/文件名靠近本节导出；命名当前课范围与整课 PDF/ZIP 直接可见；没有重复页头或局部编号冲突。 |
| [desktop-1280x800.png](../../../.test-output/v3.1.2/review-mDvnrT/desktop-1280x800.png) | 较短桌面仍保持两栏，复核工具自然换行，结果区有独立可滚动空间，控制没有水平裁切。 |
| [desktop-1920x1080.png](../../../.test-output/v3.1.2/review-mDvnrT/desktop-1920x1080.png) | 宽屏合理扩展视频/联络表，导出入口仍贴近结果，页面没有变成装饰卡片网格。 |
| [batch-wide-1440x900.png](../../../.test-output/v3.1.2/review-mDvnrT/batch-wide-1440x900.png) | 原生批量面板铺在宽工作区；批量课程“机器学习”与当前课“模式识别”不同；0 路待框选、加载/框选和每课次操作清楚可见。 |
| [stacked-390x844.png](../../../.test-output/v3.1.2/review-mDvnrT/stacked-390x844.png) | 顶部导航换行、原生页签、完整长来源名称换行及附近 0 路提示；无重复条带或横向裁切。 |
| [results-390x844.png](../../../.test-output/v3.1.2/review-mDvnrT/results-390x844.png) | 滚动到实际结果区后，本节/整课/所选页操作自然换行，文件名与设置快捷入口可见，两列缩略图无横向溢出。 |
| [dark-1440x900.png](../../../.test-output/v3.1.2/review-mDvnrT/dark-1440x900.png) | 深色背景、文本、细分隔和酒红重点可读；底部不再出现第二个页头。 |
| [contrast-dark-1440x900.png](../../../.test-output/v3.1.2/review-mDvnrT/contrast-dark-1440x900.png) | enhanced contrast 下控制边界/文字更明确，布局没有变化或覆盖。 |
| [reduce-1440x900.png](../../../.test-output/v3.1.2/review-mDvnrT/reduce-1440x900.png) | reduce 下导出页签立即可用，设置与结果同时可读；无视觉上残余的空间位移。动态取消仍以上面的交互断言为依据。 |

[narrow-geometry.json](../../../.test-output/v3.1.2/review-mDvnrT/narrow-geometry.json) 实测 `documentWidth = width = 390`，`inspectorBottom = workspaceTop = 990.5`，`resultsTop = 1718 >= videoBottom = 1700`，证明 inspector、工作区、结果按实际 DOM 顺序堆叠。桌面断言保留 `#pages` 自身滚动、有效高度 >250px、无文档横向/纵向溢出和主要操作可见要求。

早期截图目录留作过程证据，最终查看以上最新目录。features/improvements 部分产物仍带既有 v3.1.1/task4 名称，这是测试历史命名，不能据此冒称运行了另一个版本或覆盖更多源。

## 静态验证、自审与余项

最终改变的 10 个 JS/CJS 均通过 `node --check`，exit 0：

```bash
node --check capture.js && node --check workspace.js && node --check motion.js && node --check scripts/release.cjs && node --check tests/release.test.cjs && node --check tests/review.cjs && node --check tests/features.cjs && node --check tests/library.cjs && node --check tests/improvements.cjs && node --check tests/memory.cjs
```

`git diff --check -- capture.html style.css capture.js workspace.js motion.js scripts/release.cjs tests/release.test.cjs tests/README.md tests/review.cjs tests/features.cjs tests/library.cjs tests/improvements.cjs tests/memory.cjs` 与暂存后的 `git diff --cached --check` 均 exit 0。静态对照起点 HTML 的校验结果为：原有 141 个 ID 全部保留，当前 154 个 ID 全部唯一；精确版本 span 只有 1 个；motion.js 在 capture.js/workspace.js 前加载。

自审读完本任务白名单 diff 及新增动效源码，检查了范围与调用位置、异步预览 revision/URL 保护、详情/对话框语义、数据写入先行、零页/选择范围、缩略图复用和 reduce 取消。源码只按列出的 13 个文件逐一 `git add`，没有 add-all；报告独立提交。

仍未验证：真实学校登录/媒体、日常浏览器 profile、原生权限弹窗、Chrome114/Node20 最低版本组合、其他系统或真实超长课程数据。没有实现或声称完整键盘重排；原鼠标拖排与已有键盘选择/预览/裁剪能力保留。可选录像因缺少 Playwright 专用编码器未产出。没有待解决的本任务业务测试失败，也不把截图渲染内部成因写成已证明。

完成本报告提交和父代理交接后停止所有实现变更，等待控制器的具体审查结论。
