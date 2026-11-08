# 3.1.3 远程 CI 预检取消用例

用户已授权推送并发布3.1.3。PR #12首次CI的Node20三系统通过，Linux浏览器在features278失败：`cancelled old queue never starts another request`，4 !== 2。真实日志保留在run42456976695/job128657981903。

目标：维持真实用户点击、旧队列取消和迟到结果隔离的契约，使断言的取消基线代表已完成的旧课程发现，而非正在进行的发现。`discover()`在开始cancel、异步tabs/messages/storage后还会`updateSources(true)`；当前测试click返回不代表async处理结束，第一次观察到两个请求可能早于该reset。必须核实该因果，不能仅把2改4或增加sleep。

控制器选择：在测试内透明观察并等待真实onclick返回的discover Promise，原参数/this/返回值保持，恢复handler；保持旧响应held和真实fresh点击/旧结果释放，不mock产品取消。增强断言旧第三queued URL从未启动、fresh有效且旧候选不回写。若证据指向产品错误，先报告具体owner/可重复边界，不猜改运行时。

约束：Chrome114+/Node20+、无依赖安装/权限/版本/IDB/资源变化；原11个features业务断言保留。仅tests/features.cjs和本次报告；原M2保持已披露历史，不借此修改旧最终波次。测试文件变化不改变35资源ZIP，须核对原SHA37563515b543dafea4581ecb42f041eb7134543b853ada18b50d789e480172ec。

受控验证：保留真实CI RED；增加可核的完成/队列前提与请求路径证据；现成隔离Chrome完成一次FULL features；不重跑其它未执行该夹具的本地九套，远程CI按既有工作流复验。失败不重试凑绿，不弱化断言，不访问真实课程或日常资料。
