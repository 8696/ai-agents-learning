/**
 * 职责：纯计算 vs 扣款对照这一页的输出板——左 vs 右并排，看 currentNode / 余额 / 支付渠道账本。
 * 数据流：App 把左右最近一次响应 + 轮询的 payment 状态传进来。
 * 为什么单独成文件：变体 M 的对照只在这一页。
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
  const pay = props.payment;
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
      {state ? <p className="text-gray-800">drinkType（识别结果）：{state.drinkType || "—"}</p> : null}
      {state ? <p className="text-gray-800">余额：{String(state.cardBalance)} 元 · 已扣：{String(state.chargedAmount)} 元</p> : null}
      {pay ? (
        <>
          <p className="text-gray-700">支付渠道调用次数：<b>{String(pay.callCount)}</b></p>
          <p className="text-gray-700">真实扣款次数：<b>{String(pay.deductionCount)}</b></p>
          <p className="text-gray-700">最近一次是否命中幂等：{String(Boolean(pay.lastHitIdempotency))}</p>
        </>
      ) : null}
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
        <SideCard title="纯计算（左）" last={props.leftLast} payment={props.leftPayment} />
        <SideCard title="有副作用（右）" last={props.rightLast} payment={props.rightPayment} />
      </div>
    </div>
  );
}

window.DemoUI.PureVsSideEffectBoard = Board;
