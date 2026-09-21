/**
 * 职责：工具调用循环页的轨迹卡组件。两栏共享：左边 mode=default、右边 mode=stopWhen3，
 *   同一份代码渲染「耗时 / 轨迹卡 / reasoning 段 / 模型最终回答 / 错误」五块。
 *
 * 数据流：props.panel = { steps, finalText, reasoning, error, elapsedMs, done }。
 *   props.title 是栏目标题。
 *
 * 加载方式：本文件没有 JSX，全部用 React.createElement，是合法 ESM；
 *   agent-loop.html 里以 <script type="module" src=...> 加载即可。
 */
import React from "react";

function renderStepCard(s, stepIndex) {
  if (s.kind === "step-start") {
    return React.createElement(
      "div",
      null,
      React.createElement("div", { className: "text-xs font-semibold text-blue-700" }, "▶ 第 " + stepIndex + " 步 · 模型开始回答"),
      React.createElement("pre", { className: "text-xs text-gray-700 whitespace-pre-wrap mt-1" }, JSON.stringify(s.data, null, 2))
    );
  }
  if (s.kind === "tool-call") {
    return React.createElement(
      "div",
      null,
      React.createElement(
        "div",
        { className: "text-xs font-semibold text-purple-700" },
        "🔧 第 " + stepIndex + " 步 · 模型决定调工具 · " + (s.data.toolName || "（未知工具名）")
      ),
      React.createElement(
        "pre",
        { className: "text-xs text-gray-700 whitespace-pre-wrap mt-1" },
        "入参：" + JSON.stringify(s.data.input, null, 2)
      )
    );
  }
  if (s.kind === "tool-result") {
    return React.createElement(
      "div",
      null,
      React.createElement("div", { className: "text-xs font-semibold text-green-700" }, "✅ 第 " + stepIndex + " 步 · 工具返回"),
      React.createElement(
        "pre",
        { className: "text-xs text-gray-700 whitespace-pre-wrap mt-1" },
        "返回值：" + JSON.stringify(s.data.output, null, 2)
      )
    );
  }
  if (s.kind === "step-finish") {
    return React.createElement(
      "div",
      null,
      React.createElement("div", { className: "text-xs font-semibold text-gray-700" }, "■ 第 " + stepIndex + " 步结束"),
      React.createElement("pre", { className: "text-xs text-gray-600 whitespace-pre-wrap mt-1" }, JSON.stringify(s.data, null, 2))
    );
  }
  return React.createElement("pre", { className: "text-xs text-gray-700" }, JSON.stringify(s, null, 2));
}

export function AgentLoopPanel(props) {
  const panel = props.panel;
  const title = props.title;
  return React.createElement(
    "div",
    { className: "bg-white shadow rounded p-4 space-y-3" },
    React.createElement(
      "div",
      { className: "flex items-center justify-between" },
      React.createElement("div", { className: "text-xs font-semibold text-gray-700" }, title),
      React.createElement(
        "div",
        { className: "text-xs text-gray-500" },
        panel.elapsedMs == null ? "—" : "耗时 " + panel.elapsedMs + " ms"
      )
    ),
    React.createElement(
      "div",
      null,
      React.createElement("div", { className: "text-xs font-semibold text-gray-700 mb-1" }, "调用流程（轨迹卡 · 按时间序）"),
      panel.steps.length === 0
        ? React.createElement("p", { className: "text-xs text-gray-500" }, "（未跑 / 模型没有产生工具调用）")
        : React.createElement(
            "ol",
            { className: "text-xs space-y-2 list-none" },
            panel.steps.map(function (s, i) {
              const stepIndex = panel.steps.slice(0, i + 1).filter(function (x) {
                return x.kind === "step-start";
              }).length;
              return React.createElement(
                "li",
                { key: i, className: "border border-gray-200 rounded p-2 bg-gray-50" },
                renderStepCard(s, stepIndex)
              );
            })
          )
    ),
    panel.reasoning
      ? React.createElement(
          "details",
          { className: "border border-yellow-300 rounded p-2 bg-yellow-50" },
          React.createElement(
            "summary",
            { className: "text-xs font-semibold text-yellow-900 cursor-pointer" },
            "思考（reasoning 段）· " + panel.reasoning.length + " 字"
          ),
          React.createElement(
            "pre",
            { className: "text-xs text-gray-800 whitespace-pre-wrap mt-1 max-h-[240px] overflow-auto" },
            panel.reasoning
          )
        )
      : null,
    React.createElement(
      "div",
      { className: "border border-gray-300 rounded p-2 bg-white" },
      React.createElement(
        "div",
        { className: "text-xs font-semibold text-gray-700" },
        "模型最终回答（text 段）· " + panel.finalText.length + " 字"
      ),
      React.createElement(
        "pre",
        { className: "text-xs text-gray-800 whitespace-pre-wrap mt-1 max-h-[240px] overflow-auto" },
        panel.finalText || "（未跑 / 模型没出 text）"
      )
    ),
    panel.error ? React.createElement("p", { className: "text-sm text-red-700" }, panel.error) : null
  );
}