/**
 * 职责：三段流水线可视化（编排者 fan-out → N 个菜单员并行 → 汇总者 fan-in）+ 每段耗时。
 * 数据流：吃 props.out（OrchestratorOutput）+ props.busy + props.errorText；渲染三段卡片 + 每段耗时。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function fmtMs(n) {
  if (typeof n !== "number") return "—";
  return n + " ms";
}

export function OrchestratorPanel(props) {
  const out = props.out;
  const errorText = props.errorText;

  if (errorText) {
    return html`
      <section className="border-2 rounded p-4 space-y-3 border-red-300 bg-red-50">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-red-900">流水线报错</h2>
          <span className="text-xs px-2 py-0.5 rounded border font-semibold bg-red-100 text-red-800 border-red-300">
            catch 已接住
          </span>
        </div>
        <div className="text-sm text-red-900 whitespace-pre-wrap">${errorText}</div>
      </section>
    `;
  }

  if (!out) {
    return html`
      <section className="bg-white shadow rounded p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">流水线（编排者 → N 个菜单员 → 汇总者）</h2>
        <div className="text-xs text-gray-500 italic">还没跑。点「运行编排者」看三段 + 总耗时。</div>
      </section>
    `;
  }

  const tasks = out.stages.orchestrator.tasks || [];
  const workers = out.stages.workers || [];
  const maxWorker = workers.reduce((m, w) => Math.max(m, w.elapsedMs), 0);
  const sumWorker = workers.reduce((s, w) => s + w.elapsedMs, 0);

  return html`
    <section className="bg-white shadow rounded p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">流水线（编排者 → N 个菜单员 → 汇总者）</h2>
        <span className="text-xs px-2 py-0.5 rounded border bg-blue-100 text-blue-800 border-blue-300 font-semibold">
          总耗时 ${fmtMs(out.totalElapsedMs)}
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="px-2 py-0.5 rounded font-semibold bg-gray-200 text-gray-700">① 编排者</span>
          <span>拆出 ${tasks.length} 个子任务 · 耗时 ${fmtMs(out.stages.orchestrator.elapsedMs)}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded p-2 text-sm">
          <div className="text-xs text-gray-500 mb-1">编排者说：${out.stages.orchestrator.reasoning}</div>
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            ${tasks.map(function (t, i) {
              return html`<li key=${i}><span className="font-mono text-xs">drink = ${t.drink}</span></li>`;
            })}
          </ol>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="px-2 py-0.5 rounded font-semibold bg-gray-200 text-gray-700">② ${workers.length} 个菜单员并行</span>
          <span>max = ${fmtMs(maxWorker)} · sum = ${fmtMs(sumWorker)}（节省 ${fmtMs(Math.max(0, sumWorker - maxWorker))}）</span>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          ${workers.map(function (w) {
            const pct = maxWorker > 0 ? Math.round((w.elapsedMs / maxWorker) * 100) : 0;
            return html`
              <li key=${w.drink} className="border rounded p-2 space-y-1 bg-white">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono">${w.drink}</span>
                  <span className=${w.available ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                    ${w.available ? "能做" : "不能做"}
                  </span>
                </div>
                <div className="text-xs text-gray-500">${w.note}</div>
                <div className="w-full bg-gray-200 rounded h-2 overflow-hidden">
                  <div className="bg-blue-500 h-2" style=${{ width: pct + "%" }}></div>
                </div>
                <div className="text-xs text-gray-400 text-right">${fmtMs(w.elapsedMs)}</div>
              </li>
            `;
          })}
        </ul>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="px-2 py-0.5 rounded font-semibold bg-gray-200 text-gray-700">③ 汇总者</span>
          <span>耗时 ${fmtMs(out.stages.aggregator.elapsedMs)}</span>
        </div>
        <div className="bg-green-50 border border-green-300 rounded p-3 text-sm text-gray-800 whitespace-pre-wrap">
          ${out.stages.aggregator.guestReply}
        </div>
        <div className="text-xs text-gray-500">汇总者说：${out.stages.aggregator.reasoning}</div>
      </div>
    </section>
  `;
}
