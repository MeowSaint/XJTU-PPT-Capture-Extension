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

状态：完成。I1 已在第 1/5 轮、I2 已在第 2/5 轮分别经全新限定复审通过；当前 I1/I2 均无未解决或停放发现。最终源码/报告 HEAD 为25bfd40f225f57d4061fbc98c75064a2b0a14a1e。以下先记录初次交付及第 1 轮历史，其上一轮源码/报告 HEAD 为 `b7021c7c9ed49c8876e732ab2174aa9ee52f6700`。初次 BASE `3f666a69cf01071d03a08c2773f3507ca93cb33e`；唯一实现者 11bf1c1c-e5b7-44f8-85aa-227169d3190a（codex/gpt-6.1-sol / max）已停止。源码提交 `1c67cbb886346982397e6e90c26c2016726d402c`，完整 180 行报告单独提交 `e3952346d71f1bd78cf105b2987d01a241f430bf`。父代理已读报告，核对 HEAD 和范围：13 个白名单源码/测试文件、471 行增加和 101 行删除，另加自己的报告；只留下父代理预期的审计文件未暂存。

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

状态：完成。全新bb1baa93-d5a2-4aed-b3d8-30b81d5d4f55（sol/high）Spec PASS / Quality PASS，C0/I0/M0，无修正或停放发现；父代理已完整读取137行报告，实现者与审查者均停止。最终两份文档提交 d50620795bd6f48862d059661385d5747db3e950（4+/2−），同一报告最终追加131–259，独立报告/干净HEAD a9c2b9ce98901ad3cc427680547af0965ba3191b；父代理已完整读取追加并核验范围。恢复后的完整features11/11、improvements25/25顺序exit0且作业均已收取。下述为checkpoint与暂停历史：Task3 source checkpoint `20b67b5efc6a79c51adef33bfc4ca27a97532860`（授权十文件，43+/38−）和独立 128 行未完成报告 `5ccfb360e2d65c2fdfec00c427f87dbda4916353` 已提交，父代理完整读取报告并核验 HEAD 与范围；checkpoint当时剩余五套未运行；当前integration/review/memory/library已由原UI owner按最终产品资源验证，features/improvements待原Task3作者顺序完成。任务原干净 BASE 仍为 `cc8a935bd5cb3461846fa2ae8d4c7feeb9770d22`，全新独立实现者 `de484aa3-3d8e-43af-9a85-a169486c9d52`（codex/gpt-6.1-sol / high）。范围限 3.1.2 元数据、当前版本夹具、使用/测试说明，以及 CI browser 步骤追加 `test:improvements`；完整九套顺序回归和中文同日两课/奇数讲义 PDF 渲染证据待回报。产品 JS/CSS/PDF/取消与存储算法不可在此任务修改；发现真实业务失败则交回原任务实现者。整体审查、根目录实际打包与校验、发布及工作区清理由父代理负责，实现者无这些动作权限。

首次 integration probe 在 tests/integration.cjs:212 期望 `/请先补填/`，实际为 `导出失败：PPTMotion is not defined`；作业 `bash-f46eb317080f4612` exit1。父代理只读核实 tests/integration.cjs:102 临时扩展复制表漏掉 motion.js，capture.html:359–361 已在 capture/workspace 之前加载它，scripts/release.cjs:9 实际安装清单也已有该资源。这是夹具消费接口遗漏，未发现新的产品业务问题。Ruling：限定 Task3 为该复制表加入 motion.js，其他断言、权限、拦截与产品源码均保持；只重跑受影响的 integration，再继续后续串行套件。代价是复制清单存在两处，可能继续漂移，须保留这次真实失败与最终打包/强断言核验；不通过模仿 PPTMotion、忽略异常或削弱缺字段检查取得通过。此前本轮 unit224/224、release17/17、bridge三来源已过，只能按实际源覆盖分别记录，不能改称修正后全套重跑。

## Task2 集成跟进 — round2/5，I2 已经独立限定复审通过

motion 清单补齐后，integration 的 MP4、命名、缓存释放与 HLS 四页提取均已跑过，但原 first→last 拖拽等待在 tests/integration.cjs:330 超时。原实现者只做一次被动诊断，job `bash-888f544487874d9f` exit1，所有 job 已收取；临时观测已还原，integration 指纹精确恢复 `8127cc73b66f834c6d83255d3e28f3a110bf756d5b62f2163b35956c5d0493d1`，没有调整原 dragTo、强断言、窗口或折叠状态。

