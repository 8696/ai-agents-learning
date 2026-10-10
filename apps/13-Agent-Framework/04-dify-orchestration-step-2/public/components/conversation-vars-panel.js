/**
 * 职责：左栏「会话变量」面板 —— 展示产品里的会话变量面板（sessionVars.cupSize / drinkType）+ 两轮对话记录。
 * 数据流：吃 props.result（含 turns + sessionVars），回返渲染。纯展示，不持有状态。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：会话变量 = 产品替你存的字段（重启产品可能丢）；不是模块 10 的记忆（记忆是检索 + 摘要）。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function VarsTable(props) {
  const v = props.sessionVars || {};
  const rows = [
    { key: "cupSize（杯型）", value: v.cupSize },
    { key: "drinkType（冷热）", value: v.drinkType },
    { key: "lastUpdateRound（最后更新轮）", value: v.lastUpdateRound },
  ];
  if (rows.every(function (r) { return r.value === undefined || r.value === null; })) {
    return html`<div className="text-xs text-gray-500 italic">（还没跑；点「跑两轮对话」后看这里）</div>`;
  }
  return html`
    <div className="bg-white border border-gray-200 rounded p-2 space-y-1 text-xs font-mono">
      ${rows.map(function (r) {
        return html`
          <div key=${r.key} className="flex items-center gap-2">
            <span className="text-gray-600">${r.key}</span>
            <span className="text-gray-400">=</span>
            <span className="text-gray-800">${r.value === undefined || r.value === null ? "（未设）" : JSON.stringify(r.value)}</span>
          </div>
        `;
      })}
    </div>
  `;
}

function TurnsList(props) {
  const turns = props.turns || [];
  if (turns.length === 0) {
    return html`<div className="text-xs text-gray-500 italic">（两轮对话记录还没出）</div>`;
  }
  return html`
    <ol className="space-y-2">
      ${turns.map(function (t) {
        const parsedSummary = [
          t.parsed.cupSize ? "杯型 = " + t.parsed.cupSize : null,
          t.parsed.drinkType ? "冷热 = " + t.parsed.drinkType : null,
        ].filter(Boolean).join(" · ") || "（没抽到 cupSize / drinkType）";
        return html`
          <li key=${t.round} className="border border-blue-300 bg-blue-50 rounded p-2 space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-semibold bg-blue-100 text-blue-800">第 ${t.round} 轮</span>
              <span className="text-gray-700">用户：${t.text}</span>
            </div>
            <div className="text-gray-700">助手：${t.reply}</div>
            <div className="text-gray-500 text-xs">本轮解析：${parsedSummary}</div>
          </li>
        `;
      })}
    </ol>
  `;
}

export function ConversationVarsPanel(props) {
  const result = props.result;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-blue-300 bg-blue-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-blue-900">左栏 · 会话变量（产品端）</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-blue-100 text-blue-800 border-blue-300">
          字段在产品服务器里
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/conversation-vars，体 = {"{ text1, text2 }"}；服务端跑两轮对话 + 维护一个 <code>sessionVars</code> 面板；返回 <code>{"{ sessionVars, turns }"}</code>。
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">会话变量面板（product.sessionVars）</div>
        ${result ? html`<${VarsTable} sessionVars=${result.sessionVars} />` : html`<${VarsTable} sessionVars=${{}} />`}
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">两轮对话记录</div>
        ${result ? html`<${TurnsList} turns=${result.turns} />` : html`<${TurnsList} turns=${[]} />`}
      </div>

      <div className="border-2 border-dashed border-red-300 bg-red-50 rounded p-2 text-xs text-red-800">
        这一份面板里的字段归产品替你存 —— 重启产品 / 关掉对话，cupSize 可能丢。模块 10 那套记忆是另一套检索 + 摘要，不在这一格。
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled=${props.busy}
          onClick=${props.onSubmit}
        >
          跑两轮对话（POST /api/conversation-vars）
        </button>
        <button
          className="border border-gray-300 px-4 py-2 rounded disabled:opacity-50"
          disabled=${props.busy}
          onClick=${props.onReset}
        >
          清空这一栏
        </button>
      </div>

      ${props.errorText ? html`
        <div className="border border-red-300 bg-red-50 text-red-800 text-sm rounded p-2">
          ${props.errorText}
        </div>
      ` : null}
    </section>
  `;
}