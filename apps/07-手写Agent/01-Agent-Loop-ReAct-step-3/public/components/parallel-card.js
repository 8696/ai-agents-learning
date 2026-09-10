/**
 * 职责：变体 E 并行对照卡（一圈多个 Act 时出现）。
 * 数据流：result.trajectory 里 toolResults >= 2 的那圈 → max vs sum 耗时。挂 window.DemoUI。
 * 为什么单独成文件：只 step-2/3 用；不要塞进巨型 ui.js。
 */
window.DemoUI = window.DemoUI || {};
window.DemoUI.ParallelCard = function ParallelCard(props) {
  const result = props.result;
  if (!result.trajectory.some((s) => s.toolResults.length >= 2)) return null;

  const peakRound = result.trajectory
    .filter((s) => s.toolResults.length >= 2)
    .reduce((max, s) => s.toolResults.length > max.toolResults.length ? s : max, { toolResults: [] });
  const peakMs = peakRound.toolResults.map((tr) => {
    try {
      const obj = JSON.parse(tr.content);
      return obj.simulatedDelayMs ?? 0;
    } catch (e) {
      return 0;
    }
  });
  const sumMs = peakMs.reduce((s, x) => s + x, 0);
  const maxMs = Math.max(...peakMs, 0);
  const saved = sumMs - maxMs;

  return (
    <div className="border border-blue-300 bg-blue-50 rounded p-3 space-y-2">
      <div className="text-sm font-semibold text-blue-900">
        并行对照（变体 E · 一圈多个 Act · Promise.all）
      </div>
      <div className="text-xs text-gray-700">
        第 <b>{peakRound.round}</b> 圈同一时间调了 <b>{peakRound.toolResults.length}</b> 个 complete_todo，
        每个 handler 模拟外部 API 真实耗时（id 末位种子，50~250ms）。
        下方对照「真并行耗时」= <b>max(各 tool_call)</b> vs 「若串行总耗时」= <b>sum(各 tool_call)</b>。
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="bg-white border border-blue-300 rounded p-2">
          <div className="text-gray-500">各 tool_call 耗时</div>
          <ul className="font-mono">
            {peakRound.toolResults.map((tr, i) => {
              const argsObj = tr.arguments && typeof tr.arguments === "object"
                ? tr.arguments
                : (function () { try { return JSON.parse(tr.arguments || "{}"); } catch (e) { return {}; } })();
              return (
                <li key={tr.tool_call_id}>
                  #{i + 1} {tr.name}({argsObj.id || "?"}): <b>{peakMs[i]}</b> ms
                </li>
              );
            })}
          </ul>
        </div>
        <div className="bg-white border border-blue-300 rounded p-2">
          <div className="text-gray-500">真并行（Promise.all）耗时</div>
          <div className="text-2xl font-bold text-blue-700"><b>{maxMs}</b> ms</div>
          <div className="text-gray-500">= 最慢那一个（不是相加）</div>
        </div>
        <div className="bg-white border border-blue-300 rounded p-2">
          <div className="text-gray-500">若串行（step-1 的 for await）耗时</div>
          <div className="text-2xl font-bold text-gray-700"><b>{sumMs}</b> ms</div>
          <div className="text-gray-500">= 各 tool_call 相加</div>
        </div>
      </div>
      <div className="text-xs text-green-700">
        并行 <b>省了 {saved} ms</b>（{saved > 0 ? "串行 vs 并行差异肉眼可见" : "差异太小看不出并行价值"}）。
        {saved <= 0 ? " 实际生产里 handler 越耗时差距越明显 —— 网络/DB/API 调用 100ms+ 是常态。" : ""}
      </div>
    </div>
  );
};
