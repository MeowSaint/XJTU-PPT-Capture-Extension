# 第三方开源组件声明

## hls.js 1.6.13

- 项目地址：https://github.com/video-dev/hls.js
- 随附文件：`vendor/hls.min.js`（未修改，来自 https://cdn.jsdelivr.net/npm/hls.js@1.6.13/dist/hls.min.js）
- 许可证：Apache License 2.0（全文见 [vendor/hls.LICENSE](vendor/hls.LICENSE)）

## 浏览器图标

`icons/browsers/` 下的 Chrome、Microsoft Edge、Brave 图标取自 [alrra/browser-logos](https://github.com/alrra/browser-logos/tree/58881b84c4d73adc03c06fa2c275a7abee02d935)（提交 `58881b84c4d73adc03c06fa2c275a7abee02d935`）：

- [Chrome SVG](https://github.com/alrra/browser-logos/blob/58881b84c4d73adc03c06fa2c275a7abee02d935/src/chrome/chrome.svg)
- [Edge SVG](https://github.com/alrra/browser-logos/blob/58881b84c4d73adc03c06fa2c275a7abee02d935/src/edge/edge.svg)
- [Brave SVG](https://github.com/alrra/browser-logos/blob/58881b84c4d73adc03c06fa2c275a7abee02d935/src/brave/brave.svg)

许可证全文见 [icons/browsers/LICENSE.txt](icons/browsers/LICENSE.txt)（MIT）。各浏览器名称与图标归其各自所有者所有。

## 开发测试依赖

`playwright`、`sharp` 与 `pdf-lib` 仅用于本地自动化测试，不打包进扩展发布文件中。
