# 长时间提取修复：课程读取与完整性

## 范围与基线

基线为本地 main `c8aaafba387401ca650b8f862acde8ee8d13d679`（3.1.2），已快进合入；旧 3.1.1 和 3.1.2 worktree 及本地分支已经清理，生成产物完整转存到原仓库 `.test-output/previous-worktrees/`。3.1.2 的整课合并 PDF、中文三级目录和工作台均沿用，不重写。

本阶段落实前次十二项调查中的 1、2、3、4、10、12，并为后续媒体容错和学习版整理保留接口。后续两阶段分别有自己的设计、计划和审查。用户已明确要求在合并清理后开始修复，并指定 subagent-driven-development / writing-plans；执行按该授权连续进行，常规实现取舍记录在台账。

## Global Constraints

- 保持原生 JavaScript / MV3、Chrome 114+、Node.js 20+，不新增运行时依赖，不安装依赖或浏览器。
- 不访问真实课程、凭据或日常浏览器资料，不上传课程资料，不修改域名授权和使用约定，不推送、发布或更新远程 main。
- 在隔离分支 fix/long-session-reliability 工作；主工作区保留已合并的 3.1.2，版本元数据暂保留 3.1.2。
- 保持 IndexedDB schema version 3；新元数据使用现有 settings/lesson 记录的可选字段，旧截图、手动命名、裁剪、忽略区和断点不得被清空。
- 图片、视频和导出继续走 IndexedDB / OPFS 流式路径；缩略图读取并发 ≤2，签名缓存最多 1000 个（82,944,000 bytes），不能因提高页数限制一并提高缓存预算。
- 保留 3.1.2 的课程域分离、逐图背压、三级 PDF 目录、原生取消、可见停止按钮、卡片复用和减少动态效果保护。
- 每任务由一个全新实现者串行实施，再由全新只读审查者给出规格和质量双结论；整体审查在本阶段末尾执行。

## 1. 有边界的课程读取

共享读取逻辑放在现有 `batch.js`，避免增加注入资源。新增 `PPTBatch.requestJSON(path, options)`：默认每次尝试 15,000ms，覆盖响应头和 JSON body；最多追加 2 次重试，退避 500ms / 1,500ms；仅网络错误、超时、HTTP 408/429/5xx 重试，401/403/其他 4xx、非 JSON 和取消不重试。调用方可以注入 fetch、deadline 和退避供测试，外部 AbortSignal 必须真正中止 fetch、body 等待及退避。即便合成 fetch 不服从 signal，公开 Promise 仍须按 deadline 结束，清除计时器和监听器。

排课枚举按实际响应的 `next`（含嵌套 data/results 包装）继续读取，去重并检测循环；只接受相同 origin、同一课程 schedules endpoint 的 next URL，最多 100 页。出现分页失败、循环或不可信 next 时，保留已知条目并明确标记目录不完整，不能宣称已经没有其他录像。一次列举返回数组且无分页信息时按该已知响应完成，不补造远端总数。

详情并发最多 4。所有排课都留在目录：可读取、读取失败、确认无视频、未开课/转码中分别记录。详情失败不是“没有录像”。job 新增可选 `discovery: {state, code, message, attempts}`，state 为 `pending/ready/error/unavailable/skipped`；尚无 URL 的 job 不可自动扫描。沿用原有 id（capture code 优先、schedule id 后备），不能按数组位置覆盖历史课次。

新增 `PPTBatch.discover({page, readJSON, signal, previous, retryOnly, onProgress})`，返回 `{courseId, courseName, total, eligible, jobs, failures, page, complete}`。增量回调包含当前已知完整 job 目录和计数。只重试失败时不重新请求已成功详情，保留既有 URL、课次状态和裁剪；成功刷新才更新对应来源。该模式不重新枚举排课，shared discover仅见previous jobs，故其complete保守为false；工具页保留前次持久化目录的complete/total/eligible等列举证据，仅替换本次详情结果与失败统计，不能把此前不完整/未知目录升级为完整，也不能把已知远端总数缩成当前已见行数。重读部分失败时，旧课次/截图/手动设置不消失。整个目录成功列举前不得据新结果删除历史条目。

## 2. 可取消的内容脚本协议与界面

`PPT_BATCH_DISCOVER` 在启动后立即返回 `{ok:true, requestId, pending:true}`。同一课程已有读取任务时加入同一 requestId，不启动第二批。`PPT_BATCH_STATUS {requestId}` 返回 `{ok:true, requestId, pending, progress, result, error?}`；`result` 为上述目录快照。`PPT_BATCH_CANCEL {requestId}` 中止匹配任务。导航、pagehide 和课程切换会取消旧读取；未知 id 明确返回失效错误。后台单视频 API 回查也有 deadline，并合并同页重复回查。

工具页每 1,000ms 查询一次状态，每次消息有 10,000ms 响应期限；任务结束或取消后停止查询。保留对旧测试/已加载脚本的一次性终局返回的兼容消费。读取期间按钮显示工作状态、禁止重复开始；停止按钮可以立即取消读取；增加“重试失败项”。进度显示已列举、已处理、成功、失败、跳过数，逐项错误为可见文本，不能只放 title。已有结果在取消或失败后仍可查看。

批量快照在现有 settings 中保存 `{page, jobs, discovery?}`；discovery 保存目录是否完整、total、eligible、courseId/courseName 和失败统计。选择/裁剪/课次原子写入不能把该字段丢掉。旧快照没有 discovery 时标为未知，不推断已全部读取。界面仅对仍匹配的 tab/page/requestId 应用结果，切换后到达的旧消息不改新课程。

