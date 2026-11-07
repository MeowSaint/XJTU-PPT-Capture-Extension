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

