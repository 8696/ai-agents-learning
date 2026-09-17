/**
 * 职责：输出区——请求参数、调用流程、磁盘检查点；扣款页再加支付渠道账本。
 * 数据流：App 把最近一次请求/响应传进来；空态也有文案。
 * 为什么单独成文件：请求 / 流程 / 结果必须上页，不堆进各 HTML。
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

function PaymentCard(props) {
  const payment = props.payment;
  if (!payment) return null;
  return (
    <div className="bg-orange-50 border border-orange-300 rounded p-2">
      <div className="text-xs font-semibold text-orange-900">响应结果 · 支付渠道账本（payment ledger）</div>
      <p className="mt-1 text-xs text-gray-800">
        幂等键（Idempotency Key）：{payment.idempotencyKey || "—"}
      </p>
      <p className="mt-1 text-xs text-gray-800">
        渠道调用次数（callCount）：{String(payment.callCount)}
        {" · "}
        真实扣款次数（deductionCount）：{String(payment.deductionCount)}
        {" · "}
        最近一次命中幂等：{String(Boolean(payment.lastHitIdempotency))}
      </p>
      <p className="mt-1 text-xs text-gray-800">
        支付渠道账本余额（ledgerBalance）：{String(payment.ledgerBalance)}
      </p>
      <pre className="mt-1 text-xs text-gray-800 whitespace-pre-wrap max-h-40 overflow-auto">
        {JSON.stringify(payment, null, 2)}
      </pre>
    </div>
  );
}

function OutputBoard(props) {
  const last = props.last;
  const err = props.error;
  const snap = last && (last.checkpoint || null);
  const state = (snap && snap.state) || (last && last.state) || null;
  const payment = props.showPayment ? last && last.payment : null;
  const emptyText =
    props.emptyText ||
    "还没有请求。先开始这件任务运行，再走一步，这里会出现请求参数、调用流程和磁盘上的 JSON。";
  return (
    <div className="min-h-[200px] space-y-4">
      {err ? (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm rounded p-3">
          <div className="font-semibold">失败（HTTP {err.status || "—"} · {err.code || "无编号"}）</div>
          <div>{err.message}</div>
        </div>
      ) : null}

      {!last && !err ? <p className="text-sm text-gray-500">{emptyText}</p> : null}

      {last ? (
        <div className="space-y-3 text-sm">
          {state ? (
            <div className="border border-gray-300 bg-white rounded p-2">
              <div className="text-xs font-semibold text-gray-600">当前停在哪一站</div>
              <p className="mt-1 text-sm text-gray-800">
                当前节点（currentNode）：{labelOf(state.currentNode)}
                {state.currentNode === "okEnd" || last.stopped
                  ? " · 已到终止站，不再往下走"
                  : " · 这一站还没开始跑"}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                已经跑完：
                {(state.completedNodes || []).length
                  ? state.completedNodes.map(labelOf).join(" → ")
                  : "还没有跑完任何一站"}
              </p>
              {typeof last.inMemoryAfter === "boolean" || typeof last.inMemory === "boolean" ? (
                <p className="mt-1 text-xs text-gray-600">
                  内存里有没有这一件任务运行：
                  {String(typeof last.inMemoryAfter === "boolean" ? last.inMemoryAfter : last.inMemory)}
                </p>
              ) : null}
            </div>
          ) : null}
          <PaymentCard payment={payment} />
          <div className="bg-gray-50 border border-gray-200 rounded p-2">
            <div className="text-xs font-semibold text-gray-600">请求参数</div>
            <pre className="mt-1 text-xs text-gray-700 whitespace-pre-wrap max-h-32 overflow-auto">
              {JSON.stringify(last.请求参数 || last.request, null, 2)}
            </pre>
          </div>
          <div className="border border-gray-300 bg-white rounded p-2">
            <div className="text-xs font-semibold text-gray-600">调用流程</div>
            <ol className="mt-1 text-xs text-gray-700 list-decimal pl-5 space-y-1">
              {(last.调用流程 || []).map(function (step, index) {
                return <li key={index}>{step}</li>;
              })}
            </ol>
          </div>
          <div className="bg-green-50 border border-green-300 rounded p-2">
            <div className="text-xs font-semibold text-gray-700">响应结果 · 磁盘上的检查点（Checkpoint）</div>
            {last.filePath ? (
              <p className="mt-1 text-xs text-gray-600">文件路径：{last.filePath}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-600">
                磁盘上还没有文件（磁盘上是否已有文件 checkpointOnDisk = {String(last.checkpointOnDisk)}）。
              </p>
            )}
            <pre className="mt-1 text-xs text-gray-800 whitespace-pre-wrap max-h-48 overflow-auto">
              {JSON.stringify(last.checkpoint || last.state, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

window.DemoUI.OutputBoard = OutputBoard;