父代理读两份 JSON 和实际 1280×720 截图：batch 展开高302.390625，results bottom645，但 #pages y718.390625、height18、bottom736.390625，首卡中心与末卡目标均在屏外。Playwright 自动滚动后 windowY16/#pages.scrollTop198，可信 dragstart 实际抓到第三卡12，drop到13，应用正确持久化为 `[10,11,13,12]` 并显示“已调整截图顺序：第4页”。这排除了本次 persistOrder 吞掉事件的说法，也不能作为首卡已移动的通过证明。图库本身越出工作区并落到底栏下，是用户可遇到的布局回归；不能仅靠关闭批量区掩盖它。证据为 task3 的 `task3-dnd-before.json`、`task3-dnd-failed.json`、`task3-dnd-failed.png` 及诊断日志。

Ruling：把 I2 交回原 Task2 owner，在保持展开批量和现有固定 Start/Stop 的条件下修复低高度工作区，让用户能通过正常有界滚动到完整卡片，不覆盖底栏、不改排序算法；Task3 checkpoint 后暂停、无并行 mutator。代价是调整最小可用空间/滚动层并增加低高度几何、真实原生拖拽、1000页 lazy 与 Stop/保留回归；保留原 integration 参数、精确页序与新页持久化等强断言。使用同一 Task2 报告追加证据，round2/5 的新独立 scoped review 从上次已审查 b7021c7 定界，不能用 checkpoint 偷换基线；Task3 其他文件由其后续独立 gate 处理。原三套/七页 PDF 仅按未改来源保留，新的 CSS 覆盖与剩余套件另记，不伪称九套已过。

## Ruling10 — 布局修复后区分原生手势与测试 helper

正常20px padding/有限560px第二行的 CSS 指纹为 `348d8ebf56ccd1b1801e121800f7e9fd8fb30147ae17cb1ec3f9c4930b109eb8`。新增 review 用例用连续原生鼠标已在三尺寸通过可信首卡10启动、精确 `[11,12,13,10]`、新页读取持久化/原字节与1000根高度独立性。原 integration helper 仍超时，因此只执行一次忽略目录中的内存被动诊断；job `bash-f2af4a55719542b5` exit1已收取，磁盘 integration 原指纹8127…不变，观察版内存指纹ae1ceed27c1944d7c4fa83e64668f2c5914a547b420968457e29655da724d715。父代理完整读135行 summary.json 与真实 after.png。

此时 document=1280×720，results高560，图库已是 y401.390625..645.390625/h244，正常位于 y665 的55px底栏之上，batch仍open，缩略图4/allowed4/outside[]。原 helper 的可信 pointerdown 为首卡10、pages.scrollTop0，首次可信 dragstart却是第三卡12、rootScroll121；window0/workspace317不变，drop13后正常保存 `[10,11,13,12]`。布局溢出与输入手势错位因此有独立证据。父代理还只读核实已装 Playwright1.62.1 的 coreBundle.js:23549–23568先source move/down，再对target执行pointer action；:19851–19888在target的首个mouse.move之前scrollIntoView，和实测相符。没有修改依赖或产品排序。

Ruling：限定原 UI owner 只将 integration 的拖拽动作改为正确连续原生鼠标：在源卡内真实移动并断言可信首卡 dragstart 后，正常滚到末卡原 x=width-4/y12 右半落点释放；仍断言原精确序列、刷新持久化和所有后续 Referer/PDF/JPEG/IDB，不改强断言、viewport、batch、权限、拦截或timeout。代价是测试多维护几步输入与启动断言，需保留真实事件/哈希和完整链通过，不能靠赋状态/合成事件/force/sleep；不扩大图库只为让 helper 同时看到两行。此为 Ruling9“保留原 helper”的证据驱动限定例外，不是产品算法修补或削弱排序目标。

## Ruling11 — 保持精确裁剪断言，修正框选输入的几何前提

正确原生首卡手势后的完整 integration（integration 指纹495deb43a3150b8b125465ff419b47af14945299558a3a7a012742bb44e07a64，CSS348d不变，job bash-9f8345d836894e53已收取exit1）已通过原精确排序、新页持久化、HLS Referer/cache/PDF，推进到原375/现395裁剪断言：真实解码为640×361，而原强断言要求高度360。父代理读integration365–429、capture853–879/922–966：测试取整个overlay包围盒25%→75%，产品则按video.clientWidth/clientHeight与原始宽高计算contain后的真实图像界限，再用PointerEvent映射并round源像素尺寸。整个overlay半高不必等于含留边图像的半高，旧用例的精确360前提需要真实几何核对。

Ruling：只允许同一原UI owner在这一框选输入块依据公开video尺寸/原始比例与overlay/canvas坐标，选择扣除contain留边后的真实图像25%→75%原生鼠标点；完整记录公开尺寸、两端点与只读实际crop/输出，不从输出或私有crop倒算expected。保留原宽度范围、高度严格360和保存/预览decode/恢复full/后续全部强断言，不改产品crop/frame/JS/CSS、viewport、权限、route或timeout。若真实几何不支持该解释，先报告而不放宽断言或继续换值。代价是测试多维护图像坐标规划与公开几何记录；不是把361算通过，也不代表已完成最后整链。原生排序Ruling10不变，其他文件仍禁止修改。

