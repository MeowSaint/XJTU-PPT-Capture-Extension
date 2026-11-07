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

## I1 修复记录：第 1/5 轮，2026-11-07

状态：DONE，等待控制器重新审查。本节记录独立审查 C0/I1/M0 中唯一的 I1 修复。上文保留初次交付时的结果；本节的源码、命令和运行中截图对应修复后的状态。

### 起点、提交与实际改动

- 本轮干净起点：`fe1798b988e67e3e5eef71faada7a7cb82c6757e`。这是控制器提交修复 brief 与设计裁定后的 HEAD。
- 后续定界审查的 `FIX_BASE` 仍为 `e3952346d71f1bd78cf105b2987d01a241f430bf`，不替换为本轮起点。
- 修复源码提交：`76341d6141b2105a243ce2ee290f892a9fa678c6`，`fix(ui): keep shared Stop visible during batch extraction`。仅 3 个文件，97 行增加、7 行删除。
- 本节追加在同一报告中，另作报告提交；该提交的精确 SHA 在最终交接中提供，也可用上文的 `git log -1 --format=%H -- .superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-report.md` 取得。
- 依据指定修复 brief 执行；没有修改、暂存控制器的文档或开展 Task 3。

原审查发现：批量面板展开后会压缩 `#panel-capture` 的实际滚动区；位于预览和裁剪控件之后的共享 Stop 虽已启用，却落在滚动区外。原取消处理器没有被认定失效。初次交付的批量截图是展开但空闲的状态，缺少“实际运行且未预滚 capture”的证据，因此没有揭示这一布局问题。

本轮把 [capture.html](../../../capture.html) 中原有的 Start/Stop 组整体移到 `.app-shell` 的第三行，保留同一个 `#run` 和唯一 `#stop`、原文字、原生按钮语义和所有处理器。[style.css](../../../style.css) 为桌面操作行预留高度，使其不受视频/结果滚动区裁切；窄屏使用底部 sticky 行，两个按钮保持一行，并保留安全区内边距。上文“视频下开始/停止”的初版位置由此项控制器裁定取代。

[capture.js](../../../capture.js) 没有变化：`batchStopRequested`、真实 `AbortController`、暂停/保留结果、任务和存储语义均使用原实现。批量面板继续展开，没有增加另一套停止按钮或动画等待。[tests/review.cjs](../../../tests/review.cjs) 只新增一组针对 I1 的行为回归，既有断言全部保留。

### 有意义的 RED 与运行路径

先加测试，再移动产品节点。新组在 1280×800、1440×900、1920×1080、390×844 各执行一轮：

1. 写入两张有真实图片资产的保留页，保存包含自动课次与 0 路待框选课次的批量列表。
2. 通过真实 summary 和 `#batch-start` 点击展开/启动；实际加载 localhost MP4，经原 `loadRemote()`、OPFS、`fastScan()`、任务控制器和 `save()` 提交一张页。
3. 仅将 fixture 的 `PPTScanner.prototype.scan` 临时替换为“提交一帧后等待真实 abort signal”，并设置 15 秒失败期限；没有设置 `busy`、`batchRunning`、`disabled` 等标志来制造运行画面。权限 request 使用本地 fixture shim，不证明原生扩展许可弹窗。
4. 在任务仍为 running 时遍历 Stop 的真实 overflow 裁切祖先及视口，检查完整边界、内缩 3px 的四角和中心 `elementFromPoint` 命中；`#panel-capture.scrollTop` 始终为 0。然后按实测中心坐标执行普通鼠标点击，避免测试框架为 Stop 自动滚动。
5. 断言真实 signal 立即 abort、原任务停止、Stop 恢复禁用、原生批量 details 仍展开；逐记录比较停止前后的全部三张页元数据、签名和图片字节，并核对原两张保留页未变。每轮通过后恢复 scanner 方法；失败路径仍由套件 finally 关闭上下文、浏览器和本地服务。

