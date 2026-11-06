# Task 5 实施报告：3.1.1 元数据、使用说明与完整回归

状态：**BLOCKED**。Task5 元数据、说明和测试探针适配已完成；八个其他套件通过。integration 证明了 Task1 的裁剪扫描保护缺陷，须由原拥有者修复并独立复核后，再恢复 Task5 完成验证。父任务已确认该裁定，当前不声称完整回归或 3.1.1 发布准备已完成。

## 范围与实现

工作目录和基线：

```text
/Users/jasondai/XJTU-PPT-Capture-Extension/tmp/worktrees/v3.1.1
branch: fix/v3.1.1
BASE: 25758e1092ce1aafa25da0e1f3c38a314a2955ba
original main: 40c02bb（未操作）
```

依据 Task5 brief、批准的全局计划及 61 行设计实施。Task1–4 在本任务前已独立批准；下文计数均为本次重新运行的完整回归，没有沿用历史通过记录。使用 ponytail full 控制修改范围，并以 humanizer-zh 校正新增中文说明。未委派、未使用真实课程或日常浏览器资料、未访问外网、未变更运行时依赖，未执行项目根目录的打包、发布或远程 Git 操作。

- 将 manifest、package、lockfile 两个根版本字段、界面两处版本标签和 README 当前版本统一为 `3.1.1`。lockfile 已与基线逐项比较，除这两个版本字段外完全一致。
- 更新 features 的“当前版本”响应、界面断言和报告标签，以及 integration 的当前发布响应、review/library 的当前产物目录；保留 `3.10.0`、预发布和其他有意比较旧版本的 fixture。
- 增加 `test:improvements` 脚本，补齐浏览器测试前提、自定义浏览器/依赖路径、串行顺序和本地合成验证的边界。
- README 说明 0.5 秒精细采样的耗时与漏页边界、旧 2/8 秒设置保留、单个比较忽略区与原始截图保留、逐对相似页决策/取消/一次撤销、Shift 连选/取消、预览 S/V 与导航、单条待复核确认、历史删除确认和大小估算、逐条读取旧素材、同机位 0 路裁剪复用与实际比例/轨道检查、所选导出页序、普通导出保留全部、默认关闭的时间/书签和讲义布局、批量 ZIP 的显示课程范围。
- 父任务在初次 integration 失败后明确扩展白名单，允许仅将四处旧 `cropEditing` 探针适配为 `selectionMode`：需要框选时严格比较 `'crop'`，已确认时严格比较 `null`。其余裁剪确认、换轨、断点、重载和图片保留断言原样保留；已允许套件内未发现其他同名旧探针。

## 实际验证环境

```text
Node.js: v26.13.0 (darwin / arm64)
Playwright: 1.62.1
Sharp: 0.35.4
pdf-lib: 1.17.1
Google Chrome for Testing: 156.0.8078.4 (chromium-1248)
PPT_TEST_BROWSER=/Users/jasondai/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
ffmpeg: /opt/homebrew/bin/ffmpeg, 9.0.2
pdftoppm: /opt/homebrew/bin/pdftoppm, 26.10.0
```

使用已有父目录 node_modules，未安装或下载任何内容。默认 Chromium 1234 缺失；每个浏览器命令均显式设置上面的同一个 `PPT_TEST_BROWSER`。套件只使用合成数据、隔离上下文或测试临时扩展配置及本地/拦截响应，不使用 Brave MCP 或专用/日常用户资料。

## 本次串行回归

每条命令均通过 `set -o pipefail` 与 `tee` 捕获完整日志；下表命令前的浏览器环境变量与上文完全一致。输出根目录为当前工作目录。

