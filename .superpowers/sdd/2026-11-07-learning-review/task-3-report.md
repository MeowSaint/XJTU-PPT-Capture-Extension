# Learning Task3 实现报告

状态：**DONE_WITH_CONCERNS**。Task3 实现、必要样式修复及本地包验证已完成，供 Controller 后续独立审查；不代表整分支通过或 3.1.3 最终交付。首轮九项严格串行执行，真实失败及修正均保留；最终受影响检查全部通过，未变化的 Node / bridge 按实际仓库输入 SHA 记账。真实 ZIP 已逐项验证 35 个成员、CRC、工作树与 SOURCE 字节。最低运行时、原始坏录制和历史超时等边界仍保留。

## 工作树与边界

- 实际工作树：`/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/long-session-reliability`。
- 分支 `fix/long-session-reliability`；ACTUAL BASE：`072ce9817559ea8609589f9213b6e677bfa71648`。Controller 的两文档范围修订 commit `8b61a6524249d46e07209ad8cba0dc22629c8609` 直接继承 BASE；不是 Task3 worker 的源码提交。
- tested SOURCE：`f9826d3cbbbd7fa504d565ec204e3de35863b07d`，直接继承 `8b61`，标题 `fix: prepare 3.1.3 with reachable gallery controls`，仅提交 15 个获准源码文件。测试发生在提交前：02–19 的实际 HEAD 是 BASE，20–28 是 `8b61` 的 dirty worktree；最终22–28所用的60个受记录源码文件与 SOURCE 逐字节相同，不能伪称当时 HEAD 已是未来 SOURCE。真实 release29 则运行于 SOURCE。
- 本报告与验证文档作为 SOURCE 后独立的 evidence-only commit；不改 shipped 资源、不改测试输入、不要求重复成功套件或重打相同包。该文档提交的实际 HEAD 在最终交接和 raw post-commit 记录中给出，不在文档中构造自指 SHA。
- 01 实际 Node 包装进程逐项记录 pwd、HEAD、branch、tracked/index diff：开始时两者干净；子进程返回 0。没有把缺少 numeric marker 的 shell 工具返回另称 outer exit 0。
- 本报告只覆盖 Learning Task3。没有委派 subagent/reviewer/workflow，没有读取整 plan/history、别工作树、真实媒体、凭据或日常浏览器资料。
- 已完整读取原 ACTIVATED brief，以及 Controller 在 `8b61` 后激活的 36 行修订 brief；绑定设计 §5 / 验收 60–70。只按具名范围读取 Task2 186–230、R1 1–31/49–65、Task1 M1/limits 49–56，以及必要的 46 行媒体审计和共享调用方。
- 使用 ponytail 的最小完整改动与边界验证指导；full 模型调用为 disabled。中文说明按 humanizer-zh 保持实际确定程度，不编造实测。

六项全局约束原文如下；Task3 保持现有产品 JS / 接口，仅按修订范围修复样式分配：

- 原生JS/MV3、Chrome114+/Node20+、现有运行时资源；不新增依赖、不安装浏览器/软件，不访问真实课程或凭据，不外传素材。
- 在隔离fix/long-session-reliability分支连续执行，保持之前两阶段已审查的目录/取消/命名/覆盖/媒体/报告接口、3.1.2三级PDF目录及有界图库、磁盘与逐图导出路径。
- IDB保持v3。旧页没有新字段视为保留；原JPEG/签名、裁剪、手动命名、断点不清空，签名仍192×108、缓存最多1000（82,944,000bytes）、缩略图读取并发≤2。
- 所有学习版排除由明确用户操作触发，可恢复；建议不是自动删除依据。保留现有永久删除/撤销和人工相似页对比；不能以学习版替代或破坏原始结果。
- 不承诺自动分清所有公式、视频、鼠标和投影噪声；未验证原录像/最低版本不能写成已通过。新鲜实现者串行、独立任务审查、最高模型末审。
- 最后同步manifest/package/lock/UI/README等当前版本引用到3.1.3并生成验证过的本地ZIP；不推送、打tag或远程发布。历史设计/审计的旧版本号保留历史事实。

## 改动与自审

