/**
 * 职责：快照历史这一页的输出板——history 列表 + 「引擎只加载最新完整份」+ 「重放会再进扣款节点」警告。
 * 数据流：App 传入最近一次 history 响应；空态有文案。
 * 为什么单独成文件：history 表格 + 教学警告只在这一页出现。
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
        {broken ? (
          <span className="text-red-700">损坏：{item.parseError || "无法解析"}</span>
        ) : (
          <span className="text-green-700">完整</span>
        )}
      </td>
    </tr>
  );
}

function Board(props) {
  const last = props.last;
  return (
    <div className="min-h-[200px] space-y-4">
      {props.error ? (
        <div className="bg-red-50 border border-red-300 text-red-800 text-sm rounded p-3">
          <div className="font-semibold">失败（HTTP {props.error.status || "—"} · {props.error.code || "无编号"}）</div>
          <div>{props.error.message}</div>
        </div>
      ) : null}

      {!last && !props.error ? (
        <p className="text-sm text-gray-500">
          还没有历史。先开始任务运行 → 走一步（保留历史副本）→ 读一次历史。这里会出现按 step 编号排序的全部检查点。
        </p>
      ) : null}

      {last ? (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-gray-700">
            任务运行编号（runId）：{last.runId || "—"}
            {" · "}
            历史目录：<code className="text-xs">{last.historyDir || "—"}</code>
            {" · "}
            共 {String((last.items || []).length)} 份
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-200 px-2 py-1 text-left text-xs">文件名</th>
                  <th className="border border-gray-200 px-2 py-1 text-left text-xs">写入时刻（writtenAt）</th>
                  <th className="border border-gray-200 px-2 py-1 text-left text-xs">当前节点（currentNode）</th>
                  <th className="border border-gray-200 px-2 py-1 text-right text-xs">已跑完节点数</th>
                  <th className="border border-gray-200 px-2 py-1 text-left text-xs">是否完整</th>
                </tr>
              </thead>
              <tbody>
                {(last.items || []).map(function (item) {
                  return <HistoryRow key={item.fileName} item={item} />;
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1">
            <p className="text-xs font-semibold text-yellow-900">变体 G · 引擎只认最新完整份</p>
            <p className="text-xs text-gray-800">
              调度器恢复时只加载最近一份 JSON.parse 成功的检查点（readCheckpoint 读 data/checkpoints/{last.runId}.json），不会用这份 history 表去跑下一站。history 只是给你看「走到这一步时余额是多少」的时间线。
            </p>
          </div>
          <div className="bg-red-50 border border-red-300 rounded p-3 space-y-1">
            <p className="text-xs font-semibold text-red-900">变体 H · 恢复 vs 重放（不提供真重放按钮）</p>
            <p className="text-xs text-gray-800">
              如果你点「从头再执行一遍」并真的按 step-0000 → step-0001 顺序再走一次，chargeCard 节点会再进一次，支付渠道的调用次数会再加 1。本页不提供这个按钮——只是把这件事写在页面上让你看见它会发生。
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

window.DemoUI.CheckpointHistoryBoard = Board;
