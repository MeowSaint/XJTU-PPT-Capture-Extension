### Task 3: 3.1.2 版本、说明与整体验证

**Files:** Modify manifest.json、package.json、package-lock.json 的 root 版本字段、capture.html 的可见版本字段、README.md、tests/README.md、tests/features.cjs / tests/integration.cjs / tests/review.cjs / tests/library.cjs / tests/improvements.cjs 中当前版本/产物目录；`.github/workflows/ci.yml` 仅将已有 test:improvements 加入顺序浏览器任务。仅允许确因 Task 1/2 行为改变的 integration selector/布局适配，先报告再改，不修业务源码；另据实际 `PPTMotion is not defined` probe，限定同步 tests/integration.cjs:102 临时扩展复制清单，加入已由 HTML 加载且实际安装清单已有的 motion.js，保留原强断言、权限与拦截。Create optional docs/releases/3.1.2.md。

**Interfaces:** Consumes 34 成员安装清单与整课目录/工作台实际行为；produces 一致的 3.1.2 元数据、准确用户说明和完整验证证据，安装包由控制器最终审查后构建。

- [ ] **Step 1 — 统一版本与说明。** manifest/package/root lock/UI/当前夹具使用 3.1.2；历史版本比较/已测 3.1.1 记录保留。README 说明合并 PDF 固定课次目录、每课新页、旧 ZIP、当前/批量范围、结果区导出设置与 reduce；不宣称转录已实现。测试说明纠正实际需要开发依赖的 Node export tests，不写“只用内置模块”。
- [ ] **Step 2 — CI 补足。** 在现有 Ubuntu browser 顺序任务追加 `npm run test:improvements`；不改权限、触发器、发布工作流或依赖版本。
- [ ] **Step 3 — 串行完整回归。** `npm test`、`npm run test:release`、`test:bridge`、`test:integration`、`test:review`、`test:features`、`test:memory`、`test:library`、`test:improvements`。记录每项最终源码/版本与真实退出码；已通过的新源码覆盖可据证据复用，不能把较早通过伪称本次全部通过。新业务失败返回对应实现者，不削弱测试。
- [ ] **Step 4 — 导出示例与交接。** 使用合成图片生成含中文/同日两课/奇数讲义的示例整课 PDF，pdf-lib 检查目录、Poppler 检查全部图片无裁切和课间新页，read_image 核验渲染。保留 UI 实际截图，无真实课程。自审提交说明/版本/夹具与完整报告，交给全新审查者。

## Controller Finish

所有任务 gate 完成后，用最有能力的全新审查者审阅 ae75c719e5ec4660363b5e29098a22b8de466940..HEAD 全分支，处理实际发现。构建本地 ZIP 前核验 root ZIP / tmp / last-release 的实际目标；构建后独立核对 34 成员、3.1.2、CRC、源字节与 SHA-256。永久审计保留全部决策、测试/截图/示例及限制，再清理只属于本计划的 SDD 临时目录。原工作区、旧 worktree 和已发布包不清理。
