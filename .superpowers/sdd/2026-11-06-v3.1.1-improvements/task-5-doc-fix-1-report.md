# Task 5 文档修复报告：M1 / M2

状态：**DONE，等待独立复审**。本轮完成两项文档修复，没有新增运行时改动或测试结果。

## 范围与提交

- 分支：`fix/v3.1.1`。
- 开始时 HEAD：`d9461ca4ce7e6267a3e7ecf2f07214309920aaf2`，工作区干净。
- 父代理指定的复审 FIX_BASE：`7002a175d99ddbafbed4502d5f9c07520bc5edc4`。中间父代理的审计提交不属于本轮修改。
- 两份文档提交：`5f774155bca0222048bfd35dcee6b6f3795caf30`，`docs: correct regression coverage and saved lesson usage`；仅 2 个文件，7 行新增、6 行删除。
- 本报告单独提交，报告提交 SHA 随最终交接提供。
- 依据：完整读取 [修复 brief](task-5-doc-fix-1-brief.md) 和完整 106 行 [Task 5 评审](task-5-review.md)，复用此前已加载的 ponytail full / humanizer-zh。

本轮仅修改 [使用说明](../../../README.md)、[测试说明](../../../tests/README.md) 和本报告。未修改原 [Task 5 汇总报告](task-5-report.md)、父代理计划/审计、源代码、测试、版本、依赖或发布文件。

## M1：测试覆盖归属

[测试矩阵](../../../tests/README.md#L12) 与 [各套件说明](../../../tests/README.md#L51) 现在按实际断言分配覆盖点：

| 套件 | 文档修正 | 静态证据 |
| --- | --- | --- |
| `test:review` | 明列 Shift 连续选择/取消、预览 S/V，以及逐对清理的取消、确认和一次撤销 | [Shift 用例](../../../tests/review.cjs#L220) 检查重排后页序、选择/取消与锚点；[预览用例](../../../tests/review.cjs#L243) 检查 S/V 和可编辑控件保护；[清理用例](../../../tests/review.cjs#L315) 检查取消不变、确认删除和撤销恢复原记录 |
| `test:library` | 明列已存批量课次跳转、待复核确认、历史删除/大小估算、裁剪复用/回退 | [批量跳转](../../../tests/library.cjs#L241)、[待复核确认](../../../tests/library.cjs#L268)、[估算](../../../tests/library.cjs#L565)、[删除取消及事务回滚](../../../tests/library.cjs#L593)、[活动/空课次/整课删除](../../../tests/library.cjs#L642)、[复用确认](../../../tests/library.cjs#L687) 和 [实际载入不匹配回退](../../../tests/library.cjs#L771) |
| `test:improvements` | 移除上述 UI/library 覆盖误归属，保留采样、忽略区比较、签名缓存、原子保存和导出 | 静态枚举为 13 个比较/缓存/原子状态组及 7 个导出组；[默认采样](../../../tests/improvements.cjs#L34)、[原图/签名内容保留](../../../tests/improvements.cjs#L94)、[缓存复用](../../../tests/improvements.cjs#L120)、[上限](../../../tests/improvements.cjs#L166)、[失效](../../../tests/improvements.cjs#L200)、[原子回滚](../../../tests/improvements.cjs#L249)、[导出组起点](../../../tests/improvements.cjs#L343) |

另核对 [忽略区清理用例](../../../tests/improvements.cjs#L139)：它检查比较规则与延迟确认，不承担整套清理 UI 的取消/撤销覆盖。因此没有将该用例扩大描述为 review 的交互回归。

[improvements 详细说明](../../../tests/README.md#L57) 保留所选 PDF / JPEG ZIP 页序、默认全部导出、时间/书签设置、讲义、批量课程范围和异步快照的原说明，以及原有产物路径。所有命令、前置依赖、串行运行步骤、32 文件打包测试说明和环境限制保持不变。

## M2：批量行“查看截图”用法

在 [批量使用说明](../../../README.md#L130) 增加一条：点课次行的 **查看截图** 可打开该节已存截图和待复核时间段，不加载视频或启动提取；零截图课次仍可查看已存待复核记录。

核对的消费者和断言：

- [按钮处理器](../../../capture.js#L1397) 查找已存课次并调用 `switchLesson(lesson.id)`，随后展开待复核面板，将截图列表滚到顶部并聚焦；该处理器没有发起视频加载或提取。
- [批量跳转用例](../../../tests/library.cjs#L256) 检查切到目标课次、截图顺序、待复核面板，以及 `sourceReady: false`、视频 `src: null`、选择/锚点清空。
- [零截图用例断言](../../../tests/library.cjs#L263) 检查零张截图仍显示一条待复核记录，页面/资产数据保持不变，视频仍未加载。

文字没有把这个入口写成视频时间跳转或提取按钮，也没有改变现有批量准备、裁剪复用和整课下载说明。

## 本轮验证与自查

仅作静态核对：读取获准的两份 README、brief、评审，以及上述三个测试文件的相关用例和按钮处理器；没有读取其他新文件。

| 检查 | 结果 |
| --- | --- |
| 起点 `pwd` / `git rev-parse HEAD` / `git status --short --branch` | 退出 0；目录、分支和 BASE 符合授权，开始时干净 |
| `git diff -- README.md tests/README.md` | 退出 0；逐行自查仅 M1 的六处覆盖说明及 M2 的一条新增用法 |
| `git diff --check` | 通过；未见空白错误 |
| `git diff --cached --check` | 退出 0；提交前检查通过 |
| 精确暂存 `README.md`、`tests/README.md` 并提交 | 退出 0；文档提交只含这两条路径 |
| 提交后 `git status --short` / `git show --format= --name-only HEAD` | 退出 0；文档提交后干净，文件列表恰为两份 README |

本轮未运行浏览器、单元测试、打包测试或任何其他运行时检查，也未对未变的代码做语法检查。没有新后台作业、网络请求、真实数据、凭据访问、委派或发布操作。未安装/下载依赖或浏览器。

## 证据边界与后续

既有 Task 5 A/B/C 分阶段证据继续复用；本轮没有重跑或增加任何通过数，也不声称九套测试均在文档提交上重新执行。原报告的历史 RED、修复归属、命令、产物和局部断言限制均未改动。

Chrome 114、Node 20、真实课程站点、真实权限弹窗及人工 PDF 阅读器检查仍未由本轮验证；既有实际环境与这些最低版本不同。最终全分支审查、实际本地发布 ZIP/校验及其他发布步骤仍由父代理在 Task 5 审批后处理。

M1/M2 已按静态证据修正，未发现新的歧义或阻塞。父代理下一步可对 `7002a175d99ddbafbed4502d5f9c07520bc5edc4..报告提交` 作限定复审。本次交接后停止修改。
