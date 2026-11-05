# 测试说明

所有测试均在本地运行，使用临时浏览器配置和合成测试视频，不需要登录思源学堂账号，也不会影响日常使用的浏览器。测试产物保存在 `.test-output/`。

## 运行命令

| 命令 | 环境要求 | 测试内容 |
| --- | --- | --- |
| `npm test` | Node.js 20+ | 视频地址解析、扫描与取消、图像比对、课程命名、PDF / ZIP 流式写入、磁盘缓存生命周期、媒体预检、版本状态 |
| `npm run test:release` | Node.js 20+ | 扩展打包清单、ZIP 校验、旧包归档与异常回滚 |
| `npm run test:features` | 开发依赖、Chromium、FFmpeg | 首次使用确认、视频地址预检分组、域名授权、更新检查 |
| `npm run test:review` | 开发依赖、Chromium、FFmpeg | 页面筛选、批量删除与撤销、快捷键、相似页清理、PDF / ZIP 导出 |
| `npm run test:bridge` | 开发依赖、Chromium | 页面与各类 iframe（含沙箱 `srcdoc`）之间的消息通信 |
| `npm run test:integration` | 开发依赖、Chromium、FFmpeg、Poppler | 从发现课程视频、单节/批量提取到校验导出 PDF 像素的完整流程 |
| `npm run test:memory` | 开发依赖、Chromium | 旧库迁移、大量截图的按需加载、真实磁盘缓存、取消与失败清理及 JS 堆用量 |

`npm test` 和 `npm run test:release` 只用到 Node.js 内置模块，克隆仓库后可直接运行。

运行浏览器测试前需先安装依赖：

```sh
npm install
npx playwright install chromium
```

Windows 默认可直接使用已安装的 Edge；macOS 和 Linux 使用 Playwright 安装的 Chromium。运行 `test:integration` 还需确保系统 PATH 中有 `ffmpeg` 和 `pdftoppm`（Poppler）。可通过环境变量 `PPT_TEST_BROWSER` 指定浏览器可执行文件路径，或通过 `PPT_TEST_NODE_MODULES` 指定依赖目录。

## 各测试套件覆盖点

- **`tests/core.test.cjs` / `tests/course.test.cjs` / `tests/export.test.cjs`**：测试 URL 提取、采样时间序列、画面噪点容差、课程名称与东八区时间解析、导出文件名过滤，以及单页 PDF、A4 讲义 PDF 和 JPEG ZIP 的二进制结构。
- **`tests/preflight.test.cjs` / `tests/extension-state.test.cjs`**：通过本地 HTTP 服务测试 MP4 / WebM / m3u8 文件头识别、HTML 登录页与 JSON 接口过滤、超长响应截断、超时与取消；测试使用约定持久化、语义化版本比对、24 小时更新缓存和通知去重。
- **`tests/features.cjs`**：加载扩展界面，验证首次使用约定弹窗、视频地址预检分组与域名授权、视频请求携带 Cookie 与课程页 Referer，以及更新提醒。
- **`tests/review.cjs`**：验证缩略图多选、删除与 `Ctrl / Cmd + Z` 撤销、数据库写入异常回滚、大图预览键盘导航、按时间戳回看视频、清理相邻相似页，以及桌面窗口下的布局和实际文件下载。
- **`tests/bridge.cjs`**：验证课程页主窗口与同源 iframe、`about:srcdoc`、沙箱 `origin === "null"` iframe 之间的视频地址采集通信。
- **`tests/integration.cjs`**：用 FFmpeg 生成带幻灯片切换的测试视频，走完从课程接口发现视频、MP4 / HLS / 本地文件提取、整门课批量提取（含 `0-` 路视频手动框选）、释放视频缓存到导出 PDF 的全流程，并用 `pdftoppm` 渲染 PDF 逐页比对画面。
- **`tests/scanner.test.cjs` / `tests/disk-cache.test.cjs`**：验证异步去重等待磁盘读取与截图提交、取消时不再保存；模拟写入背压、配额与关闭失败，检查临时文件清理和多会话隔离。
- **`tests/memory.cjs`**：在真实 Chromium 的本地测试页面中检查旧截图迁移、元数据与图片分离、缩略图和预览 URL 的释放，以及大文件分块缓存的 JS 堆变化。堆用量只反映 JavaScript 对象，不等于浏览器进程的总内存。
- **`tests/release.test.cjs`**：在临时目录中验证 `npm run release` 打包出的 31 个文件内容、版本号一致性、`last-release/` 历史包归档，以及打包中途报错时原安装包不被破坏。