RED 的实际失败为 `AssertionError [ERR_ASSERTION]: enabled Stop escapes its actual clipping context viewport`，当时位于 `tests/review.cjs:605`。1280×800 时 Stop 已启用且任务 running，矩形为 x=600、y=820.0625、120×34，bottom=854.0625；视口 bottom=800，实际 `#panel-capture` 裁切 bottom=780，5 个命中点全部为 false。面板仍展开，capture 未滚动。日志见 [fix-1 RED](../../../.test-output/task-2-fix-1-red.log)，原始 [失败几何](../../../.test-output/v3.1.2/review-2H1I0h/fix-1-stop-geometry.json)。

第一次 GREEN 已通过四个尺寸；直接看图后发现 390px 的操作组换成了两行，因此只收紧该组为 nowrap，减少占用高度。随后重新通过 focused GREEN，接着执行规定的三套完整验证。没有其他新失败或下载计数问题。

### 实际命令与结果

下面是本轮全部浏览器命令，均使用指定可执行文件；stdout/stderr 原样保存在相应日志中。两个 GREEN 之间只有上面说明的窄屏行高调整和证据断言补充。

```bash
PPT_TEST_FILTER='expanded running batch' PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/review.cjs > .test-output/task-2-fix-1-red.log 2>&1
PPT_TEST_FILTER='expanded running batch' PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/review.cjs > .test-output/task-2-fix-1-green.log 2>&1
PPT_TEST_FILTER='expanded running batch' PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node tests/review.cjs > .test-output/task-2-fix-1-green-final.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:review > .test-output/task-2-fix-1-review.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:memory > .test-output/task-2-fix-1-memory.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:library > .test-output/task-2-fix-1-library.log 2>&1
```

| 运行 | 结果 | 具体证据 |
| --- | --- | --- |
| focused RED | exit 1，实际 running 的 Stop 越界/无法命中 | [日志](../../../.test-output/task-2-fix-1-red.log)，review-2H1I0h |
| 第一次 focused GREEN | 1 组、4 尺寸，exit 0 | [日志](../../../.test-output/task-2-fix-1-green.log)，review-YXTtkh |
| 最终 focused GREEN | 1 组、4 尺寸，exit 0 | [日志](../../../.test-output/task-2-fix-1-green-final.log)，review-aOP4pz |
| 全量 review | 18/18，exit 0 | [日志](../../../.test-output/task-2-fix-1-review.log)、[结果](../../../.test-output/v3.1.2/review-LR5goa/results.json) |
| 全量 memory | 14/14，exit 0，0 browser errors | [日志](../../../.test-output/task-2-fix-1-memory.log)、[指标](../../../.test-output/v3.1.2/memory-1794041360658/report.json) |
| 全量 library | 24/24，exit 0 | [日志](../../../.test-output/task-2-fix-1-library.log)、[结果](../../../.test-output/v3.1.2/library-FI68Ku/results.json) |

完整 covering 顺序为 review → memory → library；各前项完成并收集结果后才启动下一项。全量 review 的“focused review groups”仍是既有输出标签，该次命令没有 filter。三套完整验证覆盖相同的最终产品 HTML/CSS 和最终回归测试，之后只有提交与本报告追加。按修复 brief 没有重跑 features、improvements、release、独立 export 或可选录像，上文这些项目只保留初轮证据的历史含义。

错误/请求范围沿用上文准确界定：review 与 library 各自实际主页面的 `pageerror` 列表和 context 非本地 blocked 列表都为空；memory 每个 fresh 页面收集的错误列表为空，其 route 会阻断非本地请求但没有累计“尝试次数为零”的独立列表。没有把这些结果扩大为所有 console、profile、权限 UI 或实网环境都已验证。

### 运行中几何与亲自看图

以下四张均来自完整 review 的实际 DOM，拍摄时批量列表展开、自动课次运行、待框选课次仍在列表。我逐一用 `read_image` 查看：桌面共享操作行位于两栏之外且完整可见；390px 行内的两个按钮没有换行或水平裁切。截图不是重建 HTML 或合成图。

