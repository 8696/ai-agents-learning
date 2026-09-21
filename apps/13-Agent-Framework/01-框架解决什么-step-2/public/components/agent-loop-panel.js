/**
 * 职责：工具调用循环页的轨迹卡组件。两栏共享：左边 mode=default、右边 mode=stopWhen3，
 *   同一份代码渲染「耗时 / 轨迹卡 / reasoning 段 / 模型最终回答 / 错误」五块。
 *
 * 数据流：props.panel = { steps, finalText, reasoning, error, elapsedMs, done }。
 *   props.title 是栏目标题。
 *
 * 加载方式：本文件用 HTM 写（`html\`...\`` 是 tagged template literal），
 *   浏览器原生执行，不需要 Babel 转译；
 *   agent-loop.html 里以 <script type="module" src=...> 加载即可。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

function renderStepCard(s, stepIndex) {
  if (s.kind === "step-start") {
    return html`
      <div>
        <div className="text-xs font-semibold text-blue-700">▶ 第 ${stepIndex} 步 · 模型开始回答</div>
        <pre className="text-xs text-gray-700 whitespace-pre-wrap mt-1">${JSON.stringify(s.data, null, 2)}</pre>
      </div>
    `;
  }
  if (s.kind === "tool-call") {
    return html`
      <div>
        <div className="text-xs font-semibold text-purple-700">
          🔧 第 ${stepIndex} 步 · 模型决定调工具 · ${s.data.toolName || "（未知工具名）"}
        </div>
        <pre className="text-xs text-gray-700 whitespace-pre-wrap mt-1">入参：${JSON.stringify(s.data.input, null, 2)}</pre>
      </div>
    `;
  }
  if (s.kind === "tool-result") {
    return html`
      <div>
        <div className="text-xs font-semibold text-green-700">✅ 第 ${stepIndex} 步 · 工具返回</div>
        <pre className="text-xs text-gray-700 whitespace-pre-wrap mt-1">返回值：${JSON.stringify(s.data.output, null, 2)}</pre>
      </div>
    `;
  }
  if (s.kind === "step-finish") {
    return html`
      <div>
        <div className="text-xs font-semibold text-gray-700">■ 第 ${stepIndex} 步结束</div>
        <pre className="text-xs text-gray-600 whitespace-pre-wrap mt-1">${JSON.stringify(s.data, null, 2)}</pre>
      </div>
    `;
  }
  return html`<pre className="text-xs text-gray-700">${JSON.stringify(s, null, 2)}</pre>`;
}

export function AgentLoopPanel(props) {
  const panel = props.panel;
  return html`
    <div className="bg-white shadow rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-700">${props.title}</div>
        <div className="text-xs text-gray-500">
          ${panel.elapsedMs == null ? "—" : "耗时 " + panel.elapsedMs + " ms"}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-gray-700 mb-1">调用流程（轨迹卡 · 按时间序）</div>
        ${panel.steps.length === 0
          ? html`<p className="text-xs text-gray-500">（未跑 / 模型没有产生工具调用）</p>`
          : html`
              <ol className="text-xs space-y-2 list-none">
                ${panel.steps.map(function (s, i) {
                  const stepIndex = panel.steps.slice(0, i + 1).filter(function (x) {
                    return x.kind === "step-start";
                  }).length;
                  return html`
                    <li key=${i} className="border border-gray-200 rounded p-2 bg-gray-50">
                      ${renderStepCard(s, stepIndex)}
                    </li>
                  `;
                })}
              </ol>
            `}
      </div>
      ${panel.reasoning
        ? html`
            <details className="border border-yellow-300 rounded p-2 bg-yellow-50">
              <summary className="text-xs font-semibold text-yellow-900 cursor-pointer">
                思考（reasoning 段）· ${panel.reasoning.length} 字
              </summary>
              <pre className="text-xs text-gray-800 whitespace-pre-wrap mt-1 max-h-[240px] overflow-auto">
                ${panel.reasoning}
              </pre>
            </details>
          `
        : null}
      <div className="border border-gray-300 rounded p-2 bg-white">
        <div className="text-xs font-semibold text-gray-700">
          模型最终回答（text 段）· ${panel.finalText.length} 字
        </div>
        <pre className="text-xs text-gray-800 whitespace-pre-wrap mt-1 max-h-[240px] overflow-auto">
          ${panel.finalText || "（未跑 / 模型没出 text）"}
        </pre>
      </div>
      ${panel.error ? html`<p className="text-sm text-red-700">${panel.error}</p>` : null}
    </div>
  `;
}