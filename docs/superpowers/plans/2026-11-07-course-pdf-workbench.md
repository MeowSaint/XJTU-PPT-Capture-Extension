# 3.1.2 Course PDF and Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 完成整课合并 PDF 的中文课次目录，并重做工作台的操作层级和局部动效，统一版本 3.1.2。

**Architecture:** 新增独立整课流式 PDF 入口，保留旧导出路径。重排现有原生 DOM 和控制器，专用 motion.js 只负责可取消视觉反馈，数据和真实任务状态仍由原模块管理。

**Tech Stack:** Native JavaScript、MV3、IndexedDB、OPFS、CSS / WAAPI；Node test、Playwright、pdf-lib、Sharp、FFmpeg、Poppler。

**Spec:** [执行设计](../specs/2026-11-07-course-pdf-workbench-design.md)。设计中的技术/视觉细节是执行者选择；用户已要求直接完成 PDF 与 UI，不再为常规选择重复确认。

## Global Constraints

- 保持 Chrome 114+、Node.js 20+；不改变 IndexedDB schema、使用约定、域名授权或真实任务的 busy/停止保护。
- 当前是原生 JavaScript / MV3 / IndexedDB / OPFS。保留这些结构；不迁移 React，不新增运行时依赖或云服务。
- 整课合并始终生成完整目录；现有 bookmarks 选项继续只控制单课、所选及分课 ZIP 的平级页码书签。旧导出字节不变。
- 生产路径每次读取/写完一张 JPEG 后再读下一张，保留原字节和背压；仅允许 O(页数+课次数) 元数据。
- 两种整课格式都等待 namingSave、lessonSave，再解析缺省课程键、快照标题和页序；显式 null 不回退当前课次。
- 保留每课 1000 页、缩略图读取并发 ≤2、IntersectionObserver root=#pages / rootMargin=200px、离开范围释放 URL、节点复用与 scrollTop。
- 业务处理器不 await 动画；不新增 animationBusy，不延迟授权点击、原生 modal 关闭或缺字段聚焦。减少动态效果同时覆盖 CSS 与 JS。
- 全部实现仅在隔离 feat/v3.1.2；不编辑原工作区、旧 worktree、真实课程数据或既有发布产物。浏览器只跑本地合成夹具，不使用浏览器资料目录或联网服务。
- 每次一个实现者，完成后由全新只读审查者检查 Spec 和 Quality；控制器不直接修源码。所有任务完成后整体审查并构建本地安装包；转录暂缓。

## Review Focus

1. 有命名/课次写入在途时立即导出，不得回退新名称或混入旧组；Task 1 使用真实 IDB 持有事务验证，不用 resolved mock 代替。
2. 活动课 A、批量列表 B 或显式空范围时，两个整课入口仍各自明确；Task 1 导出解析目录与 JPEG 归属。
3. 讲义跨奇数课次、同日不同时间、中文/emoji/孤立代理项，目录必须准确且旧格式字节不变；Task 1 递归树/纸页/原字节断言。
4. 快速反复切换、动画中关闭预览、偏好动态改为 reduce，数据操作与焦点仍立即正确；Task 2 真实浏览器交互和动画取消验证。
5. 恢复 1000 页、窄窗口和长课程名时，保持按需图片、滚动根、可见操作和课程范围；Task 2 内存/UI 夹具与尺寸截图，Task 3 串行回归。

## File Map

- Task 1：pdf.js 负责新流式目录/物理页规划；capture.js 负责范围/快照/命名/下载；capture.html 只加两个入口；现有导出/浏览器测试追加行为断言。
- Task 2：capture.html / style.css 负责布局；motion.js 是单独的同步视觉反馈层；capture.js / workspace.js 仅接入 UI、状态和可发现性；打包清单与测试纳入 motion.js。
- Task 3：manifest/package/lock/UI/文档/当前夹具版本，测试说明与 CI 完整回归；不顺手改业务。

### Task 1: 合并整课 PDF、三级中文目录与独立范围

**Files:** Modify pdf.js、capture.js、capture.html、tests/export.test.cjs、tests/library.cjs、tests/improvements.cjs。仅允许这些源码/测试及自己的报告、忽略的测试产物。Read-only library.js、course.js、disk-cache.js、page-store.js、tests/runtime.cjs，另读 tmp/research/pdf-recon.md。

