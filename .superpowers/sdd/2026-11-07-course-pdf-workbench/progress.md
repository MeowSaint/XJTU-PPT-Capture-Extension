# SDD ledger — plan: docs/superpowers/plans/2026-11-07-course-pdf-workbench.md

基线 ae75c719e5ec4660363b5e29098a22b8de466940；feat/v3.1.2；根目录 /Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2。设计为 docs/superpowers/specs/2026-11-07-course-pdf-workbench-design.md，永久审计 docs/superpowers/plans/2026-11-07-course-pdf-workbench-audit.md。

## Preflight

| 范围 | 生产/消费契约 | 检查结果 |
| --- | --- | --- |
| Task 1 × Task 2 | PDF writer / course-pdf、batch-course-pdf、两个独立课程域；UI 移动同一 DOM 节点 | 一致。先 PDF，UI 不改 writer 或范围语义，测试 selector 只适配真实结构变化。 |
| Task 1 × Task 3 | 新目录固定开启、旧格式默认字节、合成导出与浏览器断言 | 一致。Task 3 只统一版本/说明与验证，不顺手修业务。 |
| Task 2 × Task 3 | motion.js 先于控制器加载，34 成员清单，UI/可访问性与动效结果；发布页唯一版本 span | 一致。Task 2 含资源/清单测试，Task 3 继承真实结果，当前版本最终统一 3.1.2。补查 .github/workflows/release.yml:56–61，严格匹配唯一 <span class="version">3.1.1</span>，Task2 保持该原标记、Task3 只改其文本及 README 唯一当前版本字段；已将精确消费契约传给 UI 实现者，无需改发布 workflow。Task3真实integration probe又暴露独立临时安装复制表漏motion.js；已核对HTML359与release.cjs9，限定同步integration.cjs102资源消费清单，强断言/权限/拦截不变，详见Ruling8。 |
| Task 1 内部 | 有序 lesson/page 元数据、共享 sheet/row、UTF-16BE 与逐图背压 | 一致。独立新路径，旧 helper/旧指纹不覆盖；真实持有 namingSave/lessonSave 测试。 |
| Task 2 内部 | 同步业务与原生控件、可取消视觉层、1000 页按需图片、三检查器页签 | 一致。无 animationBusy 或延迟权限；最多 12 个本批可见卡片，reduce 动态变化取消。 |
| Task 3 内部 | 当前版本/历史事实、CI 顺序改动、完整回归和合成产物 | 一致。开发依赖实际使用要如实说明；历史比较/实测记录不跟新版本替换。 |

## Rulings

- Ruling: 按用户“先完成 PDF / 改进 UI”直接推进既定目标，常规视觉选择不重复询问 — 用户已指明目标与 Apple Design，细节可在可操作结果上修正 — 理解偏差的代价是隔离分支局部返工，未假称逐项批准。
- Ruling: 新整课路径始终生成三级目录，旧 bookmarks 开关语义不变 — 默认就能定位课次并保留旧字节 — 新整课没有关闭目录的额外选项，阅读器可能仍需手动打开目录栏。
- Ruling: 用现有原生 JS 与 CSS / WAAPI，参考 React Bits / Anime.js 交互而不安装它们 — 不为局部反馈迁移框架或扩大运行时 — 没有通用弹簧框架，裁剪保持 1:1，离散反馈采用无过冲短动画。
- Ruling: 新增独立 motion.js 并将当前清单由 33 改为 34 — UI 视觉状态不进入数据模型或阻塞真实任务 — 多一份小型资源及打包验证，旧 33 成员事实保留。
- Ruling: 仅将本轮自写的设计/计划/永久审计三份文档显式纳入 Git，若本地忽略目录则只对这三份使用 force-add — 审计需可恢复，不改变忽略规则或带入别的材料 — 分支增加三份过程文档，可单独撤销。

## 执行状态

