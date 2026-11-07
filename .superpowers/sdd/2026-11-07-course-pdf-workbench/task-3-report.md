# Task 3：3.1.2 元数据、文档、CI 与回归报告

状态：`WAITING_ON_UI_LAYOUT`。Task3 已提交受控 checkpoint，未完成九套回归，也未标记 DONE。源改动提交：`20b67b5efc6a79c51adef33bfc4ca27a97532860`；本报告独立提交，报告提交 SHA 由交接消息提供。父代理将低高度展开批量时的结果区越界交回 Task2 owner；本实现者停止修改，待原任务恢复。

## 范围与实现

- 工作目录：`/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.2`，分支 `feat/v3.1.2`；基线 `cc8a935bd5cb3461846fa2ae8d4c7feeb9770d22`。本报告只覆盖 Task3 自身差异，没有复核或修改其他任务实现。
- `manifest.json`、`package.json`、`package-lock.json` 两处根版本与 `capture.html` 两处可见当前版本更新为 3.1.2。保留唯一精确 `<span class="version">3.1.2</span>`；没有改权限、依赖、HTML 结构或锁文件依赖内容。
- `README.md` 与 `tests/README.md` 说明合并整课 PDF 与分课 ZIP 的区别、三级中文目录、阅读器书签侧栏、奇数课次后的新物理纸页、本节 / 所选 / 当前课程 / 批量课程四种范围、命名与课次保存完成后确定范围和快照、系统显示偏好、可取消短动效与运行中停止入口。纠正 Node 导出测试“只用内置模块”的旧说法，注明已有 pdf-lib / Sharp 开发依赖。
- `tests/features.cjs` 当前版本夹具、断言与报告目录更新为 3.1.2；保留 3.10.0 和 9.0.0-beta.1 比较值。`tests/integration.cjs` 更新当前 release 夹具，并按父代理补充授权将已有 `motion.js` 纳入临时扩展复制清单；`tests/improvements.cjs` 当前证据目录改到 3.1.2。已有 3.1.1 记录不改写。
- `.github/workflows/ci.yml` 只在现有 Ubuntu Chromium 顺序作业末尾追加 `npm run test:improvements`，没有改变其他作业与发布流程。
- 应用 ponytail full 与 humanizer-zh；未新增运行时或开发依赖，没有安装或升级任何包。

## 环境与证据位置

所有本轮日志和自写合成脚本存于忽略目录 `.test-output/v3.1.2/task3/`。运行环境：darwin / arm64，Node v26.13.0，npm 11.20.0，FFmpeg 9.0.2，Poppler 26.11.0。浏览器全部显式使用：

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
```

其 `--version` 输出为 Google Chrome for Testing 156.0.8078.4。依赖直接使用仓库已有安装，`sharp` / `pdf-lib` 从仓库根 `node_modules` 解析；没有请求真实课程数据。只运行隔离 Playwright 上下文和 localhost 合成媒体，测试页或扩展的非本地请求由现有拦截和 GitHub 返回夹具处理。打包回归仅在一次性测试目录构建 ZIP，未运行仓库根的发布命令，未覆盖根安装包、归档旧包、推送、打 tag 或发布。

## 顺序验证记录

元数据冻结证据为 `.test-output/v3.1.2/task3/source-freeze.json`，记录 22 个文件的 SHA-256。以下按实际执行顺序记录；无完整套件并行。

| 次序 | 命令 | 结果 | 日志 | 后台 job |
| --- | --- | --- | --- | --- |
| 1 | `npm test` | exit 0，224 / 224，失败 / 跳过均 0 | `01-unit.log` | `bash-94a368e3d76c4e80` |
| 2 | `npm run test:release` | exit 0，17 / 17，失败 / 跳过均 0；34 个打包成员 | `02-release.log` | `bash-1f36cd1a2af6445f` |
| 3 | `npm run test:bridge` | exit 0；inherited / opaque / opaque-url 三种来源投递成功，异源窗口拒绝 | `03-bridge.log` | `bash-2182f300de2b4589` |
| 4a | `npm run test:integration` 首次 probe | exit 1，临时扩展缺 motion.js，详见下节 | `04-integration-probe.log` | `bash-f46eb317080f4612` |
| 4b | `npm run test:integration` 补齐 motion 后 | exit 1；HLS 四页提取后拖动调序等待超时，详见下节 | `04-integration.log` | `bash-c21d6fe42d444d4b` |
| 4c | `npm run test:integration` 单次临时被动诊断 | exit 1；同一拖动超时，已还原诊断代码；不作为通过运行 | `04-integration-diagnostic.log` | `bash-888f544487874d9f` |
| 5–9 | `npm run test:review` / `test:features` / `test:memory` / `test:library` / `test:improvements` | 未跑；等待 Task2 布局修正，不能据此前置单元通过声称浏览器整链通过 | 无 | 无 |

上表后台 job 已全部用 `job_output` 收取，合成证据 job 也已收取。checkpoint 时 `job_list` 返回无后台 job。后续五套尚未开始，integration 三次均失败。

## 首次 integration 失败与来源覆盖

首次 probe 在 `tests/integration.cjs:212` 失败：

```text
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /请先补填/. Input:
'导出失败：PPTMotion is not defined'
```

`tests/integration.cjs:102` 的一次性扩展复制清单遗漏已有 `motion.js`，而当前 HTML 和业务调用依赖它。没有放宽断言或修改产品代码。父代理核实当前 HTML 在主脚本前加载该资源，实际安装清单也已有它，并在 `2db6b34323c6e61f1e219dba782d33ca16ccf1ea` 提交限定授权；重读更新后的 brief Files 行后，我只在复制清单补入 `'motion.js'`。保留原始日志、退出码和修前哈希，并记录修后矩阵 `.test-output/v3.1.2/task3/source-after-fixture-fix.json`。唯一哈希变化为 `tests/integration.cjs`：修前 `b30c81d2e0caf55b61b449fd226c391b9362a22f014e6a4c66ed18f36f7aa84d`，修后 `8127cc73b66f834c6d83255d3e28f3a110bf756d5b62f2163b35956c5d0493d1`。已通过的前三套不使用该测试复制清单，不因这一项补齐而重复；之后两次 integration 运行使用修后复制清单（其中诊断版曾临时加观测，随后还原），所有产品文件、元数据及其他测试来源仍与最初冻结相同。后续五套尚未执行；Task2 修源后，父代理需按新来源矩阵决定重跑范围，现有通过不冒充未来布局源码的覆盖。失败运行在 finally 中关闭上下文与本地服务器，并验证临时目录路径后清理临时扩展和资料目录；由于提前失败，没有声称它完成后续 pageerror / 非本地请求断言。

补齐 motion 后的第二次完整集成运行已通过 MP4 提取、命名、缓存释放与 HLS 四页提取，随后出现：

```text
page.waitForFunction: Timeout 30000ms exceeded.
    at main (.../tests/integration.cjs:330:16)
