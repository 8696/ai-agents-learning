/**
 * 职责：当前整份状态（State），和 TypeScript 类型同结构。
 * 数据流：最新一次 start / step 返回的 state；刚写的字段用列表标出。
 * 为什么单独成文件：当前数据和历史时间线分开，避免一份 JSON 当全部真相。
 */
window.DemoUI = window.DemoUI || {};

function CurrentState(props) {
  const state = props.state;
  const wroteKeys = props.wroteKeys || [];
  if (!state) {
    return <div className="text-xs text-gray-500">还没有当前数据。下单后这里会出现整份状态（State）。</div>;
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-800">当前数据（State 全文）</div>
      {wroteKeys.length > 0 ? (
        <div className="text-[11px] text-blue-800">刚刚写入：{wroteKeys.join("、")}</div>
      ) : (
        <div className="text-[11px] text-gray-500">刚进图：只有 drinkName 有值</div>
      )}
      <pre className="whitespace-pre-wrap text-xs bg-gray-50 text-gray-700 p-2 rounded max-h-48 overflow-auto">
        {JSON.stringify(state, null, 2)}
      </pre>
    </div>
  );
}

window.DemoUI.CurrentState = CurrentState;