Final whole-branch review: complete — fresh ee70d102完整156行已读，Spec PASS/Quality APPROVED/C0I0M0、4150行once与命名补读/7视觉，无需修复/停放，已STOP。实际npm run release+独立81行verifier已通过，34精确有序成员/CRC/每项当前source bytes/312 markers/motion顺序，包1271902B SHA8c32ffbe2e935f9df968e27397383f41dbde1c2b6931c0fab87b9d739358de6f；preflight原根ZIP[]/物理目录正常，未动旧worktree/真实数据。全11Ruling成本保留，剩余仅Git可恢复记录+严格own-root cleanup和最终文件交付；以下冻结派发记录为历史—— all3fresh task gates complete/C0I0M0，closure e94f02d1aa0bb116d1baa5bea3fd56a45aea40f1 clean已核验；完整原main ae75c719e5ec4660363b5e29098a22b8de466940..e94f02d1aa0bb116d1baa5bea3fd56a45aea40f1 22commit410126B frozen final-review-package.txt。fresh ee70d102-57e8-431e-966e-f78b4c095286（magpie-responses/codex/gpt-6.1-sol max）已发全authority与scope/history/evidence；只读完整包once+按问题小读，不执行Git/测试/浏览器/网络/委派，不新增productwriter。output final-review.md。最多ONE最终combinedfixwave+ONE fresh scoped，剩余adjudication；未预定verdict。当前尚未root实际ZIP，必须sourcegate后立即物理路径/旧ZIP预检再34CRC/逐项当前sourcebytes/SHA；只清理验证ownedSDD root并先Git保存11Rulings与报告，ASR仍deferred。

