# 媒体准备与诊断阶段审计、后续接口

本阶段承接课程读取、命名、长任务及完整性阶段。两项任务及其限定修复均已通过独立审查，随后最高推理档审查者检查了完整分支。此记录是学习阶段的前置交接，不是十二项整体目标、3.1.3 安装包或真实故障录像恢复的完成证明。

## 审查范围和结果

- 实际 main/merge base：`c8aaafba387401ca650b8f862acde8ee8d13d679`。
- 整体审查冻结 HEAD：`ebf57de5ae005715336028984b774925bd4c0835`；完整 20 个提交、698,226 bytes、8,022 行差异、35 个文件。
- 新鲜最高推理档审查者 b4148299-2fd4-48d3-9da9-2570aa7edaf0：Spec PASS，Quality/Architecture/Integration APPROVED，C0/I0/M0，无待修产品 Minor、parked finding 或计划冲突。没有需要触发的阶段末修复波次。
- [完整整体报告](../../../.test-output/phase-reports/2026-11-07-media-recovery/branch-review-report.md)、[冻结差异包](../../../.test-output/phase-reports/2026-11-07-media-recovery/review-c8aaafb..ebf57de.diff)、[冻结完整账本](../../../.test-output/phase-reports/2026-11-07-media-recovery/branch-review-ledger-snapshot.md)保留具体代码判断、读取范围、原始证据和限制。审查未重复运行已有测试。
- 本审计随后的提交只新增此文档；下一项任务须独立读取实际 HEAD，不能把设计提交或上述审查 HEAD 预定为实现 BASE。当前产品版本仍为 3.1.2。

## 已完成的接口

1. `PPTMP4.inspect(blob, {signal} = {})` 与 `PPTMP4.prepare(blob, {signal} = {})`：有界结构检查；公开时长为秒，视频时长取 movie 时基中的 tkhd 呈现时长。受支持文件仅把音轨外层 `trak` type 改为 `free`，保持长度、视频数据、索引偏移和时间线。音频载荷仍在文件中，不是脱敏。
2. 解析预算保持每次读取 65,536 bytes、累计元数据 16,777,216 bytes、50,000 boxes、深度 8、32 tracks。不支持的结构/纯视频返回同一原 Blob；确认损坏或缺索引才拒绝；取消与真实本地读取失败分别保留 `AbortError`、`LOCAL_READ_FAILED/local-read/cause`。mdat 区间索引、独立二分查找及协作 yield 消除 chunks×mdats 同步工作量，不增加第六个拒绝 cap。
3. 完整 OPFS File 或本地 File 在原生加载前准备。原 URL、文件 name/size/lastModified、canonical key、候选 URL 课次关联、显式 batch course 与同源手动名称保持原语义。准备后的 Blob URL 只用于生命周期管理。`mediaRecovery.omitAudio` 默认开启，独立于 scanSettings；HLS 和 unsupported/original 仍只作一次原生尝试。
4. `PPTCore.mediaError(mediaError, {phase='load', local=false, audioOmitted=false, time=null} = {})` 保留 code/phase/nativeCode/time；`PPTScanner(video, capture, mediaContext = {})` 兼容旧调用。后续修改比较逻辑不能丢掉这些接口。加载就绪要求实际视频解码/呈现依据，不能仅靠 loadeddata、尺寸或立即为零的计数；有效黑帧仍被接受。
5. `fetchVideo(url, signal, {timeoutMs=30000} = {})` 约束首响应和每次 body read 的无进展时间，不是整个下载总时限。206 须覆盖全资源并匹配实收长度；仅在表示编码可比时核 Content-Length。已有格式探测仍限制 64 KiB。自有 video detach 后才 revoke URL、删除缓存，迟到回调不得绑定或标记完成。
6. `PPTLibrary.bind(db, lesson, {signal} = {}) -> Promise<void>` 在一个 settings 事务写 lesson 与 activeLesson。绑定先暂存元数据，事务成功后才发布内存、列表和撤销清理。提交前取消回滚；提交已胜时 DB/UI 保持一致，已取消加载仍不会进入 sourceReady/done/coverage。既有 put/activate/batch/restore/remove、IDB v3、资产存储不变。

## 测试来源必须分开

