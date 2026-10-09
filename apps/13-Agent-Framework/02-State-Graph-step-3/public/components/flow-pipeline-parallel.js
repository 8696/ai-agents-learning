/**
 * 职责：把并行扇出扇入路上的六个点画成一排工位。START → takeOrder → 分叉两台机器 → 汇合到 serve → END。
 * 数据流：props.doneNodes / currentNode → 每个工位的边框颜色。
 *
 * 为什么单独成文件：跟回边图的 flow-pipeline-back-edge.js 共用同一份渲染逻辑，但站点不一样
 * （多了 takeOrder 的 fan-out、branchHot / branchIce 并行、serve 是 fan-in 汇合点）。
 * 学习者对照看「同一份核心组件 + 不同站点配置」时一眼能区分。
 */
import React from "react";
import htm from "https://esm.sh/htm";

const html = htm.bind(React.createElement);

const STATIONS = [
  { id: "START", label: "入口", writes: "图从这里进" },
  { id: "takeOrder", label: "点单（fan-out 起点）", writes: "写 orderSlip；之后同一 super-step 跑两个分支" },
  { id: "branchHot", label: "热饮制作（并行分支 1）", writes: "写杯盖（按 mode 决定字段）" },
  { id: "branchIce", label: "冰饮制作（并行分支 2）", writes: "写杯盖（按 mode 决定字段）" },
  { id: "serve", label: "出餐（fan-in 汇合点）", writes: "两台机器都跑完才进 serve；写取餐广播" },
  { id: "END", label: "结束", writes: "图停" },
];

function stationClass(station, doneNodes, currentNode) {
  if (currentNode && station.id === currentNode) {
    return "border-blue-500 bg-blue-50 text-blue-900";
  }
  const walked = doneNodes.indexOf(station.id) !== -1;
  const ended = station.id === "END" && doneNodes.length > 0;
  if (walked || ended) return "border-green-300 bg-green-50 text-green-900";
  return "border-gray-300 bg-white text-gray-700";
}

export function FlowPipelineParallel(props) {
  const doneNodes = props.doneNodes || [];
  const currentNode = props.currentNode || "";
  return html`
    <div className="space-y-2">
      <div className="flex flex-wrap items-stretch gap-2">
        ${STATIONS.map(function (station, i) {
          const box = stationClass(station, doneNodes, currentNode);
          return html`
            <div key=${station.id} className="flex items-center gap-2">
              <div className=${"border rounded p-2 min-w-[8.5rem] " + box}>
                <div className="text-xs font-semibold">${station.label}</div>
                <div className="text-xs font-mono">${station.id}</div>
                <div className="text-xs mt-1">${station.writes}</div>
              </div>
              ${i < STATIONS.length - 1
                ? html`<span className="text-gray-400 text-sm">→</span>`
                : null}
            </div>
          `;
        })}
      </div>
      <p className="text-xs text-gray-500">${props.caption || "fan-out：takeOrder 出两条边；fan-in：branchHot / branchIce 都汇合到 serve。同一 super-step 并行跑两台机器，不需要你显式 await Promise.all。"}</p>
    </div>
  `;
}