| 顺序 | 命令 | 本次结果 | 退出码 | 完整日志/主要证据 |
| --- | --- | --- | --- | --- |
| 1 | `npm test` | 207/207 | 0 | `.test-output/v3.1.1/task5-npm-test.log` |
| 2 | `npm run test:release` | 17/17，32 个成员的临时目录打包测试 | 0 | `.test-output/v3.1.1/task5-test-release.log` |
| 3 | `npm run test:bridge` | 3 种 iframe 来源场景及 2 种课程地址 fallback | 0 | `.test-output/v3.1.1/task5-test-bridge.log` |
| 4 | `npm run test:integration` | 初次在旧裁剪探针失败；细节见下节 | 1 | `.test-output/v3.1.1/task5-test-integration.log` |
| 5 | `npm run test:review` | 13/13 组 | 0 | `.test-output/v3.1.1/task5-test-review.log`；`review-uHff8A/results.json` |
| 6 | `npm run test:features` | 11/11 组，full feature suite，运行前后复制资源哈希一致 | 0 | `.test-output/v3.1.1/task5-test-features.log`；`features-oxDV1U/results.json` |
| 7 | `npm run test:memory` | 14/14 组 | 0 | `.test-output/v3.1.1/task5-test-memory.log`；`.test-output/memory-1793970038054/report.json` |
| 8 | `npm run test:library` | 22/22 组 | 0 | `.test-output/v3.1.1/task5-test-library.log`；`library-KmnVO1/results.json` |
| 9 | `npm run test:improvements` | 20/20 组 | 0 | `.test-output/v3.1.1/task5-test-improvements.log`；`.test-output/v3.1.1/task4-mHgekz/` |
| 10 | `npm run test:integration` | 修正四处探针后在持久化确认断言失败 | 1 | `.test-output/v3.1.1/task5-test-integration-corrected.log` |
| 11 | `npm run test:integration` | 父任务授权的状态/几何诊断，确认真实扫描保护缺陷 | 1 | `.test-output/v3.1.1/task5-test-integration-diagnostic.log`；`task5-integration-crop-diagnostic.json` |

review/features/library 的证据子目录和诊断 JSON 均位于 `.test-output/v3.1.1/`。release 测试只在临时 fixture 内验证打包脚本，没有生成本次待交付 release ZIP。

所有后台作业均已用 job_output 收取最终状态，没有遗留作业；下列退出码对应上表顺序：

```text
1  bash-d03786f4826048ac  exit 0
2  bash-ece160b8be8d4097  exit 0
3  bash-69a4fe1098e94abf  exit 0
4  bash-86241c0b51734c27  exit 1
5  bash-5d9003261c8a47f5  exit 0
6  bash-22bd0040e77b4c85  exit 0
7  bash-0f68acf0871f4071  exit 0
8  bash-03095a52b6bb458f  exit 0
9  bash-9159620ef9c24862  exit 0
10 bash-5ff46d083cea4d36  exit 1
11 bash-18ff9d7a102c4408  exit 1
```

bridge 断言无页面错误；review、features、library 断言无页面错误且无意外外部请求。memory 记录 0 浏览器错误并阻止非本地请求，但没有外部请求次数为零的统计断言。improvements 断言没有外部请求；其页面错误断言只覆盖第二个导出上下文，不能扩大成整个套件的全局页面错误保证。integration 目前尚未到达末尾的页面错误/外部请求断言和最终 PDF 像素复核，不作通过声称。

memory 实测缩略图最大并发读取为 2，1000 页签名缓存按 32 页分批读取，释放 82,944,000 字节；256 MiB 合成流的采样 JS 堆增量为 51,544 字节。这些值反映此次 JavaScript 堆与缓存行为，不代表浏览器进程 RSS 或真实课程的固定占用。

## 失败、裁定与修正

第一次 integration 到达 MP4/HLS/本地提取与自动批量完成后，在原第 426 行等待已移除的变量时终止：

```text
page.waitForFunction: ReferenceError: cropEditing is not defined
at main (.../tests/integration.cjs:426:16)
```

已向父任务报告；父任务确认其为 Task1 界面状态更名后的旧测试探针，更新 brief 并授权上述四处严格适配。

第二次运行越过该探针，但在原第 433 行失败：

```text
AssertionError [ERR_ASSERTION]: drawing a crop persists confirmation before any scan or later write
false !== true
```

父任务授权仅在 integration 内记录边界诊断，第三次运行保留了相同失败。完整状态见忽略目录下的 `task5-integration-crop-diagnostic.json`，这次明确排除了裁剪矩形不在视口和异步保存尚未结束两种推测：

| 状态 | 点击扫描保护前 | 点击保护后、拖动前 | 拖动后 |
| --- | --- | --- | --- |
| selectionMode | `'crop'` | `null` | `null` |
| overlay pointer-events | `auto` | `none` | `none` |
| sourceReady / busy / reviewBusy | true / false / false | true / false / false | true / false / false |
| 活动 job / cropConfirmed | batch-c / false | batch-c / false | batch-c / false |
| 持久化 cropConfirmed | false | false | false |
| 两个预期指针落点 | 尚未拖动 | 实际命中 `video` | 实际命中 `video` |

