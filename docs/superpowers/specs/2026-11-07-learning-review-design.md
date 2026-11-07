# 长时间提取修复：保守比较、学习版与3.1.3交付

## 范围

承接课程完整性和媒体容错阶段，落实原问题5、6、11及12的学习阅读部分，并按用户补充要求在全部功能完成后统一版本3.1.3。原图与原页序继续保存；学习版是可恢复的排除选择，不伪造自动知识判断，不引入OCR/云视觉服务。

## Global Constraints

- 原生JS/MV3、Chrome114+/Node20+、现有运行时资源；不新增依赖、不安装浏览器/软件，不访问真实课程或凭据，不外传素材。
- 在隔离fix/long-session-reliability分支连续执行，保持之前两阶段已审查的目录/取消/命名/覆盖/媒体/报告接口、3.1.2三级PDF目录及有界图库、磁盘与逐图导出路径。
- IDB保持v3。旧页没有新字段视为保留；原JPEG/签名、裁剪、手动命名、断点不清空，签名仍192×108、缓存最多1000（82,944,000bytes）、缩略图读取并发≤2。
- 所有学习版排除由明确用户操作触发，可恢复；建议不是自动删除依据。保留现有永久删除/撤销和人工相似页对比；不能以学习版替代或破坏原始结果。
- 不承诺自动分清所有公式、视频、鼠标和投影噪声；未验证原录像/最低版本不能写成已通过。新鲜实现者串行、独立任务审查、最高模型末审。
- 最后同步manifest/package/lock/UI/README等当前版本引用到3.1.3并生成验证过的本地ZIP；不推送、打tag或远程发布。历史设计/审计的旧版本号保留历史事实。

## 1. 在全页比较上保护小区域增量

继续使用PPTCore.similar签名/API与原changed+mean双阈值、亮度小偏置补偿、忽略区。新增 `PPTCore.hasLocalChange(a,b,mask=null) -> boolean`，只对既有192×108 RGBA布局的82944个通道值执行局部保护，数组长度不同的旧输入沿用既有全页逻辑；不增加width/height参数。mask继续为frameDistance已有的每像素标记数组，偏置保持原浮点精度。无效输入仍按既有保守“不相似”处理。

局部规则固定：在扣除与frameDistance一致的每通道绝对值≤8全局亮度偏置后，只要有一个未忽略像素的最大RGB通道差≥48，就判定存在局部变化。直接逐像素检查，不使用窗口/stride/计数门槛。mask采用与frameDistance第三参数相同的忽略区含义。similar只有全页阈值通过且局部变化不存在时才返回true；相邻变化、稳定确认、全局去重和人工相似页比较用同一规则，不能只在事后补救已经被删掉的知识页。共享内部比较结果，避免similar重复计算偏置和像素循环；不新增跨帧缓存，不提高签名分辨率或让高分辨率图常驻内存。

局部保护可能多保留鼠标、压缩噪声和轻微抖动画面，这是优先保留已有小信号的取舍。通过既有忽略区与后续学习版整理处理；不能声称该规则理解公式，缩小签名时已经消失的细节也无法恢复。至少证明单个强差像素、等价上下标/单数字小区域、48黑像素公式/8彩色像素批注可保留，图像边缘和部分mask不漏计，uniform小亮度和完全位于mask内的动效仍可忽略。

修订依据见[Canvas与Sharp设计核查](../../../.test-output/learning-preflight/2026-11-08-detail-design-review.md)：710×378合成课件缩至192×108后，上标/下标/单数字仅剩2/1/1个强差像素，旧8像素门槛会漏过。此结果支持更保守门槛，不等于对真实课件或知识语义的认证。

新完整scan记录comparisonVersion='local-v1'。旧断点仍可按既有采样/裁剪设置续扫；旧比较与新比较混用的任务记录'mixed'，报告要求核对前段，不删除旧图或假称此前已应用局部保护。物理覆盖证据保持实际含义。

## 2. 可恢复的学习版

每页新增可选 `learningExcluded:boolean`，默认false；由用户选择排除/恢复时只更新pages元数据，不删除assets。lesson新增 `knowledgeReview:'unreviewed'|'has-content'|'no-content'`，默认unreviewed，非unreviewed核验同时保存 `knowledgeReviewEvidence:{sourceKey,trackKey,sourceDuration,pageIds}`。sourceKey按完整性投影使用的当前PPTLibrary.key(lesson.source)推导；没有source元数据时才用lesson.key或null。trackKey复用完整性投影的当前通道身份规则，无可识别来源时为null，不能直接信任旧task.coverage里的source/track值。sourceDuration为当前lesson.source.duration的有限正数，否则显式null；pageIds为本节全部当前原始页ID。

有效核验要求四项均与当前依据一致，包括sourceDuration字段存在且相等，以及完整pageIds集合相等；否则按unreviewed显示/报告。源地址或batch job相同也可能切换通道或更新为更长文件，旧核验不能继续认证。核验始终用本节全部原始页，不能用当前筛选、所选页或学习版子集；只有排除标记、页序或查看范围变化不使原始页集合失效。新增截图成功但随后lesson元数据写入失败，也不能在重开时沿用旧已审状态。添加新截图、实际来源/通道/已知时长变化导致旧核验失效时恢复unreviewed，不能把重新扫描后的新页继承为已审。

