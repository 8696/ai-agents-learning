/**
 * 职责：step-4 自己的本页说明和核心教学点卡片。
 * 数据流：App 传入 page（graph-version / overview）。
 * 为什么单独成文件：各页教学文案不同，不堆进 layout.js。
 */
window.DemoUI = window.DemoUI || {};

function PageIntro(props) {
  const page = props.page;
  if (page === "graph-version") {
    return (
      <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
        <p className="text-sm text-gray-700">
          本页只演示：<b>发版改了节点名，旧单还在磁盘上，加载时不能瞎猜</b>（变体 J）。CheckpointRecord 加 graphVersion 字段；加载时与进程内 currentGraphVersion 不一致 → 明确抛 GRAPH_VERSION_MISMATCH，不进入一个不存在的节点。
        </p>
        <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
          <li>进程内默认 graphVersion = v1。点「开这件」→ POST /api/run/start</li>
          <li>点「走一步（写盘带 graphVersion）」→ POST /api/run/step 携带 keepHistory=true。磁盘上写一份 graphVersion=v1 的检查点 + step-0000.json 副本</li>
          <li>「切图版本到上方输入框里的值」(默认 v2)→ POST /api/run/set-graph-version</li>
          <li>点「读一次最新检查点」→ 看到 HTTP 400 · GRAPH_VERSION_MISMATCH + 错误卡里显示两个版本号</li>
          <li>反例:不切版本就读,看到正常读回(graphVersion 一致)</li>
        </ol>
        <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
          <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
          <div className="text-xs text-gray-800">
            检查点里带 graphVersion。加载时版本不一致 → 明确失败（"这张单按旧图跑到一半，新图无法接"），不瞎猜改名继续跑。生产里发版改名/删边，旧检查点必须明确不让加载——失败可见比让一个半截单跑进新图更安全。
          </div>
          <div className="text-xs text-gray-600">
            怎么观察:切到 v2 之后读检查点，错误卡里会显示「检查点 graphVersion = v1, 进程内 currentGraphVersion = v2」。
          </div>
        </div>
      </section>
    );
  }
  return (
    <section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
      <p className="text-sm text-gray-700">
        本页是 step-4 总览。这一步只演示一个新教学点:<b>图版本失败可见</b>。其他 step-1 / step-2 / step-3 那几页(端口 50121 / 50122 / 50123)不在这里复刻。
      </p>
      <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
        <li>step-1 / step-2 / step-3 锁住的「最佳表达」保留;step-4 改造 CheckpointRecord 加 graphVersion + readCheckpoint 加载时校验</li>
        <li>新加 POST /api/run/set-graph-version:进程内 currentGraphVersion 切换</li>
      </ol>
      <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
        <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
        <div className="text-xs text-gray-800">
          step-4 是「加深」——CheckpointRecord 加 graphVersion + readCheckpoint 加载时校验,这一步从「写入即正确」升级到「写入 + 加载都带版本,版本不匹配拒绝加载」。迁移可以以后做(旧图节点名映射到新图节点名),但**失败可见**是必须先有的。
        </div>
        <div className="text-xs text-gray-600">
          怎么观察:从下面按钮进图版本页,按「开件 → 走一步 → 切到 v2 → 读检查点」走一遍。
        </div>
      </div>
    </section>
  );
}

window.DemoUI.PageIntro = PageIntro;
