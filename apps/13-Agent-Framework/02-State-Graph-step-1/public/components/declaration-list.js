/**
 * 职责：声明期五步。先用工位图把路摊开，再把每一步的「干什么」和源代码对着放。
 * 数据流：props.steps + props.edges（线性图）/ props.pathMap（条件图）+ props.flowComponent（默认线性 FlowPipeline）。
 * 条件图页传自己的 flowComponent + pathMap，不重写整个组件。
 */
import React from "react";
import htm from "https://esm.sh/htm";
import { FlowPipeline } from "./flow-pipeline.js";
import { SourceBlock } from "./source-block.js";

const html = htm.bind(React.createElement);

const STEP_GOAL_LINEAR = {
  state: "先规定这一单的夹子上有哪四格。",
  nodes: "登记三个工位。每个工位只改自己那一格。",
  edges: "把箭头画死。运行时不再问 if。",
  compile: "检查这张图能不能跑。一滴咖啡都还没做。",
  run: "真正按箭头走。这件事要等你点按钮。",
};

const STEP_GOAL_CONDITIONAL = {
  state: "在四格外多一格 drinkType——路由函数读它决定下一站。",
  nodes: "登记六个工位：点单 / 分类 / 热饮 / 冰饮 / 出餐 / 无法制作。",
  edges: "addConditionalEdges 夹在中间——同一节点出三条候选路；其余固定尾巴照常 addEdge。",
  route: "路由函数返回键；路径映射把键翻成目标节点名。手写版里这就是 pickRoute + EDGES[].condition。",
  compile: "检查这张图能不能跑。条件边的目标必须出现在路径映射里。",
};

export function DeclarationList(props) {
  const steps = props.steps || [];
  const edges = props.edges || [];
  const pathMap = props.pathMap || [];
  const FlowComponent = props.flowComponent || FlowPipeline;
  const caption = props.caption || "灰框 = 路已经画好，一站都还没走。点下面的按钮之后，下半页会按这个箭头一格一格变绿。";
  const goal = props.useConditionalGoal ? STEP_GOAL_CONDITIONAL : STEP_GOAL_LINEAR;
  if (steps.length === 0) {
    return html`<p className="text-sm text-gray-500">声明步骤还没加载。刷新页面会重新请求 GET 接口。</p>`;
  }
  return html`
    <div className="space-y-3">
      <${FlowComponent}
        doneNodes=${[]}
        caption=${caption}
      />
      <p className="text-xs text-gray-600">${props.subCaption || "下面五步是「把这张图画出来」的顺序。还没点按钮时，一行业务都没跑。"}</p>
      ${steps.map(function (step) {
        return html`
          <${SourceBlock}
            key=${step.id}
            title=${step.title}
            why=${(goal[step.id] ? goal[step.id] + " " : "") + step.why}
            code=${step.code}
          />
        `;
      })}
      ${edges.length > 0 ? html`
        <div className="border border-gray-300 rounded p-3 bg-white space-y-2">
          <div className="text-sm font-semibold text-gray-900">固定边（Edge）· 运行时不再另选路</div>
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
      ` : null}
      ${pathMap.length > 0 ? html`
        <div className="border border-yellow-300 bg-yellow-50 rounded p-3 space-y-2">
          <div className="text-sm font-semibold text-yellow-900">条件边的路径映射（path map）· 路由函数返回什么键，就走谁</div>
          <ol className="text-xs text-gray-800 list-decimal pl-5 space-y-1">
            ${pathMap.map(function (row) {
              return html`
                <li key=${row.key}>
                  <span className="font-mono">${row.key}</span>
                  ${" → "}
                  <span className="font-mono">${row.toNode}</span>
                  ${" · "}
                  ${row.example}
                </li>
              `;
            })}
          </ol>
          <p className="text-xs text-gray-700">路径映射里没列出来的键，运行时框架直接抛异常（接口级报错，不是业务级拦截——这是「为什么用 addConditionalEdges 比手写 pickRoute 少一层业务兜底」的实际代价）。</p>
        </div>
      ` : null}
    </div>
  `;
}