```

该断言等待 `pages.at(-1)?.id === originalOrder[0]`，之前由 `firstCard.dragTo(lastCard, {targetPosition: {x: lastBox.width - 4, y: 12}})` 尝试首卡移至末尾。当时未把它归因为业务或布局，先向父代理报告并暂停后续套件，随后获准只留忽略产物的几何 / 事件 / 截图诊断。没有放宽调序、刷新持久化或其他强断言，没有增加等待，也没有修改业务代码。

父代理随后允许一次同一失败链的被动诊断：保留原 `dragTo`、参数、顺序、断言、timeout、权限与路由，仅临时采集读状态和被动事件，不预滚、不扩大窗口、不强制事件、不 reload、不 sleep。该次仍 exit 1（job `bash-888f544487874d9f` 已收取），日志 `04-integration-diagnostic.log`；在 finally 后精确恢复 fixture SHA-256 `8127cc73b66f834c6d83255d3e28f3a110bf756d5b62f2163b35956c5d0493d1`。临时诊断源码哈希 `643c8f3edbb8f9d53eba7906f8439154be5dbd5843640bac2ea880e1ed585e5c`，前后记录 `diagnostic-source-hashes.json`。

诊断 JSON 与实际截图均保留在 `.test-output/v3.1.2/task3/`：`task3-dnd-before.json` / `task3-dnd-failed.json` / `task3-dnd-failed.png`；截图已亲自 `read_image`。可证的最小原因：原序 `[10,11,12,13]`，开始时 busy / task 均 false，四张卡 draggable 均 true；1280×720 默认窗口中，展开的批量列表占 302.39px，图库 `#pages` 的 y=718.39、height/clientHeight=18，底部 736.39 超过视口，首卡中心 y=809.84 与末卡目标 y=924.95 均命中 null。原 `dragTo` 自动滚动至 windowY=16、图库 scrollTop=198 后，原生可信 `dragstart` 实际命中第三卡 ID=12，`dragover` / `drop` 命中第四卡 ID=13，应用正确执行并持久化为 `[10,11,13,12]`，提示“已调整截图顺序：第 4 页。”。四种原生事件各一个，drop 已 preventDefault；结束时 busy / task 均 false。这证明此次并非持久化吞掉拖动，测试动作在独立滚动与展开批量的几何下误从第三卡发起；也不据此声称 1280×720 展开批量时有足够图库工作空间。

曾向父代理提出通过现有 UI 收起批量区的候选适配，但未执行。父代理随后明确裁定：不能只靠自动收起绕过状态；诊断和截图显示 `#results` bottom=645，而 `#pages` top=718.39、bottom=736.39，图库越界到固定底栏下，原动作又使 window 滚动 16px，因此是 Task2 低高度展开批量的布局回归。原生调序算法的事件路径正常，但此状态仍须由原 Task2 owner 修正，让用户能正常滚动访问完整卡片且不覆盖底栏。

本 checkpoint 保留 motion-only 复制清单修复及原调序动作、参数、原第 330 / 332 / 334 行与后续 Referer / PDF / 字节强断言；没有永久关闭 batch、改变 viewport 或修改产品 JS / CSS。不会用诊断中第三卡成功移末声称原首卡断言通过。

## 合成 PDF 结构与人工渲染

