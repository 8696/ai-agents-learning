/**
 * 职责：图版本失败可见这一页的输出板——显示最近一次读检查点的结果：成功 → 看到 graphVersion 一致；失败 → 看到 GRAPH_VERSION_MISMATCH 与两个版本号。
 * 数据流：App 传最后一次结果进来。
 * 为什么单独成文件：变体 J 的对照只在这一页。
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

function Board(props) {
  return (
    <div className="min-h-[200px] space-y-3">
      {props.error ? (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm rounded p-3">
          <div className="font-semibold">失败（HTTP {props.error.status || "—"} · {props.error.code || "无编号"}）</div>
          <div>{props.error.message}</div>
          {props.error.checkpointGraphVersion ? (
            <p className="mt-1 text-xs text-red-700">
              磁盘上检查点 graphVersion = <b>{props.error.checkpointGraphVersion}</b>
            </p>
          ) : null}
          {props.error.currentGraphVersion ? (
            <p className="text-xs text-red-700">
              进程内 currentGraphVersion = <b>{props.error.currentGraphVersion}</b>
            </p>
          ) : null}
        </div>
      ) : null}
      {!props.last && !props.error ? (
        <p className="text-sm text-gray-500">
          还没有请求。流程:开件 → 走一步(写盘带 graphVersion = v1)→ 切到 v2 → 读一次检查点 → 看到 GRAPH_VERSION_MISMATCH。
        </p>
      ) : null}
      {props.last && props.last.checkpoint ? (
        <div className="bg-green-50 border border-green-300 rounded p-3 space-y-1 text-xs">
          <p className="font-semibold text-green-900">读回成功</p>
          <p>runId：{props.last.checkpoint.runId}</p>
          <p>currentNode：{labelOf(props.last.checkpoint.currentNode)}</p>
          <p>writtenAt：{props.last.checkpoint.writtenAt}</p>
          <p>graphVersion：<b>{props.last.checkpoint.graphVersion || "（旧检查点无 graphVersion 字段）"}</b></p>
          {props.last.checkpoint.fellBackTo ? (
            <p className="text-orange-700">主文件 parse 失败,回退到：{props.last.checkpoint.fellBackTo}</p>
          ) : null}
        </div>
      ) : null}
      {props.last && props.last.graphVersion && !props.last.checkpoint ? (
        <div className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 text-xs">
          <p className="font-semibold text-yellow-900">切图版本结果</p>
          <p>当前进程 graphVersion = <b>{props.last.graphVersion}</b></p>
        </div>
      ) : null}
    </div>
  );
}

window.DemoUI.GraphVersionBoard = Board;
