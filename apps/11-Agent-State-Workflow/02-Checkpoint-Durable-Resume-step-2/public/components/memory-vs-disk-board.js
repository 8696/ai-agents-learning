/**
 * 职责：内存 vs 磁盘对照这一页的输出板——左「in-memory」+ 右「on-disk」并排；实时显示 inMemory + 磁盘上是否有文件。
 * 数据流：App 把左右最近一次响应 + 轮询的 memory 状态传进来。
 * 为什么单独成文件：对照只在这一页。
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
  const mem = props.memory;
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
      {state ? <p className="text-gray-800">当前节点：{labelOf(state.currentNode)}</p> : null}
      {state ? <p className="text-gray-800">余额：{String(state.cardBalance)} 元</p> : null}
      {mem ? (
        <>
          <p className="text-gray-700">内存里有这件任务运行：<b>{String(Boolean(mem.inMemory))}</b></p>
          <p className="text-gray-700">磁盘上是否还有检查点：<b>{String(mem.checkpoint ? "有" : "没有")}</b></p>
        </>
      ) : null}
      {last.filePath ? <p className="text-gray-600">检查点文件：{last.filePath}</p> : null}
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
        <SideCard title="只放内存（左）" last={props.leftLast} memory={props.leftMemory} />
        <SideCard title="真写磁盘（右）" last={props.rightLast} memory={props.rightMemory} />
      </div>
    </div>
  );
}

window.DemoUI.MemoryVsDiskBoard = Board;
