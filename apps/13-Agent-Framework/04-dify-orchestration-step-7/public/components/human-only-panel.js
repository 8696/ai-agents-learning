/**
 * 职责：左栏「仅人工方块」面板 —— 展示「等点头 + 调扣款」流程 + **没** checkpoint + **没** idempotency 的对照点。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：「人工方块」≠ 检查点 + idempotency —— 进程杀掉后重启 = 重复扣款。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function StepsView(props) {
  const steps = props.steps || [];
  if (steps.length === 0) {
    return html`<div className="text-xs text-gray-500 italic">（还没跑）</div>`;
  }
  return html`
    <ol className="space-y-1">
      ${steps.map(function (s, i) {
        return html`<li key=${i} className="text-xs text-gray-700 whitespace-pre-wrap">${s}</li>`;
      })}
    </ol>
  `;
}

export function HumanOnlyPanel(props) {
  const r = props.result;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-red-300 bg-red-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-red-900">左栏 · 仅人工方块</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-red-100 text-red-800 border-red-300">
          没写 checkpoint + 没做 idempotency
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/human-only，体 = {"{ refundRequestId, amount, killAt }"}；服务端跑 <code>runHumanApprovalOnly</code> —— 等人工点头 + 调扣款（**不写 checkpoint**，**不检查 idempotency_key**）。
      </div>

      ${r ? html`
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">本次实际扣款次数（chargedTimes）</div>
            <div className=${"text-lg " + (r.chargedTimes > 1 ? "text-red-700" : "text-gray-700")}>${r.chargedTimes}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">checkpoint 是否持久化</div>
            <div className=${"text-base " + (r.checkpointPersisted ? "text-emerald-700" : "text-red-700")}>${r.checkpointPersisted ? "✅ 是" : "❌ 否"}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="font-semibold text-gray-700">idempotency_key 去重</div>
            <div className=${"text-base " + (r.idempotencyApplied ? "text-emerald-700" : "text-red-700")}>${r.idempotencyApplied ? "✅ 是" : "❌ 否"}</div>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-1">流程步骤（步骤）</div>
          <${StepsView} steps=${r.steps} />
        </div>
        <div className="bg-white border border-gray-200 rounded p-2 text-xs">
          <div className="font-semibold text-gray-700">判据（note）</div>
          <div className="text-gray-700">${r.note}</div>
        </div>
      ` : html`<div className="text-xs text-gray-500 italic">（点按钮跑完才有结果）</div>`}

      <div className="border-2 border-dashed border-red-400 bg-red-100 rounded p-2 text-xs text-red-900">
        「等点头」方块（产品界面）≠ 检查点 + idempotency。kill 阶段模拟 before-charge 时，本栏会**重复扣款**（chargedTimes=2）。
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onSubmit}>
          跑（POST /api/human-only）
        </button>
        <button className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50" disabled={props.busy} onClick={props.onReset}>
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`<div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">${props.errorText}</div>` : null}
    </section>
  `;
}