原 14 个文件加 Controller 具名授权的样式，共 15 个源码文件；另创建本报告与[跟踪验证文档](../../../docs/superpowers/plans/2026-11-07-v3.1.3-validation.md)。没有暂存或改写 Controller 的 plan/spec/brief：

| 文件 | 实际改动 |
| --- | --- |
| [manifest](../../../manifest.json)、[package](../../../package.json)、[lock](../../../package-lock.json) | 四个版本来源统一为 3.1.3；lock 只改根与 `packages['']` 两个版本值 |
| [capture UI](../../../capture.html) | 顶栏与更新对话框两个当前版本值 |
| [README](../../../README.md) | 当前版本；目录失败/详情重试/重新读取目录/取消/保存失败边界；固定坏 AAC 原件仍可解码及五段原件未知限制 |
| [测试说明](../../../tests/README.md) | 当前证据路径、隔离输出变量与旧原生下载超时 / 后续独立新入口证据的区分 |
| [release](../../../scripts/release.cjs) | `checkFile` 验证 lock，拒绝 lock 根或 `packages['']` 与 manifest 不符；原精确 35 资源、安全暂存 ZIP 与归档流程保留 |
| [release tests](../../../tests/release.test.cjs) | 最小匹配 lock 夹具；历史版本 helper 同步 lock；目标版本、缺 lock、两字段缺失 / 不匹配共新增 6 项；原 18 项保留 |
| [features](../../../tests/features.cjs) | 当前版本 mock/UI/报告标题/输出默认路径，支持 `PPT_TEST_OUTPUT`；升级比较历史输入不变 |
| [integration](../../../tests/integration.cjs) | 当前 release mock、隔离输出；具体原生目标可见交集纠正与命中前置检查，保全部排序/持久化业务 |
| [review](../../../tests/review.cjs) | 当前输出；raw 默认/0/0 消费者；六处精确删除角色；合法 free box 同名异文件；有效非传递关系夹具；完整卡片与学习/删除两按钮几何；失败前只读 export 行 / normal 几何落盘 |
| [style](../../../style.css) | 展开批量时完整第三行控件预算；导出操作固定独立一行，避免页数改变图库预算；桌面折叠批量只占 capture 列，results 跨两行用足当前工作区；窄屏保留有界布局 |
| [improvements](../../../tests/improvements.cjs)、[library](../../../tests/library.cjs)、[memory](../../../tests/memory.cjs) | 仅当前默认输出路径改 3.1.3 |

94 对最初 14 文件 diff 自审，99 对最终 15 文件自审，实际子进程均 0；随后读取了 raw 中被工具截短的 diff 中段。diff name 集合恰好获准源码；manifest/package 除当前版本外深比较不变，lock 剔除两个版本值后全部依赖、integrity、配置与 BASE 相同，capture HTML 恰为两处当前版本替换。release 清单 block 与 BASE 原文一致，35 项中除获准的 manifest/capture HTML/README/style 外其余 31 资源与 BASE 原字节相同，`git diff --check` 成功。历史版本比较输入和旧 saved audit 未改。[Core 测试](../../../tests/core.test.cjs) SHA256 `d520fa4f841a4c355ff9b2b5e96c334d1c8de074bbe2a91b1373f592a57374a9` 与 BASE 相同；未改产品媒体 / 排序 JS、权限或 schema。[自审明细](../../../.test-output/learning-task-3/final-source-check.json)与[最终 60 文件源码字节证明](../../../.test-output/learning-task-3/source-byte-equality.json)保留精确 hash。验证文档不在 ZIP 清单中，文档变更不产生产品验证信用。

README 已有默认 5000、合法整数 100–20000、32MiB 保守配额暂停、视频轨保守处理、可恢复学习版和 `knowledgeComplete` / `complete` 区分等说明被保留。目录重试说明按实际 producer：重试失败课次只重读详情，不将失败分页误说成该按钮可以直接修复。

## RED 与首轮严格串行矩阵

raw 全在 `.test-output/learning-task-3/`。每个 label 含真实 `.command`、`.stdout`、`.stderr`、十进制 `.exit`、`.before.json`、`.after.json`。前后 source hash 在每次实际运行期间一致；没有捏造源码副本。`ACTUAL_EXIT` 属于包装器记录的命令子进程，和原始 stdout 及后台 runner 状态分开。