### Task2 round2 最终交付与限定复审

- 原 owner 已停止；源码 `353085aa6ba391d14a7767540ca036ae00639561` 仅 style.css / tests/review.cjs / tests/integration.cjs，157+/6−。同一报告只追加117行，原273行前缀字节不变，报告/干净 HEAD `25bfd40f225f57d4061fbc98c75064a2b0a14a1e`。父代理完整读取274–390，核对 HEAD、两提交范围及无其他修改。
- 最终 CSS348d 正常16/20px滚动定位间距、批量 max-content / 工作区第二行 min560 / overflow:auto；图库4页与1000页均高244，外层scrollHeight均918，只有内容377→94281。1280×720普通滚动317后，首卡及选择/时间/删除20点命中全部通过；1000页加载6=当前允许6，outside为空，不按全列表撑高观察根。三尺寸可信首卡10→末13，精确[11,12,13,10]、新页读取和元数据/签名/图片字节保留；原4尺寸Stop20点/实际abort/2→3→3仍通过。
- Ruling11量测确认公开client417×235/raw1280×720/contain417×234.5625，旧整overlay半高预测360.671，新图像点保存后真实decode640×360。旧预测必须361仅为本机归因guard；移除新增调查断言后，严格实际h360/原宽范围和所有后续业务断言均保留，公开预测日志仍在，永久fixture再次完整通过。对original8127掩去仅R10/11输入块后其余文本逐字节相同。
- 顺序完整 integration量测fddf→review19→memory14→library24 均exit0；仅删新增调查guard后，最终integration7b9再次整链exit0，CSS348d/review84a66及其他三套实际消费的资源不变，不把旧fddf冒称最终fixture。15个job均已逐项收取并finally清理，3PDF渲染/原Referer/0路重载/IDB race与严格输出全部通过；未重复其他5套或7页合成PDF。memory仍maxReads2/restore0animations/节点scroll复用，URL10=允许10为特定视口；JS堆采样差49768B不是RSS，非本地仅阻断未独立计数。
- 父代理独立读最终[低高度首屏](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-before-scroll-1280x720.png)、[普通滚动可达首卡](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-reachable-1280x720.png)、[390图库](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-reachable-390x844.png)：首屏保留展开任务，普通滚动后完整卡片位于底栏上方，窄屏无横向溢出。截图不独立证明原生事件/时序；这些由真实输入和强断言支撑。
- 正确b7021c7..25bfd40限定包为9提交/150,386B，包含已知Task3 checkpoint与父代理裁定；全新8963cda0-b33e-4444-a7b7-5951840bbd22（sol/xhigh）完成I2与本次diff新破坏核对，I2 ADDRESSED、Scoped Spec APPROVED / Quality APPROVED，新C0/I0/M0、无范围外发现；父代理完整读取其84行报告。审查者一次不重叠读完1228行包、完整brief（仅补读换行后的原长段）、同一报告274–390及恰好3张指定图，并按具体问题核对有限根/真实字节/原生开始/公开裁剪/Stop源码。没有执行Git、命令、测试、浏览器或网络，不把供给的哈希/作业记录夸成独立实跑，已停止。原I1保护保留；Task3其他元数据/验证仍需独立gate，不用本次限定结论代替。Task2 current gate完成，可从后续干净controller closure恢复原Task3作者。环境仍Node26.13.0/Chrome156/macarm64/合成本地，最低版本、真实课程与原生权限未实测。

## Task3 最终采用的验证记录

下表按实际源码消费和哈希采用结果，不是九套在同一HEAD重跑。恢复前后的42项来源均一致；Task3没有代改UI owner的CSS或两个原生输入块。旧报告128行/15,681 bytes原封保留，三次失败仍为失败。

| 类别 | 实际采用的通过记录 |
| --- | --- |
| unit | Task3原224/224，Node测试/模块来源未变 |
| release | Task3原17/17、34成员临时副本；不代表最终CSS真实ZIP已验证 |
| bridge | Task3原三种iframe来源通过，foreign拒绝；注入模块未变 |
| integration | Task2最终永久7b9夹具完整整链，实际crop640×360、精确页序/新页/Referer/IDB/3PDF保持 |
| review | Task2最终19组，含低高度图库、原生输入、原运行中Stop，errors/blocked空 |
| features | Task3恢复后11组，job bash-ecec9eef37c946ba，exit0 |
| memory | Task2最终14组，1000页/256MiB缓存/maxReads2/restore0，非本地仅路由阻断无零尝试计数 |
| library | Task2最终24组，errors/blocked空 |
| improvements | Task3恢复后完整25组，job bash-457a78a334c648f4，exit0，真实naming/lesson IDB阻塞与提交；旧stdout focused文案不代表过滤 |

