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

状态：待实现。

## Task 3 — 版本与整体验证

状态：待实现。

## 最终审查与产物

状态：待完成。需记录整体审查结论、实际截图/合成 PDF、34 成员 3.1.2 安装包的 CRC/源字节/SHA-256，以及实际测试环境与未验证项。
