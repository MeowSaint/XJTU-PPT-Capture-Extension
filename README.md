<p align="center">
  <img src="icons/icon-128.png" width="96" height="96" alt="XJTU 课程 PPT 截取图标">
</p>

# XJTU PPT Capture Extension

把西安交通大学课程录播里的幻灯片截下来，整理后导出 PDF 或图片包。

当前版本：**2.5.2** · [下载扩展](https://github.com/MeowSaint/XJTU-PPT-Capture-Extension/releases/latest/download/ppt-capture.zip) · [版本记录](https://github.com/MeowSaint/XJTU-PPT-Capture-Extension/releases)

## 推荐浏览器

支持 **Windows、macOS 和 Linux** 上的桌面版 Chrome、Edge、Brave。这些浏览器都基于 Chromium，可以加载本扩展；点击下方图标或名称前往官方下载页。

| [<img src="icons/browsers/chrome.svg" width="48" height="48" alt="Google Chrome">](https://www.google.com/chrome/) | [<img src="icons/browsers/edge.svg" width="48" height="48" alt="Microsoft Edge">](https://explore.microsoft.com/edge/download) | [<img src="icons/browsers/brave.svg" width="48" height="48" alt="Brave">](https://brave.com/download/) |
| :---: | :---: | :---: |
| [Google Chrome](https://www.google.com/chrome/) | [Microsoft Edge](https://explore.microsoft.com/edge/download) | [Brave](https://brave.com/download/) |
| 首选，适合平时就用 Chrome 的同学 | Windows 常见，也支持 macOS 和 Linux | 习惯用 Brave 也可以继续用 |

Chrome 需要 114 或更新版本；Edge 和 Brave 使用当前稳定版。工具界面按桌面窗口设计，适合 1280×800、1440×900 和 1920×1080。

## 能做什么

- 从课程页发现视频地址，也能粘贴地址或导入本地视频；支持 MP4、WebM 和 HLS / m3u8。
- 跳转采样、检测翻页并去重，提供均衡、细查、快速三档模式；可框选只截 PPT 的区域。
- 视频和幻灯片并排查看，支持拖动排序、多选删除、撤销删除、放大预览和按时间回看。
- 导出单页 PDF、带笔记区的 A4 讲义，或按页序排列的原始 JPEG 图片包。
- 读取整门课程的录像列表，逐节提取、逐节下载 PDF。
- 自动填写课程名称和上课时间，用它们给文件命名；截图和手动修改会保存在本地。

## 安装与更新

Windows、macOS 和 Linux 使用同一份扩展文件，安装步骤相同。

1. [下载最新版 ZIP](https://github.com/MeowSaint/XJTU-PPT-Capture-Extension/releases/latest/download/ppt-capture.zip)，解压到准备长期保留的文件夹。
2. 打开浏览器的扩展管理页：Chrome 用 `chrome://extensions`，Edge 用 `edge://extensions`，Brave 用 `brave://extensions`。
3. 开启“开发者模式”，点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的文件夹。
4. 在浏览器工具栏中固定扩展图标，之后从课程页点击它打开截取工具。

更新时，用新版文件替换原文件夹的内容，在扩展管理页点击“重新加载”。如果浏览器提示新增权限，按提示确认；随后关闭旧工具页、刷新课程页，再重新打开工具。

也可以在 GitHub 的 **Code → Download ZIP** 下载源码，或克隆仓库：

```sh
git clone git@github.com:MeowSaint/XJTU-PPT-Capture-Extension.git
```

运行扩展不用构建，也不用安装 npm 依赖；HLS 播放库已放在 `vendor/` 中。

## 使用

### 1. 加载课程视频

1. 在同一个浏览器打开[课程录播网站](https://rms-v5.xjtu.edu.cn/)，登录后播放一次课程视频。
2. 在课程页点击扩展图标，在工具左侧的“视频”标签中点击“刷新视频列表”。
3. 选择地址，点击“加载选中视频”，按浏览器提示允许访问视频域名，再看预览是否选对。

西交录播里，文件名以 `2-` 开头的通常是 PPT 画面，`0-` 开头的通常是教师画面，常见视频域名是 `review-class.xjtu.edu.cn`。单节模式需要自己选择地址，即使只发现一个视频也一样。

没找到地址时，刷新课程页并重新播放，再刷新视频列表。也可以展开“手动视频地址”粘贴 MP4 / m3u8 链接，或通过“本地视频”导入文件。HLS 分片使用其他域名时，工具会列出域名，再点一次加载即可授权。

### 2. 选择范围与采样模式

默认截取完整画面。如果视频里同时有老师和 PPT，点击“框选 PPT 区域”，在预览中拖出范围；松开后就能继续操作视频控件。

在“提取”标签中选择模式：

| 模式 | 采样间隔 | 适合什么时候用 |
| --- | --- | --- |
| 均衡（默认） | 每 2 秒 | 日常提取。发现翻页后，每 0.5 秒细查该区间 |
| 细查 | 每 0.5 秒 | 补找短暂出现的页面 |
| 快速 | 每 8 秒 | 先粗略提取较长的课程，再按需要细查 |

疑似新页面会再隔 0.25 秒检查一次，画面稳定后才保存。“新页差异”越低越敏感，越高越容易把相近画面当成同一页；工具同时比较变化像素比例和整体误差，减少鼠标、压缩噪声带来的重复截图。

“去除重复页”默认开启，同一张幻灯片再次出现时保留第一次截到的版本。想保留回看的顺序，可以取消勾选。

### 3. 提取与校对

点击“开始快速提取”，保持工具页打开即可，不用手动播放视频。进度会显示课程时间、页数和耗时。停止后，已经截到的页面会留下；再次开始会从头扫描，并按设置去重。已有截图会保留，新截到的页面按视频时间插入。

提取结束后，先在右侧整理，再下载：

| 操作 | 用法 |
| --- | --- |
| 调整顺序 | 拖动缩略图 |
| 删除页面 | 点单页“删除”，或勾选多页后点“删除所选” |
| 撤销删除 | 点“撤销删除”或按 Ctrl / Cmd + Z，恢复最近一批删除、原页序和命名 |
| 放大查看 | 点缩略图，左右方向键翻页，Delete / Backspace 删除，Esc 关闭 |
| 回看视频 | 点页面时间，或在放大预览中点“回看视频” |
| 清理相似页 | 合并同一视频中连续相似的相邻页，保留每组最后一张，清理后检查一下结果 |
| 手动补截 | 在视频中定位画面，点“保存当前页” |

撤销记录保留到下一次清空、换源、截页、排序或关闭工具页。在文本框里，Ctrl / Cmd + Z 仍用于撤销输入。关闭放大预览后，键盘焦点会回到缩略图。

回看需要加载截图对应的视频，并匹配课程和批次。旧截图缺少来源信息时无法直接回看，可以重新加载视频继续截取。相似页清理会保留来源不明、缺少完整图像签名或时间顺序不符的页面，整批清理也可以撤销。

### 4. 导出 PDF 或图片包

在“导出”标签中确认课程名称、上课日期和开始时间。工具会自动读取，缺少的信息可以补填，识别有误也可以直接改。

- **原始页面 PDF**：每张截图一页，保持截图比例。
- **笔记讲义 PDF**：A4 每张纸放两页幻灯片，右侧留笔记横线。
- **图片包**：保留原始 JPEG，按当前顺序命名为 `001-HH-mm-ss.jpg` 等。

点击顶栏“下载 PDF”或“下载图片包”。导出包含当前顺序的全部保留页，勾选只影响批量删除。提取完成后需要点下载按钮；换课前，先导出并清空上一门课的截图。

例如，课程名为 `传感网络与大数据技术`，上课时间为 `2026.09.15 周二 10:10 - 11:00`，PDF 文件名就是：

```text
传感网络与大数据技术-2026-09-15-10-10-00.pdf
```

省略的秒数补 `00`，日期采用上课日期。图片包使用同样的命名，结尾为 `-slides.zip`。手动修改的命名会在重新打开工具后恢复；切换课程标签页不会改掉旧截图的命名。旧版截图第一次导出时需要补填课程信息。

### 批量提取一门课

1. 停留在课程录像列表页（地址形如 `/my-capture-courses/课程ID/preview-detail`），打开工具，展开“批量模式”。
2. 确认课次，点击“开始批量提取”。工具按上课时间逐节处理，跳过未完成或正在转码的录像，优先选择 `ENCODER` 且文件名以 `2-` 开头的 PPT 视频。
3. 某节只有 `0-` 视频时，点击“加载 0 路并框选”，选好范围，再点“开始快速提取”。后续校对和导出与单节相同。
4. 处理完逐节检查，在对应课次旁下载 PDF。

保持工具页打开；关闭后队列会中止，已经保存的截图会留下。某节失败时，可以重新获取视频地址，或改用单节模式处理。

### 实时共享画面

如果课程可以播放，却拿不到视频地址，展开“兼容模式：实时共享画面”，选择课程标签页，框选 PPT 区域并播放课程，再开始实时截取。

这个模式跟着实际播放进度截取，默认画面稳定 1.5 秒后保存。点击“停止共享并保留截图”结束。

### 释放视频缓存

整理或导出后，可以点“释放视频缓存”卸载播放器和视频缓冲。截图与命名仍会保留，也能继续下载；要预览或补截时，重新加载视频即可。

加载或提取时，先停止任务再释放。共享模式下，这个按钮会结束共享。它释放工具持有的视频资源，浏览器的网络缓存和本地视频原文件保持不变，内存由浏览器回收。

## 常见问题

**漏页或重复页怎么办？**

短暂出现的页面、很小的文字变化和动画可能影响采样结果。可以换“细查”模式补截、调低“新页差异”，或手动保存当前页。动画中间帧、鼠标和黑屏需要在结果里检查。

**视频为什么要先加载一会儿？**

远程 MP4 会先读到本机内存，再按时间点解码；HLS 根据跳转位置读取分片。本地视频直接读取文件。速度取决于视频大小、网络、关键帧间距、解码能力和采样间隔，不用等整节课按原速播完。

**视频太大怎么办？**

远程 MP4 的内存缓存上限是 2 GB，更大的文件先下载，再通过“本地视频”导入。所有课次的截图合计最多保存 1000 页，达到上限后先导出、清空，再继续。

**加载失败怎么办？**

先确认课程页仍处于登录状态，再播放一次并刷新地址。签名过期、视频域名未授权或服务器要求额外请求头时，都可能加载失败；也可以下载后导入本地视频。暂不支持 DASH / `.mpd`、DRM 视频和直播的完整快速扫描。

**导出的 PDF 可以编辑文字吗？**

PDF 保存的是截图，没有 OCR 文字，也不是可编辑的 PPT。

## 数据与权限

截图和导出命名保存在扩展的本地数据库中，升级兼容旧截图，重新打开工具会恢复。卸载扩展或清除浏览器数据会删除这些记录。

视频解码、截图和 PDF 生成都在本机完成。扩展预先拥有课程站点的访问权限，其他视频 / CDN 域名在加载时申请。请求课程资源时，会使用浏览器允许携带的现有登录 Cookie，并为视频请求设置课程页 Referer。

带签名的视频地址保存在浏览器会话存储中；课程名称、日期和时间按课程页面分别缓存。扩展不保存账号密码、账户令牌或完整接口响应。课程内容的使用范围以学校和授课教师的要求为准。

## 开发与测试

核心测试无需第三方依赖：

```sh
npm test
```

浏览器测试需要 Node.js 20+ 和开发依赖。完整提取测试还需要 FFmpeg 和 Poppler，确保 `pdftoppm` 在 PATH 中；校对测试需要 FFmpeg。

```sh
npm install
npx playwright install chromium
npm test
npm run test:review
npm run test:bridge
npm run test:integration
```

这些测试可在 Windows、macOS 和 Linux 上运行。Windows 默认可用已安装的 Edge；macOS 和 Linux 使用上面安装的 Chromium。`PPT_TEST_BROWSER` 可指定其他测试浏览器路径（完整集成测试需要支持加载解压扩展），`PPT_TEST_NODE_MODULES` 可指定已有依赖目录。测试使用临时浏览器配置和本地合成视频，输出放在 `.test-output/`。测试覆盖内容见 [测试说明](https://github.com/MeowSaint/XJTU-PPT-Capture-Extension/blob/main/tests/README.md)。

## 代码结构

| 文件 | 用途 |
| --- | --- |
| `manifest.json` | 扩展配置和权限 |
| `background.js` | 记录视频地址、显示视频数量角标、打开工具 |
| `content.js` / `page-hook.js` / `batch.js` | 从播放器、接口响应和课程列表发现视频 |
| `media.js` | 地址解析、图像比较和 iframe 消息通信 |
| `course.js` | 课程名称与时间提取、日期校验和导出命名 |
| `scanner.js` | 跳转解码、翻页细查、稳定确认和去重 |
| `capture.html` / `capture.js` / `style.css` | 截取、预览、校对和本地存储 |
| `pdf.js` | 生成单页 / A4 讲义 PDF 和 JPEG ZIP |
| `icons/` | 扩展图标和 README 使用的浏览器图标 |
| `vendor/` | 随扩展提供的 HLS 库和许可 |
| `tests/` | 核心、消息通信、校对、导出和完整提取测试 |
| `scripts/release.ps1` | 打包最新版并归档旧包 |

### 打包与归档

打包脚本使用 PowerShell。Windows 可直接运行：

```sh
npm run release
npm run test:release
```

macOS 和 Linux 安装 [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell) 后运行以下命令；Windows 安装 PowerShell 7 后也可以这样运行：

```sh
pwsh -NoProfile -File scripts/release.ps1
pwsh -NoProfile -File tests/release.ps1
```

打包后，根目录会生成 `ppt-capture.zip`，旧 ZIP 移到 `last-release/`。固定名称的旧包会按其版本改名；同名历史包加时间戳和序号保存。生成的扩展包可在 Windows、macOS 和 Linux 上安装。

安装包按文件清单收录运行文件、README、图标和许可。测试输出、录像、PDF、依赖和 Git 数据不参与打包。ZIP 是本地产物，不加入 Git。打包测试用临时目录检查文件收录、归档、重名和构建失败时的处理。

## 版本变化

- **2.5.2**：红色新图标、桌面标签设置、并排校对、多选与撤销、放大预览、时间回看、相似页清理、A4 讲义和图片包。
- **2.5.1**：修复视频发现和加载；支持页面加载后重载扩展、`/study-capture-courses/` 路由、嵌套 JSON 和签名地址，恢复无 CORS 响应头视频及 HLS 的加载。
- **2.5.0**：视频来源和设置移入侧栏，预览、幻灯片和下载集中在工具页。该版的窄窗口收起方式已由 2.5.2 的桌面标签设置取代。
- **2.4.0**：支持整门课排队提取、逐节导出，以及 `0-` 视频的手动框选。
- **2.3.1**：支持拖动排序，细查新增页面按时间插回原序列。

## 第三方许可

hls.js 1.6.13 使用 Apache-2.0 许可；浏览器 SVG 来自 [browser-logos](https://github.com/alrra/browser-logos)。具体来源和许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。项目自有代码暂未指定开源许可证。
