/**
 * 职责：节点失败对照这一页的输出板——显示 lastError / currentNode / 已完成节点 / 文件路径。
 * 数据流：App 传最近一次响应进来。
 * 为什么单独成文件：节点失败对照只在这一页。
 */
window.DemoUI = window.DemoUI || {};

const NODE_LABELS = {
  takeOrder: "点单（takeOrder）",
  chargeCard: "扣会员卡（chargeCard）",
  brewHot: "热饮制作（brewHot）",
  brewIced: "冰饮制作（brewIced）",
  sendPickupSms: "发取餐短信（sendPickupSms）",
  serve: "出餐（serve）",
  okEnd: "完成（okEnd）",
  brewFailed: "制作失败（brewFailed · 节点失败走到的站）",
};

function labelOf(node) {
  return NODE_LABELS[node] || node || "—";
}

function Board(props) {
  const last = props.last;
  return (
    <div className="min-h-[200px] space-y-3">
      {props.error ? (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm rounded p-3">
          <div className="font-semibold">失败（HTTP {props.error.status || "—"} · {props.error.code || "无编号"}）</div>
          <div>{props.error.message}</div>
        </div>
      ) : null}
      {!last && !props.error ? (
        <p className="text-sm text-gray-500">还没有请求。先开始 → 走一步（到 chargeCard）→ 让 brewHot 失败（设标志）→ 走一步（触发失败）→ 看 lastError 与 brewFailed 站。</p>
      ) : null}
      {last ? (
        <div className="space-y-3 text-sm">
          {last.checkpoint ? (
            <div className="border border-gray-300 bg-white rounded p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-600">当前停在哪一站</p>
              <p className="text-sm text-gray-800">当前节点（currentNode）：{labelOf((last.checkpoint.state && last.checkpoint.state.currentNode) || (last.state && last.state.currentNode))}</p>
              {last.checkpoint.state ? (
                <p className="text-xs text-gray-700">lastError：<b className={(last.checkpoint.state.lastError || (last.state && last.state.lastError)) ? "text-red-700" : "text-gray-500"}>{(last.checkpoint.state.lastError || (last.state && last.state.lastError)) || "（无）"}</b></p>
              ) : null}
              {last.checkpoint.state ? (
                <p className="text-xs text-gray-700">brewFailOnStep：<b>{String(Boolean(last.checkpoint.state.brewFailOnStep))}</b></p>
              ) : null}
              {last.checkpoint.state ? (
                <p className="text-xs text-gray-600">已完成节点：{(last.checkpoint.state.completedNodes || []).map(labelOf).join(" → ") || "—"}</p>
              ) : null}
              {last.filePath ? (
                <p className="text-xs text-gray-600">检查点文件：{last.filePath}</p>
              ) : null}
            </div>
          ) : null}
          <div className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 text-xs">
            <p className="font-semibold text-yellow-900">节点失败 ≠ 进程被杀掉（这一格教学点）</p>
            <p>走完 brewHot 节点函数时，brewFailOnStep 标志是 true，节点写 lastError、路由沿 fail 边走 brewFailed。**进程还在**，内存表里这件任务运行还在，磁盘上有一份新检查点。</p>
            <p>对照：进程被杀掉是另一回事——进程没了，内存表清空，磁盘上留下最后一份写完整的快照。这两种情况根本不是同一件事。</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

window.DemoUI.NodeFailBoard = Board;
