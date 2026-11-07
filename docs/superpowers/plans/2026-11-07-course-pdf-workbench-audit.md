# 3.1.2 实施与验证记录

基线：main / ae75c719e5ec4660363b5e29098a22b8de466940（已发布 3.1.1）。执行分支 feat/v3.1.2；工作仅在独立 worktree，原 main、旧 worktree 和已发布安装包保留。

[设计](../specs/2026-11-07-course-pdf-workbench-design.md) · [实施计划](2026-11-07-course-pdf-workbench.md)

## 范围与选择

- 用户要求先做整课 PDF 目录，同时改善 UI 的操作可发现性与动效，指定 Apple Design，并参考 React Bits / Anime.js。转录与自有云 API 暂缓，不上传课程资料。
- Ruling：按用户直接要求执行 PDF 与 UI，常规构图/配色/技术选择由执行者承担，不将其写成用户逐项批准 — 如理解有偏差，隔离分支和截图可供调整，代价是局部返工。
- Ruling：整课合并固定生成课程、课次、页码/时间三级目录；原书签开关只控制旧导出 — 保证用户默认就能找到课次并保持旧字节，代价是新格式不提供关闭目录的额外开关。
- Ruling：保留原生 DOM，用 CSS / WAAPI 做可取消的局部反馈，不引入 React 或动画运行时 — 参考交互原理并控制维护量，代价是没有通用弹簧/手势动画框架；实际裁剪仍实时跟随。
- Ruling：新增 motion.js 独立管理视觉反馈并纳入打包，从 33 到 34 个资源 — 避免业务状态与动画互相等待，代价是一份小型资源及对应打包校验。
- Ruling：本地忽略规则覆盖设计目录，仅强制加入本次自写的设计、计划、验证记录；不改变忽略策略、不带入其他文档 — 保留可审查的执行依据，代价是分支增加三份过程文档，可单独回退。
- 开发/审查按任务串行，只有只读走查并行；每任务使用全新实现者和全新规格/质量审查者。可用子模型为 magpie-responses/codex/gpt-6.1-sol；PDF 用 xhigh，UI 与最终整体审查用 max，版本/文档用 high。
- 规则检索工具仍未注册，不能声称已执行该检查；已读取本地约束，相关经验检索无匹配。using-git-worktrees 未在当前技能目录提供，已用标准 git worktree 创建并验证隔离分支。
- 只读调查确认 Node 导出单元测试实际使用现有 pdf-lib / Sharp 开发依赖；文档中的“仅内置模块”说法需在 Task 3 纠正，不因此新增依赖。

## 参考与实现依据