自写 `.test-output/v3.1.2/task3/synthetic-pdf.cjs` 只调用现有 `writeCoursePDF`，用已有 Sharp 生成四张 JPEG、已有 pdf-lib 解码验证 PDF。合成中文课程为“高等数学·合成验证”，两节同为 2026-11-07，开始时间 08:00 / 10:00，页数 `[3,1]`，包括横版与竖版，标注有效视频时间。

命令：

```sh
node .test-output/v3.1.2/task3/synthetic-pdf.cjs
pdftoppm -scale-to 1400 -png .test-output/v3.1.2/task3/course-single.pdf .test-output/v3.1.2/task3/single
pdftoppm -scale-to 1400 -png .test-output/v3.1.2/task3/course-handout.pdf .test-output/v3.1.2/task3/handout
```

结构检查与两次渲染均 exit 0；后台 job `bash-19b3a5c462434c05` 已收取。详情保存在 `synthetic.log`、`synthetic-checks.json`、`render-single.log`、`render-handout.log` 与 `visual-notes.md`，都在同一 Task3 目录。

| 文件 | SHA-256 | 物理页 |
| --- | --- | --- |
| `course-single.pdf` | `8415192353ee6e8ff9849a2f596652ba8831a46530a3d78fbe97c1c5ec10d929` | 4 |
| `course-handout.pdf` | `dc022bc6da655d6bfc4a7d0a4d12a67425a641e520823bf0138239a2674d34e7` | 3 |

自动检查递归遍历完整 7 节点目录，验证课程 / 两个课次 / 四页的中文标题和时间、Parent / Prev / Next / First / Last / Count、无环、XYZ 目的地和父节点指向首个子节点。讲义四个页目标为第 1 张上半区 / 第 1 张下半区 / 第 2 张上半区 / 第 3 张上半区，对应 Y=758 / 364 / 758 / 758；第二课从新纸页上半区开始。三张讲义均 595×842，打印编号连续 1–4，纸页码为 1 / 3、2 / 3、3 / 3；空下半区没有 Im1。逐张比较四张 JPEG 原始字节，没有重编码。

我通过 `read_image` 亲自打开全部物理页：`single-1.png`、`single-2.png`、`single-3.png`、`single-4.png`、`handout-1.png`、`handout-2.png`、`handout-3.png`。四张单页的边框、底线、横竖比例和图片外时间完整；讲义第 1 张上蓝下橙、第 2 张只有上半区绿色第三页、第 3 张只有上半区紫色第二课第一页，右侧笔记线、打印时间和编号清晰，两张奇数末纸的下半区完整留空。没有只验首页或拼图。

结构证据与 Poppler 视觉证据分开记录；渲染图不含阅读器侧栏，中文目录由解码验证。未在系统 Preview / Acrobat 等原生阅读器手工点击书签，不声称跨阅读器人工验收。

## 冻结来源矩阵

下列 SHA-256 均来自本轮冻结记录。除 integration 清单补齐外没有更改；报告本身与父代理拥有的控制文档不作为业务测试来源。首次 `npm test` / release / bridge 覆盖原冻结，integration 的修后运行覆盖补齐清单后的来源；其他文件相同，后续完整套件只在分类和修复明确后继续。

| 文件 | SHA-256 |
| --- | --- |
| `manifest.json` | `1238b6873dc70854bbd7fce7f4361fea455bbe4b8d038da11dcf5822a6594d3c` |
| `package.json` | `c9bceadff114f1a826dc26c7f07d814921e09afeed9c2f0b15085a63b1e43db7` |
| `package-lock.json` | `a58d3d557729d3b089669ea4103ddc3c4b01bbee0d8ebf270000d37c1c6847ff` |
| `capture.html` | `ada7d642ce6969f80cb53aae95fdd04e839d8f62ddc05ba67988207e5223c2a8` |
| `README.md` | `136e2cbfc485aa2901d3815b6dcaacbedf7d3685c83167fa82c66c8440832b81` |
| `tests/README.md` | `6a091f5237558cf4b06886062a89cca50ad66e357cb05d9a8936b901e6a22ff7` |
| `.github/workflows/ci.yml` | `1ace5022229d853c6893fe10588d91412bfda6912402e45b8b74f27698037374` |
| `tests/features.cjs` | `37432a4448c6a3067d87525444e60c956f72301807e084f0db24ce2c5f53cd5e` |
| `tests/integration.cjs` 补齐 motion 后 | `8127cc73b66f834c6d83255d3e28f3a110bf756d5b62f2163b35956c5d0493d1` |
| `tests/review.cjs` | `b6b9d809da390da607049e9921d2b667201ee7aa2f29c65fcebe41171655a32f` |
| `tests/library.cjs` | `b307152056a712abdf4b909da32e21a570b31d9b9ff8924e262baa22b557cd52` |
| `tests/improvements.cjs` | `fb9df72d1094311ab549f678525a0cd3426a45fac7a1c44e832e9ec9236a2dd9` |
| `tests/runtime.cjs` | `569f0d254ffacd2fe1fd54049f17cfbab9431e74faa17e2e1819b59a0b151bb2` |
| `pdf.js` | `3ee30c2ae58766de877e1fd3f0a6689e8b76507e60eab7b8cc14668069703be1` |
| `capture.js` | `57908d171efeab0d6365c16ad087c4a688089068cefbccdf30e097c88b44f560` |
| `style.css` | `cd944b5bd34891897b7efb7391822915952b692c3d6470ece7cf29a85d0e496f` |
| `motion.js` | `991b6b1bec9bb1cd9758aba19dcf54aaa345ddbf188a73e0999a7094c9a5854e` |
| `workspace.js` | `93a9680bb4ae62ef79f2bd78a9b7cc260095049b17544588047397b508584ca8` |
| `course.js` | `4513432cecee6073be98e6d11f2c2fbee616458288ee302ef1b989f4680032a7` |
| `library.js` | `fec2a15870bf05c1aa78fd50a2b5499084b33792e3d83caf782ff00e61261faf` |
| `page-store.js` | `bbb580d44d4cf6aa8c2e0fd450c55df927b2140805eb18fb2788c443e59d93e5` |
| `disk-cache.js` | `b9281db3a96ce7d9f0fa789656d0f9042c816d7a777b09a007f9e774021d5e79` |

