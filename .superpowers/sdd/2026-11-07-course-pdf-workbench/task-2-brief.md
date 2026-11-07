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

