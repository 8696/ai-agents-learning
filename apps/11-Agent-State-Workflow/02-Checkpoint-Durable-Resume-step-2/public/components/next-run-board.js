/**
 * 职责：终态开新业务这一页的输出板——左右并排「上一件 / 下一件」的 currentNode / cardBalance / filePath / parentRunId。
 * 数据流：App 把最近一次响应传进来；空态有文案。
 * 为什么单独成文件：变体 F · 做法 1/2 的对照只在这一页。
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
};

function labelOf(node) {
  return NODE_LABELS[node] || node || "—";
}

function SideCard(props) {
  const last = props.last;
  if (!last) {
    return (
      <div className="border border-gray-200 rounded p-3 bg-white text-xs text-gray-500">
        {props.title} 还没有请求。
      </div>
    );
  }
  const snap = last.checkpoint || null;
  const state = (snap && snap.state) || last.state || null;
  return (
    <div className="border border-gray-300 rounded p-3 bg-white space-y-1 text-xs">
      <p className="text-sm font-semibold text-gray-800">{props.title}</p>
      <p className="text-gray-700">runId：{last.runId || "—"}</p>
      {last.parentRunId ? <p className="text-gray-700">parentRunId：{last.parentRunId}</p> : null}
      {state ? <p className="text-gray-800">当前节点（currentNode）：{labelOf(state.currentNode)}</p> : null}
      {state ? <p className="text-gray-800">余额（cardBalance）：{String(state.cardBalance)} 元</p> : null}
      {state ? <p className="text-gray-800">已完成节点：{(state.completedNodes || []).map(labelOf).join(" → ") || "—"}</p> : null}
      {last.filePath ? <p className="text-gray-600">检查点文件：{last.filePath}</p> : null}
      {last.checkpointOnDisk === false ? <p className="text-gray-600">磁盘上还没有文件（checkpointOnDisk = false）</p> : null}
    </div>
  );
}

function Board(props) {
  return (
    <div className="min-h-[200px] space-y-3">
      {props.error ? (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm rounded p-3">
          <div className="font-semibold">失败（HTTP {props.error.status || "—"} · {props.error.code || "无编号"}）</div>
          <div>{props.error.message}</div>
        </div>
      ) : null}
      <div className="grid md:grid-cols-2 gap-3">
        <SideCard title="上一件（左 · 第一件）" last={props.firstLast} />
        <SideCard title="下一件（右 · 第二件）" last={props.nextLast} />
      </div>
    </div>
  );
}

window.DemoUI.NextRunBoard = Board;