Task 1: complete (commits 2076098..dd2b71c, review clean)
实现者 1b0e3e36-333f-4839-bb0d-1917b3b648a8 已停止；独立审查者 db42963c-2ba9-4da0-87a1-952090b5631c（sol/xhigh）Spec PASS / Quality APPROVED，C0/I0/M0，完整 61 行报告已由父代理读取。没有待修复或停放发现；运行证据由实现者实跑报告支撑，审查检查源与断言不重复执行，最小版本/真实阅读器/最终 UI 与安装包保留后续 gate。
Task 2: complete (commits 3f666a6..25bfd40, review clean) — integration follow-up round2/5，I1/I2均addressed，open0/parked0；fresh8963cda0完整84行报告已读，I2 ADDRESSED/Spec APPROVED/Quality APPROVED，新C0/I0/M0/out-of-scopeNone，已停止；source353085aa6ba391d14a7767540ca036ae00639561 / report25bfd40f225f57d4061fbc98c75064a2b0a14a1e已完成，父代理完整读274–390并核验clean HEAD/三授权文件157+/6−，owner STOPPED；correctb702..25bfd40 9commit/150386B packet已生成，fresh8963cda0-b33e-4444-a7b7-5951840bbd22(sol/xhigh)只读限定复审；父代理读final三张真实图，后续guard删除的final7b9integration再过，fddf→review19/memory14/library24有准确源矩阵，15jobs全收取。brief仅做段落换行解决read2000字截断，语义不变，未重读差异包；上次独立已审查 HEAD b7021c7c9ed49c8876e732ab2174aa9ee52f6700 为本轮正确 FIX_BASE，不是中间 Task3 checkpoint。此前 complete (commits 3f666a6..b7021c7, review clean) 保留为上阶段历史，未宣称新增低高度问题已过 gate。
初次交付与审查历史（I1 已在 round1 全新复审解决）：initial source 1c67cbb886346982397e6e90c26c2016726d402c；separate report/previous-reviewed HEAD e3952346d71f1bd78cf105b2987d01a241f430bf（父代理已读完整180行、核对范围与HEAD）；冻结3f666a69..e3952346 两提交/141490B；fresh reviewer 36e08890-e7cf-4ca2-af7f-638a1c81a200（sol/max）完整123行报告已读，Spec Issues/Quality Needs fixes，C0/I1/M0：expanded running batch hides shared Stop；已停止。FIX_BASE必须是e3952346，不是稍后的parent-doc/fix-start SHA。BASE 3f666a69cf01071d03a08c2773f3507ca93cb33e；stopped sole implementer 11bf1c1c-e5b7-44f8-85aa-227169d3190a（magpie-responses/codex/gpt-6.1-sol max）。权威 task-2-brief.md（15 行）及已读生成内容；明确授权只读 AppleDesign 的本地 SKILL.md，具体任务不适用其 Ready-only 条件。仅 brief 白名单的 UI/motion/当前 34 资源与相关测试、自己的 task-2-report.md；不改版本/PDF writer/数据模型/授权业务/依赖，不委派/联网/使用真实资料或浏览器配置。Task1 已过 gate，scope/queues/1000 页/lazy root/并发/URL/节点/scroll 约束已传；实际 UI 多尺寸/暗色/reduce/快切与六相关套件顺序验证后全新 Spec+Quality 审查。
Task 3: complete (commits cc8a935..a9c2b9c, review clean) — freshbb1baa93完整137行已读，Spec PASS/Quality PASS/C0I0M0，包1373行once、全部7PDF和3实际UI、命名结果字段补读先报后准，source/claim边界明确，无修正/停放/范围外新问题，已STOP。以下in-review与恢复记录均为历史—— 原de484已STOPPED/source-docs d50620795bd6f48862d059661385d5747db3e950/report-HEAD a9c2b9ce98901ad3cc427680547af0965ba3191b干净核验。父代理读完整final追加131–259；原128prefix不变，九类source-backed采用unit224/release17/bridge3/owner finalintegration7b9-review19-memory14-library24/本次features11-improvements25均通过，42哈希before/after一致。两新jobs收齐/owner15ledger收齐，7PDF未重复。correct cc8a935..a9c2b9c 11commit175477B packet，fresh bb1baa93-d5a2-4aed-b3d8-30b81d5d4f55(sol/high)已发39行brief+全部7PNG和3真实UI/namedJSON；Spec+Quality未定，root34ZIP仍未来gate。以下恢复与暂停记录为历史—— Task2 I2 fresh gate已过，closure2c85f65e49cf571df21a8be5c5bd10965814684e干净已核验；原de484aa3-3d8e-43af-9a85-a169486c9d52恢复为唯一mutator，原BASEcc8a935不变。仅顺序features→improvements新跑，按plan78用source消费者/hash采纳unit224/release17/bridge3和owner final7b9integration/review19/memory14/library24，非九套同HEAD重跑；实际最终root ZIP逐项新CSS源字节校验由controller完成。PDFsource3ee未变、7图不重做，同Task3报告保留128prefix并append完整matrix/来源/错误范围/限制，source/docs必要提交+独立report后STOP/freshTask3gate→wholebranchmax/34ZIP/cleanup。以下checkpoint与暂停为历史—— source checkpoint20b67b5efc6a79c51adef33bfc4ca27a97532860 / own128行report5ccfb360e2d65c2fdfec00c427f87dbda4916353已由父代理完整读取并核验；十授权文件43+/38−，全部job收取，de484已STOPPED；目前只有controller design/plan/audit为预期M。224unit/17release/bridge旧来源通过，integration三次exit1、后五套未跑，七页合成PDF有效但无原生阅读器侧栏实测。等待同一Task2 round2修复和fresh scoped gate，再恢复原de484；不得并行mutator。原任务BASE仍cc8a935bd5cb3461846fa2ae8d4c7feeb9770d22（父代理closure doc commit后clean已核验）；fresh sole implementer de484aa3-3d8e-43af-9a85-a169486c9d52（magpie-responses/codex/gpt-6.1-sol high）。权威task-3-brief.md14行+plan globals1–32+相关design/template已指定。仅metadata3.1.2/README/tests说明/当前夹具路径/CI追加improvements；不改产品JS/CSS/PDF/数据库/权限/依赖。integration真实layoutselector适配先报告再改，不修业务；新业务失败返回owner。九套完整顺序、显式Chromium1248、日志/作业/source-hash矩阵，合成中文同日两课/奇数讲义PDF+递归目录/pdf-lib/全部Poppler页/read_image与实际UI截图。父代理负责ControllerFinish整体审查/34ZIP/cleanup，worker禁止root打包/远程/审查/清理。ownreport=task-3-report.md，源码/报告分开提交，fresh任务审查后才能final整分支gate。ASR明确deferred，无新用户问题阻塞。

