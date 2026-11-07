# Video-only Media Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对可安全识别的MP4在画面提取前忽略音轨，并区分传输、索引、原生解码和跳转故障。

**Architecture:** 新增有界、纯Blob的MP4检查/准备模块，使用音轨trak→free的4字节替换保持视频/offset/timing；capture的远程OPFS File和本地File共用准备路径，继续原生解码。共享错误解释用于load/seek。

**Tech Stack:** 原生JS/MV3、Blob.slice/DataView/BigInt、现有Node test/Playwright/FFmpeg。

**Spec:** `docs/superpowers/specs/2026-11-07-media-recovery-design.md`

## Global Constraints

- 原生JS/MV3、Chrome114+/Node20+；不新增运行时依赖，不安装软件或浏览器，不引入FFmpeg/WASM、云API或本机native host。
- 仅已有依赖、本地合成素材、隔离临时浏览器上下文和loopback服务；不访问真实课程/凭据/日常资料，不外传素材、不推送发布。
- 保持IDB v3、第一阶段的目录/取消/覆盖/报告接口、旧手动名称/裁剪/断点、3.1.2中文三级目录、逐图导出背压和有界图片缓存。
- 临时准备后的Blob不改变原来源URL/file name/size/mtime或sourceKey，不创建新课次；失败与取消保留截图、释放本任务URL/缓存，不能错误绑定sourceReady或done。
- 中间任务保留3.1.2元数据；全部功能完成后由独立版本任务统一更新3.1.3。
- 新鲜实现者串行、独立只读任务审查、阶段末最高模型整体审查；实际没有复现的原生媒体故障必须明示证据缺口。

## Review Focus

- 尾部moov、顶层size0 mdat与只读首段不能错误宣告缺索引：Task1边界测试。
- 64位size/count/offset与读取预算，不能分配或扫描整段mdat：Task1恶意/稀疏测试。
- 正AVC media-time edit与audio长于video的时间轴，不能平移课件timestamp：Task1时序字节测试、Task2原生duration核对。
- muted原生原文件仍可正常播放的“坏音频”夹具不构成故障修复证据：Task2差分测试和报告。
- 取消后Blob读/loadeddata迟到、206部分下载、缓存删除时File仍引用：Task2生命周期/传输测试。

---

### Task 1: 有界MP4检查与字节保持的音轨忽略

**Files:** Create `mp4-recovery.js`, `tests/mp4-recovery.test.cjs`; Modify `package.json`。模块暂不接入浏览器，先独立验证；不要动其他阶段/控制器文档。

**Interfaces:**
- Produces `PPTMP4.inspect(blob,{signal}={}) -> Promise<Inspection>` / `PPTMP4.prepare(blob,{signal}={}) -> Promise<Prepared>`；字段和状态严格按Spec §1，不暴露外部patch计划。公开movieDuration/videoDuration为秒，后者用tkhd presentation duration而非mdhd原始媒体长度；movieTimescale为ticks/second，内部关系仍按原始时基精确校验。取消拒绝name='AbortError'；真实读取错误拒绝code='LOCAL_READ_FAILED'/phase='local-read'并保留cause，两者不返回伪造Inspection或触发重复原生加载。
- Limits:65536/read、16777216累计、50000boxes、depth8、32tracks；生产不可从网页输入扩大。Node测试可用Blob-like稀疏对象验证大offset，不分配巨型Buffer。
- eligible仅单启用clear AVC avc1/avc3 +普通AAC mp4a，duration/edit/依赖等按Spec §2。稳定codes至少覆盖AUDIO_OMITTED/NO_AUDIO/OTHER_CONTAINER/FRAGMENTED_MP4/UNSUPPORTED_TRACKS/UNSUPPORTED_CODEC/TRACK_REFERENCES/ENCRYPTED/UNSUPPORTED_TIMELINE/LIMIT_EXCEEDED/MISSING_MOOV/MALFORMED_BOX。
- prepare：eligible→同长度patch Blob/audio-omitted；video-only/unsupported→同一原Blob/original；confirmed malformed recognized MP4/missing-index→reject/null；abort/read error不伪装成missing-index。

- [ ] **Step 1: 写失败测试**。用小型box构造器生成合法/负例，覆盖头/尾moov、多mdat、32/64bit/uuid/size0、截断/重复/嵌套size0、不可信counts、fMP4、加密/引用/外部dref、未知codec/brands、video-only、多track、时序v0/v1、普通positive media_time edit、复杂edit/零timescale/sentinel/duration不符。movie timescale=1000、mvhd/tkhd duration=8000必须公开为8秒；positive edit下mdhd原始长度可为8.1秒，不能替代videoDuration。ftyp-only/ftyp+free空壳须unsupported且prepare保原Blob；只有完整合法、非碎片、非空mdat且无moov的夹具才断言missing-index。取消断言name='AbortError'、公开Promise结束且迟到读不继续；读失败断言code='LOCAL_READ_FAILED'/phase='local-read'/cause原异常；逐种证明预算真的限制读取。

```js
assert.equal(prepared.mode, 'audio-omitted');
assert.equal(prepared.blob.size, original.size);
assert.equal(changedOffsets.every(n => audioTrackTypeOffsets.some(t => n >= t && n < t + 4)), true);
assert.deepEqual(patchedTrackTypes, audioTrackTypeOffsets.map(() => 'free'));
assert.deepEqual(retainedVideoBytes, originalVideoBytes);
assert.equal(maxRead <= 65536, true);
assert.equal(mdatPayloadReads, 0);
assert.equal((await prepare(videoOnly)).blob, videoOnly);
assert.equal((await inspect(missingMoov)).status, 'missing-index');
```