overlay 始终完整可见，矩形为 x=264、y=132.5、width=496、height=279，视口为 1280×720，无页面滚动。预期指针坐标为 (363.2, 188.3) 与 (660.8, 355.70000000000005)。点击前提示“本节只有 0 路视频。请在预览中框选 PPT 区域，再点击‘开始快速提取’”；点击后提示“请先在 0 路视频画面中框选 PPT 区域；PPT 已占满画面时，点击‘使用完整画面’即可”，但选择层已失效，画面裁剪仍为完整范围。

根因位于未修改的生产源码：`capture.js:1545–1550` 的 `#run` 保护在缺少确认时无条件调用 `startSelection('crop')`；`capture.js:836–845` 的同模式切换逻辑 `if (selectionMode === mode) cancelSelection();` 会取消已经由 0 路加载打开的选择状态。后续指针因 `pointer-events: none` 命中视频，根本没有进入裁剪提交，不是等待保存的问题。

父任务确认这是 Task1 的可达产品缺陷，要求交回原拥有者。按授权保留了一条紧邻扫描保护的窄回归断言：`selectionMode` 必须严格为 `'crop'`；原有持久化、立即重载、换轨、断点和图片字节断言全部保留。临时诊断代码已从最终测试 diff 移除，忽略目录的 JSON 与三次失败日志保留。未添加等待、滚动或重新激活框选的测试绕行，也未修改生产源码。新增窄断言未另跑一次，第三次诊断已经记录了它要求的状态实际为 `null`；父任务已要求停止重复运行并交接。

一次环境探测尝试通过 `require('sharp/package.json')` 读取版本，因包 exports 限制抛出 `ERR_PACKAGE_PATH_NOT_EXPORTED`；改用公开的 `require('sharp').versions.sharp` 后成功，非测试/产品失败。版本、lockfile 元数据一致性、目标 JavaScript 语法及 `git diff --check` 均通过；后续变更后会再次检查。

## 供父任务复核的现成证据

以下都是本次套件生成的截图，未另开浏览器补拍；integration 的截图仍来自未完整通过的运行，最终成功后应以成功运行覆盖版本为准。

```text
.test-output/v3.1.1/review-uHff8A/desktop-1440x900.png
.test-output/v3.1.1/review-uHff8A/desktop-1280x800.png
.test-output/v3.1.1/review-uHff8A/first-layout-1440.png
.test-output/v3.1.1/features-oxDV1U/normal-1440x900.png
.test-output/v3.1.1/features-oxDV1U/normal-1280x800.png
.test-output/v3.1.1/features-oxDV1U/terms-1440x900.png
.test-output/v3.1.1/features-oxDV1U/update-1440x900.png
.test-output/verified-interface.png
```

导出证据目录包含 default-all、selected-one、selected-many、annotated-single、annotated-handout、annotated-selected、snapshot 等 PDF，以及 JPEG ZIP、course-A、batch-course-B 和 renamed-local-course 等课程 ZIP；覆盖页序、图片字节、PDF 结构、讲义/书签及异步快照。

## 提交、自查与交接边界

实现提交：`e5029ebad6cf6632838c395d8e697880ff3397be`（`chore: prepare v3.1.1 metadata and usage docs`），包含 10 个白名单文件，66 行新增、33 行删除。按父任务的阻塞交接要求先提交已完成部分及严格回归探针；这是 BLOCKED 交接，不是通过批准。报告另作单独提交，其 SHA 在最终交接消息中提供。自查仅限本任务白名单 diff；临时诊断代码已移除，未削弱原断言。最终语法和 `git diff --check` 已通过。父任务修改的计划、brief、audit/ledger 未纳入本任务提交，忽略目录的合成输出未提交。

下一步必须由父任务恢复原 Task1 拥有者修复扫描保护并取得新一轮范围内审核；随后恢复 Task5，重新运行受影响的 integration 和父任务指定验证。当前八个通过结果均产生于生产源码修复前。此处停止修改，不自行扩大范围或重复运行已经通过的八个套件。

Chrome 114、Node.js 20 和真实课程站点没有验证。浏览器原生授权提示由测试替身验证请求时机，未声称测试真实用户点击授权或实际站点登录。精细扫描仍可能漏掉短于采样/稳定确认窗口的画面；大小为图片数据估算；相同机位须由用户确认。没有音频或 ASR 实现及承诺。

父任务负责本任务独立审核、全分支最终复核，以及批准后的根目录 `npm run release`、ZIP 成员/内嵌版本核对、SHA256 与本地安装包交付。当前不存在可声称已交付的 3.1.1 release ZIP。
