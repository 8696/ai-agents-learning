/**
 * 职责：每轮轨迹卡 —— 显示「这一轮店长选了谁 + 为什么 / 工人写了什么字段 / 新状态摘要」。
 * 数据流：吃 props.entries（RunOneStepOutput 数组）+ props.workerLabel；按 round 倒序展示。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const WORKER_LABEL = {
  menu: "菜单工人",
  brew: "吧台工人",
  serve: "出餐工人",
  finish: "结束（FINISH）",
};

function formatPatch(patch) {
  if (!patch) return "（无）";
  const keys = Object.keys(patch);
  if (keys.length === 0) return "（无字段）";
  return keys.map(function (k) {
    return k + " = " + JSON.stringify(patch[k]);
  }).join(" · ");
}

export function RoundTrace(props) {
  const entries = props.entries || [];
  if (entries.length === 0) {
    return html`
      <section className="bg-white shadow rounded p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">轨迹（每轮店长 + 工人）</h2>
        <div className="text-xs text-gray-500 italic">还没有轮次。点「下一步」看第一轮。</div>
      </section>
    `;
  }
  return html`
    <section className="bg-white shadow rounded p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">轨迹（每轮店长 + 工人 · 共 ${entries.length} 轮）</h2>
      <ol className="space-y-3 list-none pl-0">
        ${entries.map(function (e) {
          const workerLabel = WORKER_LABEL[e.nextWorker] || e.nextWorker;
          const isFinish = e.nextWorker === "finish";
          return html`
            <li key=${e.round} className=${"border rounded p-3 space-y-2 " + (isFinish ? "border-green-300 bg-green-50" : "border-gray-300 bg-gray-50")}>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded font-semibold bg-gray-200 text-gray-700">round ${e.round}</span>
                <span className=${"px-2 py-0.5 rounded font-semibold " + (isFinish ? "bg-green-200 text-green-900" : "bg-blue-100 text-blue-800")}>
                  店长选 → ${workerLabel}
                </span>
                <span className="text-gray-400 ml-auto">${e.isFinished ? "本轮结束" : "继续"}</span>
              </div>
              <div className="text-sm text-gray-700">
                <span className="text-xs font-semibold text-gray-500">店长说：</span>
                ${e.supervisorReasoning}
              </div>
              ${!isFinish ? html`
                <div className="text-sm text-gray-700">
                  <span className="text-xs font-semibold text-gray-500">${workerLabel}写进状态：</span>
                  <span className="font-mono text-xs">${formatPatch(e.workerPatch)}</span>
                </div>
                <div className="text-xs text-gray-500">
                  <span className="font-semibold">${workerLabel}说：</span>${e.workerReasoning}
                </div>
              ` : null}
            </li>
          `;
        })}
      </ol>
    </section>
  `;
}
