# 测试说明

所有测试均在本地运行，使用临时浏览器配置和合成测试视频，不需要登录思源学堂账号，也不会影响日常使用的浏览器。测试产物保存在 `.test-output/`。

## 运行命令

| 命令 | 环境要求 | 测试内容 |
| --- | --- | --- |
| `npm test` | Node.js 20+、已有开发依赖（pdf-lib / Sharp） | 视频地址解析、范围扫描与安全进度、图像比对、课次身份与恢复、课程命名、PDF / ZIP 流式写入、磁盘缓存生命周期、媒体预检、版本状态 |
| `npm run test:release` | Node.js 20+ | 扩展打包清单、ZIP 校验、旧包归档与异常回滚 |
| `npm run test:features` | 开发依赖、Chromium、FFmpeg | 首次使用确认、视频地址预检分组、域名授权、更新检查 |
| `npm run test:review` | 开发依赖、Chromium、FFmpeg | 页面筛选、Shift 连续选择、预览与快捷键、批量删除与撤销、逐对相似页清理的取消/确认/撤销、PDF / ZIP 导出 |
| `npm run test:bridge` | 开发依赖、Chromium | 页面与各类 iframe（含沙箱 `srcdoc`）之间的消息通信 |
| `npm run test:integration` | 开发依赖、Chromium、FFmpeg、Poppler | 从发现课程视频、单节/批量提取到校验导出 PDF 像素的完整流程 |
| `npm run test:library` | 开发依赖、Chromium、FFmpeg | 旧截图归组、课次隔离、裁剪与设置恢复、停止刷新续扫、局部复核与确认、已存批量课次跳转、课次删除与大小估算、裁剪复用与回退、整课 PDF 包及批量状态 |
| `npm run test:memory` | 开发依赖、Chromium | 旧库迁移、大量截图的按需加载、真实磁盘缓存、取消与失败清理及 JS 堆用量 |
| `npm run test:improvements` | 开发依赖、Chromium | 0.5 秒默认及旧采样设置、忽略区比较、签名缓存、原子保存与回滚、所选/全部导出与 PDF 时间/书签 |

`npm test` 的导出和图标检查已经使用开发依赖 `pdf-lib` 与 Sharp；`npm run test:release` 本身只用 Node.js 内置模块。先安装仓库锁定的开发依赖，再运行单元或浏览器回归；本轮没有新增依赖。浏览器套件还需安装 Chromium：

```sh
npm install
npx playwright install chromium
```

Windows 默认可直接使用已安装的 Edge；macOS 和 Linux 使用 Playwright 安装的 Chromium。已安装兼容浏览器时可跳过下载，通过环境变量 `PPT_TEST_BROWSER` 指定可执行文件路径；依赖位于其他目录时可设置 `PPT_TEST_NODE_MODULES`。`test:features`、`test:review`、`test:integration` 和 `test:library` 需要系统 PATH 中的 `ffmpeg`，`test:integration` 还需要 `pdftoppm`（Poppler）。`test:improvements` 使用浏览器内生成的画面，无需 FFmpeg。

完整回归请按以下顺序串行运行，避免浏览器和视频处理争抢资源。自定义浏览器路径时，将 `PPT_TEST_BROWSER` 导出到同一终端，使每个浏览器套件都能读取它。

```sh
npm test
npm run test:release
npm run test:bridge
npm run test:integration
npm run test:review
npm run test:features
npm run test:memory
npm run test:library
npm run test:improvements
```

测试使用本地或拦截响应，不访问真实课程；通过这些测试不代表完成 Chrome 114、Node.js 20 或真实课程站点的兼容性验证，这些环境需另行检查。

## 各测试套件覆盖点

