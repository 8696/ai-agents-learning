/**
 * 职责：两单编号隔离这一页的输出板——左右并排两单的当前节点 / 余额 / 已扣金额 / 痕迹 / 文件路径。
 * 数据流：App 把左右两份「最近一次响应」传进来；空态有文案。
 * 为什么单独成文件：两单并排是这一页特有的对照布局。
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
      <p className="text-gray-700">任务运行编号（runId）：{last.runId || "—"}</p>
      {state ? (
        <p className="text-gray-800">
          当前节点（currentNode）：{labelOf(state.currentNode)}
        </p>
      ) : null}
      {state ? (
        <p className="text-gray-800">
          余额（cardBalance）：{String(state.cardBalance)} 元
          {" · "}
          已扣金额（chargedAmount）：{String(state.chargedAmount)} 元
        </p>
      ) : null}
      {state ? (
        <p className="text-gray-800">
          已执行过的工具调用编号（executedToolCallIds）：[
          {(state.executedToolCallIds || []).join(", ") || "—"}]
        </p>
      ) : null}
      {last.filePath ? (
        <p className="text-gray-600">检查点（Checkpoint）文件路径：{last.filePath}</p>
      ) : null}
      {last.inMemory !== undefined ? (
        <p className="text-gray-600">内存里有这件任务运行：{String(Boolean(last.inMemory))}</p>
      ) : null}
    </div>
  );
}

function TwoOrdersBoard(props) {
  return (
    <div className="min-h-[200px] space-y-3">
      {props.error ? (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm rounded p-3">
          <div className="font-semibold">失败（HTTP {props.error.status || "—"} · {props.error.code || "无编号"}）</div>
          <div>{props.error.message}</div>
        </div>
      ) : null}
      <div className="grid md:grid-cols-2 gap-3">
        <SideCard title="张三的拿铁（左）" last={props.leftLast} />
        <SideCard title="李四的美式（右）" last={props.rightLast} />
      </div>
    </div>
  );
}

window.DemoUI.TwoOrdersBoard = TwoOrdersBoard;
