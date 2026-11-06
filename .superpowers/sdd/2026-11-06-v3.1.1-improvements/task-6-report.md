# Task 6：命名保存顺序与 README 横幅

状态：DONE。修复了整分支终审唯一 I1，并完成新增 README SVG 横幅及 33 成员打包清单。没有新增依赖或扩大共享逻辑范围。

**范围与提交**

- 工作区：`/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1`；分支 `fix/v3.1.1`；干净起点 `8bc923cf16d65eb69bfb23995bd3555eb233026b`。
- 原终审基点、后续定向复审的 `FIX_BASE`：`f83fed69e63f93ca597e209f5bc5d9f8e84d77c5`。后续复审范围应从它到最终 HEAD，包含父代理先提交的 `8bc923c` 设计、计划及审计追加。
- I1 修复与回归提交：`676f31a28b5590b405fe17bc68ea1017cb47d67e`，`fix: preserve pending naming when reusing crop`。
- 横幅与打包提交：`a1691deef13f59428b8d0610cb6d86bbfbcc54ae`，`docs: add self-contained README banner to release`。
- 本报告另行提交；报告提交不改上述已验证的产品和测试源码。最终报告提交 SHA 由交接消息提供，避免在报告中自引用未产生的提交。
- 修改范围仅为 [capture.js](../../../capture.js#L1312)、[tests/library.cjs](../../../tests/library.cjs#L687)、[README.md](../../../README.md#L1)、新增 [SVG 横幅](../../../icons/readme-banner.svg)、[发布清单](../../../scripts/release.cjs#L6)、[独立打包测试](../../../tests/release.test.cjs#L16)、[当前打包说明](../../../tests/README.md#L58)，以及本报告。辅助脚本、截图和日志均位于忽略的测试输出目录。

**I1 的机制和修复**

原处理器在命名事务尚未提交时直接计算目标，并调用 `PPTLibrary.put(db, activeLesson, {page: batchPage, jobs})`。该 helper 在调用时复制整节课次；此时内存里的 `course`、`page`、`namingManual` 仍是旧值。命名事务提交后才更新内存，但排在它后面的复用事务已经持有旧快照，会覆盖磁盘中的新命名；刷新后读取课次记录，命名随即回退。现有 `busy()` 不等待命名保存，因而用户可以进入这个时序。

在 [复用确认处理器](../../../capture.js#L1316) 的 `try` 开头仅增加：

```js
await namingSave; await lessonSave;
```

目标资格在等待之后重新计算，随后才构造任务副本和来源课次快照。继续使用原有一次 `PPTLibrary.put` 原子提交来源课次与相关批次；`retainBatch`、任务替换和界面成功提示仍在提交完成之后执行。没有新增串行器，也没有把调用改道到会提前取快照的 `persistLesson`。

新增的一组 [真实 IndexedDB 回归](../../../tests/library.cjs#L687) 使用现有隔离课次 fixture，准备来源、目标和无关课次、批次及图片资产。测试先拦截 IndexedDB `put`，用同一事务中的持续 `get` 保活，再设置日期/时间字段并触发一次实际名称输入事件，确保一个保存快照包含全部新命名。生产函数和 promise 没有替换，来源课次与命名写入均真实排队。

事务挂起时，断言输入框已包含新名称、日期和时间，内存课次仍是旧命名且 `namingManual: false`。通过实际复用按钮、同机位确认复选框和应用按钮提交，检查处理器处于写入状态、应用按钮禁用、目标 override 尚未发布。释放事务后检查完整来源记录的新命名与 `namingManual: true`、目标任务的完整预期裁剪状态、其余课次/批次/页面/图片资产不变；刷新后再次核对完整存储和输入框。

原有异步批次写入失败使用重复键制造真实事务 abort，并保留磁盘完全不变、内存无发布的断言。取消复用、提交后渲染失败、任务资格排除、不同宽高比/轨道回退、保存批次归属及手工准备保存失败等原有测试没有改动。

**新增 D 组验证：实际命令与结果**

环境为 Node.js `v26.13.0`，本机现有 Chromium `156.0.8078.4`。浏览器命令统一使用用户指定的可执行文件；未安装或下载浏览器、字体或其他资产。

```sh
export PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
```

以下命令均从上述工作区执行。课次库与发布检查按顺序执行，没有重跑其余无关测试套件。

| 步骤 | 实际命令 | 结果与证据 |
| --- | --- | --- |
| 首次测试草稿 | `PPT_TEST_FILTER='^crop reuse waits' node tests/library.cjs` | exit 0，1 组；这是无效 RED 草稿，连续填写三个字段产生后续保存，掩盖旧快照覆盖。见 [初稿日志](../../../.test-output/v3.1.1/task6-unique/library-red.log)。收紧为单次保存后才进入有效 RED。 |
| 有效 RED，生产代码仍未修复 | `PPT_TEST_FILTER='^crop reuse waits' node tests/library.cjs` | exit 1，在完整来源记录断言失败：磁盘仍为“模式识别 / 2026-11-10 / 08:00:00 / false”，期望“手工修改后的模式识别 / 2026-12-03 / 14:25:00 / true”；浏览器内存已是新命名。见 [RED 日志](../../../.test-output/v3.1.1/task6-unique/library-red-single-save.log)、[结果](../../../.test-output/v3.1.1/library-IrZQEo/results.json)、[失败截图](../../../.test-output/v3.1.1/library-IrZQEo/failure.png)。脚本错误及非本地请求均为 0。 |
| 最小修复后的聚焦 GREEN | `PPT_TEST_FILTER='^crop reuse waits' node tests/library.cjs` | exit 0，1 组；[日志](../../../.test-output/v3.1.1/task6-unique/library-green.log)、[结果](../../../.test-output/v3.1.1/library-ffg4Tb/results.json)。 |
| 完整受影响课次库 | `node tests/library.cjs` | exit 0，23 组通过（原 22 + 新 1）；`errors: []`、`blocked: []`。见 [日志](../../../.test-output/v3.1.1/task6-unique/library-full.log)、[完整结果](../../../.test-output/v3.1.1/library-bVQzZ0/results.json)。 |
| 当前 33 成员发布 fixture | `npm run test:release` | exit 0，17/17 通过、0 失败/跳过；见 [日志](../../../.test-output/v3.1.1/task6-unique/release-33.log)。临时根的包成员集合、每项源码字节和独立 CRC 校验均通过，旧 Store/Deflate/descriptor 样本与异常回滚检查保留。 |
| JavaScript 语法 | `node --check capture.js`、`node --check tests/library.cjs`、`node --check scripts/release.cjs`、`node --check tests/release.test.cjs` | 全部成功，无诊断。 |
| 差异与范围 | `git diff --check`、暂存差异检查、逐文件自审 | 成功；产品改动及新报告仅在白名单内。两次产品提交后工作区干净。 |

**SVG、README 和发布清单**

[横幅](../../../icons/readme-banner.svg) 的 `viewBox` 为 `0 0 1200 300`，采用米白背景、红棕色系统字体、细分隔线和少量课件页轮廓。左侧是原有栅格 Logo，右侧两行矢量文字合起来是完整的 `XJTU PPT Capture Extension`；背景和装饰也是矢量。没有版本字样、假徽章、发光、新署名或外部素材。

原始 [高清 Logo](../../../icons/logo-1024.png) 未修改。生成器从文件系统读取 PNG，直接编码到 SVG 内一条独立 `href` 属性行；没有重新绘制、压缩或手工复制编码数据。其余 XML 几何和样式分行可读。文件有根命名空间、`title`、`desc` 与可访问名称引用，README 图片也提供完整项目名和用途替代文本。

- SVG 长度：`660037` 字节；SHA-256：`66fd4f428073b65b3ac8434872a1c642762899a8e6a562f35762462e7da17d92`。
- 原 PNG 与 SVG 解码得到的 PNG 均为 `494080` 字节，内容逐字节相等；二者 SHA-256 均为 `016b9bfb8e96f5193a0f9ff6420d91739476cefce1fbb12d49c125a074efafe7`。
- 原 PNG 的 SHA-256 同时与起点 `8bc923c` 的 Git 对象一致。
- XML 解析错误 `0`，内嵌 PNG `1`，其他 `href` 引用 `0`，事件属性 `0`；没有脚本、`foreignObject`、远程图片或字体、`@import`、`@font-face`、CSS `url()` 或滤镜。
- 用基点 README 的完整字节作对照，仅开头独立 Logo 加 H1 替换为相对 SVG 图片；其后的标语、介绍、版本、使用说明与近期 M2 文案全部保留，原初始 H1 已移除。
- [生产发布白名单](../../../scripts/release.cjs#L13) 与 [独立测试文件列表](../../../tests/release.test.cjs#L23) 都加入同一新资源。当前成员数断言、测试名与 [测试说明](../../../tests/README.md#L58) 为 33。CRC32 实现、`icon-32` 资源、历史 ZIP 样本及历史结果均未修改。版本文件没有改动，当前版本仍为 `3.1.1`，发布测试的版本一致性检查通过。

辅助生成命令为 `node .test-output/v3.1.1/task6-unique/generate-banner.cjs`。真实渲染及静态验证命令为：

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node .test-output/v3.1.1/task6-unique/preview-banner.cjs
```

渲染使用独立新建的无头浏览器上下文和回环 HTTP fixture，HTML 中的 `<img src="/readme-banner.svg">` 加载本次实际 SVG。没有重画预览或启用 MCP 浏览器。实际读取检查了以下两张 PNG：

| 预览 | PNG 尺寸 | 实际图像边界 | 人工观察 |
| --- | --- | --- | --- |
| [桌面预览](../../../.test-output/v3.1.1/task6-unique/banner-960.png) | 960 × 240 | 960 × 240 | Logo、标题及细线对齐；完整名称可读，无边缘裁切。 |
| [窄屏预览](../../../.test-output/v3.1.1/task6-unique/banner-390.png) | 390 × 98 | 390 × 97.5 | 保持左图右文，名称两行完整、可读，Logo 未变形；截图高度向上取整 0.5 像素。 |

实际预览的 XML 及网络记录在 [banner-checks.json](../../../.test-output/v3.1.1/task6-unique/banner-checks.json) 和 [预览日志](../../../.test-output/v3.1.1/task6-unique/banner-preview.log)：两个必要 HTTP 请求均为 200；浏览器脚本错误 `0`、失败请求 `0`、非本地请求 `0`。这是一轮实际预览和静态检查，没有添加重复布局实现的快照测试。

**运行收尾和证据边界**

- 六个后台任务均已收集结束结果：`bash-41dfd77cd09a46e9` exit 0（初稿）；`bash-9af6d25379e0463f` exit 1（有效 RED）；`bash-3bd81055e4c247b3` exit 0（GREEN）；`bash-1e54934d24b14599` exit 0（完整课次库）；`bash-51ec1296bdd84945` exit 0（发布）；`bash-fbb8fbfd9d4c4590` exit 0（预览）。没有仍在运行的本任务后台作业。
- 课次库和预览脚本在 `finally` 中关闭了自己的浏览器上下文、浏览器及回环服务器。没有访问日常浏览器资料、真实课程、账号或凭据；没有外网请求、重新委派或安装依赖。保留忽略的证据供父代理交接；没有执行清理删除。
- 使用 ponytail full 控制实现范围，humanizer-zh 复核本报告的自然表述。设计与计划沿用父代理已提交内容。运行时未注册 OpenViking Rule search 工具；在本任务禁止网络和限定读取范围下未作额外记忆查询，该项不作为已通过检查。
- 此处 D 组结果独立于旧 A/B/C。此前记录的 A：unit 207、release 17（32 成员）、bridge 3 origins + 2 fallback、review 13、features 11、memory 14；B：improvements 20；C：integration + library 22。它们是父代理已记录的历史证据，本轮没有重新执行，也没有改写旧的 32 成员结果。
- 本轮没有运行实际仓库根的 `npm run release`，没有改动原根安装包或旧 `last-release` 归档。本报告中的 33 成员/字节/CRC 结论来自隔离临时根发布测试。父代理仍需在新定向复审之后执行实际打包和 33 成员、源码字节、CRC、版本及 ZIP SHA-256 验证。
- 未验证 Chrome 114、Node 20、真实课程、原生权限界面或手动 PDF 阅读器；未声称九套测试都在最终 SHA 重新通过。后续整轮审查、交付台账、真实发布包准备及自有工作区清理由父代理继续处理。

自审未发现新的范围内问题。I1 的有效 RED 与修复后 GREEN、完整受影响库、当前发布 fixture 及真实横幅渲染均有独立证据。