## 已有验证与限制

- 基线 Node v26.13.0；207/207 单元与17/17发布测试通过，33成员。基线 job bash-3757cd0b6a5b4f40 已收集 exit0。
- Task 1 最新中间回报：最终 export 88/88、library 23 组、improvements 25 组均 GREEN。新增 writer 的 genuine RED 是缺失 writeCoursePDF，17/17 focused 覆盖层级/Unicode/代理项/奇数课次/背压/1000 元数据/六阶段拒绝。improvements 的四次失败及被否定的 stale releaseNaming 假设将保留在报告；独立原生 probe 复现第 11 次下载抑制，fresh-document probe 在第 11 次前重载后 18 次全部送达。最终夹具仅在新独立命名 case 边界正常空闲后重载、持久数据不变、再安装真实 hold，不在测试链中途重载；无权限/安全设置修改。产品源码自 88/23 GREEN 后未变；25 组有非本地请求与 errors=[] 断言，最终审查仍须查明其具体上下文覆盖。实现/测试已提交 49a4d348c6caf3e3b40d0315ef32e1e21597d860，完整 102 行报告单独提交 dd2b71c01f6466712f4a54269a50bec5210e7348；父代理已读报告并核对该 HEAD 干净。已生成 20760988..dd2b71c 两提交/70,162 B 的 task-1-review-package.txt，fresh reviewer db42963c-2ba9-4da0-87a1-952090b5631c（sol/xhigh）只读 Spec + Quality 审查已完成 PASS / APPROVED，C0/I0/M0；父代理已读完整报告并确认额外读取均有具体风险与范围记录。审查确认 reload 在新 hold/点击之前、旧 ZIP 已空闲，真实 race 断言完备。实现者/审查者已停止；Task 1 gate complete，可启动 Task 2。
- Ruling: 仅在独立 probe 证实隔离有效后，新增事务用例可在开始前正常等待命名/课次队列、核对持久合成数据并重新载入文档，再安装真实 IDB hold；不在被测点击或在途 hold 中重载，不改浏览器权限、安全设置、固定 sleep 或业务断言。依据是独立原生第 11 次下载抑制，具体时间/文档范围不宣称为浏览器规范。判断错的成本是文档隔离可能掩盖文档态/未保存状态缺陷，故边界外的原测试和新增持久数据核对必须保留。
- 两个只读分析者已结束：cf4b21cd-cf5a-469e-8d38-069dd94325b1（PDF）、08fd7153-6350-48da-a13e-9087828103d5（UI）；报告在 tmp/research/，未改源码/运行测试/联网。
- 规则工具仍未提供，未伪称已查。经验无匹配。using-git-worktrees 未提供，标准 worktree 已验证。当前仅可用 magpie-responses/codex/gpt-6.1-sol；Task 1 xhigh，Task 2 max，Task 3 high，最终审查 max。
- 浏览器仅使用显式 PPT_TEST_BROWSER 和 localhost 合成素材，无真实课程、个人登录、云 API 或浏览器资料目录操作。原 main、旧 worktree、已发布 3.1.1 保留。

## Task 2 review and fix round 1/5

