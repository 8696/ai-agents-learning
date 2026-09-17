/**
 * 职责：左边顾客柜台。只展示点的那一杯、处理中提示、叫号。
 * 数据流：下单触发 onSend；完成站把 pickupCall 画成绿色店员气泡。chips 由本页传入。
 * 为什么单独成文件：顾客视角不要堆 JSON，吧台在右边。
 */
window.DemoUI = window.DemoUI || {};

function CafeChatPane(props) {
  const locked = props.locked;
  const loading = props.loading;
  const chips = props.chips || [];
  const hint = props.hint || "点「下单」会发出 POST /api/cafe/start。";
  return (
    <div className="flex flex-col min-h-[420px]">
      <div className="text-sm font-semibold text-gray-900">顾客这边</div>
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
      <div className="flex-1 mt-3 space-y-2 overflow-auto">
        {props.messages.length === 0 ? (
          <div className="text-xs text-gray-400">还没有点单。像在咖啡店柜台说一句你要点什么。</div>
        ) : null}
        {props.messages.map(function (msg, index) {
          const isUser = msg.role === "user";
          const box = isUser
            ? "bg-gray-50 text-gray-700 ml-8"
            : "bg-green-50 border border-green-300 text-gray-800 mr-8";
          const who = isUser ? "顾客（customer）" : "店员（barista）";
          return (
            <div key={index} className={"rounded p-2 text-sm " + box}>
              <div className="text-[11px] text-gray-500 mb-1">{who}</div>
              <div className="whitespace-pre-wrap">{msg.text}</div>
            </div>
          );
        })}
        {props.processingHint ? (
          <div className="text-xs text-blue-700">{props.processingHint}</div>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        <label className="text-xs text-gray-600 block">
          你要点什么（drinkName）
          <textarea
            className="mt-1 w-full border rounded p-2 text-sm"
            rows={2}
            value={props.draft}
            disabled={locked || loading}
            onChange={function (event) {
              props.onDraftChange(event.target.value);
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {chips.map(function (name) {
            return (
              <button
                key={name}
                type="button"
                className="border border-gray-300 text-xs px-2 py-1 rounded disabled:opacity-50"
                disabled={locked || loading}
                onClick={function () { props.onDraftChange(name); }}
              >
                填入{name}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded disabled:opacity-50"
          disabled={loading || locked}
          onClick={props.onSend}
        >
          下单（建立订单，停在点单）
        </button>
        <button
          type="button"
          className="ml-2 border border-gray-300 text-sm px-3 py-1.5 rounded disabled:opacity-50"
          disabled={loading}
          onClick={props.onReset}
        >
          再点一杯（当前订单清空，对照留下）
        </button>
      </div>
    </div>
  );
}

window.DemoUI.CafeChatPane = CafeChatPane;