type字节可能相同的字符位置不变，changedOffsets断言应比较“只在允许4字节范围内且四字节结果为free”，不能错误要求每字节都必变。字节完整性覆盖mdat/stco/co64/timing；大offset夹具按需提供header，不创建4GiB真实素材。

- [ ] **Step 2: RED**。Run `node --test tests/mp4-recovery.test.cjs`，预期模块/API缺失；记录失败。
- [ ] **Step 3: 实现最小安全profile**。只读验证过的结构，不递归解析opaque esds/metadata为box；保持保守passthrough。加入npm test文件列表，不新增依赖/lock变化。
- [ ] **Step 4: GREEN**。Run focused新测试，再 `npm test` 一次、syntax/diff check；检查所有读取/abort listener收尾、无未收取后台job。测试必须证明限额生效，不只断言常量。
- [ ] **Step 5: 自审并提交**。Commit `feat: prepare video-only MP4 blobs without moving media bytes`；完整report记录支持profile/边界/RED/GREEN/commits。后续Task2接入之前本任务独立审查。

### Task 2: 接入本地与远程媒体并区分失败阶段

**Files:** Modify `capture.js`, `capture.html`, `media.js`, `scanner.js`, `scripts/release.cjs`, `tests/release.test.cjs`, `tests/core.test.cjs`, `tests/scanner.test.cjs`, `tests/library.cjs`, `tests/features.cjs`, `tests/integration.cjs`, `README.md`, `tests/README.md`；必要修正Task1的 `mp4-recovery.js` / `tests/mp4-recovery.test.cjs` 必须有具体失败证据。不修改permissions或引入新依赖。

**Interfaces:**
- Consumes Task1 inspect/prepare、第一阶段的coverage/report/取消和原OPFS生命周期。inspection时长按秒与native duration比较；AbortError按取消清理，LOCAL_READ_FAILED/local-read按本地读取失败解释，不当missing-index、不重复加载。保留第一阶段候选URL精确关联、可选candidates字段、batch job.course和同源手动命名优先级；接口与证据交接见 `docs/superpowers/plans/2026-11-07-long-session-acquisition-audit.md`，媒体准备不能回退为所有URL共享一份全局课次日期。
- Produces `PPTCore.mediaError(mediaError,{phase='load',local=false,audioOmitted=false,time=null}={}) -> Error`，附code/phase/nativeCode/time。媒体码只说明实际已知失败，不单凭nativeCode确诊音频/视频损坏。
- Extends `PPTScanner(video,frame,mediaContext={})` 可选第三参数，旧两参数兼容；load/seek错误共用解释。seek保留30s期限与AbortSignal。
- `fetchVideo(url,signal,{timeoutMs=30000}={})` 首响应/每次body read无进展期限；清除计时器，完整206判定与可比Content-Length检查见Spec §4。
- `mediaRecovery:{omitAudio:true}` 持久化setting和DOM `video-only`。默认为true；关闭/unsupported走同一原生加载一次，HLS保持原分支。prepare前置；原source identity不变。
- 模块只在capture HTML加载，不进学校MAIN/content脚本。更新release精确资源及tests/features/integration复制清单，保留原打包CRC/源字节校验。

- [ ] **Step 1: 写失败测试**。已有FFmpeg生成8s、640×360、AVC/AAC、明显稳定色块/知识增量slide的AV控制、video-only控制、尾moov、fMP4、missing-moov和坏video初始化素材。音频仅改decoder configuration且外层box合法；必须先实测原muted路径失败，再实测准备后首/中/尾像素与sourceTime。若目标浏览器不拒绝夹具，记录缺口，不虚构差分通过或反复随机破坏直到侥幸。

```js
assert.equal(cleanControl.decoded, true);
assert.equal(originalBadAudio.nativeFailed, true); // 声称差分恢复前必须成立
assert.equal(recovered.reachedEnd, true);
assert.deepEqual(recovered.slidePixels, expectedSlidePixels);
assert.equal(reloaded.lessonId, originalLessonId);
assert.equal(cancelled.sourceReady, false);
assert.equal(afterFailure.oldScreenshotCount, before.oldScreenshotCount);
```

也覆盖无支持profile原样、video-only不改Blob、关闭开关、movie/native duration不符、缓存/本地load与seek错误不推荐刷新、HTTP状态/HTML/空/中断/错误206/编码Content-Length、下载首响应与body挂起可取消、prepare/loadeddata迟到无绑定、URL/cache/监听器清理。网络仅loopback；原生坏视频不能报告已修复。

- [ ] **Step 2: RED**。Run focused `node --test tests/core.test.cjs tests/scanner.test.cjs tests/release.test.cjs` 和新增library媒体用例，预期新asset/prepare/诊断接口不满足。旧与新路径对照保留证据。
- [ ] **Step 3: 接入并自审**。在完整cache File和local File准备后再赋src；在原cleanup owner中管理引用，UI说明音轨忽略不是已确诊。未知/不支持格式继续native一次；确定missing-index/结构错误给针对建议，不增加全量预检下载。
- [ ] **Step 4: GREEN**。Run `npm test`、`npm run test:release`、`npm run test:library`、`npm run test:features`、`npm run test:integration` 顺序；使用已装Chromium的PPT_TEST_BROWSER。本任务focused迭代、最后每个完整套件只跑一遍，失败修复后的受影响重跑有明确理由。核对打包asset和语法/diff，关闭所有上下文/服务、收取后台job。
- [ ] **Step 5: 自审并提交**。Commit `fix: isolate eligible MP4 audio and report media failures by stage`。report写出差分成立与否、支持范围/未恢复情况、phase/timestamp/cleanup证据；独立审查后阶段整体审查。用户5段真实音轨故障、损坏原文件和丢29帧没有样本，不声称已实测复原。