| 实际运行截图 | Stop 实测矩形（x、y、width、height） | 命中与操作行 |
| --- | --- | --- |
| [1280×800](../../../.test-output/v3.1.2/review-LR5goa/fix-1-expanded-running-1280x800.png) | `668, 756, 120, 34` | 5/5 命中；editor bottom=745，独立行 y=745、height=55 |
| [1440×900](../../../.test-output/v3.1.2/review-LR5goa/fix-1-expanded-running-1440x900.png) | `668, 856, 120, 34` | 5/5 命中；editor bottom=845，独立行 y=845、height=55 |
| [1920×1080](../../../.test-output/v3.1.2/review-LR5goa/fix-1-expanded-running-1920x1080.png) | `668, 1036, 120, 34` | 5/5 命中；editor bottom=1025，独立行 y=1025、height=55 |
| [390×844](../../../.test-output/v3.1.2/review-LR5goa/fix-1-expanded-running-390x844.png) | `254, 800, 120, 34` | 5/5 命中；底部行 y=789、height=55，documentWidth=390 |

完整 [几何/取消记录](../../../.test-output/v3.1.2/review-LR5goa/fix-1-stop-geometry.json) 保留了每个裁切上下文、五点坐标、capture scroll、可见控件命中与停止结果。桌面行占位的几何断言防止其覆盖两栏；对已在实际裁切区内完整可见的批量 summary、页签、裁剪/补页控件，另断言与操作行不相交且中心能命中。离开视口或被自身滚动区裁切的控件不计为可见。390px 保留点击批量开始后的原生文档滚动位置，列表其余内容仍通过纵向滚动访问；没有为了找到 Stop 预滚 capture 或收起批量面板。

四个尺寸的取消结果均为 `immediateAbort: true`、`state: stopped`、`batchStillOpen: true`，保留页总数 `2 → 3 → 3`，当前课新提交卡片 1 张。比较覆盖精确元数据/签名/图像字节，不仅是可见计数。新组使用有界 scanner 等待来稳定验证取消，不用于证明识别算法或真实学校长视频的扫描精度。

本轮 memory 仍通过 1,000 页/资产/节点、无恢复动画、节点与非零 scrollTop 复用；实测 `maxReads: 2`、`activeURLs: 10 = allowedImages: 10`、`animations: 0`、`bounded/oldRevoked/reused/preservedScroll: true`。这些 URL 数值对应本轮的结果滚动区，不把初轮 13 个 URL 当成固定数量。256 MiB OPFS 顺序写入/checksum、配额与取消、1,000 页 ZIP 字节和失败清理均通过；library 继续通过真实检查点、重扫、课程隔离、待框选和持久化竞争断言。

### 最终源码、自审与边界

[限定源码 diff](../../../.test-output/task-2-fix-1-source.diff) 已逐行自审；只移动原组并增加必要 CSS，没有读取或审查整分支。[静态记录](../../../.test-output/task-2-fix-1-source.json) 对照本轮起点核对：154 个 ID 完全相同且唯一，精确版本 span 仍 1 个，motion 加载顺序不变，取消控制源码无变化。最终源码 hash：

| 本轮文件 | SHA-256 |
| --- | --- |
| [capture.html](../../../capture.html) | `2a4d6735fcbd6ca84fc0c2eba9ac85ab6e614268e5cf9a830f1f3806ad272864` |
| [style.css](../../../style.css) | `cd944b5bd34891897b7efb7391822915952b692c3d6470ece7cf29a85d0e496f` |
| [tests/review.cjs](../../../tests/review.cjs) | `b6b9d809da390da607049e9921d2b667201ee7aa2f29c65fcebe41171655a32f` |

`node --check tests/review.cjs`、`git diff --check -- capture.html style.css tests/review.cjs` 及暂存后的 `git diff --cached --check` 均 exit 0。源码提交仅逐名暂存上述 3 个文件，提交后工作区干净；随后只追加本报告。应用 ponytail full 和 humanizer-zh，沿用 Apple Design 的即时响应原则。

本轮运行环境为 macOS arm64、Node `v26.13.0`、指定 Chromium `156.0.8078.4`，仍未验证 Chrome114/Node20 最低版本、其他系统、真实学校媒体/账户或原生权限弹窗。测试只用既有依赖、localhost 合成 fixture 和一次性上下文；没有重试录像、安装组件、改运行时设置或使用真实 profile。全部 6 个本轮后台 job 均已逐项收集；所有 fixture 浏览器/服务器沿用 finally 清理。