## 3. 课次时间与任务上下文

课程开课日期不是录像日期。`course.js` 只在明确的课次/排课/录制字段或匹配实体中解析日期时间；course 根对象的普通 start_time、coursedate 和“开课时间”不进入课次。页面中唯一日期若来自该标签，也不得通过无标签回退重新引入。保留 Asia/Shanghai 与无时区墙钟规则、ID 消歧和不猜多课次日期的行为；支持 my/study 两类路径。

已匹配 API/排课元数据优先于 DOM 回退。首次绑定以已确认来源时间为准，旧表单的自动值不能盖掉它。新增 `PPTCourse.forBinding(detected, displayed, {manual=false, sameSource=false}={})`：只有属于同一来源的明确手动表单值可覆盖；其他情况只取 detected（缺少的日期时间保持空）。新批量课次使用 job.course，不能继承上一课次的全局手动表单；既有 lesson.namingManual 保护已有手改值，自动命名可在同身份的可靠排课信息到达后纠正。

批量运行/已读目录与单来源等待态一致展示：当前课程、课次日期时间、通道和批量进度优先于笼统“等待发现视频”；单视频尚无候选可明确说明其局部状态。扩展的课程选择项优先显示已识别课程名，保留 tab id，不修改学校页面标题。

## 4. 长任务保护与续扫

单课业务页数默认 5,000，可在提取设置中配置为 100..20,000 的整数；无效保存值回退 5,000。设置与课次扫描参数分开，修改保护阈值不使有效断点失效。到保护阈值时安全暂停，提示提高阈值后继续，不要求清空截图。不得改变 1000 个签名的独立内存预算。

可用时检查 navigator.storage.estimate：开始扫描和每新增 25 页检查一次，剩余空间小于 32MiB 时在下一页提交前暂停；API 缺失/估计失败不当作磁盘已满，实际 QuotaExceededError 仍按原子存储失败处理。页数/空间保护保存 paused 和原因，不标 done；批量该项保留 partial/paused，不把它与普通解码失败混淆。STORAGE_LOW 属于全局空间保护：一旦识别，整批在下一个课次加载/缓存之前停止，最终提示保留空间不足原因，释放空间后可重启未完成项。实际 QuotaExceededError 同样停止后续课次加载，保留原子回滚和最后安全断点，不能伪装该页已提交。PAGE_LIMIT 只限制当前课次，仍可继续其他课次。继续时重放安全边界，同 scanId/time 不重复保存。

保存新增末页时只增量插入该卡片，不为每一页重新移动所有旧节点；全量恢复/重排允许 O(页数) 元数据。保留有界图库观察根、旧节点/scrollTop、离屏 URL 回收。验收至少保存 1,388 页到录像尾部，并以 2,000 页合成数据核对设置、恢复、签名预算及流式导出。

## 5. 完整性与导出核对

新全扫在 task.coverage 中记录 `{version:1, sourceKey, trackKey, duration, ranges, reachedEnd}`；ranges 只在对应 page/suspect/checkpoint 成功持久化后合并。恢复同任务可延续有效范围；来源/通道/设置改变后从新任务重新记，不能拼成虚假的完整性。`PPTScanner.scan` 成功返回新增 `completedTo`（最后安全处理的采样时刻），原有 saved/unstable 保留。只有从 0 连续覆盖到安全尾部且 reachedEnd 时标“已扫到尾部”。局部补扫不直接完成整节。旧任务即便 state=done，缺少覆盖证据也显示“旧任务，需核对尾部”，不回填证据。

新增纯函数 `PPTLibrary.integrity({batch, lessons, pages, exportedAt=null, format=null})` 生成 version=1 报告，分开列目录完整性、逐课次发现状态、扫描状态/时长/安全断点/覆盖/待复核区间、保存页数、知识内容核验状态、以及导出时的课次/页 ID 与 sourceTime 顺序。不能用文件数或 page count 推导完成；知识内容默认 unreviewed，供后续阶段更新。报告中不含带签名的远程 URL、Cookie 或 token。

增加当前课程与批量课程各自的“完整性报告”入口，课程域和已有两种整课导出一致；报告可独立导出 UTF-8 JSON。整课 PDF/ZIP 开始前等待命名与课次保存，冻结该次导出的页序快照，并保存其报告作为 lastExport；导出失败不覆盖上次成功报告。成功提示列出未到尾部、目录失败/未知和待复核数量，允许继续导出部分结果但不宣称整课完成。不改变现有 PDF/ZIP 格式字节协议，不额外自动发第二个下载。

## 验收与边界

- 26 排课 = 21 成功 + 4 HTTP 503 + 1 超时：始终有 26 行、5 项明确失败，只重试这 5 项可补齐；挂起请求可停止；重复读取只一批；旧清单不缩成 21 项。
- 课程 9月14日00:00、录像9月15日16:40：首次绑定/刷新/恢复按正确课次，手动改名保持；两门课切换不会串名称或时间。
- 1,388 页扫描到尾、提高阈值续扫、空间保护与失败事务均不丢旧图/重复边界；2,000 页继续保持原缓存预算和逐图导出。
- 26 份 PDF 中一节中止：报告必须定位该节，不显示整课完成；旧 done 但无 coverage 不能冒充已验证；导出顺序快照不会被随后调整污染。
- 仅本地合成素材和现有依赖验证，测试证据与真实学校故障复验分别报告。网页空白的服务端原因及真实损坏录像尚无样本，不补造实测。
