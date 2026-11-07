# 长时间提取修复：本地媒体诊断与视频轨容错

## 范围

承接课程读取/完整性阶段，解决此前问题7、8、9：静音仍会解析损坏音轨，格式预检不能证明文件结构完好，加载/跳转错误需要给出相应处理方式。只对保守可确认的普通MP4忽略音轨，保留原生解码器、原视频字节和课次身份。不是通用转码器或损坏视频修复器。

## Global Constraints

- 原生JS/MV3、Chrome114+/Node20+；不新增运行时依赖，不安装软件或浏览器，不引入FFmpeg/WASM、云API或本机native host。
- 仅已有依赖、本地合成素材、隔离临时浏览器上下文和loopback服务；不访问真实课程/凭据/日常资料，不外传素材、不推送发布。
- 保持IDB v3、第一阶段的目录/取消/覆盖/报告接口、旧手动名称/裁剪/断点、3.1.2中文三级目录、逐图导出背压和有界图片缓存。
- 临时准备后的Blob不改变原来源URL/file name/size/mtime或sourceKey，不创建新课次；失败与取消保留截图、释放本任务URL/缓存，不能错误绑定sourceReady或done。
- 中间任务保留3.1.2元数据；全部功能完成后由独立版本任务统一更新3.1.3。
- 新鲜实现者串行、独立只读任务审查、阶段末最高模型整体审查；实际没有复现的原生媒体故障必须明示证据缺口。

## 1. 无依赖的有界MP4检查

新增 `mp4-recovery.js`，使用IIFE/CommonJS，`PPTMP4` 只暴露：

```text
inspect(blob, {signal}={}) -> Promise<Inspection>
prepare(blob, {signal}={}) -> Promise<Prepared>
Inspection = {format:'mp4'|'other'|'unknown', status:'eligible'|'video-only'|'unsupported'|'missing-index'|'malformed', code, tracks:[{id,handler}], movieDuration:number|null, videoDuration:number|null, movieTimescale:number|null, inspectedBytes:number}
Prepared = {mode:'audio-omitted'|'original'|'reject', blob:Blob|null, inspection:Inspection}
```

模块只处理已完整获取的Blob，不fetch、不碰DOM/OPFS/URL。每次read≤65536字节，累计读≤16777216字节（重复也计），最多50000 boxes、深度8、32 tracks。只按已验证父容器/offset遍历，不在原始字节中搜索box名、不读取mdat payload、不按不可信count分配数组。前后都检查signal，取消即结束公开Promise并忽略迟到读结果；真实读取错误单列local-read，不伪装成无索引。超预算是unsupported/unverified。

支持普通32位size、size=1的64位extended header（BigInt检查范围后转换）、顶层size=0到EOF、uuid额外header。要求严格前进、不超父box/文件、安全整数、不接受截断或歧义的重复关键box；嵌套size=0拒绝重写。仅已识别ISO/MP4品牌才可能诊断格式损坏，其他容器/未知品牌原样交原生路径。

缺少moov只能在认可的非碎片MP4完整且合法的顶层遍历后判定。moov位于文件尾是正常情况。仅ftyp、64KiB首段、读失败或超预算不能证明无索引。moof或moov/mvex一律不重写，包括只有初始化段的碎片文件。

## 2. 音轨忽略的准入与字节保持

只支持一条启用、独立、未加密的AVC（avc1/avc3）视频轨和一条或多条可识别的普通version0 AAC mp4a音轨；唯一非零track IDs、tkhd/mdia/hdlr/stsd/dref等结构边界明确，数据引用为self-contained。保留视频所需sample tables必须结构有效，数据是否真能解码仍由浏览器验证。

出现多视频/其他handler、tref/trgr/iods、外部dref、受保护sample entry、sinf/tenc/pssh/senc/saiz/saio、未知结构依赖/uuid或不支持codec时原样passthrough，说明原因，不部分改写。显式允许的free/skip与不影响轨道关系的udta/meta可原样保留；不把opaque AAC esds解析为box容器，以便绕过坏解码配置，但外层音轨box framing必须正确。

仅在mvhd与保留视频tkhd时长相同（movie timescale）且有限为正时重写；支持v0/v1时长字段，拒绝sentinel/零timescale。保留视频可无edit，或只有一个unit-rate、非负media time且segment duration匹配的视频edit；正常正media time offset保留。空leading edit、多段、dwell/非unit rate、duration关系不明确原样passthrough。不得改写mvhd/tkhd/mdhd、PTS/DTS、stts/ctts或edit list。原生加载后的duration与检查所得videoDuration偏差不得大于max(1 movie tick,1ms)，否则停止并提示时间轴不一致。