报告暂存时普通 `git add -- .superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-report.md` 返回 exit 1，提示 `The following paths are ignored by one of your .gitignore files:`，路径为 `.superpowers`。按既有明确授权，仅对此报告使用 `git add -f -- .superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-report.md`；没有强制暂存其他路径。追加内容检查确认初轮报告仍为完整原前缀，71 个本地证据链接均存在，最终产品 hash 未变。

本轮实现与证据提交后停止变更，交控制器做下一次限定审查；不开展新的修复或 Task 3。

## Task 2 修复轮次 2/5：展开批量列表后的图库边界

本节只追加本轮 I2 的实现与验证证据，供控制器进行 fresh scoped review。前 273 行保持逐字节原样，前缀 SHA-256 为 `594a3fc172256e324569536e78377778a2593fd5f45b9f48e5ce876c5de17601`。

- 本轮开始时的干净 HEAD：`cb23f8b9bac9f46281408d45948c68e421c01fb2`，分支 `feat/v3.1.2`。本轮独立审查的正确 `FIX_BASE` 仍为 `b7021c7c9ed49c8876e732ab2174aa9ee52f6700`。
- 权威范围：[Task 2 fix 2 brief](./task-2-fix-2-brief.md)。控制器随后以 `e3090579439568d547e1251d352070a8cb71ad51` 记录 Ruling10，以 `8cdee0159ad3699543c941efe3b9a8d994929c38` 记录 Ruling11；我分别读过更新后的授权段，遇到新的裁剪失败时先停报，再按新增的窄例外继续。
- 本轮源码提交：`353085aa6ba391d14a7767540ca036ae00639561`，`fix(ui): keep expanded batch gallery bounded and reachable`。仅提交下面 3 个文件，157 行增加、6 行删除。报告另作独立提交；其准确 SHA 可在报告提交后用 `git log -1 --format=%H -- .superpowers/sdd/2026-11-07-course-pdf-workbench/task-2-report.md` 取得，最终交接同时提供该 SHA。

### 改动与输入边界

[style.css](../../../style.css) 只调整工作区这一条布局规则：批量区域采用 `max-content`，操作与结果区域最小高 560px，工作区使用 `overflow: auto`，普通滚动保留 `16px 20px` 的上下滚动定位边距。展开列表后，可以滚动工作区来到完整卡片；批量详情仍保持打开，共享 Start/Stop 操作栏继续固定在原位置。长图库仍在有限的 `#pages` 内独立滚动。

[tests/review.cjs](../../../tests/review.cjs) 新增一组真实 DOM 回归：本地视频、真实 IndexedDB 页面与已保存的 3 条批量任务，在 1280×720、1440×900、390×844 下检查实际裁剪祖先、卡片及选择框/时间/删除按钮的四角与中心命中，执行原生选择和时间跳转，再验证原生拖动、精确顺序、新页面持久化，以及元数据/签名/图像字节仅顺序发生变化。另以 1,000 页证明增长发生在图库内容内，观察根和外层工作区不会随所有卡片一起长高。已有业务、范围选择、持久化和运行中 Stop 检查保留。

[tests/integration.cjs](../../../tests/integration.cjs) 只按 Ruling10/11 修改两个原生输入区块：

1. 拖动从可见首卡按下，真实移动 12px 后，通过一次性被动监听确认可信 `dragstart` 来自原首 ID；随后普通滚动到末卡，在原有 `width - 4, y = 12` 位置松开。原有精确顺序、独立新页面持久化及后续检查不变。
2. 裁剪点从公开的 video client/raw 尺寸、画布和 overlay 坐标计算实际 contain 图像的 25%→75%，仍使用真实鼠标输入和真实保存、预览解码。严格高度 `360`、原宽度范围及所有后续检查不变。实际 crop 只在输入后读取记录，不参与反推鼠标点或期望值。

对原脚本 SHA `8127cc73b66f834c6d83255d3e28f3a110bf756d5b62f2163b35956c5d0493d1` 做两个输入区块掩码后，剩余文本逐字节一致。[最终限定 diff](../../../.test-output/task-2-fix-2-source.diff) 已完整检查。[capture.html](../../../capture.html) 没有改动，154 个 ID 仍完全相同且唯一，精确版本标记 `<span class="version">3.1.2</span>` 保留一次，motion 脚本顺序不变。产品 JS、裁剪/排序/取消/存储逻辑、PDF writer、依赖、版本和其他工作树均未改动。