02 真实 `npm run test:release` RED：24 项，原 18 pass、新 6 fail，exit 1。原 ZIP 35 资源/CRC/源字节/历史包/路径/符号链接/版本安全断言均保留并通过。新失败为四元数据仍 3.1.2，以及缺 lock、lock 根缺失/9.9.9、lock package 缺失/9.9.9 都未被旧校验拒绝。只有 RED 后才改版本和 release validator。RED stdout 中 npm 出现更新提示，未执行安装或更新；不把它说成已测得 OS 出站为零。后续 runner 设置 offline / 关闭 notifier，不能倒推 RED 也用了这些变量。

所有下面时间为 UTC；运行时 HEAD 均为上述 BASE 的 dirty worktree。

| 顺序 / label | 命令 | UTC 开始–结束 | 实际结果 / child exit |
| --- | --- | --- | --- |
| 04-final-node | `npm test` | 03:31:06.039–03:31:14.410 | 346/346，fail/cancel/skip 0；0 |
| 05-final-release | `npm run test:release` | 03:31:34.703–03:31:41.250 | 24/24，fail/cancel/skip 0；0 |
| 06-final-bridge | `npm run test:bridge` | 03:32:01.313–03:32:09.312 | 3 frame origin 与课程 API 脚本通过；无 TAP 总项数；0 |
| 07-final-integration | `npm run test:integration` | 03:32:18.128–03:33:00.480 | 原生拖放后等页序 30000ms 超时；1 |
| 08-final-review | `npm run test:review` | 03:33:49.293–03:33:52.296 | 首组旧范围文案不符；1 |
| 09-final-features | `npm run test:features` | 03:34:29.519–03:34:48.353 | 11/11；0 |
| 10-final-memory | `npm run test:memory` | 03:35:11.175–03:35:32.713 | 16/16；0 |
| 11-final-library | `npm run test:library` | 03:36:03.455–03:38:08.326 | 本轮新鲜 FULL 60/60；0 |
| 12-final-improvements | `npm run test:improvements` | 03:38:48.636–03:39:00.436 | 28/28；0 |

首轮九项全部属于 E1 `0b89ebc6df4a07e41f6a6e9ea9572e2d60894a0c7bd2a687a3fdecb9cdcfba43`，顺序如上。RED epoch 为 `7afd1231debb9e95af15e2bd2d64fc164f34438728fd178ba0cd31bed7d1e8a6`。源映射的生成算法与各次 epoch 见[验证记录](../../../docs/superpowers/plans/2026-11-07-v3.1.3-validation.md)及[实际账本](../../../.test-output/learning-task-3/job-resource-ledger.json)。

## 失败演进与必要重跑

1. 08 在当时 review169 期望 `/本节全部.*0.*页/`，producer 实际 `原始全部 · 0 / 0 页`。明确断言 fresh workspace 的 `export-view='raw'` 与完整 0/0 字符串，保留六导出节点、焦点、桌面/窄布局等原业务。
2. 13 前四组通过，第五组当时 review278 等“删除失败”10000ms 超时；实际点击新增学习排除按钮，状态“已排除 1 页，可撤销；原始截图仍保留。”。只读 producer 当时 capture1030–1035：删除 onclick 仍是 `deletePages`，learning-toggle 插在 delete button 前。将明确删除调用改为 exact role/name“删除”，保原 abort、Undo、命名、重开、Shift 业务。
3. 14 前六组通过，第七组当时 review320 的特定 ID20 泛 button 命中学习排除和删除两个元素，strict mode 失败。最初 grep 只查泛形式，漏掉特定 ID 变体；扩大精确检索后补齐第六处。没有声称早先五处覆盖全文件。
4. 15 前九组通过，第十组同名异文件加载超时10000ms，实际状态“加载失败：MP4 容器结构非法，无法安全读取。请换用同课次其他通道或用外部工具检查原文件。”。旧夹具在有效 MP4 后裸追加文本。按 Controller 具名授权，使用 BE32 `8+payload.length`、ASCII `free` 与同一 payload 构造合法顶层 box；保原文件前缀、basename、不同 bytes/size，保 sourceKey/lesson/原图/时间/other-course/batch/legacy 业务断言，未让产品接纳非法结构。
5. 17 前十二组通过，第十三组当时 review475 抛 `Invalid nontransitive fixture`。原 `[0,.5,1]% / RGB255` 三对均触发已审 `maximum>=48` 的 canonical local veto，AB/BC/AC 全不相似。93 实际只读对照：改 `[0,2,4]% / RGB30` 后 AB changed1.9965277778/mean0.4603921285，BC2.0013503086/0.4614814772，二者 localfalse/similartrue；AC changed3.9978780864/mean0.9030700693、localfalse/similarfalse（原 threshold3）。保原三对关系前置、A/C 重评 remove=[2]、事务 abort/read failure/原图/geometry/empty 断言；没有改产品算法或 Task1 M1。
6. 19 前十五组通过，第十六组原低高度完整卡片可达性失败；这是实际产品布局 finding。先报告范围外 owner，Controller 以 `8b61` 两文档提交把唯一必要产品 owner 样式纳入 Task3；随后才编辑样式，没有把故障改成夹具或放宽断言。20、21 的候选失败也原样保留，22 全 19 组及其后所有 CSS 消费者通过，见下一节。