- 初审 Spec Issues / Quality Needs fixes，C0/I1/M0；父代理读完整123行和final batch-wide image/design38/CSS108–118/HTML192–200，确认正常展开布局会把共用Stop挡在capture scrollport外。审查者未执行测试，其他已审查契约合规；未建立额外范围缺陷。
- Ruling: 运行中停止可见高于“预览下”的初始静态位置，可锚定同一个已有Stop/操作行；不复制控件/处理器、不改取消与保留结果，不靠折叠批量或测试预滚动绕过。— 固定工具区会占少量可视空间，必须用desktop与390命中/遮挡/滚动根检查；设计已澄清，此为原功能可见性要求，非新业务功能。
- Round1/5已resume原实现者11bf1c1c-e5b7-44f8-85aa-227169d3190a为唯一产品写入者；I1 open=1/addressed=0；父代理只改design/audit并提交fe1798b988e67e3e5eef71faada7a7cb82c6757e，clean fix-start已核验。previous reviewed FIX_BASE=e3952346d71f1bd78cf105b2987d01a241f430bf，修复后HEAD待回报；scoped packet必须包含中间doc commit，不能把fe1798b当previous-reviewed base。新回归需在旧源码实际RED、真实展开running handler下证明enabled Stop处于scrollport与viewport且可命中/实际停止；full review/memory/library顺序覆盖修改，静态版本/原1000页/焦点/字节检查保留。Task3仍pending，修复后全新scoped复审。

### Round1 interim evidence (not a gate verdict)

- 原实现者回报实际旧源码RED：real batch-start→localhost MP4/OPFS/loadRemote/fastScan/save→bounded scanner等待abort，1280×800时Stop enabled/task running，rect y820.0625..854.0625 对viewport800与旧capture clip bottom780，5命中点全false；capture.scrollTop0且batch保持展开。RED exit1，.test-output/task-2-fix-1-red.log，review-2H1I0h。
- 将同一Start/Stop组移至app-shell保留第三grid行，窄屏sticky，不改capture.js。初次focused GREEN 1组/4尺寸exit0，实际Stop abort与全部旧/新页字节2→3→3保持、batch仍展开，review-YXTtkh四图由实现者读取。窄屏初始两行，现仅约束shared row nowrap；最终focused/区域不相交与full review→memory→library仍在进行，未收到最终SHA/report，不提前视为修复完成。

### Round1 final implementation/evidence received — scoped verdict pending

- 收到source76341d6141b2105a243ce2ee290f892a9fa678c6与append-only report/HEAD b7021c7c9ed49c8876e732ab2174aa9ee52f6700；父代理读同一报告182–273、核验clean HEAD/三改动源码范围。captureHTML/CSS/review测试97+/7−，不改capture.js，154IDs相同/唯一，exact3.1.1span1。所有6fix作业收集、finally清理，原实现者STOPPED。
- 真实最终focused1组/4尺寸→full review18→memory14→library24顺序全部exit0，产品/新增回归哈希在最后三套间不变。四尺寸Stop新实际context/viewport/五点命中成立，real mouse Stop abort+stopped+batchStillOpen，每轮旧/新全部metadata/sig/image bytes2→3→3。父代理独立读LR5goa最终running1440/390，两图均见独立55px底部操作行且无横向溢出；narrow保持原生batch-start文档滚动，不预滚capture。
- memory restore0animations/maxReads2/10URLs=allowed10/nodes+scroll+byte/OPFS约束保留，10为当前视口具体值；review/library errors[]blocked[]，memory errors[]但无非本地尝试计数。没有重复其他套件、没有录像安装或源码业务变更。源码SHA、全部命令/RED/六作业/真实四尺寸图片在append，旧六套矩阵只保留历史含义。
- 已生成正确e3952346d71f1bd78cf105b2987d01a241f430bf..b7021c7c9ed49c8876e732ab2174aa9ee52f6700，三提交49,415B，task-2-fix-1-review-package.txt；fresh affdb2c4-496e-43c6-8b11-8fad49344d8c（sol/high）in_re_review，完整task-2-fix-1-review-brief.md+verbatim I1+reportappend+两张final running图。仅本次fix新破坏/I1，readonly/noGit/commands/tests/network/browser/delegation/audit，写ownreview。I1 open1/addressed0直到独立verdict，Task3 pending。

### Round1 fresh scoped verdict — complete