- [React Bits Animated List](https://reactbits.dev/components/animated-list)：列表反馈、选择指示。
- [React Bits Stepper](https://reactbits.dev/components/stepper)：方向与当前位置提示。
- [Anime.js Animatable](https://animejs.com/documentation/animatable/)：读取当前值、针对频繁变化重定向。通过正文提取工具读取，未把先前导航截断误称为完整文档。
- Apple Design 技能由用户直接提供；默认无过冲、反馈立即响应、动画可中断，减少动态效果与透明度均有回退。参考不等于复制组件或要求改用 React。

## 基线验证

- Node v26.13.0；npm test：207/207 通过；npm run test:release：17/17 通过，当前 33 成员。
- 既有 Chromium 1248 可供本地隔离测试，使用 PPT_TEST_BROWSER 显式指定；不下载新浏览器、不接触日常浏览器配置或真实课程登录。
- 只读 PDF/UI 走查报告已完成，未执行测试、改源码、联网或访问真实资料。

## Task 1 — 整课 PDF

状态：完成，独立 Spec PASS / Quality APPROVED，C0/I0/M0，无待修复或停放发现。实现提交 `49a4d348c6caf3e3b40d0315ef32e1e21597d860`，独立完整报告提交 `dd2b71c01f6466712f4a54269a50bec5210e7348`；审查范围 `20760988..dd2b71c`，两提交、70,162 B 审查包。独立审查者 db42963c-2ba9-4da0-87a1-952090b5631c（codex/gpt-6.1-sol / xhigh）的完整 61 行报告已读取，记录了额外源码范围及对应风险；实现者与审查者均已停止。此 gate 不等同于整版发布批准。

- 新增流式 writeCoursePDF 与主工作区/批量列表两个独立课程域的入口。新格式固定生成中文三级目录；每节课独立规划纸页，奇数讲义尾页保留空下半区，连续页码和目录目的地共享规划。旧格式、原始 JPEG 和书签开关含义保持原样。
- genuine RED：完整 export 中原有 71 项通过、新增 17 项因 writeCoursePDF 不存在而失败；focused 新增 17/17 GREEN，最终完整 export 88/88 GREEN。library 23 组、improvements 25 组顺序运行并通过，产品源码在后两组排查期间未再改动。语法与 diff --check 通过。
- 自动断言覆盖递归目录链接/Count、Unicode 与孤立代理项、两种版式、时间有效性、[3,1]/[1,1]/[2,3] 讲义边界、连续编号、原 JPEG、逐张背压、1000 页元数据及六阶段拒绝。控制器覆盖课程 A/B/显式空范围、页序和写入时快照、busy/consent、OPFS 失败恢复，以及真实 IDB 命名/课次提交持有。
- library 断言其上下文无脚本错误及非本地请求；improvements 的脚本错误断言覆盖导出上下文，非本地请求断言覆盖两个上下文，首个上下文未新增脚本错误监听。没有真实站点、资料目录、凭据、云请求或新依赖安装。
- 四次 improvements 在新命名用例下载事件处超时。最初 stale releaseNaming 假设被重跑否定；随后观察到正确 blob/新 Unicode 文件名的原生 anchor click、true userActivation 与正常完成状态，但未收到 download 事件。独立 localhost 原生 probe 的普通/中文/emoji 文件名分别可下载；连续测试第 11 次未送达，超时后后续可送达；在第 11 次前重新载入文档的 variant 18 次全部送达。精确时间窗口和文档范围未测，不宣称为 Chromium 通用规范。
- Ruling：有独立 probe 证据后，只在新增独立事务夹具的开始边界正常空闲后重载文档，保留合成 IDB，再安装真实 hold；不在被测动作/在途事务中重载，不改权限或安全配置、不加固定 sleep、不削弱业务断言 — 排除浏览器下载送达抑制，代价是隔离可能掩盖文档态或未保存状态缺陷，所以保留原测试链与持久数据/真实事务核对。最终夹具未保留 stale-latch 修补或 anchor monkeypatch。
- 证据：[完整导出 GREEN](../../../.test-output/task-1-export-green.log)、[library GREEN](../../../.test-output/task-1-library-green.log)、[improvements 最终 GREEN](../../../.test-output/task-1-improvements-green-final.log)。完整报告保留四次失败、三个独立 probe 和全部 11 个已收集作业 ID；浏览器/HTTP 服务均按 finally 关闭。
- 仍未手测 PDF.js / Acrobat / Preview 的目录展开和滚动行为，未运行实际 Chrome 114 或 Node 20；当前结果来自 Node v26.13.0 与显式指定的 Chromium 1248。界面、版本和最终安装包属于后续任务。

## Task 2 — 工作台与动效

状态：已完成，Task 2 的初审 I1 已在第 1/5 轮修复并经全新限定复审通过，无未解决发现。以下保留初次交付及修复过程，最终源码/报告 HEAD 为 `b7021c7c9ed49c8876e732ab2174aa9ee52f6700`。初次 BASE `3f666a69cf01071d03a08c2773f3507ca93cb33e`；唯一实现者 11bf1c1c-e5b7-44f8-85aa-227169d3190a（codex/gpt-6.1-sol / max）已停止。源码提交 `1c67cbb886346982397e6e90c26c2016726d402c`，完整 180 行报告单独提交 `e3952346d71f1bd78cf105b2987d01a241f430bf`。父代理已读报告，核对 HEAD 和范围：13 个白名单源码/测试文件、471 行增加和 101 行删除，另加自己的报告；只留下父代理预期的审计文件未暂存。

- 宽工作区批量入口、结果旁全部/所选/整课导出与设置、来源全名和 0 路提示、明确独立的当前/批量课程、390px 堆叠、暗色/对比/实色回退及可中断局部反馈已实现。新增 38 行 [motion.js](../../../motion.js)，原 141 个 ID 全部保留，当前 154 个 ID 唯一；业务不等待动画，裁剪维持 1:1，新增可见卡片每批至多 12 张，恢复 1000 页不批量动画。
- 顺序完整验证为 review 17/17、features 11/11、memory 14/14、library 24/24、improvements 25/25、release 17/17（34 资源），均 exit0。前三套已覆盖最终 JS/CSS，之后只删除两个局部编号 span；后三套和最终 focused 5/5 跑在最终 HTML 上。10 个改变的 JS/CJS 语法与 diff 检查通过，不能将早先整套记录冒称最后 HTML 字节的重复运行。
- memory 的当次 1000 页恢复记录为 animations=0、maxReads=2、activeURLs=allowedImages=13、bounded/oldRevoked/reused/preservedScroll 均为 true；13 对应当次视口，不是所有尺寸的固定上界。improvements 的非本地请求断言覆盖两个上下文，脚本错误监听仍只覆盖导出上下文；memory 拦非本地请求但不统计外联尝试为零。实际环境为 macOS arm64、Node v26.13.0、Chrome 156.0.8078.4；最低版本、真实学校媒体及原生权限弹窗未实测。
- 最初截图重复 raster 页头，经核对仅一份 app-shell/唯一 ID，改为实际视口并在尺寸/滚动/media 改变后等待两帧的测试采集后消失；未证明 Chromium 内部具体成因。父代理要求当前整课入口直接可见、统一流程编号，实现者移除本次新增 fold 及两个局部序号，保留原原生详情/对话框和唯一处理器。父代理独立读过最终 [桌面](../../../.test-output/v3.1.2/review-mDvnrT/desktop-1440x900.png)、[窄屏结果](../../../.test-output/v3.1.2/review-mDvnrT/results-390x844.png)、[深色](../../../.test-output/v3.1.2/review-mDvnrT/dark-1440x900.png)：入口可见、按钮换行、无重复页头或编号矛盾；实现者还检查了其余六张实际尺寸/偏好图。
- 可选录制在 newPage 因缺少 Playwright 专用 ffmpeg-1011 可执行文件失败，未安装或绕过，临时 hook 完全撤回后正常 focused 通过。没有交付视频；动态行为有实际 retarget/live reduce/焦点/关闭/12 卡片断言，不用静态图替代时间行为证明。全部 12 个后台作业已由实现者收集，浏览器/服务按 finally 关闭。
- 全新 36e08890-e7cf-4ca2-af7f-638a1c81a200（codex/gpt-6.1-sol / max）完成 `3f666a69..e3952346` 两提交/141,490 B 的独立审查：Spec Issues found / Quality Needs fixes，C0/I1/M0。父代理已读完整 123 行报告。审查者一次连续读完 1,767 行包、180 行实现报告和指定材料，独立看三个要求截图及说明风险后加读的最终展开批量图；未运行 Git、命令、测试、浏览器、网络或子代理，未读父代理审计，已停止。其他已检查契约合规，未把环境未知当成缺陷。
- I1：1440×900 展开含自动课次和待裁剪课次的批量区域后，预览滚动区下方的共用停止按钮被遮住；开始批量的实际处理器保留展开状态，controls 会启用同一个屏外 Stop。取消逻辑没有被证明损坏，但运行时需要另滚预览才能找到停止，违反设计原有可见性要求。父代理独立读最终展开图，并核对设计第 38 行、CSS 第 108–118 行及 HTML 第 192–200 行，确认这是具体布局缺陷；旧几何断言只测折叠批量状态，不能用通过记录替代这一缺失场景。
- Ruling：在有限高度和展开批量状态下，运行中停止可见优先于“预览下”的初始静态位置；允许锚定同一个已有停止控件/操作行，不复制 ID 或处理器、不改取消及保留逻辑，不靠折叠批量或测试预滚动规避 — 代价是固定工具区可能占用少量可视空间，需要桌面和窄屏命中/遮挡检查。设计据此明确优先级，由原实现者承担修复 round 1/5；修复及全新 scoped re-review 结果见下，未跳过此 gate。
- 父代理额外核实发布消费者：release workflow 的 56–61 行严格匹配唯一版本 span 与 README 当前版本字段。已要求 Task 2 原样保留恰好一个 `<span class="version">3.1.1</span>`，Task 3 再统一其文本为 3.1.2；不为改版修改发布 workflow。最终独立 ZIP 校验工具也检查这两个版本标记，当前只通过语法检查，尚未验证新安装包。

### Task 2 I1 修复第 1/5 轮

- 原实现者在干净 `fe1798b988e67e3e5eef71faada7a7cb82c6757e` 上修复。源码 `76341d6141b2105a243ce2ee290f892a9fa678c6` 仅改变 capture.html、style.css、tests/review.cjs，97 行增加、7 行删除；同一报告只追加第 182–273 行，报告提交/当前 HEAD 为 `b7021c7c9ed49c8876e732ab2174aa9ee52f6700`。父代理已读追加内容、核对干净 HEAD/提交范围；实现者已停止，六个本轮作业均收集、fixture 按 finally 清理。
- 真实 RED 通过实际 batch-start、localhost MP4、OPFS、loadRemote、fastScan 与 save，仅在提交一帧后用有界 scanner 等待真实 abort；不赋值 busy/running/disabled 制造状态。旧 1280×800 中已启用 Stop 的 y=820.0625..854.0625，超出 viewport800 与 capture clip780，五点命中全 false，capture.scrollTop=0、批量仍展开。失败为 `AssertionError [ERR_ASSERTION]: enabled Stop escapes its actual clipping context viewport`。
- 同一 Start/Stop 组移到 app-shell 保留第三行，窄屏底部 sticky/nowrap，操作行高 55px。capture.js、取消/保留算法均未改变，154 个 ID 完全一致且唯一、精确 3.1.1 span 仍唯一。先 focused GREEN，再仅调整窄屏换行并重跑最终 focused 1 组/四尺寸；之后完整 review18/18 → memory14/14 → library24/24 顺序 exit0，覆盖完全相同的最终 HTML/CSS/新增测试。没有把旧 features/improvements/release 记录扩称本轮重跑。
- 实际运行几何覆盖 1280×800、1440×900、1920×1080、390×844；Stop 分别为 `(668,756,120,34)`、`(668,856,120,34)`、`(668,1036,120,34)`、`(254,800,120,34)`，五点均命中。每轮真实点击后 immediateAbort=true、state=stopped、batchStillOpen=true，逐记录核对旧/新页全部元数据、签名、图片字节 `2→3→3`。父代理独立读过最终 [运行中 1440](../../../.test-output/v3.1.2/review-LR5goa/fix-1-expanded-running-1440x900.png) 与 [运行中 390](../../../.test-output/v3.1.2/review-LR5goa/fix-1-expanded-running-390x844.png)：同一停止按钮位于可见底部行，未见横向裁切；窄屏仍通过纵向滚动查看列表其余内容。
- memory 维持 1000 页/节点/scroll、maxReads2、restore animations0、bounded/oldRevoked/reused/preservedScroll=true，本轮 activeURLs=allowedImages=10；它随结果区高度变化，不是固定 13。review/library 的实际脚本错误与 blocked 列表为空；memory 错误列表为空、会阻断非本地请求但不累计零尝试列表。仍是 macOS arm64 / Node26.13.0 / Chromium156.0.8078.4，不扩大为最小版本、真实学校视频或原生许可弹窗证明。
- 正确定界包是上次已审查 `e3952346..b7021c7`，三提交 49,415 B，包含中间父代理文档裁定，不能改用 fix-start。全新 affdb2c4-496e-43c6-8b11-8fad49344d8c（codex/gpt-6.1-sol / high）仅核对 I1 和本次 diff 新破坏；完整只读 brief、包、追加报告和两张最终运行图已交接，无命令/Git/重复测试/联网/委派权限。该审查者返回 I1 ADDRESSED，Scoped Spec APPROVED / Quality APPROVED，新发现 C0/I0/M0，Out-of-Scope None；父代理读完完整 96 行报告。它一次读完 450 行修复包、限定材料与两张最终运行图，以额外的具体生产者/消费者问题核对真实 source-load/scan/save/Stop/保留链路，未执行测试、Git、命令、浏览器或联网。报告将同步源码证据与下一次浏览器 evaluation 的 abort 断言分开，不把后者夸成计时指标；原始六套与本轮覆盖源证据、十个 URL 的视口限定和权限/最低版本边界均保留。实现者和审查者已停止，Task 2 gate 完成；Task 3 可从后续干净文档提交启动。

## Task 3 — 版本与整体验证

状态：暂停，等待原 Task2 owner 处理新增低高度布局回归。Task3 source checkpoint `20b67b5efc6a79c51adef33bfc4ca27a97532860`（授权十文件，43+/38−）和独立 128 行未完成报告 `5ccfb360e2d65c2fdfec00c427f87dbda4916353` 已提交，父代理完整读取报告并核验 HEAD 与范围；剩余五套尚未运行。任务原干净 BASE 仍为 `cc8a935bd5cb3461846fa2ae8d4c7feeb9770d22`，全新独立实现者 `de484aa3-3d8e-43af-9a85-a169486c9d52`（codex/gpt-6.1-sol / high）。范围限 3.1.2 元数据、当前版本夹具、使用/测试说明，以及 CI browser 步骤追加 `test:improvements`；完整九套顺序回归和中文同日两课/奇数讲义 PDF 渲染证据待回报。产品 JS/CSS/PDF/取消与存储算法不可在此任务修改；发现真实业务失败则交回原任务实现者。整体审查、根目录实际打包与校验、发布及工作区清理由父代理负责，实现者无这些动作权限。

首次 integration probe 在 tests/integration.cjs:212 期望 `/请先补填/`，实际为 `导出失败：PPTMotion is not defined`；作业 `bash-f46eb317080f4612` exit1。父代理只读核实 tests/integration.cjs:102 临时扩展复制表漏掉 motion.js，capture.html:359–361 已在 capture/workspace 之前加载它，scripts/release.cjs:9 实际安装清单也已有该资源。这是夹具消费接口遗漏，未发现新的产品业务问题。Ruling：限定 Task3 为该复制表加入 motion.js，其他断言、权限、拦截与产品源码均保持；只重跑受影响的 integration，再继续后续串行套件。代价是复制清单存在两处，可能继续漂移，须保留这次真实失败与最终打包/强断言核验；不通过模仿 PPTMotion、忽略异常或削弱缺字段检查取得通过。此前本轮 unit224/224、release17/17、bridge三来源已过，只能按实际源覆盖分别记录，不能改称修正后全套重跑。

## Task2 集成跟进 — round2/5，I2 尚待修复

motion 清单补齐后，integration 的 MP4、命名、缓存释放与 HLS 四页提取均已跑过，但原 first→last 拖拽等待在 tests/integration.cjs:330 超时。原实现者只做一次被动诊断，job `bash-888f544487874d9f` exit1，所有 job 已收取；临时观测已还原，integration 指纹精确恢复 `8127cc73b66f834c6d83255d3e28f3a110bf756d5b62f2163b35956c5d0493d1`，没有调整原 dragTo、强断言、窗口或折叠状态。

父代理读两份 JSON 和实际 1280×720 截图：batch 展开高302.390625，results bottom645，但 #pages y718.390625、height18、bottom736.390625，首卡中心与末卡目标均在屏外。Playwright 自动滚动后 windowY16/#pages.scrollTop198，可信 dragstart 实际抓到第三卡12，drop到13，应用正确持久化为 `[10,11,13,12]` 并显示“已调整截图顺序：第4页”。这排除了本次 persistOrder 吞掉事件的说法，也不能作为首卡已移动的通过证明。图库本身越出工作区并落到底栏下，是用户可遇到的布局回归；不能仅靠关闭批量区掩盖它。证据为 task3 的 `task3-dnd-before.json`、`task3-dnd-failed.json`、`task3-dnd-failed.png` 及诊断日志。

Ruling：把 I2 交回原 Task2 owner，在保持展开批量和现有固定 Start/Stop 的条件下修复低高度工作区，让用户能通过正常有界滚动到完整卡片，不覆盖底栏、不改排序算法；Task3 checkpoint 后暂停、无并行 mutator。代价是调整最小可用空间/滚动层并增加低高度几何、真实原生拖拽、1000页 lazy 与 Stop/保留回归；保留原 integration 参数、精确页序与新页持久化等强断言。使用同一 Task2 报告追加证据，round2/5 的新独立 scoped review 从上次已审查 b7021c7 定界，不能用 checkpoint 偷换基线；Task3 其他文件由其后续独立 gate 处理。原三套/七页 PDF 仅按未改来源保留，新的 CSS 覆盖与剩余套件另记，不伪称九套已过。

## 最终审查与产物

状态：待完成。需记录整体审查结论、实际截图/合成 PDF、34 成员 3.1.2 安装包的 CRC/源字节/SHA-256，以及实际测试环境与未验证项。