实现者所有作业已收取并finally关闭，无活动mutator。当前环境macarm64/Node26.13.0/npm11.20.0/Chrome156.0.8078.4/Playwright1.62.1/Sharp0.35.4/pdf-lib1.17.1/FFmpeg9.0.2/Poppler26.11.0；未装依赖。来源/93链接/prefix校验和42哈希在task3结果目录中。features的service-worker更新API用忠实本地包装器，不声称全浏览器零外联；improvements page-error只覆盖其实际监听上下文。JS heap49768B是采样差不是RSS。最低Chrome114/Node20、其他OS/真实课程/原生权限和PDF侧栏未人工验收，未产出可选录像。

合成中文同日08:00/10:00的[3,1]课次sample沿用未改pdf.js来源3ee30c2ae58766de877e1fd3f0a6689e8b76507e60eab7b8cc14668069703be1：single4页/handout3张，全部7页由实现者逐页看过；父代理看过handout2/3和最终实际桌面1440、低高度/390图，目录/原JPEG/目的地/空半页由独立硬编码期望核验。没有用图像代替原生目录点击或真实时序证明。

Task3正确冻结包 cc8a935..a9c2b9c，11提交/175,477B；fresh bb1baa93-d5a2-4aed-b3d8-30b81d5d4f55（sol/high）按39行review brief完成Spec+Quality双PASS/C0I0M0。完整1373行包仅读一次，七页PDF和恰好三张实际UI均看过；按问题核对UTF16根/目的地/逐张背压断言、版本/34消费者、原生输入/运行Stop及未弱化的下游链。额外结果字段/日志尾部/owner三SHA先向controller申请后最小补读；不执行Git/命令/测试/浏览器/网络/委派，不读包外controller audit。供给运行与独立源码检查区分清楚，旧临时release不代替实际ZIP。整体最高模型审查与实际34成员CRC/sourcebytes/SHA仍是后续gate。

## 最终审查与产物

状态：完成本地实现、整分支审查与真实安装包验证；尚未发布远程版本。

- 整体最高可用模型独立审查 ee70d102-57e8-431e-966e-f78b4c095286（codex/gpt-6.1-sol/max），冻结原main ae75c719e5ec4660363b5e29098a22b8de466940..e94f02d1aa0bb116d1baa5bea3fd56a45aea40f1，22提交/27文件/410,126B/4150行。Spec Compliance PASS、Quality APPROVED、C0/I0/M0，无需最终修复波次，无停放发现。父代理完整读156行报告；审查者仅读一次完整包，加4个具体小范围生产/消费补读和7张指定视觉证据，不执行Git/测试/浏览器/网络/委派或修改源码，已停止。
- 2026-11-07本地实际执行npm run release，随后独立Python逐成员检查。打包前已核验物理worktree/tmp/last-release/finalZIP解析路径、无symlink、根目录旧ZIP为空，未移动原仓库/旧worktree的发布产物。新ppt-capture.zip为1,271,902 bytes、34个精确有序Deflate成员；全部CRC正确，成员内容逐字节等于当前源文件，manifest/package/rootlock/UI/README版本3.1.2和motion加载顺序正确。SHA-256：8c32ffbe2e935f9df968e27397383f41dbde1c2b6931c0fab87b9d739358de6f。证据：[preflight](../../../.test-output/v3.1.2/release-preflight.json)、[完整校验](../../../.test-output/v3.1.2/release-verification.json)。这项才补齐旧17-test临时payload没有证明的新CSS实际安装包字节。
- 合成目录示例：[single](../../../.test-output/v3.1.2/task3/course-single.pdf) / [handout](../../../.test-output/v3.1.2/task3/course-handout.pdf)，前述4页/3张SHA未变；实际UI与全部7页渲染保留在结果目录外，不跟随SDD工作区清理。界面截图是本地合成数据，不是用户真实课程。
- 测试来源采用前述九类精确矩阵，未宣称九套在最后SHA重跑。环境与未验证项保持：本地Node26/Chrome156/macarm64/Poppler26.11；最小Node20/Chrome114、其他OS、真实课程、原生授权面板和PDF侧栏未人工验收。ASR/上下文/词库仍明确暂缓，未上传音频或调用云API。线上3.1.1未被本地构建改动。
- 全部11条Rulings及代价已逐字复制到[保留记录](../../../.test-output/v3.1.2/rulings-preserved.md)，没有新增/遗漏；清理前将把本plan-owned工作区报告/brief/progress/verifier等可恢复记录写入Git，不纳入可重新生成的大型review packets，然后仅删除经过物理路径与plan-path标识核验的本SDD目录，保留其他计划、产品worktree、原仓库和所有交付物。