### RED、失败归因与修正

第一组 RED 在未改 CSS 时确实失败：`AssertionError [ERR_ASSERTION]: gallery stays inside its allocated results height instead of escaping below the action row`，位置见 [RED 堆栈中的 review.cjs:593:9](../../../.test-output/task-2-fix-2-red.log)。1280×720 下，结果区底部 645，图库顶部 718.390625、高 18、底部 736.390625，页面也溢出到 736px，首卡所有命中点均不可达。见 [RED stdout](../../../.test-output/task-2-fix-2-red.log) 和 [RED 几何](../../../.test-output/v3.1.2/review-7i5Knn/fix-2-gallery-geometry.json)。该布局断言始终保留。

第一次 CSS 尝试保留 `auto` 首行，导致低高度下原生批量入口缩至 0，被其他区域遮住；改为 `max-content` 后入口恢复。随后普通滚动留下 0.234375px 的卡片边缘越过操作栏边界，增加正常的上下滚动间距修正。后续失败转为拖动起点问题：被动事件记录显示可信按下首 ID10，但 helper 在真正开始原生拖动前先滚目标，把其他卡片移到了指针下方。

曾用 200px 下滚动间距取得一次 focused 通过，但它没有解决完整 integration 的原生起点问题，已回退到正常 20px。这个临时通过只保留为过程证据，不算最终源码覆盖。控制器允许的一次被动诊断没有改磁盘脚本、事件、产品状态或运行设置：按下 ID10 时 `pages.scrollTop=0`，真正 `dragstart` 时根已滚到 121、目标为 ID12，随后 drop13，应用正确保存 `[10,11,13,12]`。见 [唯一被动诊断摘要](../../../.test-output/v3.1.2/task2-fix2-diagnostic/summary.json)、[前后源码哈希](../../../.test-output/v3.1.2/task2-fix2-diagnostic/source-hashes.json) 和 [实际截图](../../../.test-output/v3.1.2/task2-fix2-diagnostic/after.png)。之后只按 Ruling10 改原生输入起始顺序。

可信首 ID 和精确顺序通过后，完整 integration 继续到原来的裁剪严格断言，实际解码 `640×361`，原样报 `361 !== 360`（[当时的 integration.cjs:395:58](../../../.test-output/task-2-fix-2-final-integration.log)，原位置 375）。我先停报；Ruling11 才允许检查公开图像几何并改输入点。实测原始视频 `1280×720`，client/canvas `417×235`，实际 contain 图像 `417×234.5625`，整画布的一半映射为约 `360.671` 个原始像素。图像内的原生点 `(407.25,203.75) → (615.75,321.03125)` 保存后实际解码 `640×360`。

这个旧手势得到 361 的数值只用于本机的一次归因核对。我最初在调查版 fixture 加了旧预测值必须为 361 的断言；控制器明确其不属于跨平台契约后，只删除这一行。公开尺寸和旧预测仍记录日志，固定视频源高 720 的检查、实际解码严格 h360、原宽度范围和所有后续断言均保留。永久 fixture 再次完整 integration 通过。详见 [裁剪量测证据](../../../.test-output/task-2-fix-2-crop-evidence.json) 与 [最终 integration stdout](../../../.test-output/task-2-fix-2-final-integration-3.log)。

### 全部命令、退出与最终源码覆盖

所有浏览器命令均直接指定同一可执行文件，没有改测试运行时、原生安全设置、依赖或宿主服务。完整调用与重定向、job ID、退出码和收取状态列于 [15 项命令台账](../../../.test-output/task-2-fix-2-command-ledger.json)。focused 调用使用 `PPT_TEST_FILTER='low-height expanded batch' node tests/review.cjs`；唯一被动诊断使用 `node .test-output/task-2-fix-2-diagnostic-launcher.cjs`。

