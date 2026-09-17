/**
 * 职责：数据扭转流程——四站流水线 + 边表。当前站高亮。
 * 数据流：graph.stations / graph.edges + currentNode；没有订单时整条发灰。
 * 为什么单独成文件：扭转条就是这一步的图，不另画复杂图。
 */
window.DemoUI = window.DemoUI || {};

function Pipeline(props) {
  const graph = props.graph;
  const current = props.currentNode;
  if (!graph) {
    return (
      <div className="text-xs text-gray-500">
        还没有订单。左边下一杯之后，这里会出现点单，以及热饮制作 / 冰饮制作 / 无法制作。
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-gray-800">数据扭转流程（节点 Node + 边 Edge）</div>
      <div className="flex flex-wrap gap-2 items-stretch">
        {graph.stations.map(function (station, index) {
          const active = station.id === current;
          const cls = active
            ? "border-blue-500 bg-blue-50"
            : "border-gray-200 bg-white";
          return (
            <div key={station.id} className="flex items-stretch gap-2">
              <div className={"border rounded p-2 w-40 " + cls}>
                <div className="text-sm font-medium text-gray-900">{station.label}</div>
                <div className="text-[11px] text-gray-500">{station.id}</div>
                <div className="text-[11px] text-gray-600 mt-1">读：{station.reads.join("、") || "—"}</div>
                <div className="text-[11px] text-gray-600">写：{station.writes.join("、") || "无（终止）"}</div>
              </div>
              {index < graph.stations.length - 1 ? (
                <div className="self-center text-gray-400 text-xs">→</div>
              ) : null}
            </div>
          );
        })}
      </div>
      <table className="w-full text-xs text-left border border-gray-200">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="p-1 border-b">从哪一站</th>
            <th className="p-1 border-b">到哪一站</th>
            <th className="p-1 border-b">条件读哪个字段</th>
          </tr>
        </thead>
        <tbody>
          {graph.edges.map(function (edge) {
            const on = edge.from === current;
            return (
              <tr key={edge.from + "-" + edge.to} className={on ? "bg-blue-50" : ""}>
                <td className="p-1 border-b">{edge.from}</td>
                <td className="p-1 border-b">{edge.to}</td>
                <td className="p-1 border-b">{edge.readsField || edge.condition}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {graph.parallelArms ? (
        <p className="text-[11px] text-gray-500">
          分流站一次跑两条臂：出浓缩只写 shotReady，打奶只写 milkReady。两边都写回才去组装。点单必须先做完，打奶要读订单条。
        </p>
      ) : (
        <p className="text-[11px] text-gray-500">制作站有回边：杯盖空且次数未满，下一站还是自己。满 3 次才走失败终止。这不是再开一轮 Agent 循环。</p>
      )}
    </div>
  );
}

window.DemoUI.Pipeline = Pipeline;