## 自查与未完成项

本任务已自查十个源文件的完整自身 diff，并运行 `git diff --check`，对修改的三个浏览器夹具运行 `node --check`，均通过。九个产品实现文件 `pdf.js` / `capture.js` / `style.css` / `motion.js` / `workspace.js` / `course.js` / `library.js` / `page-store.js` / `disk-cache.js` 对基线没有差异。父代理拥有的 design / plan / audit 修改未编辑、未 stage、未纳入本提交；本任务只按授权阅读 brief、计划全局第 1–32 行与相关设计，没有读取 controller audit / progress / verifier。若父代理后续编辑控制文档，它们是已知 controller 例外，不属于 Task3。

checkpoint 来源证据 `.test-output/v3.1.2/task3/source-checkpoint.json` 重新校验全部 22 哈希：除已授权 integration motion 清单外，其余 21 个与最初冻结一致。source commit 只包含前述十个允许文件，10 files changed，43 insertions / 38 deletions；报告独立提交且只 force-add 本报告。

未完成项：等待原 Task2 owner 修复低高度展开批量布局，随后恢复同一 Task3，按实际源码变化补充回归覆盖矩阵并完成 integration 与余下五套、实际新版 UI 截图和最终报告。当前没有 review / features / memory / library / improvements 的本轮通过声明，没有最终发布包、合并、推送、tag、release 或真实课程验收。交接后按父代理要求停止修改。


## 最终追加：2026-11-07，恢复同一 Task3 后完成

**状态：DONE（Task3 实现与限定范围验证完成，待 controller 的 fresh Spec + Quality gate 与最终打包）。** 前 128 行是 `5ccfb360e2d65c2fdfec00c427f87dbda4916353` 的原始 checkpoint，逐字节保留；其中 WAITING、三次 integration 失败和五套未跑均指当时状态，本追加不改写那些记录。

