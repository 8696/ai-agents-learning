/**
 * 职责：声明期五步。先用工位图把路摊开，再把每一步的「干什么」和源代码对着放。
 * 数据流：props.steps + props.edges；本组件不跑图。
 */
import React from "react";
import htm from "https://esm.sh/htm";
import { FlowPipeline } from "./flow-pipeline.js";
import { SourceBlock } from "./source-block.js";

const html = htm.bind(React.createElement);

const STEP_GOAL = {
  state: "先规定这一单的夹子上有哪四格。",
  nodes: "登记三个工位。每个工位只改自己那一格。",
  edges: "把箭头画死。运行时不再问 if。",
  compile: "检查这张图能不能跑。一滴咖啡都还没做。",
  run: "真正按箭头走。这件事要等你点按钮。",
};

export function DeclarationList(props) {
  const steps = props.steps || [];
  const edges = props.edges || [];
  if (steps.length === 0) {
    return html`<p className="text-sm text-gray-500">声明步骤还没加载。刷新页面会重新请求 GET /api/linear-graph。</p>`;
  }
  return html`
    <div className="space-y-3">
      <${FlowPipeline}
        doneNodes=${[]}
        caption="灰框 = 路已经画好，一站都还没走。点下面的按钮之后，下半页会按这个箭头一格一格变绿。"
      />
      <p className="text-xs text-gray-600">下面五步是「把这张图画出来」的顺序。还没点按钮时，一行业务都没跑。</p>
      ${steps.map(function (step) {
        return html`
          <${SourceBlock}
            key=${step.id}
            title=${step.title}
            why=${(STEP_GOAL[step.id] ? STEP_GOAL[step.id] + " " : "") + step.why}
            code=${step.code}
          />
        `;
      })}
      <div className="border border-gray-300 rounded p-3 bg-white space-y-2">
        <div className="text-sm font-semibold text-gray-900">四条固定边（Edge）· 运行时不再另选路</div>
        <ol className="text-xs text-gray-700 list-decimal pl-5 space-y-1">
          ${edges.map(function (edge, i) {
            return html`
              <li key=${i}>
                <span className="font-mono">${edge.from}</span>
                ${" → "}
                <span className="font-mono">${edge.to}</span>
                ${" · "}
                ${edge.why}
              </li>
            `;
          })}
        </ol>
      </div>
    </div>
  `;
}
