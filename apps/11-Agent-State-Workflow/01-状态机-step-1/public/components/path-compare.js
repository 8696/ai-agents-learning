/**
 * 职责：把这一页里下过的几杯路径列在一起，对照「图没变、路径变了」。
 * 数据流：每杯走到完成时 App 追加一条；再点一杯不清这份对照。
 * 为什么单独成文件：对照条不要堆进吧台的当前订单 JSON。
 */
window.DemoUI = window.DemoUI || {};

function PathCompare(props) {
  const items = props.items || [];
  const emptyText = props.emptyText || "还没有对照。走完一杯后，再点一杯下另一杯，路径会留在这里。";
  if (items.length === 0) {
    return (
      <div className="text-xs text-gray-500">{emptyText}</div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-800">路径对照（各自一次请求）</div>
      <p className="text-[11px] text-gray-500">
        同一张图。对照看路径、饮品类型（drinkType）、重试次数（retryCount）、上一次错误（lastError）。
      </p>
      <div className="grid md:grid-cols-2 gap-2">
        {items.map(function (item, index) {
          return (
            <div key={index} className="border border-gray-200 rounded p-2 text-xs bg-white space-y-1">
              <div className="font-medium text-gray-800">第 {index + 1} 杯 · {item.drinkName}</div>
              <div>饮品类型（drinkType）：{item.drinkType || "—"}</div>
              <div>重试次数（retryCount）：{item.retryCount == null ? "—" : item.retryCount}</div>
              {item.lastError ? <div>上一次错误（lastError）：{item.lastError}</div> : null}
              {item.shotReady !== undefined ? <div>浓缩（shotReady）：{item.shotReady || "（空）"}</div> : null}
              {item.milkReady !== undefined ? <div>打奶（milkReady）：{item.milkReady || "（空）"}</div> : null}
              <pre className="whitespace-pre-wrap bg-gray-50 p-1 rounded">{item.path}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.DemoUI.PathCompare = PathCompare;