| Label | 新输入 / 用途 | Epoch | child exit |
| --- | --- | --- | --- |
| 13-review-consumer-corrected | raw 范围消费者 | `fc113d8b68e625dc1dfe93ae6ad5cfe5d1d1d1471282572d9740ce5fba3311f9` | 1 |
| 14-review-exact-delete | 最初五处删除角色 | `1bf7347cdc37a29f162af8c2678c30e9507e3b4b8da9236f3acb53d00c9aee44` | 1 |
| 15-review-all-delete-selectors | 六处完整删除角色 | `7696f1e32bb37aa87812412a8b8339f6c3b42021dbc73929c2f1516a4602852a` | 1 |
| 16-integration-diagnostic | 唯一被动原生拖放诊断 | 同 15 的 tracked source，观察脚本不同 | 1 |
| 17-review-valid-distinct-mp4 | 合法 free box 同名异文件 | `c43fe13986f26683a430e27a8110b109beb2a110a6afa18fed411a31cd87a207` | 1 |
| 18-integration-visible-target | 可见交集右半内点与只读命中检查 | `d783406f6beaa42831cc70d2db7680fc0b59d24c9bb1c948cd375a0e87a48640` | 0 |
| 19-review-valid-nontransitive | 有效非传递夹具，仍完整 FULL run | 同 18 | 1 |

07 的原生 dragstart 实际 trusted source10，但这只证明启动，不证明落下或排序。16 保留原动作 / 断言，仅在 capture 阶段记录有界事件、内存/DOM ID、clip rect、scroll、状态与失败 PNG。实际 16 events 无 drop；最后 dragover/dragend `(1256,469)` 命中 `SECTION#results`，dragend `dropEffect=none`；末卡13 top457.953125、图库 clip top475.390625，`card.top+12` 被取整到裁剪区上方。numeric 内存 IDs `[10,11,12,13]` 与 DOM 顺序一致。此证据没有数据库页序采样，context 已关，不能补称已采；capture listener 中排队的 `defaultPreventedAfterDispatch` 不是可靠最终派发状态。只确证 16 未将 drop 投向末卡，不能证明 07 同因。

18 按具名授权只纠正该 driver 的 target：末卡∩图库∩viewport 的右半可见交集，取稳定有边距内点、验证取整仍在交集、`elementFromPoint` 命中既定末卡13。实际 `(1256,560)`，intersection left1139.5/right1260/top475.390625/bottom645.390625；原 trusted source10、12px native start、move/up、精确整序和 fresh page 持久化全部保留且通过。随后 HLS/Referer、缓存释放 PDF、local crop640×360、batch0channel/HTTPerror隔离与3页PDF渲染全执行，browser errors0。没有第二次被动诊断，没有强制派发 drop、人工排序或外推旧超时因果。

16 的实际观察工具 SHA：runner `c18a0d886d5951c46c316fcf832e63487eb11ec2d5534d51d84d83caf2600ec6`；guard `0a9c00fa4772e49f29f3124107d84f3933fc2a255d32e6bd2a1a247cb3a8b184`；diagnostic `700f81b1f0f34baa18001d4c1864f0c5fc30b01394512bed7099a5a1a3b20075`。91 为当时实际 helper 做 `COPYFILE_EXCL` 保存：initial guard 同上述 SHA，initial runner `1a453990b9002fb1eac3ca72b51045db33d8f5696c4eee19c7137be08c15392a`；这不是重建过去的源码副本，也不代表 RED 使用后来全部环境选项。