| 执行/日志 | exit | 结果 |
| --- | --- | --- |
| [RED](../../../.test-output/task-2-fix-2-red.log) | 1 | 旧布局图库越过分配高度，断言真实失败 |
| [GREEN 尝试 1](../../../.test-output/task-2-fix-2-green.log) | 1 | 批量入口的 `locator.click` 超时，定位到首行缩为 0 |
| [GREEN 尝试 2](../../../.test-output/task-2-fix-2-green-2.log) | 1 | 卡片边缘 0.234375px 超出操作栏边界 |
| [GREEN 尝试 3](../../../.test-output/task-2-fix-2-green-3.log) | 1 | 1440 下 helper 拖动超时，增加被动记录定位原因 |
| [GREEN 尝试 4](../../../.test-output/task-2-fix-2-green-4.log) | 1 | 实际按下 ID10 后却从 ID13 开始原生拖动 |
| [GREEN 尝试 5](../../../.test-output/task-2-fix-2-green-5.log) | 0 | 临时 200px 间距下 3 尺寸与 1,000 页通过；此版本已弃用 |
| [原完整 integration](../../../.test-output/task-2-fix-2-integration.log) | 1 | 临时 CSS 下原脚本第 330 行顺序等待超时 |
| [正常间距 native GREEN](../../../.test-output/task-2-fix-2-native-green.log) | 0 | 最终 CSS 下可信首卡输入、3 尺寸/新页面/字节/1,000 页通过 |
| [唯一被动诊断](../../../.test-output/task-2-fix-2-integration-diagnostic.log) | 1 | 保留原顺序失败，观测到按下10→根滚动→开始12→drop13 |
| [Ruling10 完整 integration](../../../.test-output/task-2-fix-2-final-integration.log) | 1 | 首卡/顺序/新页面/Referer 已过；后续严格裁剪 h360 失败为361 |
| [Ruling11 量测版完整 integration](../../../.test-output/task-2-fix-2-final-integration-2.log) | 0 | 原整条业务链、实际裁剪640×360、3页PDF视觉比较通过 |
| [完整 review](../../../.test-output/task-2-fix-2-final-review.log) | 0 | 19/19 组，未设 filter；stdout 沿用旧的 focused 标签 |
| [完整 memory](../../../.test-output/task-2-fix-2-final-memory.log) | 0 | 14/14 组，0 browser errors |
| [完整 library](../../../.test-output/task-2-fix-2-final-library.log) | 0 | 24/24 组，未设 filter；stdout 沿用旧的 focused 标签 |
| [永久 fixture 完整 integration](../../../.test-output/task-2-fix-2-final-integration-3.log) | 0 | 仅移除调查性旧361断言后，整条原业务链再次通过 |