**Interfaces:**
- Consumes 原有 PDF 生成器、writeExport、PPTDiskCache、PPTPageStore.imageBytes(db,id)、currentCourseLessons、命名与课次保存队列。
- Produces `writeCoursePDF(lessons, {title, layout = 'single', timestamps = false, readImage, write}) -> Promise<void>`；lessons 为有序 `{title: string, pages: PageMetadata[]}`，PageMetadata 沿用 `{id, w, h, sourceTime?, order?, ...}`；`readImage(page) -> Promise<Uint8Array>`，`write(bytes: Uint8Array) -> Promise<void>`。
- Produces `exportCoursePDF(courseKey, statusId = 'status') -> Promise<void>`；主按钮 `course-pdf` 省略参数，批量按钮 `batch-course-pdf` 显式传批量课程键和 batch-status。两者可在 Task 2 移动 DOM，ID/语义不变。

- [ ] **Step 1 — RED：为新目录写行为测试。** 递归检查课程/课次/页三级 Parent/Prev/Next/First/Last/Count 和 /XYZ 目的页；中文、emoji、括号/反斜杠、孤立代理项替换、无效时间、重复标题与空课次。单图异尺寸与讲义 `[3,1]→3`、`[1,1]→2`、`[2,3]→3` 纸页、课首上行、连续编号/页脚均断言。保留旧 SHA-256 / 选项组合 / ZIP 字节测试原期望。
- [ ] **Step 2 — 验证 RED。** `node --test tests/export.test.cjs`，新入口尚不存在或新行为失败，记录实际失败；既有成功不宣称新行为成功。
- [ ] **Step 3 — 实现独立整课 writer。** 按课次分 sheet，与目录共用映射；UTF-16BE BOM hex，课程/课次初始展开并设置 UseOutlines。复用原逐图读取/输出，禁止整课 Blob 和图片 Promise.all；空输入产生合法零页 PDF。目录页内用课内页号，讲义图片连续编号，正文不添加需要中文字体的目录页。
- [ ] **Step 4 — 接入真实控制器。** 在导出面板与批量面板加“下载整课合并 PDF”；原 ZIP 不变。保存队列后才筛选/排序/快照；标题 fallback 为未命名课程、未知日期/未知时间，文件名为清理后的课程名-整课.pdf。未完成/空课次数、失败清理与竞争导出锁明确。
- [ ] **Step 5 — 验证并发、原图与失败。** 导出单元测试扩展受控背压/1000 元数据页/读写各阶段 reject；浏览器在 A/B 不同课程、在途真实 namingSave 和 lessonSave、写出期间可变 UI 快照、空范围与缺图片上验证新入口，不弱化旧断言。已有 pdf-lib/Sharp 开发依赖可用；不要将测试说明中“仅内置模块”的旧描述当成真实依赖事实。
- [ ] **Step 6 — GREEN 与提交。** 依次 `node --test tests/export.test.cjs`、指定浏览器运行 `node tests/library.cjs`、`node tests/improvements.cjs`；语法与 git diff --check 通过。自审提交源码/测试，再单独提交自己的完整报告，短回报 SHA/命令/结果/限制；停止等待控制器审查。

### Task 2: 清楚的工作台与可中断动效

**Files:** Modify capture.html、style.css、capture.js、workspace.js（仅选中来源信息/就近提示）、scripts/release.cjs（仅增加资源）、tests/release.test.cjs（仅当前清单/34 成员）、tests/README.md（仅当前清单/覆盖点）、tests/review.cjs、tests/features.cjs、tests/library.cjs、tests/improvements.cjs、tests/memory.cjs 的真实受影响交互与新增 UI 验证；Create motion.js。其余源码/依赖/数据库不改。Read-only pdf.js、page-store.js、tests/runtime.cjs，另读 tmp/research/ui-recon.md 和设计 UI/动效部分。

**Interfaces:**
- Consumes Task 1 的 course-pdf / batch-course-pdf 和两个独立课程域；旧各控件 ID、业务 handler、activateTab 和原生 details/dialog。
- Produces `window.PPTMotion.reveal(element, {x = 0, y = 6, duration = 180} = {}) -> void`、`cancel(element) -> void`、`cancelAll() -> void`；只做 UI transform/opacity，无异步业务等待。
- Produces 34 成员的当前安装清单；motion.js 在 capture.js / workspace.js 之前加载。已有 33 成员的历史验证记录不改写。

