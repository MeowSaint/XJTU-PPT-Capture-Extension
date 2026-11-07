# 3.1.2 实施与验证记录

基线：main / ae75c719e5ec4660363b5e29098a22b8de466940（已发布 3.1.1）。执行分支 feat/v3.1.2；工作仅在独立 worktree，原 main、旧 worktree 和已发布安装包保留。

[设计](../specs/2026-11-07-course-pdf-workbench-design.md) · [实施计划](2026-11-07-course-pdf-workbench.md)

## 范围与选择

- 用户要求先做整课 PDF 目录，同时改善 UI 的操作可发现性与动效，指定 Apple Design，并参考 React Bits / Anime.js。转录与自有云 API 暂缓，不上传课程资料。
- Ruling：按用户直接要求执行 PDF 与 UI，常规构图/配色/技术选择由执行者承担，不将其写成用户逐项批准 — 如理解有偏差，隔离分支和截图可供调整，代价是局部返工。
- Ruling：整课合并固定生成课程、课次、页码/时间三级目录；原书签开关只控制旧导出 — 保证用户默认就能找到课次并保持旧字节，代价是新格式不提供关闭目录的额外开关。
- Ruling：保留原生 DOM，用 CSS / WAAPI 做可取消的局部反馈，不引入 React 或动画运行时 — 参考交互原理并控制维护量，代价是没有通用弹簧/手势动画框架；实际裁剪仍实时跟随。
- Ruling：新增 motion.js 独立管理视觉反馈并纳入打包，从 33 到 34 个资源 — 避免业务状态与动画互相等待，代价是一份小型资源及对应打包校验。
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

状态：待实现。

## Task 2 — 工作台与动效

状态：待实现。

## Task 3 — 版本与整体验证

状态：待实现。

## 最终审查与产物

状态：待完成。需记录整体审查结论、实际截图/合成 PDF、34 成员 3.1.2 安装包的 CRC/源字节/SHA-256，以及实际测试环境与未验证项。
