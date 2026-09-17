/**
 * 职责：左边用户聊天。只展示问句、处理中提示、最终回复。
 * 数据流：发送触发 onSend；完成站把 replyDraft 画成绿色助手气泡。
 * 为什么单独成文件：用户视角不要堆 JSON，处理台在右边。
 */
window.DemoUI = window.DemoUI || {};

function ChatPane(props) {
  const locked = props.locked;
  const loading = props.loading;
  return (
    <div className="flex flex-col min-h-[420px]">
      <div className="text-sm font-semibold text-gray-900">用户这边</div>
      <p className="text-xs text-gray-500 mt-1">
        点「发送」会发出 POST /api/faq/start。期望：出现你的气泡，下面一行小字告诉你处理到哪一站；三次走一步之后才出现绿色回复。
      </p>
      <div className="flex-1 mt-3 space-y-2 overflow-auto">
        {props.messages.length === 0 ? (
          <div className="text-xs text-gray-400">还没有问句。像找客服一样先问一句。</div>
        ) : null}
        {props.messages.map(function (msg, index) {
          const isUser = msg.role === "user";
          const box = isUser
            ? "bg-gray-50 text-gray-700 ml-8"
            : "bg-green-50 border border-green-300 text-gray-800 mr-8";
          const who = isUser ? "用户（user）" : "助手（assistant）";
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
          问句（userQuestion）
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
        <button
          type="button"
          className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded disabled:opacity-50"
          disabled={loading || locked}
          onClick={props.onSend}
        >
          发送（建立工单，停在入口）
        </button>
        <button
          type="button"
          className="ml-2 border border-gray-300 text-sm px-3 py-1.5 rounded disabled:opacity-50"
          disabled={loading}
          onClick={props.onReset}
        >
          再问一次（两边一起清空）
        </button>
      </div>
    </div>
  );
}

window.DemoUI.ChatPane = ChatPane;