- **`tests/core.test.cjs` / `tests/course.test.cjs` / `tests/export.test.cjs`**：测试 URL 提取、采样时间序列、画面噪点容差、课程名称与东八区时间解析、导出文件名过滤，以及单页 PDF、A4 讲义 PDF 和 JPEG ZIP 的二进制结构；整课 PDF 递归检查中文 / Unicode 目录、父子及相邻链接、目的地、奇数课次新纸页、连续打印编号、JPEG 原字节、背压、1000 页逐图读取和失败停止。
- **`tests/preflight.test.cjs` / `tests/extension-state.test.cjs`**：通过本地 HTTP 服务测试 MP4 / WebM / m3u8 文件头识别、HTML 登录页与 JSON 接口过滤、超长响应截断、超时与取消；测试使用约定持久化、语义化版本比对、24 小时更新缓存和通知去重。
- **`tests/features.cjs`**：加载扩展界面，验证首次使用约定弹窗、视频地址预检分组与域名授权、视频请求携带 Cookie 与课程页 Referer，以及更新提醒；复制到临时扩展目录的资源包含共享动效脚本。
- **`tests/review.cjs`**：验证缩略图多选（含 Shift 连续选择与取消）、删除与 `Ctrl / Cmd + Z` 撤销、数据库写入异常回滚、大图预览键盘导航及 S/V 快捷键、按时间戳回看视频、逐对相似页清理的取消/确认/一次撤销，以及桌面分栏、390px 堆叠、长来源名称、结果区导出入口、快速切换后的输入和预览关闭、动态减少动态效果，以及实际文件下载。展开批量列表的图库另在 1280×720、1440×900、390×844 下检查实际裁剪边界和完整卡片 / 控件命中，验证原生选择、时间跳转、可信首卡拖动、新页面顺序与元数据 / 图像字节保留；1,000 页时图库根和外层工作区不会随全部卡片长高。开始 / 停止组位于工作台预留的第三行，窄窗口中吸附底部；运行中的停止覆盖 1280×800、1440×900、1920×1080、390×844、展开批量列表、真实取消及新旧截图字节保留。布局截图来自实际扩展页面，保存在 `.test-output/v3.1.2/review-*/`。
- **`tests/bridge.cjs`**：验证课程页主窗口与同源 iframe、`about:srcdoc`、沙箱 `origin === "null"` iframe 之间的视频地址采集通信。
- **`tests/integration.cjs`**：用 FFmpeg 生成带幻灯片切换的测试视频，走完从课程接口发现视频、MP4 / HLS / 本地文件提取、整门课批量提取（含 `0-` 路视频手动框选）、释放视频缓存到导出 PDF 的全流程，并用 `pdftoppm` 渲染 PDF 逐页比对画面。原生拖动在滚动目标前确认可信的首卡启动事件，仍落在末卡右半区；框选点按视频实际显示图像的 25%→75% 计算，保留解码图像高 360px、原宽度范围及后续全部断言。
- **`tests/scanner.test.cjs` / `tests/disk-cache.test.cjs`**：验证异步去重等待磁盘读取与截图提交、取消时不再保存，以及 `completedTo` 只在安全尾部 checkpoint 提交后返回；尾部提交失败或取消不能返回成功。模拟写入背压、配额与关闭失败，检查临时文件清理和多会话隔离。
- **`tests/memory.cjs`**：在真实 Chromium 的本地测试页面中检查旧截图迁移、元数据与图片分离、1000 页恢复时无整列入场动画、卡片节点与滚动位置保留、缩略图读取并发和 URL 范围，以及预览关闭释放和大文件分块缓存的 JS 堆变化。堆用量只反映 JavaScript 对象，不等于浏览器进程的总内存。
- **`tests/library.test.cjs` / `tests/library.cjs`**：验证来源和课程身份、旧截图按课次迁移、切换课次后的整理隔离、裁剪与设置恢复、关闭去重时的中断续扫（包括长时间静止的页面）、设置写入失败后的缓存释放、局部时间段复核、整课 ZIP 中的独立 PDF、批量行跳转已存截图和待复核记录（含零截图课次）、待复核记录确认、历史课次删除与图片大小估算、同机位裁剪复用及不匹配回退。完整性回归使用 26 项目录夹具区分未扫完、旧 `done`、零截图、待复核、已排除和默认未审知识状态，检查合成签名身份不会进入报告。浏览器使用真实 IndexedDB 事务验证旧断点不补前缀、不同轨道重开、checkpoint 写入失败不推进覆盖、课程 A/B 报告隔离、等待命名与课次保存后冻结导出，以及迟到页序修改和失败导出不会改写上次成功快照。设置 `PPT_TEST_OUTPUT` 可指定本套件的证据目录。
- **`tests/improvements.cjs`**：在隔离上下文中验证 0.5 秒默认采样与旧设置保留、忽略区持久化及比较范围、原图与签名保留忽略区内容、签名缓存的复用/上限/失效，以及课次和批量状态原子保存与失败回滚；再检查所选 PDF / JPEG ZIP 的页序、默认全部导出、时间与书签设置保存、讲义标注、当前课次与批量列表的命名范围、两个整课入口的明确课程范围及异步导出快照（持有真实 IDB 事务）。PDF 用二进制结构和原始图片字节校验，当前导出证据保存在 `.test-output/v3.1.2/task4-*/`；既有 3.1.1 实测记录仍保留原版本。
- **`tests/release.test.cjs`**：在临时目录中验证 `npm run release` 打包出的 34 个文件内容（含 `motion.js`）、版本号一致性、`last-release/` 历史包归档，以及打包中途报错时原安装包不被破坏。