| 来源 | 已保留的实际结果 | 使用边界 |
| --- | --- | --- |
| M1 CPU 修复后 | focused 30/30，exit 0；工作量、事件派发、CPU 阶段取消及字节/预算控制 | 原 298 项 npm 是 CPU 修复前结果，不替代该修复后的验证 |
| M2 初始源码 `569fb488ab0a0c2dda8afd1e2a5f2d0d42b7c500`，report-only `714ff2c0eb822cb822aa67b679b0a222fc0b4e02` | Node 320、release 18、unfiltered library 55、features 11、完整 integration 均 exit 0 | 是原子绑定修复前矩阵；integration 的“53”是运行前缀，不是 53 组测试 |
| 原子绑定修复源码 `3d6078311ecad513eafe0438a72f4a3252b26271`，report-only `ebf57de5ae005715336028984b774925bd4c0835` | focused Node 68/68；浏览器 12 组含 20 个真实 IDB 顺序场景；npm 341/341，均 exit 0 | 05/06/07 before-after hash、原 125 行报告前缀及 committed source 均已核对；未把旧完整浏览器矩阵改称此源码上的重跑 |

原始命令、stdout、stderr、实际 exit、环境与来源矩阵分别保存在 [M1 修复记录](../../../.test-output/media-task-1-fix-round1/)、[M2 初始记录](../../../.test-output/media-task-2/)及[原子绑定修复记录](../../../.test-output/media-task-2-fix-round1/)。所有失败、基线 RED 和 superseded interim 均保留，不计作通过。

20 个真实 IDB 场景为 local/remote × new/same × preabort/Stop/ConstraintError/commit-then-Stop/success。pending Stop 在原生 get keepalive、尚无 terminal event 时触发；commit-wins 从真实 complete event 在 library continuation 前触发 Stop。仍打开的取消操作保留 undo-owned 102、active 101 和 unrelated 103 的实际字节；重开时既有 undo-only orphan 清理另有语义，不能混称取消丢图。

## 明确保留的限制

- 同一规范化坏 AAC 固定变体的 original muted 仍可解码：`nativeFailed=false`、`decoded=true`、`differential=false`、`browser-tolerates-damaged-audio`。已证明准备和保留像素/时间，未证明“原件失败后恢复”。普通 FFmpeg 分组控制的 original passthrough 是另一原因；受支持合成控制的规范化不等于所有 AVC/AAC 都可改写。原五段坏音轨、坏原视频和 29 帧结果未取得独立验证。
- L1：旧 acquisition 最后 JSON 命令 exit 1，`page.waitForEvent: Timeout 10000ms exceeded while waiting for event "download"`，原因仍未知。更早 JSON/完整 ZIP、重开后 exit 0 只证明各自操作和恢复；60 秒 no-cache URL cleanup 修复、后来 HLS/PDF fixture 失败均未被证明解释或治愈它。
- 1,388 页是实际 scanner/save/JPEG/IDB、694 秒合成 seek；2,000 页是 seeded restore/stream ZIP。JSHeap 不等于 RSS/峰值，未作原生数小时连续解码认证。
- 执行环境为 Node 26.13.0、Playwright 1.62.1、Chromium 156.0.8078.4、darwin arm64。最低 Chrome114/Node20、其他 OS、真实学校/认证 API、物理磁盘满、OS 最终保存和知识语义完整性未认证。
- 审查者自动 context restore 产生的两个 tool-owned 本地转录有独立披露，没有删除；不作绝对 report-only-artifact 或完整 TMP cleanup 声明。Rule Search 工具不可用，未假称规则检索成功。

## 学习阶段交接与最终收尾

后续按[学习计划](2026-11-07-learning-review.md)与[绑定规格](../specs/2026-11-07-learning-review-design.md)执行：先保护规范签名中的一个强差像素，再做可恢复排除、四项当前核验证据、全 raw reviewPages 与请求范围分离，最后统一 3.1.3、九项最终套件和 ZIP 的 exact assets/CRC/源字节/SHA256。实际前置接口须在学习 own ledger 激活时核对；不得重派已完成媒体任务。

[阶段完整账本](../../../.test-output/phase-reports/2026-11-07-media-recovery/progress.md)与[此前决策草稿](../../../.test-output/phase-reports/2026-11-07-media-rulings-before-whole-draft.md)保留裁定依据。草稿只有冻结截至点，须连同后续 whole closure/过程例外/归档交接决定在最终“Rulings I made”逐项披露理由与错误代价，不能只给链接。为 producer 消费和最终披露暂保本阶段 own scratch；完成耐久交接和披露后只清自己的计划目录。隔离 branch/worktree、交付物保留供检视，不合 main、不远程发布。
