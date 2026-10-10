/**
 * 职责：右栏「工作流画布」面板 —— 不调大模型；展示固定节点图 + 变量面板 + 灰显「调度器 / 状态类型 / 边表核对 不在仓库里」。
 * 数据流：吃 props.text + props.busy + props.onSubmit，回返 { nodes, edges, variables, hiddenMechanism }。
 *
 * 加载方式：HTM 写，浏览器原生执行，不需 Babel 转译。
 *
 * 教学点：节点 / 连线 / 变量可见 = 模块 11 的 nodes / edges / state 字段；
 * 调度器 / 状态类型 / 边表核对 = 模块 11 的「走一步 + 边表核对 + reducer 合并」 —— 在产品服务器里，不在仓库。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function CanvasView(props) {
  const nodes = props.nodes || [];
  const edges = props.edges || [];
  // 画一张 ASCII 画布（不调任何渲染库）
  // 节点按 id 排：start → llm → branch → {hot, iced} → end
  return html`
    <div className="bg-gray-50 border border-gray-300 rounded p-3 font-mono text-xs whitespace-pre overflow-x-auto">
        开始（start）
          │
          ▼
        大模型节点（llm）  · 写出 drink_name / drink_type
          │
          ▼
        条件分支（branch） · 读 drink_type
          ├── drink_type=hot ──▶ 回复节点「热饮出品」
          └── drink_type=iced ─▶ 回复节点「冰饮出品」
                                   │
                                   ▼
                                 结束（end）
    </div>
    <div className="text-xs text-gray-500 mt-2">
      节点 ${nodes.length} 个 · 连线 ${edges.length} 条 · 跑这一圈可看节点 / 连线 / 变量，但跑图的代码不在仓库。
    </div>
  `;
}

function VariablesView(props) {
  const vars = props.variables || {};
  return html`
    <div className="bg-white border border-gray-200 rounded p-2 space-y-1 text-xs">
      ${Object.keys(vars).map(function (k) {
        return html`
          <div key=${k} className="flex items-center gap-2">
            <span className="font-mono text-gray-600">${k}</span>
            <span className="text-gray-400">=</span>
            <span className="font-mono text-gray-800">${typeof vars[k] === "string" ? JSON.stringify(vars[k]) : JSON.stringify(vars[k])}</span>
          </div>
        `;
      })}
    </div>
  `;
}

export function WorkflowPanel(props) {
  const result = props.result;
  const hidden = result ? result.hiddenMechanism : null;
  return html`
    <section className="border-2 rounded p-4 space-y-3 border-gray-400 bg-gray-50">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">右栏 · 工作流画布（编排产品）</h2>
        <span className="text-xs px-2 py-1 rounded border font-semibold bg-gray-200 text-gray-700 border-gray-400">
          节点和变量可见
        </span>
      </div>

      <div className="text-xs text-gray-700 bg-white border border-gray-200 rounded p-2">
        <span className="font-semibold">点按钮会发出什么请求：</span>POST /api/workflow，体 = {"{ text }"}；**不调大模型**（§5.3.0 例外：纯协议形状 / UI 渲染层演示），返回固定的节点 / 变量 / 灰显机制。
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">画布（节点 + 连线）</div>
        ${result ? html`<${CanvasView} nodes=${result.nodes} edges=${result.edges} />` : html`<${CanvasView} nodes=${[]} edges=${[]} />`}
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">变量面板（一次运行里活在变量面板里的字段）</div>
        ${result ? html`<${VariablesView} variables=${result.variables} />` : html`<${VariablesView} variables=${{}} />`}
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">
          藏在产品里的机制（模块 11 写过，这里产品替你藏）
        </div>
        ${hidden ? html`
          <ul className="space-y-1 text-xs">
            <li className="border border-dashed border-red-300 bg-red-50 rounded p-2 text-red-800">
              调度器（scheduler）：${hidden.scheduler}
            </li>
            <li className="border border-dashed border-red-300 bg-red-50 rounded p-2 text-red-800">
              状态类型（stateType）：${hidden.stateType}
            </li>
            <li className="border border-dashed border-red-300 bg-red-50 rounded p-2 text-red-800">
              边表核对（edgeTableCheck）：${hidden.edgeTableCheck}
            </li>
          </ul>
        ` : html`<div className="text-xs text-gray-500 italic">（点「画工作流画布」后看这里）</div>`}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="bg-gray-700 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled=${props.busy}
          onClick=${props.onSubmit}
        >
          画工作流画布（POST /api/workflow）
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