本节页面提供“排除所选 / 恢复所选”、每页排除/恢复和“全部 / 学习版保留 / 已排除”查看。当前筛选下全选/计数以可见页为准，跨视图切换清除陈旧选择；原pages/allPages仍保存所有原始记录，不能把视图过滤当删除。排除/恢复为原子metadata事务，失败不改内存和显示；最近一次可撤销，重开后状态保留。原永久删除及其undo资产租约继续有效，切换undo类型需正确释放先前租约。

lesson核验UI明示“尚未核验 / 有独立知识内容 / 无独立知识内容（学习版跳过本节）”。无内容只影响学习版导出，原图仍可查看/原始导出；改回其他状态即可恢复未逐页排除的内容，不自动清空截图。

## 3. 整理建议仅供核对

添加可取消的“整理建议”：使用现有metadata/签名，按最多32条asset读取批次、逐条处理；不能把所有JPEG或超过1000个签名留在内存。给出三种中性候选：

- 相邻近似页：同来源/尺寸且sourceTime递增，使用新similar保护局部增量；明确显示相邻对，能调用现有两图查看。
- 低变化画面：签名95%以上未忽略像素各通道距离其均值≤6；仅标候选，不标已无知识。
- 短时间多页：同时间线15秒内至少8张已保存页，可能是嵌入视频/动态操作或快速推导；说明需核对，不能自动排除整组。

建议展示页码、视频时间与原因；可选择候选后由用户点排除，或直接查看。生成建议、取消或重开界面均不自动更改learningExcluded/knowledgeReview。逐步公式即便出现在密集组里也仍需人工决定。

## 4. 原始/学习版导出与证据

增加独立导出内容选择“原始保留页 / 学习版”，默认原始，保存设置但不加入采样参数。作用于本节PDF/图片ZIP、所选PDF/图片ZIP、分课PDF包、整课PDF；所选先按用户选择再按导出版筛选。学习版排除learningExcluded，且跳过明确no-content课次；空学习版禁用或说明没有保留页，不下载空文件冒充成功。

原页序、sourceTime、书签目的地与课次日期保留；课次内页码按实际导出连续，讲义每课次新纸页，中文三级目录和背压沿用。当前课与批量课作用域继续独立；设置或页序在导出过程中变化不污染已冻结的快照。

完整性报告在原schema v1基础上增加view='raw'|'learning'、rawCount/excludedCount/exportedCount、有效knowledgeReview、comparisonVersion、逐页原ID/sourceTime与导出序号映射。计数以本次请求的raw页面范围为基准：rawCount是过滤前数量，exportedCount是本次实际输出数量，excludedCount=rawCount-exportedCount；raw模式不应用学习排除，excludedCount为0。核验依据另从完整原始页集合计算，不能把所选子集当作旧核验失效，也不能因子集验证失败而绕过整节no-content。

`PPTLibrary.integrity`新增可选reviewPages=pages作为本节/课程完整原始页的核验快照；pages仍是本次请求的raw范围，内部各课次用reviewPages的本节全量记录核验并统计原始savedPages。调用方冻结全量核验依据、所选raw范围、有效状态与view，再得到实际输出；writer、报告和receipt必须消费同一快照。新增knowledgeComplete：报告至少有一行课次，且每一行都有效核验；空页/未扫描课次仍在集合内，无lesson或无有效证据的行是unreviewed。既有complete继续表示目录/物理扫描证据，不用知识标记覆盖它。只有两者均满足才可显示学习版完整；一个已扫尾但无知识的课次可以标已核验无内容，不能说扫描失败或丢课。

公开报告继续使用既有身份别名和受限字段投影，不拷贝内部knowledgeReviewEvidence、原始sourceKey/trackKey、签名URL、名称/备注或凭据字段。页ID需沿用原有必要别名规则。实际字段名继续使用lessons[].lessonId和scan.reachedEnd等现有schema，不另造scan.complete。

## 5. 3.1.3与最终交付

全部功能完成并经任务审查后，显式核查版本来源：manifest.json、package.json、package-lock.json根及packages['']、界面/更新测试的当前版本、README和tests当前说明、release expectations。只更新当前版本引用，不批量改写历史文档或旧版本测试用例（如升级比较的历史值）。

保留已有npm release的确定性、CRC/源字节与精确资源验证，生成3.1.3本地ppt-capture.zip。报告记录commit、文件数/bytes/SHA256、所有最终测试的源版本矩阵、未验证边界。整体审查覆盖自c8aaafb以来所有功能及集成（即使前阶段已有审查），不能仅审版本那一提交。通过后将最终审计与必要rulings保存为跟踪文档，再仅清理本次拥有的SDD临时目录。修复分支/worktree与交付物保留供用户检视，不擅自合入main或远程发布。

## 验收

渐进积分公式、手写批注、彩色数据、回翻、桌面/无信号、嵌入视频/密集页面、教师投影亮度与忽略区均有本地合成用例。以页图/pixels/sourceTime与导出映射核对知识增量保留，不能只数页。排除/取消/撤销/重开/失败事务不丢原图，学习版与原始导出各自准确。完整性报告定位读取失败、中途终止、旧证据不足和人工无内容状态。最后3.1.3安装包、清单/配置/锁文件一致，只有本地交付。