- affdb2c4-496e-43c6-8b11-8fad49344d8c已停止，I1 ADDRESSED / Scoped Spec APPROVED / Quality APPROVED，新C0/I0/M0，Out-of-Scope None；父代理读完整96行review。450行包连续一次读、2张actual final running图，具体追加读取producer/consumer证明真实load/fastScan/save/signal/Stop/保留结果与responsive新clip context，无命令/Git/测试/浏览器/联网/委派。新测试没有手工busy/UIflags，源码同步abort与eval观测不是延时指标混为一谈。I1 open0/addressed1，no parked findings，Task2 gate complete，正式completion line见前。Task3可在父代理文档提交后启动。

## Task 2 证据（初次报告，历史记录，不代表最后修复源码的重跑）

- 完整180行报告与e3952346 HEAD已接收，全部12作业已收集。完整顺序 review17/features11/memory14/library24/improvements25/release17 全部 exit0；前三套之后仅移除两个局部标题序号span，后三套与最终focused5/5、9张review-mDvnrT实际截图已完成，父代理独立读过final desktop1440/results390/dark1440。来源/结果两个课程域可见、无重影/编号冲突；全部JS/CSS覆盖一致，不将前三套冒称最终HTML字节的重跑。memory恢复1000页 animations0/maxReads2/activeURLs13=allowed13、bounded/oldRevoked/reused/preservedScroll均true。Node26.13/Chrome156；真实站点/最低运行时/原生权限未验。
- 父代理独立读过 KfPEnH 的 desktop1440/results390/batch1440/dark1440；深色图底部出现重复 raster 页头。实现者检查 app-shell 数量为1、DOM布局无溢出；改用实际视口截图，并在尺寸/滚动/media改变后等待两个RAF。父代理再次读 DgYlhC dark1440/stacked390，未见重复页头或横向裁切。Chromium内部成因未证实；这是测试采集观察，不是给业务增加等待。
- 用户核心是目录与操作易找，父代理要求当前课程整课PDF/ZIP入口直接可见。实现者移除了新加的课程导出折叠层，保持原details/dialog和唯一业务节点；父代理读59miOu desktop1440/results390，实际看到带明确课程域的两个入口且窄屏正常换行。这批图仍在删除局部序号前，最后截图以正式报告为准。
- 可选本地动效录像在 newPage 因 `Executable doesn't exist at /Users/jasondai/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac` 失败。未安装组件/改运行配置；移除仅为尝试录制临时新增的两行并刷新正常上下文。不是产品测试失败，也不是强制验收项，正式报告需保留命令/日志与已清理证据。
- 父代理当时已准备 task-2-review-brief.md；初次及修复后的独立 gate 结果见前，本段只保留当时准备历史。

## Task 3 integration fixture ruling — 2026-11-07 17:20

- 实际首次probe job bash-f46eb317080f4612 exit1，tests/integration.cjs212 expected /请先补填/ vs actual `导出失败：PPTMotion is not defined`，log .test-output/v3.1.2/task3/04-integration-probe.log。父代理读integration88–121与HTML345–363，grep release.cjs见motion.js已在生产安装清单9；integration临时复制表102缺失该必需资源。此前unit224/224、release17/17、bridge3origins已过，作业全已收；22-file source-freeze与修前fixturehash保留。实现者先报告且尚未改102，产品九文件相对BASE未变。
- Ruling: 只为tests/integration.cjs102临时扩展复制表加入motion.js，再重跑integration继续后续顺序套件，不更改PPTMotion/任何产品代码、强断言、权限或拦截 — 真实缺模块、HTML和实际release资源消费者证据证明夹具安装不完整 — 代价是复制清单有两份、未来可能漂移，所以保留真实failure/hash矩阵与实际34安装包核验；不靠stub/忽略异常/弱化缺字段检查。Task3 Files限定例外写入原plan并重新生成brief；父代理只改plan/audit/ignoredrecords，原实现者继续唯一测试fixture mutator。Task3 BASE仍cc8a935，后续parent-doc SHA不是任务base。

## Task2 integration follow-up — Ruling9 / round2/5