## 真实布局 finding、Controller 修订与最终 CSS

19 原始产品 RED 字符串：`AssertionError [ERR_ASSERTION]: ARTICLE is not fully reachable inside pages`，当时 [review606–611](../../../tests/review.cjs#L606)；第16组 `low-height expanded batch keeps a bounded reachable gallery and native first-card drag`。

实际 [geometry](../../../.test-output/learning-task-3/artifacts/review-HJGzxY/fix-2-gallery-geometry.json)与[截图](../../../.test-output/learning-task-3/artifacts/review-HJGzxY/failure.png)记录：

- viewport1280×720、batch展开3节、busyfalse/taskfalse；调用 firstCard `scrollIntoViewIfNeeded` 并等图片加载后。
- gallery `y475.390625..645.390625`，clientHeight170，scrollTop6；card `y475.390625..680.953125`、height205.5625。卡片高于图库35.5625px，底两角 hitfalse。
- learning-toggle `y650.953125..680.953125`、height30，5/5 hitfalse；选择框/时间行则5/5 hittrue。
- workspace `bottom665/scrollTop317/clientHeight601/scrollHeight918`，actionRow `y665..720`，document1280×720。不是横向文档膨胀或仍忙状态。
- 原 review611 明确要求 `pages.clientHeight >= card.height`，原606–609要求完整 card/controls 在每个 clip 内且命中，并位于 action row 上方；170无法容纳205.5625，普通滚动、改 selector 或删断言无法满足。
- 当时只读 owner 是 [style](../../../style.css) 中的 `minmax(560px,1fr)` 工作区预算、图库 flex1/min-height0 与第三行学习按钮；当时样式仍在原 14 文件范围外，已先带证据上报。Controller 后续修订后才改，未追写成当时已有权限。

19 没有执行该组后续尺寸、1000 卡预算、Stop 或截图组；18 integration 的原生成功不能替代它。后来的 20/21/22 才提供各自真实后续证据：

| Run | 实际结果与取舍 | aggregate epoch / exit |
| --- | --- | --- |
| 20 `minmax(620px,1fr)` | 三尺寸完整卡片/按钮和 native order/reload 通过；1000 卡图库 230→196，外层 scrollHeight 同为978，原恒定预算断言失败。多出的34像素来自 export wrap 只是当时假说，没有补称已观测关闭的 context | `bf66de5d47a02319611760bc97880d41d9ea7f6a6797c99b23cebd3e227f9fdf` / 1 |
| 21 `minmax(660px,1fr)` + export actions 固定独立一行 | 首17组通过，含1000预算/Stop；第18正常折叠桌面在原 gallery bottom/height>250/独立滚动合取断言失败，未预先落盘其数值，不能声称已知哪个子条件的精确值。实际截图显示折叠 summary 仍空占整行 | `25f4e48781507a7c72625718c09a5606ed210cd4b86279d8fae8c5db574afa99` / 1 |
| 22 最终 CSS | 保留展开660预算、原窄屏规则与独立 export actions 行；仅桌面折叠 batch 把 summary 留在 capture 列，results 跨两行、使用工作区完整高度。全部原断言保留，19/19 组通过 | `79171a758a8a5b900baaffa58235ea1b573b6b87b8e23740119178ac7a0782ba` / 0 |

最终只读测量显式包括完整 ARTICLE、checkbox、time、learning-toggle 和 exact 删除 button；每个控件四角内点+中心均命中且在所有 clip 内、共享 action row 上方。1280×720 展开3节时 gallery236 / card205.5625，1440×900 为272 /174.234375，390×844 为440 /167.875。1000页仍为 gallery236、外层 scrollHeight1018，与4页相同；缩略图 loaded4/allowed4/outside[]，导出两个子行实际高度66/28。原生 trusted first-card start、drop、精确顺序与重开持久化均通过，没有人工排序。

正常折叠桌面实际 gallery 为1280×800：257高、bottom745=workspace.bottom；1440×900：393高、bottom845=workspace.bottom；1920×1080：607高、bottom1025=workspace.bottom。文档未膨胀，图库独立滚动，8个 toolbar action 在视口内；并非只上挪而保留不可见 minrow。全部几何见[汇总](../../../.test-output/learning-task-3/geometry-summary.json)和[原始3383行测量](../../../.test-output/learning-task-3/artifacts/review-WzlOsh/fix-2-gallery-geometry.json)。已实际查看三个展开尺寸与1280×800正常截图。最低 Chrome114 未运行，不把 `:has` 兼容性知识当作实测。

没有新增 JS、放大到随1000卡无限增高的 lazy root、隐藏/缩掉新控件或放宽旧可达性/预算/Stop/native 断言；最终 memory 的缩略图并发≤2和其它资源预算也已通过。

## 最终九项适用性与实际安装包

E1→最终源码恰好改变3条路径：样式、integration、review。首轮9项顺序及结果不改写；样式稳定后按必要影响实际串行执行22 review→23 release→24 integration→25 features→26 memory→27 library→28 improvements，均前后 epoch 不变。release 虽不渲染 CSS，确实将 CSS 作为 ZIP 夹具输入复制，因此重新运行24项。以下是最终信用，不声称全部套件在同一个完整源码 epoch / Git HEAD 原生执行：

| 命令 | 最终实际记录 / 结果 | aggregate epoch / child exit |
| --- | --- | --- |
| `npm test` | 04，346/346；10个指定 Node entry 与共享读取源码 hash 未变 | E1 / 0 |
| `npm run test:release` | 23，24/24，原18安全项+新6项全部通过 | 最终79171… / 0 |
| `npm run test:bridge` | 06，3 frame origins+课程API全脚本；无 TAP 总项数 | E1 / 0 |
| `npm run test:integration` | 24，全脚本，native目标13(1256,542)、精确页序/持久化、HLS/Referer、crop640×360、3页PDF逐页渲染 | 最终79171… / 0 |
| `npm run test:review` | 22，19/19，完整卡片/两按钮、1000预算、Stop、正常桌面和全部截图 | 最终79171… / 0 |
| `npm run test:features` | 25，11/11 | 最终79171… / 0 |
| `npm run test:memory` | 26，16/16、0 browser errors | 最终79171… / 0 |
| `npm run test:library` | 27，新鲜 FULL60/60，native JSON SHA仍b11cc093… | 最终79171… / 0 |
| `npm run test:improvements` | 28，28/28，suite报告无外部请求 | 最终79171… / 0 |

最终 aggregate sourceEpoch 为 `79171a758a8a5b900baaffa58235ea1b573b6b87b8e23740119178ac7a0782ba`；这是60个跟踪源码路径的哈希映射摘要，不是 Git commit 或旧源码副本。Node/bridge 的真实入口、被读取/注入的 root JS、图标、manifest、runtime 等前后 SHA 成对列在[输入适用性](../../../.test-output/learning-task-3/input-applicability.json)，另有57文件保守不变集合。依据是实际命令+已读调用方/读取点与当时 source map；没有补造原来未采的 filesystem trace、dependency/browser binary hash。两命令不读 CSS/capture HTML，也不加载另外两个浏览器脚本。Node 的10个指定文件不包括 standalone release；bridge只向合成HTML注入5个JS，不读产品HTML。没有重复已成功未变输入的套件。

103 精确 stage15个 SOURCE 文件并提交，所有 Git 子命令均真实0，父为 Controller `8b61`；107 对全部60个记录源码验证工作树和 SOURCE 字节相等。测试运行时实际 HEAD 仍如开头记录，SOURCE 是后提交的同一字节来源。SOURCE 提交后仅编辑证据文档；测试源码和 shipped README/style 没有在打包后改变，不需要重打包或拉宽矩阵。

104 打包前再次核实绝对 ZIP/tmp/last-release 目标与真实 root；三者当时均不存在，root/historical ZIP集合均空。29 实际 `npm run release` 于 SOURCE 执行，UTC04:28:34.816–04:28:35.337，child/managed job exit0，保留既有安全暂存与旧包归档流程。没有移动/删除用户旧产物。

实际包：[ppt-capture.zip](../../../ppt-capture.zip)，**1,303,886 bytes / 35 entries**；SHA256 **`37563515b543dafea4581ecb42f041eb7134543b853ada18b50d789e480172ec`**。105 独立检查实读 EOCD、central/local header、精确唯一顺序35名单、每个解压长度与CRC、DOS1980确定性时间戳、manifest.version3.1.3，每个成员与当前文件以及 `git show f9826d3…:<member>` 的原字节一致；没有 tests、录制源、PDF、credentials或SDD。实际35成员+逐项bytes/CRC/SHA在[ZIP验证](../../../.test-output/learning-task-3/zip-verification.json)及验证文档。包只含源码内容，不含自指 commit；后续 evidence-only commit 不在包中。

本报告 / validation 是独立后续 evidence-only commit，其实际 HEAD 在最终交接和 raw post-commit 中记录；不改 SOURCE 或包字节。本记录只是 Task3 implementer 的本地验证，fresh spec / quality / 最高整分支 gate 仍交 Controller。

## 环境、请求计数与生命周期

实际 Node v26.13.0、darwin arm64，已安装 browser Chrome156.0.8078.4；`PPT_TEST_BROWSER` 为用户指定的 `.../chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`。未安装依赖/浏览器/软件，未使用 MCP browser 或日常 profile。

raw guard 添加 mute/background-networking off/no-proxy，缺少 resolver 规则时加 deny-all + loopback 排除；将无 host 的 owned HTTP listen 限127.0.0.1，在 suite mocks 之前安装最底层非本地 deny fallback。mock 后加因此优先，未修改业务断言或产品代码。记录了 context close、browser disconnected、HTTP close、pageerror 和 fallback abort；不是 OS 出站监测。

95 是当时17 jobs/E6的历史账本，保留为[修样式前账本](../../../.test-output/learning-task-3/job-resource-ledger-before-css.json)。106 最终账本涵盖 **27 managed jobs，逐个 `job_output` 收取，0 running**；每个已记录 resource 文件 openContexts0/openServers0/connectedBrowsers0，observed pageError 总0、底层 fallback blocked总0。Node的14个HTTP服务均闭合。成功 suite 自己实际执行的 errors/blocked 断言通过；早退 review 的最终数组断言当时未执行，integration/bridge 未列出的上层 route abort 总数未知，不用 fallback0填补，也不声称 OS 出站已测0。没有 MCP/lease/外部 CDP 会话；owned context/browser/process 与 loopback server 都结束，相关媒体、URL、reader、listener、timer 与临时上下文生命周期闭合，静态 raw 保留。没有宿主重启、reload、远程发布、tag、push、main merge 或向第三方发消息。

所有 managed jobs 与实际 numeric child exits：

| Label | Job ID | exit |
| --- | --- | --- |
| 02 | bash-6fa17db16a714086 | 1 |
| 04 | bash-bcda40867ebb46c1 | 0 |
| 05 | bash-92ae83099fed4f90 | 0 |
| 06 | bash-9ccb9a4eaaf14914 | 0 |
| 07 | bash-22d6d84b46bd49c8 | 1 |
| 08 | bash-50d8340ddd1b40b9 | 1 |
| 09 | bash-fd89476d59a94d88 | 0 |
| 10 | bash-b9952a9e51ab4a46 | 0 |
| 11 | bash-04884e30b8ef478b | 0 |
| 12 | bash-3df22fd0e64d4ad1 | 0 |
| 13 | bash-31feddb3c4c84441 | 1 |
| 14 | bash-ad6b8f8a08d949a3 | 1 |
| 15 | bash-df7d2efe44334484 | 1 |
| 16 | bash-773aec724535474b | 1 |
| 17 | bash-20b758e731d64a65 | 1 |
| 18 | bash-514e47737a054610 | 0 |
| 19 | bash-4bbb491b262e4593 | 1 |
| 20 | bash-05349f83b1c1445f | 1 |
| 21 | bash-587ffe4e39384b7e | 1 |
| 22 | bash-9621c807c3b34734 | 0 |
| 23 | bash-4f3a3fed5f74407e | 0 |
| 24 | bash-961cac41f7c14ad1 | 0 |
| 25 | bash-cca19912b29a4b08 | 0 |
| 26 | bash-9dc22bfa897841e5 | 0 |
| 27 | bash-219b11e0a1a54966 | 0 |
| 28 | bash-1265f21d90de4d8e | 0 |
| 29 | bash-9f6454757b8f41a6 | 0 |

95/98/99/101/102/103/104/105/106/107 为同步检查，实际子进程0，没有额外 managed job。96 严格 handoff 检查曾 exit1，因为 Controller 正在修改两个 plan/spec 文档；当时 HEAD/index/git diff-check 已实际0，但 changed-set 断言真实失败，没有覆盖其 quartet。Controller 确认归属后提交 `8b61`，worker未暂存它们。97 的0只检查当时 NEEDS_CONTEXT 文档，不冒充最终文档检查。100 输入账本 helper 的字符正则漏 `mp4` 数字，真实 `9 !== 10` / exit1；只修 raw helper 为含数字的路径模式，101/102实际0，没有修改产品或重跑 suite来掩盖。108 最终文档检查 helper 又因假定标题为“Globals”而真实 exit1（`assert(start>=0)`）；实际标题为“Verbatim Global Constraints”。只将 raw helper 改为真实标题与下一 Markdown 标题边界，保原失败 quartet，未改六项原文或源码。109 又真实 exit1，因为额外的编号检查要求 validation 出现“106”，但当时该段仅给账本链接和实际27个job事实；补标真实106账本编号，未改运行结果或source。

静态 raw helper、quartets、失败 screenshot/geometry 继续保留，未移动/删除用户既有产物；90与104 preflight 实际 root / historical ZIP 集合均空。早期 integration 用共享固定输出名，不能把那些路径后来内容称为07或18冻结导出物；07/18 quartets/source/resource 及16独立失败JSON/PNG保留。最终包与105逐项证据是实际最终 SOURCE 的产物，未把测试夹具包当安装包。

路径探测曾误指不存在的 `core.js` / `capture.css`，grep工具实际返回 exit2，后定位实际媒体/样式文件；不把这些工具失败写成进程0。早期报告不存在的 read 错误没有 numeric process exit；glob未列出部分隐藏产物不证明不存在，实际 read/read_image 已确认。

## 沿用证据与未测边界

- Task1 M1：±30 red 覆盖20736pixels的旧case同时失败 changed100%与mean约3.92%>0.6%，未隔离changed gate；旧独立报告过度主张仍由最高整体triage处理，Task3没有改Core测试或宣称已消。
- Task2 R1 测试SOURCE `0d8124403ce139e85b3a1dd75a3be16f5cbc3d32` / report BASE072ce，fresh c859 SpecPASS / QualityApproved C0I0M0关mandatoryI1。原历史 library 信用 full59 + visual1 + newnative1，不改写成旧FULL60；本轮11实际新鲜FULL60另记。
- R1同page/context reload→真实batch-course-report入口→native saveAs→读回JSON：2562bytes，SHA256 `b11cc0931c09268a9859738ea3527f004cdbe60d14cd0131b089c6ebbc37ee81`；raw/exported/excluded4/2/2、batch42≠current99、ID613时间1.25→1及612时间2.25→2、公共字段/隐私边界。新入口证明不解释旧burst10第二同名JSON及13后续selected rawPDF native事件10000ms超时；未重放、未治愈、原因未知。Acq L1旧最终JSON超时也仍未知，与后续HLS手动日期夹具问题分开。
- 固定坏AAC originalMutedDecodedtrue/nativeFailedfalse/differentialfalse，表示浏览器容忍而非原件失败后的恢复；默认分组/轨道引用走原件是另一个保守限制。用户5坏录制/29帧/710×378文字未取原件实测。
- 1388实际流水线是合成694秒seek；2000是seeded restore + ZIP，不是采集。JSHeap不是RSS或peak。
- 最低Chrome114/Node20、其他OS、物理disk-full、真实学校与鉴权、OS最终保存、原始录像及知识正确性没有认证。没有把当前Chrome的本地合成结果外推到这些范围。

风险与未查：Task3 的本地实现和包验证已有上述实际证据；独立 spec/quality gate、最高整分支审查及最终交付仍由 Controller 执行，未在本报告代为宣称通过。Task1 M1 旧隔离缺陷和上述未测环境、原始媒体、知识正确性及历史超时仍按边界保留。未 merge main、打 tag、push 或远程发布；分支、工作树、本地 ZIP 与 raw 全部留存。
