/**
 * 职责：半份文件退回这一页的输出板——history 表格（损坏行标红）+ 主文件读回结果（fellBackTo 字段）。
 * 数据流：App 把 history 列表 + 最近一次主检查点读回结果传进来。
 * 为什么单独成文件：变体 I 的对照只在这一页。
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

function HistoryRow(props) {
  const item = props.item;
  const broken = !item.isLatestComplete;
  return (
    <tr className={broken ? "bg-red-50" : ""}>
      <td className="border border-gray-200 px-2 py-1 text-xs">{item.fileName}</td>
      <td className="border border-gray-200 px-2 py-1 text-xs">{item.writtenAt}</td>
      <td className="border border-gray-200 px-2 py-1 text-xs">{labelOf(item.currentNode)}</td>
      <td className="border border-gray-200 px-2 py-1 text-xs text-right">{String(item.completedCount)}</td>
      <td className="border border-gray-200 px-2 py-1 text-xs">
        {broken ? <span className="text-red-700">损坏：{item.parseError || "无法解析"}</span> : <span className="text-green-700">完整</span>}
      </td>
    </tr>
  );
}

function Board(props) {
  return (
    <div className="min-h-[200px] space-y-4">
      {props.error ? (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm rounded p-3">
          <div className="font-semibold">失败（HTTP {props.error.status || "—"} · {props.error.code || "无编号"}）</div>
          <div>{props.error.message}</div>
        </div>
      ) : null}

      {!props.history && !props.checkpoint && !props.error ? (
        <p className="text-sm text-gray-500">
          还没有 history。先开件 → 走一步（保留历史副本，让磁盘上多一份 step-0000.json）→ 走第二步（再写 step-0001.json）→ 「故意写半份」（主文件被截断）→ 读 history / 读最新检查点。
        </p>
      ) : null}

      {props.history ? (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-gray-700">
            runId：{props.history.runId || "—"} · 历史目录：<code className="text-xs">{props.history.historyDir || "—"}</code> · 共 {String((props.history.items || []).length)} 份
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-200 px-2 py-1 text-left text-xs">文件名</th>
                  <th className="border border-gray-200 px-2 py-1 text-left text-xs">写入时刻</th>
                  <th className="border border-gray-200 px-2 py-1 text-left text-xs">当前节点</th>
                  <th className="border border-gray-200 px-2 py-1 text-right text-xs">已跑完节点数</th>
                  <th className="border border-gray-200 px-2 py-1 text-left text-xs">是否完整</th>
                </tr>
              </thead>
              <tbody>
                {(props.history.items || []).map(function (item) { return <HistoryRow key={item.fileName} item={item} />; })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {props.checkpoint ? (
        <div className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 text-xs">
          <p className="font-semibold text-yellow-900">主检查点读回结果</p>
          {props.checkpoint.ok ? (
            <>
              <p>runId：{props.checkpoint.checkpoint.runId}</p>
              <p>currentNode：{labelOf(props.checkpoint.checkpoint.currentNode)}</p>
              <p>writtenAt：{props.checkpoint.checkpoint.writtenAt}</p>
              {props.checkpoint.checkpoint.fellBackTo ? (
                <p className="text-red-700">
                  主文件 parse 失败——回退到了历史副本：<b>{props.checkpoint.checkpoint.fellBackTo}</b>
                </p>
              ) : (
                <p className="text-green-700">主文件本身可解析，无需回退。</p>
              )}
            </>
          ) : (
            <p className="text-red-700">读回失败：{props.checkpoint.error && props.checkpoint.error.message}</p>
          )}
        </div>
      ) : null}

      {props.halfWrite ? (
        <div className="bg-red-50 border border-red-300 rounded p-3 space-y-1 text-xs">
          <p className="font-semibold text-red-900">最近一次「故意写半份」结果</p>
          <p>原长：{String(props.halfWrite.originalLength)} 字节 · 截断后：{String(props.halfWrite.truncatedLength)} 字节</p>
          <p>残片头 60 字：<code className="break-all">{props.halfWrite.truncatedHead}</code></p>
          <p>残片尾 60 字：<code className="break-all">{props.halfWrite.truncatedTail}</code></p>
        </div>
      ) : null}
    </div>
  );
}

window.DemoUI.HalfWrittenBoard = Board;