- Task3 checkpoint已完整接收并STOPPED：20b67b5 source十文件 / 5ccfb36 own128行report，父代理读完整报告+gitstat验证，目前parent三docs以外无脏源码。integration缺motion已按Ruling8补，后续原DnD超时及一次被动诊断job均exit1/已收取，fixture恢复8127cc73…，产品九文件相对Task3 BASE未改。
- 父代理已读实际before/failed JSON与1280×720图：batch h302.390625，results bottom645，#pages top718.390625/h18/bottom736.390625；源first10中心809.84/末13目标924.95初始命中null。可信dragstart实际ID12、dragover/drop13，windowY16/rootScroll198，应用持久化[10,11,13,12]，四native事件各1。busy/task起末false、全部4卡draggable。不是排序算法吞事件，也不是原首卡已成功；实际图库溢出到底栏下面需修布局。
- Ruling: 不仅以测试收起批量区绕过 I2；原Task2 owner在保持batch展开/同一底部StartStop/有界#pages条件下修复低高度工作区，使自然滚动可访问完整卡片及选择/时间/删除，禁止产品排序/取消/存储/PDF/权限/依赖/312版本变化 — 已有真实截图/几何/可信事件证据表明用户工作区越界，与可发现性目标冲突 — 代价是增加滚动/最小空间的适配和相关几何、原生DnD、1000页及Stop回归；不降低原integration参数/页序/持久化/Referer/PDF/IDB/JPEG等断言。
- 本轮为同一Task2 fix round2/5：I1已解决，I2 open1；FIX_BASE=上次已审查b7021c7c9ed49c8876e732ab2174aa9ee52f6700，fresh scoped只评I2及本次新破坏，Task3 checkpoint未完成项由Task3后续gate负责。修复start另行给出，不能代替FIX_BASE。SAME task-2-report.md追加/覆盖测试命令与输出；父代理不改产品。Task3暂停、原UI owner恢复前先确保无其他mutator；修复与复审后原de484继续，已过套件仅按实际源覆盖复用。
- Controller三docs裁定已提交cb23f8b9bac9f46281408d45948c68e421c01fb2（clean核验），完整task-2-fix-2-brief.md已创建并写入真实fix-start。原11bf1c1c-e5b7-44f8-85aa-227169d3190a（sol/max）已resume为唯一mutator，scope只有style/确需HTMLwrapper/review新回归/SAME report append；Task3仍STOPPED。新task-2-fix-2-review-brief.md已准备，实际HEAD/图片只在DONE后补全，fresh xhigh scoped来源始终b702..新HEAD，不提前判通过。
- 父代理另独立读Task3 synthetic-pdf.cjs101行、synthetic-checks.json85行及handout-2/3实际PNG：显式独立预期[3,1]→3纸页，目录递归7节点/中文/同日08:00-10:00/XYZ758-364-758-758/JPEG逐字节，页2第三张与页3第二课首张边框/底线/外时间均完整且下半留白。仅小型合成helper聚合4图用于解析，不是产品内存策略。实际PDF sourceSHA3ee30c2ae58766de877e1fd3f0a6689e8b76507e60eab7b8cc14668069703be1；PDF代码不在本次布局写白名单。非native-reader侧栏点击证明。

## Ruling10 — current-layout native input separation

