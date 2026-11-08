# 3.1.3 远程 CI 预检取消用例

用户已授权推送并发布3.1.3。PR #12首次CI的Node20三系统通过，Linux浏览器在features278失败：`cancelled old queue never starts another request`，4 !== 2。真实日志保留在run42456976695/job128657981903。

目标：维持真实用户点击、旧队列取消和迟到结果隔离的契约，使断言的取消基线代表已完成的旧课程发现，而非正在进行的发现。`discover()`在开始cancel、异步tabs/messages/storage后还会`updateSources(true)`；当前测试click返回不代表async处理结束，第一次观察到两个请求可能早于该reset。必须核实该因果，不能仅把2改4或增加sleep。

控制器选择：在测试内透明观察并等待真实onclick返回的discover Promise，原参数/this/返回值保持，恢复handler；保持旧响应held和真实fresh点击/旧结果释放，不mock产品取消。增强断言旧第三queued URL从未启动、fresh有效且旧候选不回写。若证据指向产品错误，先报告具体owner/可重复边界，不猜改运行时。

约束：Chrome114+/Node20+、无依赖安装/权限/版本/IDB/资源变化；原11个features业务断言保留。Task1仅tests/features.cjs和自身报告；Task2仅tests/memory.cjs和自身报告；Task3仅tests/library.cjs和自身报告；原M2保持已披露历史，不借此修改旧最终波次。测试文件变化不改变35资源ZIP，须核对原SHA37563515b543dafea4581ecb42f041eb7134543b853ada18b50d789e480172ec。

受控验证：保留真实CI RED；增加可核的完成/队列前提与请求路径证据；现成隔离Chrome完成一次FULL features；不重跑其它未执行该夹具的本地九套，远程CI按既有工作流复验。失败不重试凑绿，不弱化断言，不访问真实课程或日常资料。

## Task2：2000页写包与原生下载观测的边界

新run42459142803中Node20三系统及features/review/bridge/integration实际PASS；memory前15项PASS，fresh longWorkspace在tests/memory.cjs463原生download默认30000ms超时，Node20未处理拒绝提前终止，library/improvements未执行。保留真实log，不推断是旧L1/L2同因：此例新context首次导出，生成2000页约150MB可能仍在await exportRetained；现有日志没有producer结束或失败的状态，不能称已证明Linux生成耗时根因。

契约：在生成前订阅实际原生download并立即处理拒绝；重包生成的await与“生成完成后仍未收到文件”的原生等待分开，后者仍有30000ms上限，早到事件不可丢。生成失败必须明确失败、观察者/timer全部清理。可有明确的总生成/进度保护，但不只是加大原30秒等待或绕开原生文件。仅测试夹具同步/观测；不得改exportRetained、ZIP writer、图像、页数、memory阈值、浏览器下载策略或runtime。

验证：有意义的边界控制证明早事件、生成超过小测试预算、缺事件/生成失败都处理正确；同最终代码一次FULL memory16，保真实2000entry/全JPEG hash/单页read/64MiB heap/60秒retention/2001增量/1000旧case全部断言。证据记录producer耗时、原生事件耗时、输出文件与原字节，不宣称本地Linux复现；远程CI继续必要。若观察到真实产品错误或无法给生成保护，先具体NEEDS_CONTEXT，不无限等待或把timeout改大凑绿。

## Task3：空图库不能代替真实启动完成

远程run42463292679的Node20三系统和features/review/bridge/integration/memory均实际PASS。library在2205首次全课删除后reload、count(0)返回，立即断言library-manage启用时出现true!==false，improvements因此未执行。保留真实日志；其后诊断显示“已恢复”不证明断言采样那一刻ready也已完成。

直接边界：count(n)目前只检查!busy()及DOM卡片数；新页面初始也有0卡片/!busy，却可能仍在IndexedDB打开、设置读取、prune、restore。实际capture31–50在这些步骤结束才置ready=true并controls，897按active||!ready禁用管理按钮。Task3只让测试等待实际启动及既有页数契约，不更改产品或把false断言换值/删掉。count(0)必须在真实restore未完成时保持pending，完成后返回；正数、busy和所有原断言含义不变。

验证使用有界、可释放的真实启动延迟证明旧零计数可误报完成，以及修后在同边界等待并在release后完成；不盲加sleep或等待按钮本身冒充修复。现成隔离Chrome一次最终FULL library，保全部原业务和真实消费链，记录命令、输入、结果、资源；本地受控反例不冒称原Linux时序重放。若实际ready完成后按钮仍错误禁用，报告具体产品owner再裁定范围。其它夹具、35运行资源/ZIP、原M2保持不变。
