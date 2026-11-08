# 3.1.3 CI Canvas小变化夹具的可移植性

用户已经明确要求完成后远程发布、合并并安全清理已合入分支。前一发布CI同步阶段的三个任务及完整阶段独审已通过；run42466202484/head66f8ed2又在真实Linux通过三OS Node20、features/review/bridge/integration/memory/library61后，首次执行到improvements时失败。完整日志留在.test-output/ci-release-run-42466202484/，job128686193066，improvements174实际保存[.25,3.25,4.25,5.25]，预期六页含1.25/2.25。不能把期望降成四页。

## 目标与直接边界

现有知识画面在710×378 Canvas用系统serif字体绘制12px上标2、14px下标i、12px数字1，再通过真实frame缩至192×108。生产local-v1只承诺保护未mask且亮度补偿后至少一个RGB通道差≥48的可观察签名像素；不同系统字体/栅格化是否提供这个前提必须区分于比较器是否正确。日志没有远程RGBA文件内容，不能把缺页本身称为已证明字体根因、实际Linux重放，或生产器已正确。

唯一任务先做一次有界实际Canvas诊断：记录默认serif与明确的sans-serif/monospace三种通用字体的三个微小变化经相同frame/签名缩放后的原始与补偿后强像素、frameDistance和hasLocalChange。保实际输入epoch/环境；没有本地重现就明确说没有，禁止搜索字体或参数直到绿。不能安装/下载字体。

若证据支持夹具的系统字体前提不稳定，三个微小字形可用固定、可审的Canvas路径/矩形像素图形绘制上标2、下标i、数字1，使构造的可观察微变化不依赖字体。保710×378真实Canvas→真实frame/192×108签名→真实scanner/JPEG/IDB路径及原语义位置，禁止伪造签名、frame、save、页数组或产品判断。不得通过字体加粗、放大到普通全局门槛、平台条件化期望或减页来迎合结果。固定几何由可观察信号契约约束，不按比较器结果循环调参。

在采集前显式核每个微小变化至少1且少于8个强签名像素、未触发旧changed1.2%/mean0.6%全局门槛，同时真实hasLocalChange为true；保float≤8亮度补偿、不改48阈值。记录这些前提的紧凑stdout及原RGBA/JPEG证据，以便真实CI失败时区分输入与算法。若前提已满足但实际scanner仍漏保存，必须报告具体运行时NEEDS_CONTEXT，不在测试夹具中掩盖。

## 不变的验收

原six时间[.25,1.25,2.25,3.25,4.25,5.25]、六个唯一ID、原图和签名字节相符、原sourceKey、三个微变化少于8强像素、旧全局双门槛全部放行、comparisonVersion、相似页人工确认、精确48/8/single-on/off/mask/brightness控制和所有resume ID/checkpoint/bytes/settings均保留。不得删或放宽原28业务组。只修tests/improvements.cjs及自身报告；其它三夹具、35运行资源、版本/IDB/权限/依赖与原ZIP不变。真实坏AAC显式缺口、原M2文档勘误及其它历史边界不清零。

受控诊断/前提失败可以作为真实局部RED，但不能称本地复现远程调度或远程像素内容。focused使用已有PPT_TEST_LOCAL_DETAIL_ONLY/精确filter，最后最终源只跑一次完整improvements，原28组原生消费断言全部保留，不重复已在真实远程通过的其它本地套件。全部raw stdout/stderr/exit、源hash、环境、图片/签名、observer还原与资源关闭留证。确认原assertions和真实数据流，self-review和独立门审后再push/完整远程CI。

## 阶段边界

这是系统字体依赖的视觉输入契约任务，与前一阶段三项异步所有权修复不同；前一阶段既有完整独审和真实CI已覆盖对应所有者。新阶段BASE使用已推且已审的66f8ed2，单任务full BASE..HEAD最高独审覆盖自身完整变更，另核旧三fixture/35runtime/包逐字节不变。不能因此重开旧功能最终波次，不能把原M2归零，不能跳过真实远程CI。若发现共享运行时缺陷，先给具体证据和owner再调整范围。全部发布/合并/清理成功由实际后续结果决定。
