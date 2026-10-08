# XJTU PPT Capture Extension

从西安交通大学课程录播中提取幻灯片的 Chrome / Edge 扩展。使用者手动选择视频，工具快速跳转截页并去重，完成后检查和删除不需要的页面，再手动导出 PDF。

当前版本：**2.1.1**。运行扩展无需构建或安装 npm 依赖，HLS 播放库已随源码包含。

## 功能

- 从课程页的播放器、资源请求及 JSON 接口响应发现视频地址。
- 视频由使用者手动选择，不按文件名预选或特殊标记。
- 支持 MP4、WebM、本地视频和 HLS / m3u8。
- 提供均衡、细查和快速采样模式；检测到画面变化后细查并确认稳定性。
- 可框选 PPT 区域、删除截图、去重并恢复本地保存的结果。
- 提取结束后提示筛选页面，不自动下载。PDF 仅包含导出时保留的截图。
- 地址无法读取时，可使用实时共享画面的兼容模式。
- 修复继承来源或来源为 `null` 的 iframe 中的 `postMessage` 错误。

## 安装

需要 Chrome 114+ 或支持 Manifest V3 的较新 Edge。

1. 克隆仓库，或在 GitHub 的 **Code → Download ZIP** 中下载并解压。
2. 打开 `chrome://extensions` 或 `edge://extensions`，开启开发者模式。
3. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的目录。
4. 更新代码后，在扩展管理页重新加载扩展，关闭旧工具页，并刷新课程页面。

```sh
git clone git@github.com:MeowSaint/XJTU-PPT-Capture-Extension.git
```

## 使用

1. 在同一个浏览器中打开 [课程录播网站](https://rms-v5.xjtu.edu.cn/)，自行登录并播放课程视频。
2. 在课程页点击扩展图标，打开截取工具，点击“刷新视频列表”。
3. 手动筛选视频地址，点击“加载选中视频”，按浏览器提示授权该视频域名。通过预览确认内容。
4. 如有需要，点击“框选 PPT 区域”后拖动选择范围；默认使用完整画面。
5. 选择采样模式，点击“开始快速提取”。工具页需保持打开。
6. 完成后检查缩略图，删除不需要的页面，再点击“下载 PDF”。换课前请先导出并清空。

远程 MP4 会先下载到本机内存缓存，随后按时间点解码；这不是浏览器文件下载。HLS 按跳转位置获取分片。本地视频无需额外下载。

## 限制

- 快速采样不保证找全所有幻灯片。短暂出现后返回的页面、小文字变化和持续动画可能漏截，建议用细查模式复核。
- 图片识别基于画面差异，不进行语义识别；动画、鼠标和黑屏仍可能需要人工筛选。
- 实际耗时取决于视频大小、网络、关键帧间距和解码能力；无法保证某节真实课程的处理速度。
- 远程 MP4 缓存上限为 2 GB，较大的视频请下载后通过本地文件导入。单次最多保存 1000 页。
- 不支持 DASH / `.mpd`、DRM 视频和直播的完整快速扫描。特殊请求头、失效签名或无法携带的登录凭据也可能导致加载失败。
- PDF 为截图型，不包含 OCR 文字，也不是可编辑 PPT。
- 已通过本地合成录像和 iframe 测试，尚未完成目标网站登录后的真实课程验证。

## 数据与权限

截图存储于扩展本地 IndexedDB；卸载扩展或清除浏览器数据会丢失截图。视频解码与 PDF 生成均在本机完成。

扩展默认仅获课程站点访问权；其他视频 / CDN 域名在加载时按需申请。视频地址可能含签名，保留于浏览器会话存储。插件不保存账号密码或请求正文；资源请求在浏览器允许时携带已有 Cookie，并为插件的视频请求设置课程页 Referer。

请仅处理有权观看和保存的课程。仓库不包含课程录像、截图或导出 PDF。

## 开发与测试

只运行核心测试不需要第三方依赖：

```sh
node --test tests/core.test.cjs
```

完整浏览器测试需要 Node.js 20+、开发依赖、FFmpeg 和 Poppler（`pdftoppm` 可在 PATH 中执行）：

```sh
npm install
npx playwright install chromium
npm test
npm run test:bridge
npm run test:integration
```

Windows 可使用已安装的 Edge。环境变量 `PPT_TEST_BROWSER` 可指定支持解压扩展的浏览器路径，`PPT_TEST_NODE_MODULES` 可指定已有依赖目录。浏览器测试使用临时配置，不操作日常浏览器；课程域名页面由测试本地提供，不向学校发送请求。详细验证范围见 [tests/README.md](tests/README.md)。

## 代码结构

| 文件 | 用途 |
| --- | --- |
| `manifest.json` | 扩展配置和权限 |
| `background.js` | 网络资源记录和工具入口 |
| `content.js` / `page-hook.js` | 播放器与 JSON 响应中的视频地址发现 |
| `media.js` | 地址解析、图像比较和 iframe 消息通信 |
| `scanner.js` | 跳转解码、稳定性检查和去重 |
| `capture.html` / `capture.js` / `style.css` | 截取、预览、筛选及本地存储 |
| `pdf.js` | JPEG 截图的 PDF 生成 |
| `vendor/` | 随扩展分发的 HLS 库及其许可 |
| `tests/` | 核心、消息通信和完整流程测试 |

## 第三方许可

随附的 hls.js 1.6.13 按 Apache-2.0 许可分发，保留上游版权及许可说明。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [vendor/hls.LICENSE](vendor/hls.LICENSE)。项目自有代码暂未指定开源许可证。
