/**
 * 职责：历史数据——这一趟每一步留下的读/写卡片，只追加不改旧卡。
 * 数据流：App 维护 history 数组；当前数据始终是最新快照，点旧卡不时光倒流。
 * 为什么单独成文件：历史是「曾经发生过的转移」，不要和当前 JSON 混成一块。
 */
window.DemoUI = window.DemoUI || {};

function HistoryList(props) {
  const items = props.items || [];
  if (items.length === 0) {
    return <div className="text-xs text-gray-500">还没有历史。每走一步这里多一张卡片。</div>;
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-800">历史数据（只追加）</div>
      <div className="space-y-2 max-h-56 overflow-auto">
        {items.map(function (item, index) {
          return (
            <div key={index} className="border border-gray-200 rounded p-2 text-xs bg-white">
              <div className="font-medium text-gray-800">{item.title}</div>
              {item.detail ? <div className="text-gray-600 mt-1">{item.detail}</div> : null}
              {item.read ? (
                <pre className="whitespace-pre-wrap mt-1 bg-gray-50 p-1 rounded max-h-16 overflow-auto">
                  读 {JSON.stringify(item.read)}
                </pre>
              ) : null}
              {item.wrote ? (
                <pre className="whitespace-pre-wrap mt-1 bg-gray-50 p-1 rounded max-h-16 overflow-auto">
                  写 {JSON.stringify(item.wrote)}
                </pre>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.DemoUI.HistoryList = HistoryList;