父代理在 2026-11-07 19:12（Asia/Shanghai，UTC+08:00）恢复原任务；原 BASE 仍为 `cc8a935bd5cb3461846fa2ae8d4c7feeb9770d22`。我只消费了指定的 [Task2 后续报告第 274–390 行](task-2-report.md#L274-L390) 与 [I2 scoped review 第 1–41 行](task-2-fix-2-review.md#L1-L41)，未把它们当作本 Task3 的新 gate。闭环来源为 Task2 source `353085aa6ba391d14a7767540ca036ae00639561`、report `25bfd40f225f57d4061fbc98c75064a2b0a14a1e`、review `8963cda0`、controller closure `2c85f65e49cf571df21a8be5c5bd10965814684e`；恢复时该 HEAD clean，无其他 mutator。

### 本次作者范围与提交

原 Task3 源 checkpoint `20b67b5efc6a79c51adef33bfc4ca27a97532860` 和独立报告 `5ccfb360e2d65c2fdfec00c427f87dbda4916353` 保留。本次只在 [README.md](../../../README.md) 增补展开批量后的工作区 / 图库滚动说明，并在 [tests/README.md](../../../tests/README.md) 写明最终图库、原生输入、框选与运行中 Stop 的实测覆盖；没有新的 fixture 或产品源码改动。使用 ponytail full 控制变更范围，按 humanizer-zh 校正文案与限制。

本次文档源提交 `d50620795bd6f48862d059661385d5747db3e950`，只含上述两文件，4 insertions / 2 deletions。最终 CSS、review 与 integration 的改变属于原 Task2 owner，已在闭环来源中记录；本作者没有恢复旧 helper、旧 overlay 框选或旧 361 调查断言，没有关闭 batch 绕过低高度布局。

### 日期、环境与新运行

本次完整 features → improvements 顺序运行于 2026-11-07 19:14–19:16（Asia/Shanghai）；[before](../../../.test-output/v3.1.2/task3/resume-source-before.json)、[after](../../../.test-output/v3.1.2/task3/resume-source-after.json) 记录 UTC 时间和 42 个来源 SHA-256，全数相同，`changedDuringRuns=[]`，没有过滤器。两次调用与原完整脚本一致：

```sh
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:features > .test-output/v3.1.2/task3/06-features.log 2>&1
PPT_TEST_BROWSER='/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' npm run test:improvements > .test-output/v3.1.2/task3/09-improvements.log 2>&1
```

[本次环境记录](../../../.test-output/v3.1.2/task3/resume-environment.json)：darwin arm64；Node v26.13.0、npm 11.20.0、Google Chrome for Testing 156.0.8078.4（原指定 chromium-1248 executablePath）、Playwright 1.62.1、Sharp 0.35.4、pdf-lib 1.17.1、FFmpeg 9.0.2、Poppler `pdftoppm` 26.11.0。未安装、升级或重新生成依赖。一次环境元数据采集尝试读取 Sharp 未导出的 `package.json` 得到 `ERR_PACKAGE_PATH_NOT_EXPORTED`（exit 1）；改用公开 `sharp.versions.sharp` 后采集 exit 0，没有改动测试或产品来源。

### 九类验证的实际来源

本表是按消费来源采用证据的最终覆盖，**不是九套在同一 HEAD 重新执行**。原先通过且消费来源未变的检查不重复，Task2 已完成的最终 CSS 整链采用其原 run；本 Task3 恢复后只实跑末述两套。计数单位各有区别，不相加冒充总用例数。

| 类别 / 完整命令 | 最终采用结果与来源 | 日志 / 结果 | job（均已收取） |
| --- | --- | --- | --- |
| `npm test` | Task3 原 run，224 / 224，fail / skip 0；该命令的 8 个 Node 测试文件及其模块消费来源未变 | [01-unit.log](../../../.test-output/v3.1.2/task3/01-unit.log) | `bash-94a368e3d76c4e80`，exit 0 |
| `npm run test:release` | Task3 原 run，17 / 17，fail / skip 0；34 成员的 disposable fixture 打包检查，最终 CSS 字节另待 controller | [02-release.log](../../../.test-output/v3.1.2/task3/02-release.log) | `bash-1f36cd1a2af6445f`，exit 0 |
| `npm run test:bridge` | Task3 原 run，inherited / opaque / opaque-url 三种 origin 通过、foreign 拒绝；注入模块未变 | [03-bridge.log](../../../.test-output/v3.1.2/task3/03-bridge.log) | `bash-2182f300de2b4589`，exit 0 |
| `npm run test:integration` | 采用 Task2 I2 最终永久 fixture 的完整整链；原生首卡、落点、原宽高与全部后续强断言保留，browser errors 0 | [final-integration-3.log](../../../.test-output/task-2-fix-2-final-integration-3.log) | `bash-b1876900e6d344e3`，exit 0 |
| `npm run test:review` | 采用 Task2 I2 完整 19 / 19 组，errors / blocked 均空 | [final-review.log](../../../.test-output/task-2-fix-2-final-review.log)、[results.json](../../../.test-output/v3.1.2/review-2LKBss/results.json) | `bash-327c70f2a39b48de`，exit 0 |
| `npm run test:features` | 本次完整 11 / 11 组，status pass、errors / unexpected / changedDuringRun 均空 | [06-features.log](../../../.test-output/v3.1.2/task3/06-features.log)、[results.json](../../../.test-output/v3.1.2/features-capLKD/results.json) | `bash-ecec9eef37c946ba`，exit 0 |
| `npm run test:memory` | 采用 Task2 I2 完整 14 / 14 组，errors 空 | [final-memory.log](../../../.test-output/task-2-fix-2-final-memory.log)、[report.json](../../../.test-output/v3.1.2/memory-1794048020994/report.json) | `bash-1b6267e2bac74a26`，exit 0 |
| `npm run test:library` | 采用 Task2 I2 完整 24 / 24 组，errors / blocked 均空 | [final-library.log](../../../.test-output/task-2-fix-2-final-library.log)、[results.json](../../../.test-output/v3.1.2/library-YhUSiR/results.json) | `bash-7db8a207ad5d437a`，exit 0 |
| `npm run test:improvements` | 本次完整 25 / 25 组，含真实 pending naming / lesson IDB 事务，末尾 errors / blocked 断言通过 | [09-improvements.log](../../../.test-output/v3.1.2/task3/09-improvements.log)、[导出产物目录](../../../.test-output/v3.1.2/task4-oSHqxX/) | `bash-457a78a334c648f4`，exit 0 |

[adoption 明细](../../../.test-output/v3.1.2/task3/coverage-adoption.json) 记录消费模块、哈希差异与 owner 命令。Task2 的 [15-job ledger](../../../.test-output/task-2-fix-2-command-ledger.json) 全部标记 collected，包含历史失败与诊断；其中整链 `bash-44770c7da90c406b`（[final-integration-2.log](../../../.test-output/task-2-fix-2-final-integration-2.log)，exit 0）在调查测量版后依次 review → memory → library 通过，随后只移除旧 361 调查断言，再以永久 fixture 完整整链通过。review / memory / library 不消费 integration 输入块，这个后续修改没有使它们的覆盖失效。本报告前半部的三次失败仍是失败，没有重标或省略。

25 组 improvements 的 stdout 尾行沿用脚本旧标签“focused improvement groups”；实际命令没有参数或环境过滤器，所有 25 组均执行，不能因该文案误记为筛选运行。features 也为 `scope: full feature suite`。

### 为什么采用这些旧 run

从原 Task3 源 checkpoint 到当前消费来源，只有两份说明、最终 CSS、review 与 integration 五个文件不同。其余 37 项相同；恢复后两套的 before / after 42 项均相同。9 个 Node `*.test.cjs` 源文件未变，模块实现、元数据版本和 PDF 源码未变；这些文件对 CSS / HTML 的唯一引用是 [release.test.cjs:18](../../../tests/release.test.cjs#L18) 的资源清单，第 26–32 行把当时 payload 复制到 fixture。

因此 224 单元与 17 release 的原结果可作为原实现和打包机制证据，但 **17 release 不等于最终 CSS 实际 ZIP 的逐项字节验收**。controller 将在后续最终 34 成员 ZIP 上检查 CRC 和当前 source bytes / hash；本任务没有生成根目录发布包，也不预先宣称那项通过。

bridge 消费 [media.js](../../../media.js)、[course.js](../../../course.js)、[page-hook.js](../../../page-hook.js)、[extension-state.js](../../../extension-state.js)、[content.js](../../../content.js)，均未变，不消费这次 CSS 或原生输入块。[pdf.js](../../../pdf.js) 的 `3ee30c2ae58766de877e1fd3f0a6689e8b76507e60eab7b8cc14668069703be1` 未变，两个 PDF 文件哈希也未变，故沿用此前七页结构、JPEG 原字节与逐页 Poppler 视觉证据，未重做渲染。

### 最终来源矩阵

下面给出 42 项最终 SHA-256；其中文档源已经提交为 `d50620795bd6f48862d059661385d5747db3e950`。final CSS 为 `348d8ebf56ccd1b1801e121800f7e9fd8fb30147ae17cb1ec3f9c4930b109eb8`，review 为 `84a66cdc7a599c73fd46f379645c2f80f9b4ae98ca77ce1c93ec6fc3c3feb127`，integration 为 `7b9afb5971ca71835dc919c8183c8ec100ef2280a6e9bfc100484d54f73eac24`，与 [owner final-source](../../../.test-output/task-2-fix-2-final-source.json) 相同。原先 motion-only `8127…` 属于 checkpoint，不能冒充最终 integration。

| 来源 | 最终 SHA-256 |
| --- | --- |
| [manifest.json](../../../manifest.json) | `1238b6873dc70854bbd7fce7f4361fea455bbe4b8d038da11dcf5822a6594d3c` |
| [package.json](../../../package.json) | `c9bceadff114f1a826dc26c7f07d814921e09afeed9c2f0b15085a63b1e43db7` |
| [package-lock.json](../../../package-lock.json) | `a58d3d557729d3b089669ea4103ddc3c4b01bbee0d8ebf270000d37c1c6847ff` |
| [capture.html](../../../capture.html) | `ada7d642ce6969f80cb53aae95fdd04e839d8f62ddc05ba67988207e5223c2a8` |
| [README.md](../../../README.md) | `b3059c225de7affe90c905a7c6daa92390135366055c1628f66a1433ffcbeb6a` |
| [tests/README.md](../../../tests/README.md) | `4c775b26c5b366e37c93a8d29df671ac8f773bafb333b30be338b9450e1a0c6a` |
| [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) | `1ace5022229d853c6893fe10588d91412bfda6912402e45b8b74f27698037374` |
| [tests/features.cjs](../../../tests/features.cjs) | `37432a4448c6a3067d87525444e60c956f72301807e084f0db24ce2c5f53cd5e` |
| [tests/integration.cjs](../../../tests/integration.cjs) | `7b9afb5971ca71835dc919c8183c8ec100ef2280a6e9bfc100484d54f73eac24` |
| [tests/review.cjs](../../../tests/review.cjs) | `84a66cdc7a599c73fd46f379645c2f80f9b4ae98ca77ce1c93ec6fc3c3feb127` |
| [tests/library.cjs](../../../tests/library.cjs) | `b307152056a712abdf4b909da32e21a570b31d9b9ff8924e262baa22b557cd52` |
| [tests/improvements.cjs](../../../tests/improvements.cjs) | `fb9df72d1094311ab549f678525a0cd3426a45fac7a1c44e832e9ec9236a2dd9` |
| [tests/runtime.cjs](../../../tests/runtime.cjs) | `569f0d254ffacd2fe1fd54049f17cfbab9431e74faa17e2e1819b59a0b151bb2` |
| [pdf.js](../../../pdf.js) | `3ee30c2ae58766de877e1fd3f0a6689e8b76507e60eab7b8cc14668069703be1` |
| [capture.js](../../../capture.js) | `57908d171efeab0d6365c16ad087c4a688089068cefbccdf30e097c88b44f560` |
| [style.css](../../../style.css) | `348d8ebf56ccd1b1801e121800f7e9fd8fb30147ae17cb1ec3f9c4930b109eb8` |
| [motion.js](../../../motion.js) | `991b6b1bec9bb1cd9758aba19dcf54aaa345ddbf188a73e0999a7094c9a5854e` |
| [workspace.js](../../../workspace.js) | `93a9680bb4ae62ef79f2bd78a9b7cc260095049b17544588047397b508584ca8` |
| [course.js](../../../course.js) | `4513432cecee6073be98e6d11f2c2fbee616458288ee302ef1b989f4680032a7` |
| [library.js](../../../library.js) | `fec2a15870bf05c1aa78fd50a2b5499084b33792e3d83caf782ff00e61261faf` |
| [page-store.js](../../../page-store.js) | `bbb580d44d4cf6aa8c2e0fd450c55df927b2140805eb18fb2788c443e59d93e5` |
| [disk-cache.js](../../../disk-cache.js) | `b9281db3a96ce7d9f0fa789656d0f9042c816d7a777b09a007f9e774021d5e79` |
| [background.js](../../../background.js) | `a599924e33142e1facb15f3a68cb0c747cd3ce8cb84651c8d6aa93e070e41ae3` |
| [media.js](../../../media.js) | `d6df10564f28d4a5d890e94bc5e27f6e946198a291b0f3c67903d933cf7a70d5` |
| [batch.js](../../../batch.js) | `ee1e36de26ed80f7ceb31405ef608deb216f55b9b2a186aeb2d0a5dd51b5454a` |
| [page-hook.js](../../../page-hook.js) | `398bd1715819c7e3c7b42339c1436edef112ae22c199fec6c9ae15abe8673d9b` |
| [content.js](../../../content.js) | `25ddb778f9a2aee3873afcaeb8530a370885e39b12d7aa033e28224c87b82964` |
| [extension-state.js](../../../extension-state.js) | `e475ceb139e226b90197ecdbf261d9712265798ccc836df6ee160e4f0d059a6a` |
| [preflight.js](../../../preflight.js) | `521168df5dcf8e57166103247f19e89ad48e82b767ed851a5cd3790e256b5363` |
| [scanner.js](../../../scanner.js) | `32f3854a9fdc49de3cb2ecf166ffbc45369aa134b3d77d2a7778e14d337cad9d` |
| [tests/bridge.cjs](../../../tests/bridge.cjs) | `98d6113f35f038f4e94484821ed6eca0d9e322c6d2b753650808a679ccaa8982` |
| [tests/memory.cjs](../../../tests/memory.cjs) | `b067500940e275c6526a876fcc359b03a33b150e1001948a21d6ed40c3c238a8` |
| [tests/core.test.cjs](../../../tests/core.test.cjs) | `a346fc8248694004578f7d403daf0e278d1350eb637fbc83b5333a0a89562694` |
| [tests/course.test.cjs](../../../tests/course.test.cjs) | `963ec53f0f84ef8303cf94ba3ef61028429001eec106af50795bd4e4ad607c85` |
| [tests/disk-cache.test.cjs](../../../tests/disk-cache.test.cjs) | `e2b602eb6eea12cd77e62b2b0feb87f747f986b0f5e80e724dbb16601ba38f69` |
| [tests/extension-state.test.cjs](../../../tests/extension-state.test.cjs) | `85cd845d414d9a0bf17a3f171ab899e1b46c7a6fb5c44d0bec3ddf09cb8fa474` |
| [tests/library.test.cjs](../../../tests/library.test.cjs) | `f575d1d252bb63c26f9194de9bc18610bcbb7858f285058ee5e5635cc0fffcac` |
| [tests/preflight.test.cjs](../../../tests/preflight.test.cjs) | `c18018e1212a520d671354ce3115f72fd06b7860a39f7246edbfd2cec57e8f96` |
| [tests/scanner.test.cjs](../../../tests/scanner.test.cjs) | `076d1f0a3a135945b812622c9c97ae5d37fdedf15595e8a8a562c35a0653dce7` |
| [tests/export.test.cjs](../../../tests/export.test.cjs) | `5fb31438b3b63470b956c9ef8901b60f797782589771f4ef8c8d1502aa184513` |
| [tests/release.test.cjs](../../../tests/release.test.cjs) | `d97f3fa581854c76ed06d958cd909233fd34a43b46a1f3a23e8f91688a6af5d4` |
| [scripts/release.cjs](../../../scripts/release.cjs) | `a687bb7dea4ef2868a83c800a7b9057a87a91e12514bd86afa710b3f6b19263a` |

### 浏览器、真实事务与限制

本次 features 使用临时安装扩展副本和 localhost 合成媒体，19 个复制来源的 copiedHashes / finalHashes 完全相同。普通页面上下文拦截非本地请求；已知 extension service worker 不受该路由覆盖，固定 GitHub 更新 API 由临时背景包装器替换为本地夹具。授权测试使用已有域名授权的忠实 shim，并在真实点击手势内记录顺序；这不是人工原生权限面板验收。结果的 errors / unexpected 为空只覆盖该夹具可观察范围，不扩写成所有浏览器通信“零外联”。

本次 improvements 的导出范围、命名保存、课次保存用实际 IndexedDB 事务：真实阻塞 naming settings put 和 lesson put，释放后检验提交前后的课程归属及 `未命名课程` 回退，不用 resolved Promise 替代持久化。最终 errors / blocked 断言通过；两套均由 finally 关闭其 browser / context 和本地 server，features 还释放计时器与暂挂请求并按前缀校验后清除自身临时扩展目录。未触及用户 profile、真实课程、原生 viewer 或日常浏览器。

采用的 memory 证据来自 fresh Chromium 的本地合成页与 256 MiB 分块缓存；记录的 49,768 byte JS heap delta 不是 RSS，也不是整进程内存上限。I2 低高度 1280×720 展开图库检查与运行中 Stop 的 1280×800 / 1440×900 / 1920×1080 / 390×844 是不同覆盖，不能改写为另做了 1280×720 运行中 Stop。

### 留存图像与本人查看范围

I2 实际 UI 截图保存在 [review-2LKBss](../../../.test-output/v3.1.2/review-2LKBss/)；本次 features 的 11 张实际页面截图在 [features-capLKD](../../../.test-output/v3.1.2/features-capLKD/)。我在恢复后亲自 `read_image` 以下五张，而不是把 owner 的检查写成自己全图重验：

| 本人查看图 | 观察与界限 |
| --- | --- |
| [展开、滚动前 1280×720](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-before-scroll-1280x720.png) | 批量区仍展开，初始视野中图库在工作区下方，底部操作组可见；这张本身不证明卡片可操作 |
| [滚动可达 1280×720](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-reachable-1280x720.png) | 完整首行图片、选择 / 时间 / 删除控件在图库裁剪区内，下一行可由独立图库滚动继续访问；底部栏没有覆盖首行 |
| [滚动可达 390×844](../../../.test-output/v3.1.2/review-2LKBss/fix-2-expanded-reachable-390x844.png) | 四张卡片及控件可见，底部操作组独立，窄屏结果区没有横向截断 |
| [深色 1440×900](../../../.test-output/v3.1.2/review-2LKBss/dark-1440x900.png) | 实际深色面板、视频、图片、原生控件与底部操作组；不据此宣称所有系统主题或原生 viewer 已人工验收 |
| [本次普通页 1280×800](../../../.test-output/v3.1.2/features-capLKD/normal-1280x800.png) | 3.1.2 实际工具页、本节 PDF / 整课入口、一个合成截图与底部操作组；截图当时地址预检仍在进行，不把静态图当作预检完成证据 |

截图的视觉可见性与自动化命中 / 原生动作属于互补证据。I2 的完整卡片命中、可信首卡事件、全序持久化、新页面恢复、元数据 / 图像字节和 1,000 页有界图库采用其结构检查与完整 run，不由静态截图单独证明。

此前本人逐页查看的七图继续保留：[single-1](../../../.test-output/v3.1.2/task3/single-1.png)、[single-2](../../../.test-output/v3.1.2/task3/single-2.png)、[single-3](../../../.test-output/v3.1.2/task3/single-3.png)、[single-4](../../../.test-output/v3.1.2/task3/single-4.png)、[handout-1](../../../.test-output/v3.1.2/task3/handout-1.png)、[handout-2](../../../.test-output/v3.1.2/task3/handout-2.png)、[handout-3](../../../.test-output/v3.1.2/task3/handout-3.png)。中文课程、同日不同开始时间、课次大小 [3,1] 的 [single PDF](../../../.test-output/v3.1.2/task3/course-single.pdf) SHA `8415192353ee6e8ff9849a2f596652ba8831a46530a3d78fbe97c1c5ec10d929`（4 页）与 [handout PDF](../../../.test-output/v3.1.2/task3/course-handout.pdf) SHA `dc022bc6da655d6bfc4a7d0a4d12a67425a641e520823bf0138239a2674d34e7`（3 张 A4）再次核对未变；[synthetic-checks](../../../.test-output/v3.1.2/task3/synthetic-checks.json) 与 [visual-notes](../../../.test-output/v3.1.2/task3/visual-notes.md) 保存原结构、图片、边框、留白和页码检查。第二课从第三张上半部开始、奇数课次下半空白；原字节 JPEG / outline 链和目的地由自动化验证。没有新增 Preview / Acrobat 书签侧栏或真实课程的人工验收。

### 最终自查与交接

恢复后只提交上述两份说明；完整自有 diff 与 `git diff --check` 通过。对当前四个浏览器 fixture 的 `node --check` 均 exit 0。所有本次 job 已 `job_output` 收取，采用的 owner ledger 15 项均 collected；本任务没有遗留后台工作。报告以 append 方式写入；[追加校验记录](../../../.test-output/v3.1.2/task3/final-append-verification.json) 已确认前 15,681 bytes（SHA `c6f8054dc2f81af319e298d3336000e3c9a02503ef944cbc4d9d7e358c0bb249`）与原 checkpoint 完全相同，42 个当前来源也等于 before / after。

最终报告单独提交；不 stage controller design / plan / audit，不运行 root release、不推送、打 tag、创建 release、合并或清理其他作者产物。交接后停止修改，后续 fresh Task3 Spec + Quality、whole-branch 检查和真实 34 成员发布包验收由 controller 继续。