- 一次允许的内存被动diagnostic job bash-f2af4a55719542b5 exit1/已收取；磁盘integration8127cc73…493d1不变，内存观察版ae1ceed27c1944d7c4fa83e64668f2c5914a547b420968457e29655da724d715，CSS348d8ebf56ccd1b1801e121800f7e9fd8fb30147ae17cb1ec3f9c4930b109eb8。父代理读summary.json完整135行与实际after.png：document1280×720，results560，#pages401.390625..645.390625/h244在footer665上方，batch仍open，URL4/allowed4/outside[]。可信pointerdown10(root0)→dragstart12(root121)，window0/workspace317均不变，drop13、order[10,11,13,12]。新review同CSS连续原生手势3尺寸已证first10/正确[11,12,13,10]/新页持久化+字节/1000根独立性。
- 父代理只读installed /Users/jasondai/XJTU-PPT-Capture-Extension/node_modules/playwright-core/lib/coreBundle.js:23549–23568、19851–19888：source move/down后target pointer action先scrollIntoView再首次move/up，支持本次原因；无依赖改动。
- Ruling: 仅授权原UI owner在integration拖拽输入块使用已证正确的连续native mouse：源内实移触发且断言可信first-ID dragstart，再正常目标滚动并在原x=width-4/y12释放 — 布局越界已独立修好，剩余helper在真正dragstart前滚根改变源对象；保持真实用户排序目标而不为helper扩大图库 — 代价是维护更多输入步骤/启动断言，必须保留真实事件/hash及原精确顺序/刷新持久化和后续Referer/PDF/JPEG/IDB/权限/route/timeout；无赋状态/合成event/force/sleep/关闭batch/换窗口。这是Ruling9保留旧helper的唯一证据化例外。plan/brief/audit先改，scope仅多此test-input块，不改产品sorting/motion/storage/PDF/版本；FIX_BASE和round2不变。

## Ruling11 — exact crop geometry premise

- 原native-start新fixture495deb43a3150b8b125465ff419b47af14945299558a3a7a012742bb44e07a64/CSS348d，job bash-9f8345d836894e53 exit1已收取，原first/order/new-page/Referer/cache/PDF通过，后续原375/现395真实decode640×361≠严格360。父代理读integration365–429和capture853–879/922–966：旧test使用整overlay25→75%，生产bounds按public video client/raw维度排除contain留边，frame输出round720*crop.h。完整容器与真实图像的半高不必相等；需记录真实公开几何，不宣布未测的具体像素留边。
- Ruling: 仅允许同一UI owner用公开video/canvas尺寸与视频比例规划真实图像25%→75%原生框选点、记录公开尺寸/点/只读crop及decode — 维持原“图像坐标排除留边”的测试目标和精确h360，不将361放宽通过 — 代价是维护独立坐标规划和真实测量，若几何不支持此解释则先停止报告；禁止从产品crop/输出反算expected，所有保存/预览/full/后续强断言及CSS/JS/viewport/权限/routes/timeout不变。这是Ruling10之外唯一新增integration输入块例外；先更新plan/audit/brief，再恢复source作者，仍round2/FIX_BASEb702。
- R11 current-run evidence arrived (not a final gate): covering integration fddf55b39bfd8b538597b7bf094834bf55ab379970db36cedb175e62d37add4e，bash-44770c7da90c406b已收exit0。公开client417×235/raw1280×720/containimage417×234.5625，旧overlay半高源预测360.671，correctnative点(407.25,203.75)→(615.75,321.03125)，真实decode640×360，全部后续及3PDF渲染通过。review19/memory14随后顺序exit0，CSS348d/review84a66不变，library待收。旧值必须361是这次冻结本机的调查guard，不是跨平台产品契约；授权仅移除新增调查assert（原strictactualh360等保留），保留public预测日志，library后仅重跑受此一行变化影响的integration；如实区分fddf/最终fixture和各suite覆盖，不重跑无关review/memory。最终source/report/图/全job待交接，fresh xhigh未发，I2仍open。
- Controller scoped source-coverage check for laterTask3adoption: grep tests/*.test.cjs里style.css/capture.html/workspace-sheet/#pages仅tests/release.test.cjs18资源列表；读同文件1–108，fixture26–32拷贝当时真实payload，independentzipCRC68–108。所以旧release17不能伪称验证了最后CSS字节，最后controller实际34-member/root ZIP必须逐项current-source-byte验证（计划已要求）；Node测试无CSS逻辑分支或新input契约。tests/bridge.cjs31/33/92/95只注入media/course/page-hook/extension-state/content模块，不依赖新CSS/手势块。这是静态范围证据，未重跑任何测试，不替代最后各source-hash比较。