- [ ] **Step 1 — 定义可见交互断言。** 保留三个检查器页签和键盘操作，结果区聚合单课/所选导出、文件名预览与“导出设置”直达按钮；宽工作区常驻批量折叠入口，读取/选课/开始/查看截图/整课导出明显。增加长名/空态/待确认 0 路的范围文字断言。只因结构变化定点适配旧 selector 与 240px 几何断言，保留其原业务含义。
- [ ] **Step 2 — 重排并完成视觉。** 按设计在系统字体、暖白灰/酒红强调下做完整可操作界面；主次动作分组，当前整理课次与批量课程有明确标签，预览和图库桌面并排。结果区设置直达立即打开导出 tab；不复制节点/ID，不等待动画才聚焦。窄窗口正常重排，无横向溢出；支持系统深色/对比/实色回退。
- [ ] **Step 3 — 接入 motion.js。** 按下 80–120ms、面板/展开/预览约 140–200ms；重复触发从当前呈现值继续并取消旧动画。卡片仅本次可见少量增量、每批 ≤12，保留节点/scrollTop/按需图片。CSS 与 JS 响应 reduce 并取消在途动画；原生 Esc/close/权限 click 与真实 progress 不受动画控制。crop 指针几何不做动画。
- [ ] **Step 4 — 实际交互验证。** 快速往返页签仍单一可交互面板/可立即输入；动画中打开关闭预览并确认焦点/URL释放；reduce 在初始和运行中切换；1000 页恢复不全量动画，缩略图并发 ≤2、活跃 URL 有界。视觉验证至少 1440×900、1280×800、390×844，另检 1920×1080 桌面布局；真实 DOM 的浅色、深色、reduce 截图存 `.test-output/v3.1.2/` 并 read_image，不用重绘 HTML 假预览代替。
- [ ] **Step 5 — 覆盖与提交。** 依次运行 review、features、memory、library、improvements 浏览器套件及 test:release，命令继承指定 PPT_TEST_BROWSER。每个完整相关套件在最终源码通过一次后不无故重跑。保留全部业务/持久化断言；不触碰测试 runtime 的浏览器配置。自审提交，完整报告附截图、正常/快速切换/reduce/暗色的实际结果与尚未验证项。

### Task 3: 3.1.2 版本、说明与整体验证

**Files:** Modify manifest.json、package.json、package-lock.json 的 root 版本字段、capture.html 的可见版本字段、README.md、tests/README.md、tests/features.cjs / tests/integration.cjs / tests/review.cjs / tests/library.cjs / tests/improvements.cjs 中当前版本/产物目录；`.github/workflows/ci.yml` 仅将已有 test:improvements 加入顺序浏览器任务。仅允许确因 Task 1/2 行为改变的 integration selector/布局适配，先报告再改，不修业务源码；另据实际 `PPTMotion is not defined` probe，限定同步 tests/integration.cjs:102 临时扩展复制清单，加入已由 HTML 加载且实际安装清单已有的 motion.js，保留原强断言、权限与拦截。Create optional docs/releases/3.1.2.md。

**Interfaces:** Consumes 34 成员安装清单与整课目录/工作台实际行为；produces 一致的 3.1.2 元数据、准确用户说明和完整验证证据，安装包由控制器最终审查后构建。

- [ ] **Step 1 — 统一版本与说明。** manifest/package/root lock/UI/当前夹具使用 3.1.2；历史版本比较/已测 3.1.1 记录保留。README 说明合并 PDF 固定课次目录、每课新页、旧 ZIP、当前/批量范围、结果区导出设置与 reduce；不宣称转录已实现。测试说明纠正实际需要开发依赖的 Node export tests，不写“只用内置模块”。
- [ ] **Step 2 — CI 补足。** 在现有 Ubuntu browser 顺序任务追加 `npm run test:improvements`；不改权限、触发器、发布工作流或依赖版本。
- [ ] **Step 3 — 串行完整回归。** `npm test`、`npm run test:release`、`test:bridge`、`test:integration`、`test:review`、`test:features`、`test:memory`、`test:library`、`test:improvements`。记录每项最终源码/版本与真实退出码；已通过的新源码覆盖可据证据复用，不能把较早通过伪称本次全部通过。新业务失败返回对应实现者，不削弱测试。
- [ ] **Step 4 — 导出示例与交接。** 使用合成图片生成含中文/同日两课/奇数讲义的示例整课 PDF，pdf-lib 检查目录、Poppler 检查全部图片无裁切和课间新页，read_image 核验渲染。保留 UI 实际截图，无真实课程。自审提交说明/版本/夹具与完整报告，交给全新审查者。

## Controller Finish

所有任务 gate 完成后，用最有能力的全新审查者审阅 ae75c719e5ec4660363b5e29098a22b8de466940..HEAD 全分支，处理实际发现。构建本地 ZIP 前核验 root ZIP / tmp / last-release 的实际目标；构建后独立核对 34 成员、3.1.2、CRC、源字节与 SHA-256。永久审计保留全部决策、测试/截图/示例及限制，再清理只属于本计划的 SDD 临时目录。原工作区、旧 worktree 和已发布包不清理。