按要求顺序执行的最终四套命令，以及随后因单行 fixture 边界修正而单独重跑的受影响套件，原样如下：

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:integration > .test-output/task-2-fix-2-final-integration-2.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:review > .test-output/task-2-fix-2-final-review.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:memory > .test-output/task-2-fix-2-final-memory.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:library > .test-output/task-2-fix-2-final-library.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:integration > .test-output/task-2-fix-2-final-integration-3.log 2>&1
```

最终源码矩阵见 [冻结记录](../../../.test-output/task-2-fix-2-final-source.json)。量测版完整 integration→review→memory→library 在最终 HTML/CSS/review 源码下顺序完成，当时 integration 自身为 `fddf…`；它随后只删调查性断言，最终为 `7b9a…` 并单独完整重跑。其他三套不消费这份 integration fixture，其实际加载的产品资源和各自测试内容没有改变，因此没有重跑它们。

| 文件/阶段 | SHA-256 |
| --- | --- |
| [capture.html，始终未改](../../../capture.html) | `ada7d642ce6969f80cb53aae95fdd04e839d8f62ddc05ba67988207e5223c2a8` |
| [最终 CSS](../../../style.css) | `348d8ebf56ccd1b1801e121800f7e9fd8fb30147ae17cb1ec3f9c4930b109eb8` |
| [最终 review](../../../tests/review.cjs) | `84a66cdc7a599c73fd46f379645c2f80f9b4ae98ca77ce1c93ec6fc3c3feb127` |
| [原 integration 快照](../../../.test-output/v3.1.2/task2-fix2-diagnostic/original-integration.cjs) | `8127cc73b66f834c6d83255d3e28f3a110bf756d5b62f2163b35956c5d0493d1` |
| [仅 native-start 阶段](../../../.test-output/task-2-fix-2-native-start-source.json) | `495deb43a3150b8b125465ff419b47af14945299558a3a7a012742bb44e07a64` |
| [Ruling11 量测阶段](../../../.test-output/task-2-fix-2-measured-crop-source.json) | `fddf55b39bfd8b538597b7bf094834bf55ab379970db36cedb175e62d37add4e` |
| [最终永久 integration](../../../tests/integration.cjs) | `7b9afb5971ca71835dc919c8183c8ec100ef2280a6e9bfc100484d54f73eac24` |

临时 200px 阶段的源码记录另存于 [首轮 integration 快照](../../../.test-output/task-2-fix-2-integration-attempt-1-source.json)，被动观测的内存脚本 SHA 为 `ae1ceed27c1944d7c4fa83e64668f2c5914a547b420968457e29655da724d715`；磁盘原脚本当时仍为 `8127…`。台账中的历史 run 分别指向原阶段快照，没有用最终哈希覆盖旧运行证据。

### 实际几何、交互和截图

最终 [review 结果](../../../.test-output/v3.1.2/review-2LKBss/results.json)、[完整图库几何](../../../.test-output/v3.1.2/review-2LKBss/fix-2-gallery-geometry.json) 与 [量测摘要](../../../.test-output/task-2-fix-2-geometry-summary.json) 记录：

- 1280×720 首屏的图库现在处于分配好的 560px 结果区内部，并由工作区正确裁剪；普通滚动工作区 317px 后，图库为 `506×244`，y=`401.390625…645.390625`，高于操作栏 y665。整张首卡为 `241×170.5625`，卡片、选择框、时间和删除按钮共20个命中点全部通过，批量详情保持打开，文档宽高仍为1280×720。
- 3 个尺寸的实际原生 `dragstart` 都来自可信 ID10，原落点命中末卡13；顺序成为 `[11,12,13,10]`。真实 IndexedDB 字节、签名和其他元数据保持一致，新页面逐项验证同一顺序。
- 4 页与1,000页恢复后的图库高度均244px，外层工作区 `scrollHeight` 均918px；只有图库内容高度由377增至94281px。1,000页场景实际加载6个缩略图，根视口加上下200px允许6个，越界已加载列表为空。
- 已有真实运行中 Stop 组也通过1280×800、1440×900、1920×1080、390×844；四组的按钮20个命中点全部通过，立即取消，状态为stopped、列表仍open，保留页数 `2→3→3`，精确记录与图像字节不丢失。原操作栏和取消实现均未改动。见 [最终 Stop 几何与取消记录](../../../.test-output/v3.1.2/review-2LKBss/fix-1-stop-geometry.json)。

以下均为最终 CSS/review 下真实应用 DOM 截图，我通过 `read_image` 逐张看过；没有重建 HTML、缩略图或安装图像库：

| 实际图像 | 视觉检查 |
| --- | --- |
| [1280×720，展开后首屏](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-before-scroll-1280x720.png) | 3条任务仍展开，面板/画面/导出区在操作栏上方裁剪，首屏允许继续滚动到图库 |
| [1280×720，普通滚动到首卡](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-reachable-1280x720.png) | 完整卡片、选择/时间/删除可见，没有压到固定操作栏 |
| [1440×900，展开且图库可达](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-reachable-1440x900.png) | 待框选0路条目仍在展开列表中，视频和图库保持左右布局，首行控件完整 |
| [390×844，图库可达](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-reachable-390x844.png) | 两列卡片和原生控件可用，底部同一操作栏可见，无横向溢出 |
| [1440×900，普通工作区](../../../.test-output/v3.1.2/review-2LKBss/desktop-1440x900.png) | 视频、文件名/导出范围与有界图库层级保留 |
| [1920×1080，普通工作区](../../../.test-output/v3.1.2/review-2LKBss/desktop-1920x1080.png) | 宽屏分栏和底部操作栏稳定；拍摄时底部少量缩略图尚在懒加载，未把整图都已加载当作截图结论 |
| [1280×800，真实批量运行中](../../../.test-output/v3.1.2/review-2LKBss/fix-1-expanded-running-1280x800.png) | 自动课次扫描中且有待框选课次，启用的 Stop 完整可见 |
| [390×844，真实批量运行中](../../../.test-output/v3.1.2/review-2LKBss/fix-1-expanded-running-390x844.png) | 竖向列表保持展开，Stop 有完整边界，未被本次图库修复遮住 |
| [1280×800，普通工作区](../../../.test-output/v3.1.2/review-2LKBss/desktop-1280x800.png) | 常规窗口下两列首卡及控件完整，图库在底栏上方裁剪 |
| [1440×900，深色](../../../.test-output/v3.1.2/review-2LKBss/dark-1440x900.png) | 长来源名、导出范围、分栏与底栏可读，没有重复绘制条带 |
| [1440×900，减少动态效果](../../../.test-output/v3.1.2/review-2LKBss/reduce-1440x900.png) | 导出页签和表单立即呈现，布局、文件名与图库保持一致；实际取消动画另由交互断言验证 |
| [1440×900，深色高对比](../../../.test-output/v3.1.2/review-2LKBss/contrast-dark-1440x900.png) | 文本、边界和控件对比清楚，底部操作栏不遮首行图库 |

[最终 memory 报告](../../../.test-output/v3.1.2/memory-1794048020994/report.json) 继续通过1,000条元数据/资产/卡片，恢复动画0、最大并发读取2、节点与非零scrollTop复用；该场景实际URL10=允许10，`bounded/oldRevoked/reused/preservedScroll` 均true。256MiB真实OPFS顺序写入与checksum、配额/取消清理、1,000页ZIP字节与共享撤销租约均通过。JS堆采样差49768字节只代表该采样，不作RSS或整机内存结论。[最终 library 报告](../../../.test-output/v3.1.2/library-YhUSiR/results.json) 24组继续覆盖迁移、命名/设置/裁剪/顺序隔离、检查点、0路手动框选、真实持久化失败及批量裁剪所属关系。

### 日志范围、清理与剩余限制

- integration 的整条链在同一临时扩展上下文内完成，原 pageerror 收集覆盖上下文页面，末尾错误数组与非本地拦截数组均为空；真实PDF渲染由既有 `pdftoppm`/图像比较校验3页，原阈值保留。review 和 library 的结果均为 `errors: []`、`blocked: []`，新增的新页面监听也进入 review 的错误列表。
- memory 的各临时上下文收集 pageerror/既有未处理拒绝记录，最终 `errors: []`；路由继续阻断非本地请求，但没有独立的尝试次数计数。这里没有声称所有 console 频道、所有原生弹窗或所有外部请求都经过独立审计。
- 所有15个本轮后台 job 已逐项 `job_output` 收取，退出码和日志均保留；最后一次列表中的本次恢复5个 job 均 completed，没有运行中的 fixture。浏览器、临时上下文和服务器沿用原有 finally 关闭，唯一被动观察随进程结束，没有留下产品开关。没有再次录像或运行其他无关大套件，也没有重做 Task3 的样例7页PDF。
- `node --check tests/review.cjs`、`node --check tests/integration.cjs`、`git diff --check` 和源码暂存后的 `git diff --cached --check` 均exit0；提交前再次核对冻结源码与273行报告原前缀哈希。显式暂存仅3个授权文件，源码提交后工作区干净，再单独追加本报告。追加校验保留原273行前缀，129个本地证据链接均存在，最终产品与测试哈希未变。
- 实测环境仍为 macOS arm64、Node `v26.13.0`、指定 Chromium `156.0.8078.4`。使用现有依赖、localhost合成视频/课程API、临时fixture上下文；未验证 Chrome114/Node20 最低版本、其他操作系统、真实学校媒体/账户或原生权限提示。未声称新增键盘重排能力。

本节报告独立提交后停止所有变更，向控制器交接源码/报告 SHA、最终证据和正确 FIX_BASE，由控制器开展 fresh scoped review；Task3 的后续工作继续由控制器决定。
