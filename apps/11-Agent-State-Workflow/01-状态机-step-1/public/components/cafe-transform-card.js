/**
 * 职责：刚刚这一步的数据转换——从哪到哪、读了什么、写了什么。
 * 数据流：step 接口返回的 transition；建订单时显示入口快照。
 * 为什么单独成文件：转换卡只讲「这一步差在哪」，不和整份当前数据抢位置。
 */
window.DemoUI = window.DemoUI || {};

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function TransformCard(props) {
  const lastCall = props.lastCall;
  const transition = props.transition;
  const created = props.created;
  if (!lastCall && !transition && !created) {
    return <div className="text-xs text-gray-500">还没有发生转移。下单或点「走一步」后，这里只显示刚刚那一次。</div>;
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-800">数据转换（这一步）</div>
      {lastCall ? (
        <div className="bg-gray-50 text-gray-700 rounded p-2 text-xs space-y-1">
          <div>请求参数：{lastCall.method} {lastCall.url}</div>
          <pre className="whitespace-pre-wrap max-h-24 overflow-auto">{pretty(lastCall.request)}</pre>
        </div>
      ) : null}
      {created ? (
        <div className="border border-gray-300 bg-white rounded p-2 text-xs space-y-1">
          <div>订单创建（还不是一次状态转移）</div>
          <div>当前节点（currentNode）停在 {created.state.currentNode}</div>
          <div>读了饮品名（drinkName），其它业务字段仍是 null</div>
        </div>
      ) : null}
      {transition ? (
        <div className="border border-gray-300 bg-white rounded p-2 text-xs space-y-2">
          <div>
            {transition.from} —{transition.condition}→ {transition.to}
          </div>
          <div>
            <div className="text-gray-500">读了</div>
            <pre className="whitespace-pre-wrap max-h-24 overflow-auto bg-gray-50 p-1 rounded">{pretty(transition.read)}</pre>
          </div>
          <div>
            <div className="text-gray-500">写了</div>
            <pre className="whitespace-pre-wrap max-h-24 overflow-auto bg-gray-50 p-1 rounded">{pretty(transition.wrote)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

window.DemoUI.TransformCard = TransformCard;