对符合准入的音轨，只把每个soun轨外层trak box的4字节type改成free；不删除box、不改size、不移动mdat或moov、不改stco/co64。用原Blob.slice和几个4字节数组组合结果，输出size不变；除这些type字节外全部相同。prepare自行检查，不接受调用方传来的patch offset。video-only/unsupported返回相同原Blob引用；确认的missing-index/malformed返回reject，不交给重复刷新循环。

这些字节仍保留原音频payload，故只用于内部画面提取，不是音频脱敏文件。File-backed slices避免应用自己读取整段视频到ArrayBuffer，不承诺浏览器内部零拷贝或固定RSS。

## 3. 在原生加载前准备，覆盖中途音轨故障

普通远程MP4仍先完整流式写入OPFS，close后取File；本地File同样调用prepare，再设置video.src。增加提取设置“仅使用视频轨（支持的MP4）”，默认开启，持久保存在 `mediaRecovery:{omitAudio:true}`，不加入scanSettings以免仅输出音轨选择让同画面断点失效。关闭则原样加载；不支持的输入仍只尝试一次原生路径。预处理前置，不能只在首帧加载失败时重试，因为坏音频可能在后续seek才触发。

界面如实显示“已忽略音轨，仅用于画面提取”或“不支持自动忽略音轨：原因”。成功忽略不等于检测到音频损坏。HLS保持原分支，不套用普通MP4改写；没有自动转码/重下循环。媒体准备/原生加载全过程的Stop均可取消，撤下video/revokeURL后再删除原OPFS缓存，不绑定迟到成功。

## 4. 传输和错误信息分层

保持原HTTP状态、非JSON/HTML、空体检查。fetchVideo首响应和每次reader.read各自有30000ms无进展期限（测试可注入），没有固定总下载时长；用户signal优先，超时清理reader/OPFS。接收完整200或经Content-Range证明确实是0..total-1且接收长度匹配的206，拒绝意外部分响应。Content-Length只在与浏览器解码后的body可比（无content-encoding变换）时检查，不能把编码压缩差异当截断。

共享原生错误解释放 `PPTCore.mediaError(mediaError,{phase='load',local=false,audioOmitted=false,time=null}={}) -> Error`，保留稳定code与phase/nativeCode/time，并由awaitVideo和scanner.seek使用。Scanner可接受可选第三参数mediaContext，旧两参数兼容且可由blob URL推断本地上下文。

- 401/403建议确认登录/重新取地址；404/410说资源当前不可用，不能证明视频损坏。
- 确认缺索引/非法box建议同课次换通道或外部工具处理，不能继续推荐刷新地址。
- 原生code3只证明解码失败；在audio-omitted结果上说明视频/容器仍无法解码，可能是坏视频或不支持编码，不直接宣布已确诊视频损坏。
- 原生code4表示格式/codec/初始化不支持或无效，不混为地址失效。
- Blob上的code2或load/seek超时说明本地缓存/媒体读取问题，不声称学校服务器太慢。报出失败阶段和sourceTime，批量报告定位具体课次。

原格式预检继续只是≤64KiB的签名/HTTP检查，不暗中完整下载。

## 验收

Node人工box夹具验证边界、恶意大小/count、64位与>4GiB稀疏读取、取消/读取失败/预算、碎片/加密/依赖/时长/edit负例。重写结果逐字节比较：只允许音轨type不同，视频轨、mdat、chunk offsets和时序字节相同，passthrough保持Blob identity。

已有FFmpeg生成健康AV、video-only、头/尾moov、碎片、缺moov、坏视频和坏音频初始化对照；已有隔离Chromium验证远程OPFS和本地导入、首/中/尾slide pixels与时间、取消/清理/旧截图身份不变。音频故障对照必须先在静音原生路径真实失败，再证明准备后扫到末尾；随机AAC损坏若被容忍，不得称已复现。若当前环境无法得到稳定故障样本，记录缺口并保留字节/轨道/健康视频验证，不虚构真实5段原文件已恢复。

该能力不重建缺失moov、不修损坏视频、不恢复丢帧或低清投影文字，不保证所有MP4音轨均可自动忽略。
