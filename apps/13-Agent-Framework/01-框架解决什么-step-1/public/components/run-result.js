/**
 * 职责：把一次循环结果拆成「请求参数 / 调用流程 / 响应结果」三块卡片。
 * 数据流：props.result → 是否有 while、调了几次模型、make_latte 次数、每一圈、最终对客人说的话。
 *
 * 加载方式：本文件没有 JSX，是合法 ESM。
 */
import React from "react";

export function RunResult(props) {
  const result = props.result;
  const request = props.request;
  if (!result && !request) {
    return React.createElement(
      "p",
      { className: "text-sm text-gray-500" },
      "还没跑。点上面的按钮后，这里会出现请求参数、每一圈、最终回复。"
    );
  }

  const children = [];

  if (request) {
    children.push(
      React.createElement(
        "div",
        { key: "req", className: "bg-gray-50 border border-gray-200 rounded p-3" },
        React.createElement(
          "div",
          { className: "text-xs font-semibold text-gray-700" },
          "请求参数（Request）"
        ),
        React.createElement(
          "pre",
          { className: "text-xs text-gray-700 whitespace-pre-wrap mt-1 max-h-32 overflow-auto" },
          JSON.stringify(request, null, 2)
        )
      )
    );
  }

  if (result) {
    const roundChildren = (result.rounds || []).map(function (round) {
      const inner = [
        React.createElement(
          "div",
          { key: "fr", className: "text-xs text-gray-500" },
          "第 " + round.round + " 圈 · finish_reason=" + (round.finishReason || "（无）")
        ),
        React.createElement(
          "div",
          { key: "tc", className: "text-xs text-gray-700" },
          "工具调用（tool_calls）：" + round.toolCallCount +
            " · 名字：" + ((round.toolNames || []).join(", ") || "（无）")
        ),
      ];
      if (round.assistantPreview) {
        inner.push(
          React.createElement(
            "pre",
            { key: "ap", className: "text-xs text-gray-600 whitespace-pre-wrap mt-1 max-h-24 overflow-auto" },
            round.assistantPreview
          )
        );
      }
      return React.createElement(
        "div",
        { key: "r" + round.round, className: "border border-gray-200 rounded p-2" },
        inner
      );
    });

    children.push(
      React.createElement(
        "div",
        { key: "traj", className: "border border-gray-300 bg-white rounded p-3 space-y-2" },
        React.createElement(
          "div",
          { className: "text-xs font-semibold text-gray-700" },
          "调用流程（Trajectory）"
        ),
        React.createElement(
          "p",
          { className: "text-xs text-gray-600" },
          "业务代码里有没有 while：",
          React.createElement(
            "b",
            null,
            result.hasWhileInBusinessCode ? "有（手写）" : "没有（藏在库里）"
          ),
          " · 模型调用次数（modelCallCount）：" + result.modelCallCount,
          " · 执行 make_latte 次数（toolExecutedCount）：" + result.toolExecutedCount,
          " · 停止原因（stoppedReason）：" + result.stoppedReason,
          result.frameworkPackage ? " · 框架包：" + result.frameworkPackage : ""
        ),
        roundChildren
      )
    );

    children.push(
      React.createElement(
        "div",
        { key: "final", className: "bg-green-50 border border-green-300 rounded p-3" },
        React.createElement(
          "div",
          { className: "text-xs font-semibold text-green-900" },
          "响应结果 · 对客人说的话（finalAnswer）"
        ),
        React.createElement(
          "pre",
          { className: "text-sm text-gray-800 whitespace-pre-wrap mt-1 max-h-40 overflow-auto" },
          result.finalAnswer || "（模型没给出正文）"
        ),
        React.createElement(
          "div",
          { className: "text-xs text-gray-500 mt-1" },
          "耗时 " + result.elapsedMs + " ms"
        )
      )
    );
  }

  return React.createElement("div", { className: "space-y-3" }, children);
}